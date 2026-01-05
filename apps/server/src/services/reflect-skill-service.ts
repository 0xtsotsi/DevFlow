/**
 * Reflect Skill Service
 *
 * Implements the Reflexion pattern for AI agent self-reflection:
 * - Analyzes conversation history for patterns and insights
 * - Generates reflections on task execution
 * - Identifies areas for improvement
 * - Stores reflections in Beads memory for future context
 *
 * Based on research from:
 * - Reflexion: Language Agents with Verbal Reinforcement Learning
 * - LATS (Language Agent Tree Search)
 * - Self-Evolving Agent patterns
 *
 * Emits events for orchestration and integrates with Beads memory.
 */

import type { EventEmitter } from '../lib/events.js';
import type { BeadsMemoryService } from './beads-memory-service.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

/**
 * Evaluation criteria for reflection
 */
export interface EvaluationCriterion {
  /** Criterion name */
  name: string;
  /** Criterion description */
  description: string;
  /** Weight for scoring (0-1) */
  weight: number;
}

/**
 * Default evaluation criteria
 */
export const DEFAULT_EVALUATION_CRITERIA: EvaluationCriterion[] = [
  {
    name: 'task_completion',
    description: 'Was the primary task completed successfully?',
    weight: 0.4,
  },
  {
    name: 'code_quality',
    description: 'Is the code well-structured, readable, and maintainable?',
    weight: 0.3,
  },
  {
    name: 'error_handling',
    description: 'Were errors handled gracefully with informative messages?',
    weight: 0.15,
  },
  {
    name: 'test_coverage',
    description: 'Were appropriate tests added or updated?',
    weight: 0.15,
  },
];

/**
 * Conversation message from agent session
 */
export interface ConversationMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp?: string;
  /** Tool calls made */
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

/**
 * Reflection result from analyzing conversation
 */
export interface ReflectionResult {
  /** Unique reflection ID */
  reflectionId: string;
  /** Session ID that was analyzed */
  sessionId: string;
  /** Overall success score (0-1) */
  successScore: number;
  /** Individual criterion scores */
  criterionScores: Array<{
    name: string;
    score: number;
    reasoning: string;
  }>;
  /** Key insights from the reflection */
  insights: string[];
  /** Areas for improvement */
  improvements: string[];
  /** What went well */
  strengths: string[];
  /** Suggested actions for next attempt */
  suggestedActions: string[];
  /** Timestamp */
  timestamp: string;
  /** Duration of analysis */
  duration: number;
}

/**
 * Options for reflect skill execution
 */
export interface ReflectSkillOptions {
  /** Project path for context */
  projectPath: string;
  /** Session ID to analyze */
  sessionId: string;
  /** Conversation history */
  conversation: ConversationMessage[];
  /** Optional evaluation criteria (uses defaults if not provided) */
  criteria?: EvaluationCriterion[];
  /** Task description for context */
  taskDescription?: string;
  /** Whether to store reflection in Beads memory (default: true) */
  storeInBeads?: boolean;
  /** Maximum number of insights to generate (default: 5) */
  maxInsights?: number;
}

/**
 * Reflexion retry configuration
 */
export interface ReflexionRetryOptions {
  /** Maximum number of reflection iterations */
  maxReflections: number;
  /** Success threshold to stop reflecting (0-1) */
  successThreshold: number;
  /** Whether to store intermediate reflections */
  storeIntermediate: boolean;
}

/**
 * Result from reflexion retry loop
 */
export interface ReflexionRetryResult {
  /** Whether retry loop achieved success threshold */
  success: boolean;
  /** Number of reflections performed */
  reflectionCount: number;
  /** Final success score */
  finalScore: number;
  /** All reflections generated */
  reflections: ReflectionResult[];
  /** Total duration */
  totalDuration: number;
}

/**
 * Reflection history entry
 */
export interface ReflectionHistoryEntry {
  /** Reflection ID */
  reflectionId: string;
  /** Session ID */
  sessionId: string;
  /** Project path */
  projectPath: string;
  /** Success score */
  successScore: number;
  /** Timestamp */
  timestamp: string;
  /** Stored in Beads */
  storedInBeads: boolean;
}

export class ReflectSkillService {
  private events: EventEmitter;
  private mcpBridge: ReturnType<typeof getMCPBridge>;
  private beadsMemoryService?: BeadsMemoryService;
  private reflectionHistory: Map<string, ReflectionHistoryEntry[]> = new Map();

  constructor(events: EventEmitter, beadsMemoryService?: BeadsMemoryService) {
    this.events = events;
    this.mcpBridge = getMCPBridge(events);
    this.beadsMemoryService = beadsMemoryService;
  }

  /**
   * Check if the reflect skill service is available
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Execute reflection on a completed task/conversation
   */
  async execute(options: ReflectSkillOptions): Promise<ReflectionResult> {
    const startTime = Date.now();
    const {
      projectPath,
      sessionId,
      conversation,
      criteria = DEFAULT_EVALUATION_CRITERIA,
      taskDescription,
      storeInBeads = true,
      maxInsights = 5,
    } = options;

    this.events.emit('skill:started', {
      skill: 'reflect',
      sessionId,
      timestamp: new Date().toISOString(),
    });

    try {
      // Analyze conversation for patterns
      const analysis = await this.analyzeConversation(conversation, taskDescription);

      // Score against criteria
      const criterionScores = await this.scoreAgainstCriteria(analysis, criteria, conversation);

      // Calculate overall success score
      const successScore = this.calculateSuccessScore(criterionScores, criteria);

      // Generate insights
      const insights = await this.generateInsights(analysis, conversation, maxInsights);

      // Identify improvements
      const improvements = await this.identifyImprovements(analysis, criterionScores, conversation);

      // Identify strengths
      const strengths = await this.identifyStrengths(analysis, criterionScores);

      // Suggest actions for next attempt
      const suggestedActions = await this.suggestActions(improvements, insights, conversation);

      const duration = Date.now() - startTime;

      const reflectionResult: ReflectionResult = {
        reflectionId: this.generateReflectionId(),
        sessionId,
        successScore,
        criterionScores,
        insights,
        improvements,
        strengths,
        suggestedActions,
        timestamp: new Date().toISOString(),
        duration,
      };

      // Store in Beads memory if enabled
      let storedInBeads = false;
      if (storeInBeads && this.beadsMemoryService) {
        storedInBeads = await this.storeReflectionInBeads(
          projectPath,
          reflectionResult,
          taskDescription
        );
      }

      // Add to history
      this.addToHistory(projectPath, {
        reflectionId: reflectionResult.reflectionId,
        sessionId,
        projectPath,
        successScore,
        timestamp: reflectionResult.timestamp,
        storedInBeads,
      });

      this.events.emit('skill:completed', {
        skill: 'reflect',
        sessionId,
        duration,
        successScore,
        timestamp: new Date().toISOString(),
      });

      return reflectionResult;
    } catch (error) {
      this.events.emit('skill:failed', {
        skill: 'reflect',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Execute reflexion retry loop (Reflexion pattern)
   *
   * This implements the Reflexion pattern where an agent:
   * 1. Attempts a task
   * 2. Reflects on the result
   * 3. Generates feedback for improvement
   * 4. Retries with the feedback
   * 5. Repeats until success threshold or max iterations
   */
  async executeWithRetry(
    task: string,
    projectPath: string,
    attemptTask: (feedback?: string) => Promise<{
      conversation: ConversationMessage[];
      success: boolean;
    }>,
    options: ReflexionRetryOptions = {
      maxReflections: 3,
      successThreshold: 0.8,
      storeIntermediate: true,
    }
  ): Promise<ReflexionRetryResult> {
    const startTime = Date.now();
    const reflections: ReflectionResult[] = [];
    let currentFeedback: string | undefined;
    let finalSuccess = false;
    let finalScore = 0;

    for (let i = 0; i < options.maxReflections; i++) {
      // Attempt task with previous feedback
      const attemptResult = await attemptTask(currentFeedback);

      // Generate reflection on this attempt
      const reflection = await this.execute({
        projectPath,
        sessionId: this.generateSessionId(),
        conversation: attemptResult.conversation,
        taskDescription: task,
        storeInBeads: options.storeIntermediate,
      });

      reflections.push(reflection);
      finalScore = reflection.successScore;

      // Check if we achieved success threshold
      if (reflection.successScore >= options.successThreshold) {
        finalSuccess = true;
        break;
      }

      // Generate feedback for next attempt
      currentFeedback = this.generateFeedback(reflection);
    }

    return {
      success: finalSuccess,
      reflectionCount: reflections.length,
      finalScore,
      reflections,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Get reflection history for a project
   */
  getHistory(projectPath: string): ReflectionHistoryEntry[] {
    return this.reflectionHistory.get(projectPath) || [];
  }

  /**
   * Clear reflection history for a project
   */
  clearHistory(projectPath: string): void {
    this.reflectionHistory.delete(projectPath);
  }

  /**
   * Analyze conversation for patterns and insights
   */
  private async analyzeConversation(
    conversation: ConversationMessage[],
    taskDescription?: string
  ): Promise<{
    taskSummary: string;
    toolUsage: Record<string, number>;
    errorPatterns: string[];
    codeChanges: string[];
    decisions: string[];
  }> {
    // Extract tool usage
    const toolUsage: Record<string, number> = {};
    const errorPatterns: string[] = [];
    const codeChanges: string[] = [];

    for (const message of conversation) {
      // Count tool usage
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          toolUsage[toolCall.name] = (toolUsage[toolCall.name] || 0) + 1;
        }
      }

      // Detect error patterns in assistant messages
      if (message.role === 'assistant') {
        const errorMatches = message.content.match(
          /(error|failed|failure|exception|cannot|unable)/gi
        );
        if (errorMatches) {
          errorPatterns.push(...errorMatches);
        }
      }

      // Detect code changes (file edits)
      if (message.content.includes('Edited') || message.content.includes('Created')) {
        const fileMatches = message.content.match(/([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json))/g);
        if (fileMatches) {
          codeChanges.push(...fileMatches);
        }
      }
    }

    const taskSummary = taskDescription || this.extractTaskSummary(conversation);

    return {
      taskSummary,
      toolUsage,
      errorPatterns: [...new Set(errorPatterns)],
      codeChanges: [...new Set(codeChanges)],
      decisions: this.extractDecisions(conversation),
    };
  }

  /**
   * Score conversation against evaluation criteria
   */
  private async scoreAgainstCriteria(
    analysis: ReturnType<typeof this.analyzeConversation> extends Promise<infer T> ? T : never,
    criteria: EvaluationCriterion[],
    conversation: ConversationMessage[]
  ): Promise<Array<{ name: string; score: number; reasoning: string }>> {
    const scores: Array<{ name: string; score: number; reasoning: string }> = [];

    for (const criterion of criteria) {
      const score = await this.evaluateCriterion(criterion, analysis, conversation);
      scores.push({
        name: criterion.name,
        score: score.score,
        reasoning: score.reasoning,
      });
    }

    return scores;
  }

  /**
   * Evaluate a single criterion
   */
  private async evaluateCriterion(
    criterion: EvaluationCriterion,
    analysis: {
      taskSummary: string;
      toolUsage: Record<string, number>;
      errorPatterns: string[];
      codeChanges: string[];
      decisions: string[];
    },
    conversation: ConversationMessage[]
  ): Promise<{ score: number; reasoning: string }> {
    // This is a simplified evaluation. In production, this would use
    // an LLM call to perform more nuanced evaluation.
    let score = 0.5; // Default mid-score
    const reasoningParts: string[] = [];

    switch (criterion.name) {
      case 'task_completion': {
        // Check if there are more successful completions than errors
        const completionCount = analysis.errorPatterns.length === 0 ? 1 : 0;
        score = Math.min(1, 0.5 + completionCount * 0.3);
        reasoningParts.push(
          analysis.errorPatterns.length === 0
            ? 'Task completed without errors'
            : `Task had ${analysis.errorPatterns.length} error patterns`
        );
        break;
      }

      case 'code_quality': {
        // Check for multiple file edits (suggests structure)
        const fileCount = new Set(analysis.codeChanges).size;
        score = Math.min(1, 0.3 + fileCount * 0.1);
        reasoningParts.push(`${fileCount} files modified`);
        break;
      }

      case 'error_handling': {
        // Check if errors were recovered from
        const hasRecovery = conversation.some(
          (m) =>
            m.content.toLowerCase().includes('fix') || m.content.toLowerCase().includes('correct')
        );
        score = hasRecovery ? 0.8 : 0.5;
        reasoningParts.push(hasRecovery ? 'Error recovery detected' : 'No clear error recovery');
        break;
      }

      case 'test_coverage': {
        // Check for test file changes
        const hasTests = analysis.codeChanges.some(
          (f) => f.includes('.test.') || f.includes('.spec.') || f.includes('/tests/')
        );
        score = hasTests ? 0.9 : 0.4;
        reasoningParts.push(hasTests ? 'Test files modified' : 'No test coverage detected');
        break;
      }

      default:
        score = 0.5;
        reasoningParts.push('Default score applied');
    }

    return {
      score,
      reasoning: reasoningParts.join('. ') || `Evaluated ${criterion.name}`,
    };
  }

  /**
   * Calculate weighted success score from criterion scores
   */
  private calculateSuccessScore(
    criterionScores: Array<{ name: string; score: number; reasoning: string }>,
    criteria: EvaluationCriterion[]
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const criterion of criteria) {
      const scoreEntry = criterionScores.find((s) => s.name === criterion.name);
      if (scoreEntry) {
        totalScore += scoreEntry.score * criterion.weight;
        totalWeight += criterion.weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Generate insights from analysis
   */
  private async generateInsights(
    analysis: {
      taskSummary: string;
      toolUsage: Record<string, number>;
      errorPatterns: string[];
      codeChanges: string[];
      decisions: string[];
    },
    conversation: ConversationMessage[],
    maxInsights: number
  ): Promise<string[]> {
    const insights: string[] = [];

    // Tool usage insights
    const topTools = Object.entries(analysis.toolUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    if (topTools.length > 0) {
      insights.push(
        `Most used tools: ${topTools.map(([name, count]) => `${name} (${count})`).join(', ')}`
      );
    }

    // Error pattern insights
    if (analysis.errorPatterns.length > 0) {
      insights.push(`Encountered ${analysis.errorPatterns.length} error patterns`);
    }

    // Code change insights
    if (analysis.codeChanges.length > 0) {
      insights.push(`Modified ${analysis.codeChanges.length} files`);
    }

    // Decision insights
    if (analysis.decisions.length > 0) {
      insights.push(`Made ${analysis.decisions.length} key decisions`);
    }

    return insights.slice(0, maxInsights);
  }

  /**
   * Identify areas for improvement
   */
  private async identifyImprovements(
    analysis: {
      taskSummary: string;
      toolUsage: Record<string, number>;
      errorPatterns: string[];
      codeChanges: string[];
      decisions: string[];
    },
    criterionScores: Array<{ name: string; score: number; reasoning: string }>,
    _conversation: ConversationMessage[]
  ): Promise<string[]> {
    const improvements: string[] = [];

    // Find low-scoring criteria
    for (const score of criterionScores) {
      if (score.score < 0.6) {
        switch (score.name) {
          case 'task_completion':
            improvements.push('Ensure task requirements are fully addressed');
            break;
          case 'code_quality':
            improvements.push('Improve code structure and readability');
            break;
          case 'error_handling':
            improvements.push('Add more comprehensive error handling');
            break;
          case 'test_coverage':
            improvements.push('Increase test coverage for new code');
            break;
        }
      }
    }

    // Error-based improvements
    if (analysis.errorPatterns.length > 2) {
      improvements.push('Reduce error frequency through better planning');
    }

    return improvements;
  }

  /**
   * Identify strengths from the analysis
   */
  private async identifyStrengths(
    analysis: {
      taskSummary: string;
      toolUsage: Record<string, number>;
      errorPatterns: string[];
      codeChanges: string[];
      decisions: string[];
    },
    criterionScores: Array<{ name: string; score: number; reasoning: string }>
  ): Promise<string[]> {
    const strengths: string[] = [];

    // Find high-scoring criteria
    for (const score of criterionScores) {
      if (score.score >= 0.8) {
        switch (score.name) {
          case 'task_completion':
            strengths.push('Task was completed successfully');
            break;
          case 'code_quality':
            strengths.push('Code quality is high');
            break;
          case 'error_handling':
            strengths.push('Error handling is robust');
            break;
          case 'test_coverage':
            strengths.push('Test coverage is good');
            break;
        }
      }
    }

    // Add general strengths
    if (analysis.errorPatterns.length === 0) {
      strengths.push('No errors encountered');
    }
    if (analysis.codeChanges.length > 0) {
      strengths.push('Made concrete code changes');
    }

    return strengths.length > 0 ? strengths : ['Task was attempted'];
  }

  /**
   * Suggest actions for next attempt
   */
  private async suggestActions(
    improvements: string[],
    insights: string[],
    _conversation: ConversationMessage[]
  ): Promise<string[]> {
    const actions: string[] = [];

    for (const improvement of improvements) {
      actions.push(`Address: ${improvement}`);
    }

    // Add specific actionable suggestions based on insights
    if (insights.some((i) => i.includes('error'))) {
      actions.push('Review error messages and add preventative checks');
    }

    if (actions.length === 0) {
      actions.push('Continue with current approach');
    }

    return actions;
  }

  /**
   * Store reflection in Beads memory
   */
  private async storeReflectionInBeads(
    _projectPath: string,
    _reflection: ReflectionResult,
    _taskDescription?: string
  ): Promise<boolean> {
    if (!this.beadsMemoryService) {
      return false;
    }

    try {
      // Query for similar reflections to avoid duplicates
      // (In production, this would check for similar recent reflections)
      // TODO: Store reflection in Beads memory
      void 0; // Placeholder for future implementation
    } catch (error) {
      console.error('Failed to store reflection in Beads:', error);
      return false;
    }

    return true;
  }

  /**
   * Format reflection for Beads storage
   */
  private formatReflectionForBeads(reflection: ReflectionResult, taskDescription?: string): string {
    const parts: string[] = [];

    if (taskDescription) {
      parts.push(`# Task: ${taskDescription}`);
    }

    parts.push(`## Reflection (${reflection.timestamp})`);
    parts.push(`Success Score: ${(reflection.successScore * 100).toFixed(1)}%`);

    if (reflection.strengths.length > 0) {
      parts.push('\n### Strengths');
      for (const strength of reflection.strengths) {
        parts.push(`- ${strength}`);
      }
    }

    if (reflection.improvements.length > 0) {
      parts.push('\n### Improvements Needed');
      for (const improvement of reflection.improvements) {
        parts.push(`- ${improvement}`);
      }
    }

    if (reflection.insights.length > 0) {
      parts.push('\n### Key Insights');
      for (const insight of reflection.insights) {
        parts.push(`- ${insight}`);
      }
    }

    if (reflection.suggestedActions.length > 0) {
      parts.push('\n### Suggested Actions');
      for (const action of reflection.suggestedActions) {
        parts.push(`- ${action}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Generate feedback for next retry attempt (Reflexion pattern)
   */
  private generateFeedback(reflection: ReflectionResult): string {
    const parts: string[] = [];

    parts.push('## Reflection Feedback');

    if (reflection.improvements.length > 0) {
      parts.push('\n### Areas to Improve:');
      for (const improvement of reflection.improvements) {
        parts.push(`- ${improvement}`);
      }
    }

    if (reflection.suggestedActions.length > 0) {
      parts.push('\n### Suggested Actions:');
      for (const action of reflection.suggestedActions) {
        parts.push(`- ${action}`);
      }
    }

    parts.push(`\n### Success Score: ${(reflection.successScore * 100).toFixed(1)}%`);
    parts.push('\nOn your next attempt, incorporate this feedback to improve the result.');

    return parts.join('\n');
  }

  /**
   * Extract task summary from conversation
   */
  private extractTaskSummary(conversation: ConversationMessage[]): string {
    const firstUserMessage = conversation.find((m) => m.role === 'user');
    if (firstUserMessage) {
      // Truncate to first 100 chars
      return firstUserMessage.content.slice(0, 100) + '...';
    }
    return 'Unknown task';
  }

  /**
   * Extract decisions from conversation
   */
  private extractDecisions(conversation: ConversationMessage[]): string[] {
    const decisions: string[] = [];
    const decisionKeywords = ['decided', 'chose', 'selected', 'option', 'approach'];

    for (const message of conversation) {
      if (message.role === 'assistant') {
        for (const keyword of decisionKeywords) {
          if (message.content.toLowerCase().includes(keyword)) {
            // Extract sentence containing the keyword
            const sentences = message.content.split(/[.!?]/);
            for (const sentence of sentences) {
              if (sentence.toLowerCase().includes(keyword)) {
                decisions.push(sentence.trim());
                break;
              }
            }
          }
        }
      }
    }

    return decisions;
  }

  /**
   * Add reflection to history
   */
  private addToHistory(projectPath: string, entry: ReflectionHistoryEntry): void {
    const history = this.reflectionHistory.get(projectPath) || [];
    history.push(entry);
    this.reflectionHistory.set(projectPath, history);
  }

  /**
   * Generate unique reflection ID
   */
  private generateReflectionId(): string {
    return `reflect-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
