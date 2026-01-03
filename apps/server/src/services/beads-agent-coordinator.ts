/**
 * Beads Agent Coordinator Service
 *
 * Enables autonomous agent coordination using Beads for task management.
 * Agents can self-assign work and spawn helper agents for subtasks.
 *
 * Key Features:
 * - Autonomous agent selection based on task capabilities
 * - Intelligent agent scoring (capability match, success rate, availability)
 * - Helper agent spawning for subtasks
 * - Issue locking to prevent conflicts
 * - Stale agent cleanup
 * - Event-driven coordination
 */

import { AgentService } from './agent-service.js';
import { BeadsService } from './beads-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { SpecializedAgentService } from '../agents/specialized-agent-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { AgentType, AgentConfig, BeadsIssue } from '@automaker/types';

/**
 * Agent scoring breakdown
 */
interface AgentScore {
  agentType: AgentType;
  score: number;
  capabilityMatch: number;
  successRate: number;
  availability: number;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  /** How often to run coordination loop (ms) */
  coordinationInterval: number;
  /** Maximum concurrent agents */
  maxConcurrentAgents: number;
  /** Enable automatic task assignment */
  enableAutoAssignment: boolean;
  /** Enable helper agent spawning */
  enableHelperSpawning: boolean;
  /** Maximum age for agent (ms) before considered stale */
  maxAgentAge: number;
}

/**
 * Result from spawning a helper agent
 */
export interface HelperAgentResult {
  helperSessionId: string;
  helperIssueId: string;
  parentIssueId: string;
  helperAgentType: AgentType;
}

/**
 * Active agent tracking
 */
interface ActiveAgent {
  sessionId: string;
  agentType: AgentType;
  issueId: string;
  startTime: number;
}

/**
 * Coordinator statistics
 */
export interface CoordinatorStats {
  activeAgents: number;
  lockedIssues: number;
  totalAssignments: number;
  totalHelpersSpawned: number;
  lastCoordinationTime: number;
}

export class BeadsAgentCoordinator {
  private beadsService: BeadsService;
  private agentService: AgentService;
  private agentRegistry: AgentRegistry;
  private specializedAgentService: SpecializedAgentService;
  private events: EventEmitter;
  private config: CoordinatorConfig;

  private coordinationInterval?: NodeJS.Timeout;
  private activeAgents: Map<string, ActiveAgent> = new Map();
  private issueLocks: Map<string, string> = new Map();
  private totalAssignments = 0;
  private totalHelpersSpawned = 0;
  private lastCoordinationTime = 0;

  // Event unsubscribe function
  private eventUnsubscribe?: () => void;

  constructor(
    agentRegistry: AgentRegistry,
    beadsService: BeadsService,
    agentService: AgentService,
    events: EventEmitter,
    specializedAgentService: SpecializedAgentService,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.agentRegistry = agentRegistry;
    this.beadsService = beadsService;
    this.agentService = agentService;
    this.events = events;
    this.specializedAgentService = specializedAgentService;

    // Default configuration
    this.config = {
      coordinationInterval: config.coordinationInterval || 30000, // 30 seconds
      maxConcurrentAgents: config.maxConcurrentAgents || 5,
      enableAutoAssignment: config.enableAutoAssignment !== false,
      enableHelperSpawning: config.enableHelperSpawning !== false,
      maxAgentAge: config.maxAgentAge || 7200000, // 2 hours
    };

    // Set event emitter for beads service
    this.beadsService.setEventEmitter(events);
  }

  /**
   * Start the coordinator
   */
  async start(projectPath: string): Promise<void> {
    console.log('[BeadsCoordinator] Starting coordinator...');

    // Subscribe to beads events
    this.eventUnsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'beads:issue-updated') {
        this.handleIssueUpdate(payload as { issue: BeadsIssue; projectPath?: string }).catch(
          (error) => {
            console.error('[BeadsCoordinator] Error handling issue update:', error);
          }
        );
      } else if (type === 'beads:task-ready') {
        this.handleTaskReady(payload as { issue: BeadsIssue; projectPath: string }).catch(
          (error) => {
            console.error('[BeadsCoordinator] Error handling task ready:', error);
          }
        );
      }
    });

    // Start coordination loop
    this.coordinationInterval = setInterval(() => {
      this.coordinateAgents(projectPath).catch((error) => {
        console.error('[BeadsCoordinator] Error in coordination loop:', error);
      });
    }, this.config.coordinationInterval);

    // Run initial coordination
    await this.coordinateAgents(projectPath);

    console.log('[BeadsCoordinator] Coordinator started');
  }

  /**
   * Stop the coordinator
   */
  stop(): void {
    console.log('[BeadsCoordinator] Stopping coordinator...');

    if (this.coordinationInterval) {
      clearInterval(this.coordinationInterval);
      this.coordinationInterval = undefined;
    }

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = undefined;
    }

    // Clear active agents and issue locks
    this.activeAgents.clear();
    this.issueLocks.clear();

    console.log('[BeadsCoordinator] Coordinator stopped');
  }

  /**
   * Main coordination loop - assigns work to available agents
   */
  async coordinateAgents(projectPath: string): Promise<void> {
    try {
      this.lastCoordinationTime = Date.now();

      // Clean up stale agents
      this.cleanupStaleAgents();

      // Check if we can start more agents
      if (this.activeAgents.size >= this.config.maxConcurrentAgents) {
        console.log('[BeadsCoordinator] Max concurrent agents reached, skipping coordination');
        return;
      }

      // Get ready work from Beads
      const readyWork = await this.beadsService.getReadyWork(projectPath);

      // Filter out locked issues and in-progress issues
      const availableWork = readyWork.filter(
        (issue) => !this.issueLocks.has(issue.id) && issue.status !== 'in_progress'
      );

      if (availableWork.length === 0) {
        console.log('[BeadsCoordinator] No available work');
        return;
      }

      console.log(`[BeadsCoordinator] Found ${availableWork.length} available issues`);

      // Assign work to agents
      for (const issue of availableWork) {
        // Check if we've hit the concurrent limit
        if (this.activeAgents.size >= this.config.maxConcurrentAgents) {
          break;
        }

        // Select the best agent for this issue
        const agentType = await this.selectAgentForIssue(issue);

        if (agentType) {
          await this.assignIssueToAgent(issue, agentType, projectPath);
        } else {
          console.log(`[BeadsCoordinator] No suitable agent found for issue ${issue.id}`);
        }
      }
    } catch (error) {
      console.error('[BeadsCoordinator] Error in coordination loop:', error);
    }
  }

  /**
   * Select the best agent for an issue
   */
  private async selectAgentForIssue(issue: BeadsIssue): Promise<AgentType | null> {
    try {
      // Get auto-selectable agents
      const autoSelectableAgents = this.agentRegistry.getAutoSelectableAgents();

      if (autoSelectableAgents.length === 0) {
        console.warn('[BeadsCoordinator] No auto-selectable agents available');
        return null;
      }

      // Score each agent for this issue
      const scores: AgentScore[] = [];

      for (const agentType of autoSelectableAgents) {
        const score = await this.scoreAgentForIssue(agentType, issue);
        scores.push({
          agentType,
          score,
          capabilityMatch: 0, // Will be filled in by scoreAgentForIssue
          successRate: 0,
          availability: 0,
        });
      }

      // Sort by score (highest first)
      scores.sort((a, b) => b.score - a.score);

      // Return top agent if score is above threshold
      const topScore = scores[0];
      if (topScore.score >= 0.5) {
        console.log(
          `[BeadsCoordinator] Selected agent ${topScore.agentType} for issue ${issue.id} (score: ${topScore.score.toFixed(2)})`
        );
        return topScore.agentType;
      }

      console.log(`[BeadsCoordinator] No agent scored above threshold for issue ${issue.id}`);
      return null;
    } catch (error) {
      console.error('[BeadsCoordinator] Error selecting agent:', error);
      return null;
    }
  }

  /**
   * Score an agent for an issue based on capabilities, success rate, and availability
   */
  private async scoreAgentForIssue(agentType: AgentType, issue: BeadsIssue): Promise<number> {
    try {
      // Get agent configuration
      const config = this.agentRegistry.getAgentConfig(agentType);
      if (!config) {
        return 0;
      }

      // Get agent stats
      const stats = this.agentRegistry.getAgentStats(agentType);
      const successRate = stats?.successRate || 1.0;

      // Calculate capability match (40% weight)
      const capabilityMatch = this.calculateCapabilityMatch(config, issue);

      // Calculate availability (20% weight)
      const activeCount = Array.from(this.activeAgents.values()).filter(
        (agent) => agent.agentType === agentType
      ).length;
      const availability = 1 - activeCount / this.config.maxConcurrentAgents;

      // Calculate weighted score
      const score = capabilityMatch * 0.4 + successRate * 0.4 + availability * 0.2;

      console.log(
        `[BeadsCoordinator] Agent ${agentType} score: ${score.toFixed(2)} ` +
          `(capabilities: ${capabilityMatch.toFixed(2)}, success: ${successRate.toFixed(2)}, availability: ${availability.toFixed(2)})`
      );

      return score;
    } catch (error) {
      console.error('[BeadsCoordinator] Error scoring agent:', error);
      return 0;
    }
  }

  /**
   * Calculate how well an agent's capabilities match an issue
   */
  private calculateCapabilityMatch(config: AgentConfig, issue: BeadsIssue): number {
    try {
      const capabilities = config.capabilities || [];

      if (capabilities.length === 0) {
        return 0.5; // Neutral score if no capabilities defined
      }

      // Build keyword list from issue
      const issueText =
        `${issue.title} ${issue.description || ''} ${issue.type} ${(issue.labels || []).join(' ')}`.toLowerCase();

      // Count matching capabilities
      let matchCount = 0;
      for (const cap of capabilities) {
        const capName = cap.name.toLowerCase();
        const capTools = cap.tools || [];

        // Check if capability name matches
        if (issueText.includes(capName)) {
          matchCount++;
          continue;
        }

        // Check if any related tools match
        for (const tool of capTools) {
          if (issueText.includes(tool.toLowerCase())) {
            matchCount++;
            break;
          }
        }
      }

      const capabilityScore = matchCount / capabilities.length;

      // Fallback to agent priority if no explicit capability match
      if (capabilityScore === 0) {
        // Map priority 1-10 to score 0.1-0.5
        return 0.1 + config.priority * 0.04;
      }

      return capabilityScore;
    } catch (error) {
      console.error('[BeadsCoordinator] Error calculating capability match:', error);
      return 0.1; // Minimum score for any agent
    }
  }

  /**
   * Assign an issue to an agent
   */
  private async assignIssueToAgent(
    issue: BeadsIssue,
    agentType: AgentType,
    projectPath: string
  ): Promise<void> {
    let sessionId: string | null = null;

    try {
      console.log(`[BeadsCoordinator] Assigning issue ${issue.id} to agent ${agentType}`);

      // Lock the issue
      this.issueLocks.set(issue.id, 'assigning');

      // Update issue status to in_progress
      await this.beadsService.updateIssue(projectPath, issue.id, {
        status: 'in_progress',
      });

      // Build agent prompt
      const prompt = this.buildAgentPrompt(issue);

      // Create agent session
      const session = await this.agentService.createSession(
        `Agent: ${issue.title}`,
        projectPath,
        projectPath
      );
      sessionId = session.id;

      // Start agent execution
      const context = {
        featureId: issue.featureId || issue.id,
        projectPath,
        cwd: projectPath,
        currentTask: issue.title,
        abortController: new AbortController(),
      };

      // Emit started event
      this.events.emit('beads:agent-started', {
        issueId: issue.id,
        sessionId,
        agentType,
        projectPath,
        timestamp: new Date().toISOString(),
      });

      // Execute with specialized agent (fire and forget)
      this.specializedAgentService
        .executeTaskWithAgent(context, prompt, undefined, undefined, {
          forceAgentType: agentType,
        })
        .then((result) => {
          console.log(`[BeadsCoordinator] Agent ${agentType} completed issue ${issue.id}`);

          // Update issue status based on result
          this.beadsService
            .updateIssue(projectPath, issue.id, {
              status: result.success ? 'closed' : 'open',
            })
            .catch((error) => {
              console.error('[BeadsCoordinator] Error updating issue status:', error);
            });

          // Clear lock
          this.issueLocks.delete(issue.id);

          // Remove from active agents
          this.activeAgents.delete(sessionId!);

          // Emit completion event
          this.events.emit('beads:agent-completed', {
            issueId: issue.id,
            sessionId,
            agentType,
            projectPath,
            success: result.success,
            timestamp: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error(
            `[BeadsCoordinator] Agent ${agentType} failed on issue ${issue.id}:`,
            error
          );

          // Revert issue status
          this.beadsService
            .updateIssue(projectPath, issue.id, {
              status: 'open',
            })
            .catch((updateError) => {
              console.error('[BeadsCoordinator] Error reverting issue status:', updateError);
            });

          // Clear lock
          this.issueLocks.delete(issue.id);

          // Remove from active agents
          this.activeAgents.delete(sessionId!);

          // Emit failure event
          this.events.emit('beads:agent-failed', {
            issueId: issue.id,
            sessionId,
            agentType,
            projectPath,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      // Track active agent
      this.activeAgents.set(sessionId, {
        sessionId,
        agentType,
        issueId: issue.id,
        startTime: Date.now(),
      });

      // Update lock with session ID
      this.issueLocks.set(issue.id, sessionId);

      this.totalAssignments++;

      // Emit assignment event
      this.events.emit('beads:agent-assigned', {
        issueId: issue.id,
        sessionId,
        agentType,
        projectPath,
        issue,
      });

      console.log(
        `[BeadsCoordinator] Agent ${agentType} assigned to issue ${issue.id} (session: ${sessionId})`
      );
    } catch (error) {
      console.error('[BeadsCoordinator] Error assigning issue to agent:', error);

      // Clear lock on failure
      if (issue.id) {
        this.issueLocks.delete(issue.id);
      }

      // Revert issue status if we updated it
      try {
        await this.beadsService.updateIssue(projectPath, issue.id, {
          status: 'open',
        });
      } catch {
        // Ignore
      }

      throw error;
    }
  }

  /**
   * Spawn a helper agent for a subtask
   */
  async spawnHelperAgent(
    parentSessionId: string,
    helperType: AgentType,
    taskDescription: string,
    projectPath: string
  ): Promise<HelperAgentResult> {
    try {
      console.log(
        `[BeadsCoordinator] Spawning helper agent ${helperType} for session ${parentSessionId}`
      );

      // Get parent agent info
      const parentAgent = this.activeAgents.get(parentSessionId);
      if (!parentAgent) {
        throw new Error(`Parent session ${parentSessionId} not found`);
      }

      // Create helper issue via Beads
      const helperIssue = await this.beadsService.createIssue(projectPath, {
        title: `Helper: ${taskDescription.substring(0, 50)}...`,
        description: taskDescription,
        type: 'task',
        priority: 2, // Medium priority
        parentIssueId: parentAgent.issueId,
      });

      console.log(`[BeadsCoordinator] Created helper issue ${helperIssue.id}`);

      // Lock the helper issue
      this.issueLocks.set(helperIssue.id, 'assigning');

      // Update status to in_progress
      await this.beadsService.updateIssue(projectPath, helperIssue.id, {
        status: 'in_progress',
      });

      // Create helper session
      const session = await this.agentService.createSession(
        `Helper: ${helperIssue.title}`,
        projectPath,
        projectPath
      );

      // Build helper prompt
      const prompt = this.buildAgentPrompt(helperIssue);

      // Start helper agent execution
      const context = {
        featureId: helperIssue.featureId || helperIssue.id,
        projectPath,
        cwd: projectPath,
        currentTask: helperIssue.title,
        abortController: new AbortController(),
      };

      // Emit helper started event
      this.events.emit('beads:helper-started', {
        issueId: helperIssue.id,
        sessionId: session.id,
        parentSessionId,
        agentType: helperType,
        timestamp: new Date().toISOString(),
      });

      // Execute with specialized agent (fire and forget)
      this.specializedAgentService
        .executeTaskWithAgent(context, prompt, undefined, undefined, {
          forceAgentType: helperType,
        })
        .then((result) => {
          console.log(
            `[BeadsCoordinator] Helper agent ${helperType} completed issue ${helperIssue.id}`
          );

          // Update issue status
          this.beadsService
            .updateIssue(projectPath, helperIssue.id, {
              status: result.success ? 'closed' : 'open',
            })
            .catch((error) => {
              console.error('[BeadsCoordinator] Error updating helper issue status:', error);
            });

          // Clear lock
          this.issueLocks.delete(helperIssue.id);

          // Remove from active agents
          this.activeAgents.delete(session.id);

          // Emit helper completion event
          this.events.emit('beads:helper-completed', {
            issueId: helperIssue.id,
            sessionId: session.id,
            parentSessionId,
            agentType: helperType,
            success: result.success,
            timestamp: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error(`[BeadsCoordinator] Helper agent ${helperType} failed:`, error);

          // Revert issue status
          this.beadsService
            .updateIssue(projectPath, helperIssue.id, {
              status: 'open',
            })
            .catch((updateError) => {
              console.error('[BeadsCoordinator] Error reverting helper issue status:', updateError);
            });

          // Clear lock
          this.issueLocks.delete(helperIssue.id);

          // Remove from active agents
          this.activeAgents.delete(session.id);

          // Emit helper failure event
          this.events.emit('beads:helper-failed', {
            issueId: helperIssue.id,
            sessionId: session.id,
            parentSessionId,
            agentType: helperType,
            projectPath,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
        });

      // Track helper agent
      this.activeAgents.set(session.id, {
        sessionId: session.id,
        agentType: helperType,
        issueId: helperIssue.id,
        startTime: Date.now(),
      });

      // Update lock with session ID
      this.issueLocks.set(helperIssue.id, session.id);

      this.totalHelpersSpawned++;

      // Emit helper spawned event
      this.events.emit('beads:helper-spawned', {
        helperIssueId: helperIssue.id,
        helperSessionId: session.id,
        parentIssueId: parentAgent.issueId,
        parentSessionId,
        agentType: helperType,
        projectPath,
        timestamp: new Date().toISOString(),
      });

      return {
        helperSessionId: session.id,
        helperIssueId: helperIssue.id,
        parentIssueId: parentAgent.issueId,
        helperAgentType: helperType,
      };
    } catch (error) {
      console.error('[BeadsCoordinator] Error spawning helper agent:', error);
      throw error;
    }
  }

  /**
   * Handle issue update events
   */
  private async handleIssueUpdate(payload: {
    issue: BeadsIssue;
    projectPath?: string;
  }): Promise<void> {
    try {
      const { issue } = payload;

      // If issue was closed, clear the lock
      if (issue.status === 'closed') {
        this.issueLocks.delete(issue.id);
      }
    } catch (error) {
      console.error('[BeadsCoordinator] Error handling issue update:', error);
    }
  }

  /**
   * Handle task ready events
   */
  private async handleTaskReady(payload: {
    issue: BeadsIssue;
    projectPath: string;
  }): Promise<void> {
    try {
      const { issue, projectPath } = payload;

      console.log(`[BeadsCoordinator] Task ${issue.id} is ready, triggering coordination`);

      // Trigger immediate coordination
      await this.coordinateAgents(projectPath);
    } catch (error) {
      console.error('[BeadsCoordinator] Error handling task ready:', error);
    }
  }

  /**
   * Clean up stale agents
   */
  private cleanupStaleAgents(): void {
    try {
      const now = Date.now();
      const staleAgents: string[] = [];

      for (const [sessionId, agent] of this.activeAgents.entries()) {
        const age = now - agent.startTime;
        if (age > this.config.maxAgentAge) {
          staleAgents.push(sessionId);
        }
      }

      if (staleAgents.length > 0) {
        console.log(`[BeadsCoordinator] Cleaning up ${staleAgents.length} stale agents`);

        for (const sessionId of staleAgents) {
          const agent = this.activeAgents.get(sessionId);
          if (agent) {
            // Clear the issue lock
            this.issueLocks.delete(agent.issueId);

            // Remove from active agents
            this.activeAgents.delete(sessionId);

            // Emit cleanup event
            this.events.emit('beads:agent-cleaned', {
              sessionId,
              issueId: agent.issueId,
              agentType: agent.agentType,
              age: now - agent.startTime,
            });
          }
        }
      }
    } catch (error) {
      console.error('[BeadsCoordinator] Error cleaning up stale agents:', error);
    }
  }

  /**
   * Build a prompt for an agent working on an issue
   */
  private buildAgentPrompt(issue: BeadsIssue): string {
    return `## Task Assignment

You have been assigned to work on the following task:

**Title**: ${issue.title}

**Description**:
${issue.description || 'No description provided.'}

**Priority**: P${issue.priority}

**Type**: ${issue.type}

${(issue.labels?.length ?? 0) > 0 ? `**Labels**: ${issue.labels!.join(', ')}\n` : ''}

Please analyze this task and implement a solution following best practices.

1. Start by understanding the requirements
2. Plan your approach
3. Implement the solution
4. Test your changes
5. Clean up and finalize

Update the issue status as you progress.
`;
  }

  /**
   * Get coordinator statistics
   */
  getStats(): CoordinatorStats {
    return {
      activeAgents: this.activeAgents.size,
      lockedIssues: this.issueLocks.size,
      totalAssignments: this.totalAssignments,
      totalHelpersSpawned: this.totalHelpersSpawned,
      lastCoordinationTime: this.lastCoordinationTime,
    };
  }

  /**
   * Get active agents
   */
  getActiveAgents(): ActiveAgent[] {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Get locked issues
   */
  getLockedIssues(): Map<string, string> {
    return new Map(this.issueLocks);
  }

  /**
   * Manually trigger coordination (useful for testing)
   */
  async triggerCoordination(projectPath: string): Promise<void> {
    await this.coordinateAgents(projectPath);
  }
}
