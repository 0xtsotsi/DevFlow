/**
 * Prompt Merge Utilities
 *
 * Merges user-customized prompts with built-in defaults.
 * Custom prompts have an enabled flag - when true, the custom value is used.
 * When false or undefined, the default is used instead.
 */

import type {
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

import {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
} from './defaults.js';

/**
 * Resolve a custom prompt to its effective string value
 * @param custom - The custom prompt (optional)
 * @param defaultValue - The default prompt value
 * @returns The resolved prompt string (custom if enabled, otherwise default)
 */
function resolvePrompt(custom: CustomPrompt | undefined, defaultValue: string): string {
  return custom?.enabled ? custom.value : defaultValue;
}

/**
 * Merge custom Auto Mode prompts with defaults
 * @param custom - Custom auto mode prompts (optional)
 * @returns Resolved auto mode prompts with defaults filled in
 */
export function mergeAutoModePrompts(custom?: AutoModePrompts): ResolvedAutoModePrompts {
  return {
    planningLite: resolvePrompt(custom?.planningLite, DEFAULT_AUTO_MODE_PROMPTS.planningLite),
    planningLiteWithApproval: resolvePrompt(
      custom?.planningLiteWithApproval,
      DEFAULT_AUTO_MODE_PROMPTS.planningLiteWithApproval
    ),
    planningSpec: resolvePrompt(custom?.planningSpec, DEFAULT_AUTO_MODE_PROMPTS.planningSpec),
    planningFull: resolvePrompt(custom?.planningFull, DEFAULT_AUTO_MODE_PROMPTS.planningFull),
    featurePromptTemplate: resolvePrompt(
      custom?.featurePromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.featurePromptTemplate
    ),
    followUpPromptTemplate: resolvePrompt(
      custom?.followUpPromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.followUpPromptTemplate
    ),
    continuationPromptTemplate: resolvePrompt(
      custom?.continuationPromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.continuationPromptTemplate
    ),
    pipelineStepPromptTemplate: resolvePrompt(
      custom?.pipelineStepPromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.pipelineStepPromptTemplate
    ),
  };
}

/**
 * Merge custom Agent prompts with defaults
 * @param custom - Custom agent prompts (optional)
 * @returns Resolved agent prompts with defaults filled in
 */
export function mergeAgentPrompts(custom?: AgentPrompts): ResolvedAgentPrompts {
  return {
    systemPrompt: resolvePrompt(custom?.systemPrompt, DEFAULT_AGENT_PROMPTS.systemPrompt),
  };
}

/**
 * Merge custom Backlog Plan prompts with defaults
 * @param custom - Custom backlog plan prompts (optional)
 * @returns Resolved backlog plan prompts with defaults filled in
 */
export function mergeBacklogPlanPrompts(custom?: BacklogPlanPrompts): ResolvedBacklogPlanPrompts {
  return {
    systemPrompt: resolvePrompt(custom?.systemPrompt, DEFAULT_BACKLOG_PLAN_PROMPTS.systemPrompt),
    userPromptTemplate: resolvePrompt(
      custom?.userPromptTemplate,
      DEFAULT_BACKLOG_PLAN_PROMPTS.userPromptTemplate
    ),
  };
}

/**
 * Merge custom Enhancement prompts with defaults
 * @param custom - Custom enhancement prompts (optional)
 * @returns Resolved enhancement prompts with defaults filled in
 */
export function mergeEnhancementPrompts(custom?: EnhancementPrompts): ResolvedEnhancementPrompts {
  return {
    improveSystemPrompt: resolvePrompt(
      custom?.improveSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.improveSystemPrompt
    ),
    technicalSystemPrompt: resolvePrompt(
      custom?.technicalSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.technicalSystemPrompt
    ),
    simplifySystemPrompt: resolvePrompt(
      custom?.simplifySystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.simplifySystemPrompt
    ),
    acceptanceSystemPrompt: resolvePrompt(
      custom?.acceptanceSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.acceptanceSystemPrompt
    ),
  };
}

/**
 * Merge all custom prompts with defaults
 * @param custom - Complete prompt customization (optional)
 * @returns All resolved prompts with defaults filled in
 */
export function mergeAllPrompts(custom?: PromptCustomization): ResolvedPrompts {
  return {
    autoMode: mergeAutoModePrompts(custom?.autoMode),
    agent: mergeAgentPrompts(custom?.agent),
    backlogPlan: mergeBacklogPlanPrompts(custom?.backlogPlan),
    enhancement: mergeEnhancementPrompts(custom?.enhancement),
  };
}
