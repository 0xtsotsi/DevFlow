/**
 * Specialized Worker Agents Module
 *
 * This module provides a comprehensive system for working with specialized
 * worker agents that handle specific types of tasks in the AutoMode system.
 *
 * Features:
 * - Agent Type definitions and interfaces
 * - Agent Registry for managing available agents
 * - Task Classifier for automatic agent selection
 * - Specialized Agent Service for executing tasks with appropriate agents
 * - Specialized system prompts for each agent type
 *
 * @example
 * ```typescript
 * import { specializedAgentService } from './agents';
 *
 * // Classify a task and get recommended agent
 * const { recommendedAgent, classification } = specializedAgentService.classifyTask(
 *   "Write tests for the user authentication module"
 * );
 *
 * // Execute task with the recommended agent
 * const result = await specializedAgentService.executeTaskWithAgent(
 *   {
 *     featureId: 'auth-tests',
 *     projectPath: '/path/to/project',
 *     cwd: '/path/to/project',
 *     abortController: new AbortController(),
 *   },
 *   "Write comprehensive tests for the user authentication module"
 * );
 * ```
 */

// Re-export types
export * from '@automaker/types'; // AgentType, AgentConfig, etc.

// Re-export agent prompts and configurations
export { AGENT_SYSTEM_PROMPTS, getAgentConfigurations } from './agent-prompts.js';

// Re-export task classifier
export { TaskClassifier, taskClassifier } from './task-classifier.js';

// Re-export agent registry
export { AgentRegistry, agentRegistry } from './agent-registry.js';

// Re-export specialized agent service
export { SpecializedAgentService, specializedAgentService } from './specialized-agent-service.js';
