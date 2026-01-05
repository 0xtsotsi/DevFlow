/**
 * @automaker/prompts
 * AI prompt templates for AutoMaker
 */

// Enhancement prompts
export {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
  IMPROVE_EXAMPLES,
  TECHNICAL_EXAMPLES,
  SIMPLIFY_EXAMPLES,
  ACCEPTANCE_EXAMPLES,
  getEnhancementPrompt,
  getSystemPrompt,
  getExamples,
  buildUserPrompt,
  isValidEnhancementMode,
  getAvailableEnhancementModes,
} from './enhancement.js';

// Reflect skill prompts
export {
  REFLECT_ANALYSIS_PROMPT,
  REFLEXION_FEEDBACK_PROMPT,
  SELF_EVALUATION_PROMPT,
  CONVERSATION_ANALYSIS_PROMPT,
  REFLECTION_SUMMARY_PROMPT,
  TASK_REFLECTION_PROMPTS,
  getTaskReflectionPrompt,
  formatReflectionForDisplay,
  formatFeedbackForNextAttempt,
  type TaskReflectionPrompt,
  type ReflectionDisplayData,
} from './reflect.js';

// Default prompts for customization
export {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
} from './defaults.js';

// Merge utilities for prompt customization
export {
  mergeAutoModePrompts,
  mergeAgentPrompts,
  mergeBacklogPlanPrompts,
  mergeEnhancementPrompts,
  mergeAllPrompts,
} from './merge.js';

// Re-export types from @automaker/types
export type {
  EnhancementMode,
  EnhancementExample,
  CustomPrompt,
  AutoModePrompts,
  AgentPrompts,
  BacklogPlanPrompts,
  EnhancementPrompts,
  PromptCustomization,
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
  ResolvedPrompts,
} from '@automaker/types';
