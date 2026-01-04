/**
 * Prompt customization types for DevFlow
 *
 * Allows users to customize AI prompts for different features while
 * preserving default values when disabled.
 */

/**
 * A custom prompt with its value and enabled state
 * The value is always preserved even when disabled
 */
export interface CustomPrompt {
  /** The custom prompt text */
  value: string;
  /** Whether this custom prompt should be used */
  enabled: boolean;
}

/**
 * Customizable prompts for Auto Mode
 */
export interface AutoModePrompts {
  planningLite?: CustomPrompt;
  planningLiteWithApproval?: CustomPrompt;
  planningSpec?: CustomPrompt;
  planningFull?: CustomPrompt;
  featurePromptTemplate?: CustomPrompt;
  followUpPromptTemplate?: CustomPrompt;
  continuationPromptTemplate?: CustomPrompt;
  pipelineStepPromptTemplate?: CustomPrompt;
}

/**
 * Customizable prompts for Agent Runner (chat)
 */
export interface AgentPrompts {
  systemPrompt?: CustomPrompt;
}

/**
 * Customizable prompts for Backlog Planning
 */
export interface BacklogPlanPrompts {
  systemPrompt?: CustomPrompt;
  userPromptTemplate?: CustomPrompt;
}

/**
 * Customizable prompts for Feature Enhancement
 */
export interface EnhancementPrompts {
  improveSystemPrompt?: CustomPrompt;
  technicalSystemPrompt?: CustomPrompt;
  simplifySystemPrompt?: CustomPrompt;
  acceptanceSystemPrompt?: CustomPrompt;
}

/**
 * Complete set of customizable prompts
 */
export interface PromptCustomization {
  autoMode?: AutoModePrompts;
  agent?: AgentPrompts;
  backlogPlan?: BacklogPlanPrompts;
  enhancement?: EnhancementPrompts;
}

/**
 * Resolved prompts with defaults merged in
 */
export interface ResolvedAutoModePrompts {
  planningLite: string;
  planningLiteWithApproval: string;
  planningSpec: string;
  planningFull: string;
  featurePromptTemplate: string;
  followUpPromptTemplate: string;
  continuationPromptTemplate: string;
  pipelineStepPromptTemplate: string;
}

export interface ResolvedAgentPrompts {
  systemPrompt: string;
}

export interface ResolvedBacklogPlanPrompts {
  systemPrompt: string;
  userPromptTemplate: string;
}

export interface ResolvedEnhancementPrompts {
  improveSystemPrompt: string;
  technicalSystemPrompt: string;
  simplifySystemPrompt: string;
  acceptanceSystemPrompt: string;
}

/**
 * All resolved prompts merged together
 */
export interface ResolvedPrompts {
  autoMode: ResolvedAutoModePrompts;
  agent: ResolvedAgentPrompts;
  backlogPlan: ResolvedBacklogPlanPrompts;
  enhancement: ResolvedEnhancementPrompts;
}
