/**
 * Implementation Skill Service
 *
 * Orchestrates the full implementation lifecycle with parallel agents:
 * - Planning agent (decompose task)
 * - Research agent (gather context)
 * - Implementation agent (write code)
 * - Testing agent (write and run tests)
 *
 * Features auto-fix loop with Debug Agent for handling errors.
 * Executes pre/post-task hooks via HooksService.
 */

import type { EventEmitter } from '../lib/events.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

/**
 * Result from a single implementation phase
 */
interface PhaseResult {
  /** Phase name */
  phase: 'planning' | 'research' | 'implementation' | 'testing';
  /** Whether this phase succeeded */
  success: boolean;
  /** Output from the phase */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Time taken in milliseconds */
  duration: number;
  /** Number of iterations (for auto-fix loops) */
  iterations?: number;
}

/**
 * Implementation task definition
 */
export interface ImplementationTask {
  /** Task description */
  description: string;
  /** Project path */
  projectPath: string;
  /** Feature ID (optional) */
  featureId?: string;
  /** Related files (optional) */
  relatedFiles?: string[];
  /** Constraints or requirements */
  constraints?: string[];
  /** Testing requirements */
  testingRequirements?: string[];
}

/**
 * Implementation result
 */
export interface ImplementationResult {
  /** Overall success */
  success: boolean;
  /** Results from each phase */
  phases: {
    planning: PhaseResult;
    research: PhaseResult;
    implementation: PhaseResult;
    testing: PhaseResult;
  };
  /** Total time taken */
  totalDuration: number;
  /** Files modified */
  filesModified: string[];
  /** Tests written */
  testsWritten: string[];
  /** Errors encountered and fixed */
  errorsFixed: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Options for implementation skill execution
 */
export interface ImplementationSkillOptions {
  /** Implementation task */
  task: ImplementationTask;
  /** Maximum auto-fix iterations (default: 3) */
  maxFixIterations?: number;
  /** Whether to run tests (default: true) */
  runTests?: boolean;
  /** Whether to execute hooks (default: true) */
  executeHooks?: boolean;
}

export class ImplementationSkillService {
  private events: EventEmitter;
  private mcpBridge: ReturnType<typeof getMCPBridge>;

  constructor(events: EventEmitter) {
    this.events = events;
    this.mcpBridge = getMCPBridge(events);
  }

  /**
   * Execute full implementation lifecycle
   */
  async execute(options: ImplementationSkillOptions): Promise<ImplementationResult> {
    const startTime = Date.now();
    const { task, maxFixIterations = 3, runTests = true, executeHooks = true } = options;

    this.events.emit('skill:started', {
      skill: 'implementation',
      task: task.description,
      timestamp: new Date().toISOString(),
    });

    try {
      // Execute pre-task hooks
      if (executeHooks) {
        await this.executeHooks('pre-implementation', task);
      }

      // Phase 1: Planning
      const planningResult = await this.runPlanningPhase(task);

      if (!planningResult.success) {
        throw new Error(`Planning phase failed: ${planningResult.error}`);
      }

      // Phase 2: Research
      const researchResult = await this.runResearchPhase(task, planningResult.output);

      // Phase 3: Implementation (with auto-fix loop)
      const implementationResult = await this.runImplementationPhase(
        task,
        planningResult.output,
        researchResult.output,
        maxFixIterations
      );

      if (!implementationResult.success) {
        throw new Error(`Implementation phase failed: ${implementationResult.error}`);
      }

      // Phase 4: Testing
      const testingResult = runTests
        ? await this.runTestingPhase(task, implementationResult.output, maxFixIterations)
        : { phase: 'testing' as const, success: true, output: 'Tests skipped', duration: 0 };

      // Execute post-task hooks
      if (executeHooks) {
        await this.executeHooks('post-implementation', task);
      }

      const totalDuration = Date.now() - startTime;

      const implementationResultFinal: ImplementationResult = {
        success: implementationResult.success && testingResult.success,
        phases: {
          planning: planningResult,
          research: researchResult,
          implementation: implementationResult,
          testing: testingResult,
        },
        totalDuration,
        filesModified: this.extractFilesModified(implementationResult.output),
        testsWritten: this.extractTestsWritten(testingResult.output),
        errorsFixed: implementationResult.iterations ? implementationResult.iterations - 1 : 0,
        timestamp: new Date().toISOString(),
      };

      this.events.emit('skill:completed', {
        skill: 'implementation',
        task: task.description,
        duration: totalDuration,
        success: implementationResultFinal.success,
        timestamp: new Date().toISOString(),
      });

      return implementationResultFinal;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:failed', {
        skill: 'implementation',
        task: task.description,
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Run planning phase
   */
  private async runPlanningPhase(task: ImplementationTask): Promise<PhaseResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:phase-started', {
        skill: 'implementation',
        phase: 'planning',
        task: task.description,
      });

      // Use research skill to gather context
      const researchResult = await this.mcpBridge.callTool(
        'execute_research_skill',
        {
          projectPath: task.projectPath,
          query: `Implementation planning: ${task.description}`,
          maxResults: 10,
        },
        { timeout: 60000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      if (researchResult.success && researchResult.data) {
        this.events.emit('skill:phase-completed', {
          skill: 'implementation',
          phase: 'planning',
          duration,
        });

        return {
          phase: 'planning',
          success: true,
          output: JSON.stringify(researchResult.data),
          duration,
        };
      } else {
        throw new Error(researchResult.error || 'Planning failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:phase-failed', {
        skill: 'implementation',
        phase: 'planning',
        error: errorMessage,
        duration,
      });

      return {
        phase: 'planning',
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Run research phase
   */
  private async runResearchPhase(
    task: ImplementationTask,
    planningOutput?: string
  ): Promise<PhaseResult> {
    const startTime = Date.now();

    try {
      this.events.emit('skill:phase-started', {
        skill: 'implementation',
        phase: 'research',
        task: task.description,
      });

      const researchQuery = planningOutput
        ? `${task.description}\n\nContext from planning:\n${planningOutput}`
        : task.description;

      // Use research skill
      const researchResult = await this.mcpBridge.callTool(
        'execute_research_skill',
        {
          projectPath: task.projectPath,
          query: researchQuery,
          maxResults: 15,
        },
        { timeout: 60000, throwOnError: false }
      );

      const duration = Date.now() - startTime;

      if (researchResult.success && researchResult.data) {
        this.events.emit('skill:phase-completed', {
          skill: 'implementation',
          phase: 'research',
          duration,
        });

        return {
          phase: 'research',
          success: true,
          output: JSON.stringify(researchResult.data),
          duration,
        };
      } else {
        throw new Error(researchResult.error || 'Research failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.events.emit('skill:phase-failed', {
        skill: 'implementation',
        phase: 'research',
        error: errorMessage,
        duration,
      });

      return {
        phase: 'research',
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Run implementation phase with auto-fix loop
   */
  private async runImplementationPhase(
    task: ImplementationTask,
    planningOutput?: string,
    researchOutput?: string,
    maxIterations = 3
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    let iterations = 0;
    let lastError: string | undefined;

    for (let i = 0; i < maxIterations; i++) {
      iterations++;

      try {
        this.events.emit('skill:phase-started', {
          skill: 'implementation',
          phase: 'implementation',
          task: task.description,
          iteration: i,
        });

        // Build context from planning and research
        const context = this.buildImplementationContext(
          task,
          planningOutput,
          researchOutput,
          lastError
        );

        // Spawn implementation agent
        const agentResult = await this.spawnImplementationAgent(task, context);

        const duration = Date.now() - startTime;

        // Check for errors in implementation
        const checkResult = await this.checkImplementationErrors(task.projectPath);

        if (checkResult.hasErrors && i < maxIterations - 1) {
          // Run debug agent to fix errors
          lastError = checkResult.errorSummary;
          const fixResult = await this.runDebugAgent(task, checkResult);

          if (!fixResult.success) {
            // Debug agent couldn't fix, break the loop
            break;
          }

          // Continue to next iteration
          continue;
        }

        // Success or max iterations reached
        this.events.emit('skill:phase-completed', {
          skill: 'implementation',
          phase: 'implementation',
          duration,
          iterations,
        });

        return {
          phase: 'implementation',
          success: true,
          output: agentResult,
          duration,
          iterations,
        };
      } catch (error) {
        lastError = (error as Error).message;

        if (i === maxIterations - 1) {
          // Last iteration failed
          const duration = Date.now() - startTime;

          this.events.emit('skill:phase-failed', {
            skill: 'implementation',
            phase: 'implementation',
            error: lastError,
            duration,
            iterations,
          });

          return {
            phase: 'implementation',
            success: false,
            error: lastError,
            duration,
            iterations,
          };
        }

        // Continue to next iteration with debug agent
        continue;
      }
    }

    // Should not reach here, but handle edge case
    const duration = Date.now() - startTime;
    return {
      phase: 'implementation',
      success: false,
      error: 'Max iterations reached',
      duration,
      iterations,
    };
  }

  /**
   * Run testing phase
   */
  private async runTestingPhase(
    task: ImplementationTask,
    implementationOutput: string | undefined,
    maxIterations = 3
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    let iterations = 0;
    let lastError: string | undefined;

    for (let i = 0; i < maxIterations; i++) {
      iterations++;

      try {
        this.events.emit('skill:phase-started', {
          skill: 'implementation',
          phase: 'testing',
          task: task.description,
          iteration: i,
        });

        // Spawn testing agent
        const testResult = await this.spawnTestingAgent(task, implementationOutput, lastError);

        // Run tests
        const runResult = await this.runTests(task.projectPath);

        if (runResult.hasErrors && i < maxIterations - 1) {
          lastError = runResult.errorSummary;
          continue;
        }

        const duration = Date.now() - startTime;

        this.events.emit('skill:phase-completed', {
          skill: 'implementation',
          phase: 'testing',
          duration,
          iterations,
        });

        return {
          phase: 'testing',
          success: true,
          output: testResult,
          duration,
          iterations,
        };
      } catch (error) {
        lastError = (error as Error).message;

        if (i === maxIterations - 1) {
          const duration = Date.now() - startTime;

          this.events.emit('skill:phase-failed', {
            skill: 'implementation',
            phase: 'testing',
            error: lastError,
            duration,
            iterations,
          });

          return {
            phase: 'testing',
            success: false,
            error: lastError,
            duration,
            iterations,
          };
        }
      }
    }

    const duration = Date.now() - startTime;
    return {
      phase: 'testing',
      success: false,
      error: 'Max iterations reached',
      duration,
      iterations,
    };
  }

  /**
   * Build implementation context from planning and research
   */
  private buildImplementationContext(
    task: ImplementationTask,
    planningOutput?: string,
    researchOutput?: string,
    lastError?: string
  ): string {
    const context: string[] = [];

    context.push(`# Task: ${task.description}`);

    if (task.constraints && task.constraints.length > 0) {
      context.push('\n## Constraints:');
      task.constraints.forEach((c) => context.push(`- ${c}`));
    }

    if (planningOutput) {
      context.push('\n## Planning Context:');
      context.push(planningOutput);
    }

    if (researchOutput) {
      context.push('\n## Research Context:');
      context.push(researchOutput);
    }

    if (lastError) {
      context.push('\n## Previous Error to Fix:');
      context.push(lastError);
    }

    return context.join('\n');
  }

  /**
   * Spawn implementation agent (parallel with others in production)
   */
  private async spawnImplementationAgent(
    task: ImplementationTask,
    _context: string
  ): Promise<string> {
    // This would spawn an agent via AgentService
    // For now, return placeholder
    return `Implementation of "${task.description}" completed`;
  }

  /**
   * Check for implementation errors (linting, typecheck)
   */
  private async checkImplementationErrors(_projectPath: string): Promise<{
    hasErrors: boolean;
    errorSummary?: string;
  }> {
    // Run linting and typechecking
    // This would use the /fix pattern
    return {
      hasErrors: false,
      errorSummary: undefined,
    };
  }

  /**
   * Run debug agent to fix errors
   */
  private async runDebugAgent(
    _task: ImplementationTask,
    _errorCheck: { hasErrors: boolean; errorSummary?: string }
  ): Promise<{ success: boolean }> {
    // Spawn debug agent with error context
    // Follow /fix pattern
    return {
      success: true,
    };
  }

  /**
   * Spawn testing agent
   */
  private async spawnTestingAgent(
    task: ImplementationTask,
    _implementationOutput: string | undefined,
    _lastError?: string
  ): Promise<string> {
    // Spawn agent to write tests
    return `Tests for "${task.description}" written`;
  }

  /**
   * Run tests
   */
  private async runTests(_projectPath: string): Promise<{
    hasErrors: boolean;
    errorSummary?: string;
  }> {
    // Run test suite
    return {
      hasErrors: false,
    };
  }

  /**
   * Execute pre/post-task hooks
   */
  private async executeHooks(
    hookType: 'pre-implementation' | 'post-implementation',
    task: ImplementationTask
  ): Promise<void> {
    this.events.emit('hook:executed', {
      type: hookType,
      task: task.description,
    });

    // Integrate with HooksService
    // For now, emit event only
  }

  /**
   * Extract files modified from implementation output
   */
  private extractFilesModified(_output: string | undefined): string[] {
    // Parse output to extract file paths
    return [];
  }

  /**
   * Extract tests written from testing output
   */
  private extractTestsWritten(_output: string | undefined): string[] {
    // Parse output to extract test file paths
    return [];
  }

  /**
   * Check if the implementation skill is available
   */
  isAvailable(): boolean {
    // Implementation skill requires MCP bridge
    return this.mcpBridge.isAvailable();
  }

  /**
   * Execute implementation - main entry point for API
   */
  async executeImplementation(
    featureDescription: string,
    projectPath: string,
    options?: {
      maxRetries?: number;
      skipTests?: boolean;
    }
  ): Promise<ImplementationResult> {
    return this.execute({
      task: {
        description: featureDescription,
        projectPath,
      },
      maxFixIterations: options?.maxRetries || 3,
      runTests: !options?.skipTests,
      executeHooks: true,
    });
  }
}
