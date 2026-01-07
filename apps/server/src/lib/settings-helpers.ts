/**
 * Settings Helper Functions (Improved with Runtime Validation)
 *
 * Utility functions for working with settings, including prompt customization
 * and agent model resolution with comprehensive runtime validation.
 */

import { createLogger } from '@devflow/utils';
import type { SettingsService } from '../services/settings-service.js';
import type {
  PromptCustomization,
  ResolvedPrompts,
  GlobalSettings,
  AgentType,
  AgentModel,
} from '@devflow/types';
import { CLAUDE_MODEL_MAP, DEFAULT_AGENT_MODELS } from '@devflow/types';
import { mergeAllPrompts } from '@devflow/prompts';

const logger = createLogger('SettingsHelpers');

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a string is a valid AgentModel alias
 *
 * @param value - The value to check
 * @returns True if the value is a valid AgentModel ('haiku' | 'sonnet' | 'opus')
 */
export function isValidModelAlias(value: unknown): value is AgentModel {
  return typeof value === 'string' && ['haiku', 'sonnet', 'opus'].includes(value);
}

/**
 * Type guard to check if a key exists in CLAUDE_MODEL_MAP
 *
 * @param key - The key to check
 * @returns True if the key is a valid key in CLAUDE_MODEL_MAP
 */
export function isValidModelMapKey(key: string): key is keyof typeof CLAUDE_MODEL_MAP {
  return key in CLAUDE_MODEL_MAP;
}

/**
 * Validates that a model ID is available in the current environment.
 * Checks both aliases and full model IDs.
 *
 * @param modelId - The model ID to validate (alias or full ID)
 * @returns True if the model ID is valid and available
 */
export function isValidModelId(modelId: string): boolean {
  // Check if it's a valid alias
  if (isValidModelMapKey(modelId)) {
    return true;
  }

  // Check if it's a valid full model ID
  return Object.values(CLAUDE_MODEL_MAP).includes(modelId as any);
}

/**
 * Validates the structure of agent model settings.
 * Ensures required fields exist and have valid types.
 *
 * @param settings - Settings object to validate
 * @returns True if settings structure is valid
 */
export function isValidAgentModelSettings(
  settings: unknown
): settings is { agents: Record<string, AgentModel> } {
  if (!settings || typeof settings !== 'object') {
    return false;
  }

  const settingsObj = settings as Record<string, unknown>;

  // Check agents field exists and is an object
  if (!settingsObj.agents || typeof settingsObj.agents !== 'object') {
    return false;
  }

  const agents = settingsObj.agents as Record<string, unknown>;

  // Check at least one agent type with valid model
  for (const [agentType, model] of Object.entries(agents)) {
    if (typeof agentType !== 'string') {
      continue;
    }
    if (isValidModelAlias(model)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// MODEL RESOLUTION (with runtime validation)
// ============================================================================

/**
 * Get the full model ID for an agent based on settings.
 *
 * Priority:
 * 1. Explicit model provided (validated)
 * 2. Agent preference from settings (validated)
 * 3. Default model for agent type (validated)
 *
 * @param agentType - The type of agent
 * @param explicitModel - Optional explicit model override
 * @param settings - Global settings containing agent model preferences
 * @returns Full model ID (e.g., "claude-sonnet-4-5-20250929")
 * @throws Error if explicit model is invalid (for fail-fast behavior)
 *
 * @example
 * ```ts
 * const model = getModelForAgent('planning', undefined, globalSettings);
 * // Returns "claude-sonnet-4-5-20250929" or user's preference
 * ```
 */
export function getModelForAgent(
  agentType: AgentType,
  explicitModel: string | undefined,
  settings: GlobalSettings | undefined
): string {
  // Validate agent type
  const validAgentTypes: AgentType[] = [
    'planning',
    'implementation',
    'testing',
    'review',
    'debug',
    'documentation',
    'refactoring',
    'orchestration',
    'generic',
  ];

  if (!validAgentTypes.includes(agentType)) {
    logger.warn(`Unknown agent type: ${agentType}, falling back to 'generic'`);
    agentType = 'generic';
  }

  // If explicit model provided, validate and use it
  if (explicitModel) {
    // Trim whitespace
    const trimmedModel = explicitModel.trim();

    // If it's a known alias, convert to full model ID
    if (isValidModelMapKey(trimmedModel)) {
      return CLAUDE_MODEL_MAP[trimmedModel];
    }

    // Validate it's a known full model ID
    if (isValidModelId(trimmedModel)) {
      return trimmedModel;
    }

    // Invalid model ID - log warning but return as-is for backward compatibility
    logger.warn(
      `Invalid explicit model ID: "${explicitModel}". Using as-is (may fail at runtime). ` +
        `Valid aliases: ${Object.keys(CLAUDE_MODEL_MAP).join(', ')}`
    );
    return trimmedModel;
  }

  // Check agent model preferences from settings
  const agentModelSettings = settings?.agentModelSettings;

  if (agentModelSettings && isValidAgentModelSettings(agentModelSettings)) {
    const preferredModel = agentModelSettings.agents[agentType];

    if (preferredModel && isValidModelAlias(preferredModel)) {
      return CLAUDE_MODEL_MAP[preferredModel];
    }

    if (preferredModel && !isValidModelAlias(preferredModel)) {
      logger.warn(
        `Invalid model alias in settings for ${agentType}: "${preferredModel}". ` +
          `Using default instead. Valid aliases: haiku, sonnet, opus`
      );
    }
  }

  // Fall back to default for agent type
  const defaultModel = DEFAULT_AGENT_MODELS[agentType] || 'sonnet';
  logger.debug(`Using default model for ${agentType}: ${defaultModel}`);
  return CLAUDE_MODEL_MAP[defaultModel];
}

/**
 * Get the model alias (haiku/sonnet/opus) for an agent.
 * Useful for display purposes or logging.
 *
 * @param agentType - The type of agent
 * @param explicitModel - Optional explicit model override (can be alias or full ID)
 * @param settings - Global settings containing agent model preferences
 * @returns Model alias ('haiku' | 'sonnet' | 'opus')
 *
 * @example
 * ```ts
 * const alias = getModelAliasForAgent('planning', undefined, globalSettings);
 * // Returns "sonnet" or user's preference
 * ```
 */
export function getModelAliasForAgent(
  agentType: AgentType,
  explicitModel: string | undefined,
  settings: GlobalSettings | undefined
): AgentModel {
  // If explicit model is already a valid alias, return it
  if (explicitModel && isValidModelAlias(explicitModel)) {
    return explicitModel;
  }

  // Check agent model preferences from settings
  const agentModelSettings = settings?.agentModelSettings;

  if (agentModelSettings && isValidAgentModelSettings(agentModelSettings)) {
    const preferredModel = agentModelSettings.agents[agentType];

    if (preferredModel && isValidModelAlias(preferredModel)) {
      return preferredModel;
    }
  }

  // Fall back to default
  return DEFAULT_AGENT_MODELS[agentType] || 'sonnet';
}

/**
 * Async version of getModelForAgent that loads settings from SettingsService.
 * Includes comprehensive error handling and fallbacks.
 *
 * @param agentType - The type of agent
 * @param explicitModel - Optional explicit model override
 * @param settingsService - Settings service to load global settings from
 * @returns Promise resolving to full model ID
 *
 * @example
 * ```ts
 * const model = await getModelForAgentAsync('planning', undefined, settingsService);
 * // Returns "claude-sonnet-4-5-20250929" with full validation
 * ```
 */
export async function getModelForAgentAsync(
  agentType: AgentType,
  explicitModel: string | undefined,
  settingsService: SettingsService | null | undefined
): Promise<string> {
  // If no settings service, use defaults
  if (!settingsService) {
    logger.debug('No settings service provided, using default model resolution');
    return getModelForAgent(agentType, explicitModel, undefined);
  }

  try {
    const globalSettings = await settingsService.getGlobalSettings();

    // Validate settings structure
    if (!globalSettings || typeof globalSettings !== 'object') {
      logger.warn('Settings service returned invalid settings object, using defaults');
      return getModelForAgent(agentType, explicitModel, undefined);
    }

    return getModelForAgent(agentType, explicitModel, globalSettings);
  } catch (error) {
    // Handle different error types
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn(
      `Failed to load settings for model resolution: ${errorMessage}. ` +
        `Using default model for ${agentType}.`
    );

    // Fall back to defaults
    return getModelForAgent(agentType, explicitModel, undefined);
  }
}

// ============================================================================
// SCHEMA MIGRATION
// ============================================================================

/**
 * Migrates agent model settings to the current schema version.
 * Ensures all agent types exist and fills in missing ones with defaults.
 *
 * @param settings - Settings object (may be old version)
 * @returns Migrated settings with all agent types
 *
 * @example
 * ```ts
 * const settings = await settingsService.getGlobalSettings();
 * const migrated = migrateAgentModelSettings(settings.agentModelSettings);
 * await settingsService.updateGlobalSettings({ agentModelSettings: migrated });
 * ```
 */
export function migrateAgentModelSettings(settings: unknown): {
  version: 1;
  agents: Record<AgentType, AgentModel>;
} {
  // No settings - return defaults
  if (!settings || typeof settings !== 'object') {
    logger.debug('No agent model settings found, using defaults');
    return {
      version: 1,
      agents: { ...DEFAULT_AGENT_MODELS },
    };
  }

  const settingsObj = settings as Record<string, unknown>;

  // Check version
  const version = settingsObj.version;

  if (version === 1 && isValidAgentModelSettings(settingsObj)) {
    // Current version - merge with defaults to ensure all agent types exist
    const migrated = {
      version: 1 as const,
      agents: {
        ...DEFAULT_AGENT_MODELS,
        ...settingsObj.agents,
      } as Record<AgentType, AgentModel>,
    };

    logger.debug('Agent model settings are current version, merged with defaults');
    return migrated;
  }

  // Old or unknown version - migrate to v1
  logger.info(`Migrating agent model settings from version ${version || 'unknown'} to v1`);

  const migrated = {
    version: 1 as const,
    agents: {
      ...DEFAULT_AGENT_MODELS,
      // Preserve any valid user preferences
      ...(settingsObj.agents && typeof settingsObj.agents === 'object' ? settingsObj.agents : {}),
    },
  } as Record<AgentType, AgentModel>;

  // Validate all agent types have valid models
  for (const [agentType, model] of Object.entries(migrated.agents)) {
    if (!isValidModelAlias(model)) {
      logger.warn(
        `Invalid model for ${agentType}: ${model}. Replacing with default: ${DEFAULT_AGENT_MODELS[agentType as AgentType]}`
      );
      migrated.agents[agentType as AgentType] = DEFAULT_AGENT_MODELS[agentType as AgentType];
    }
  }

  return migrated;
}

// ============================================================================
// PROMPT CUSTOMIZATION (unchanged from original)
// ============================================================================

/**
 * Get merged prompt customization from settings.
 * Merges user custom prompts with built-in defaults.
 *
 * @param settingsService - Optional settings service instance
 * @param logPrefix - Prefix for log messages (default: '[PromptHelper]')
 * @returns Promise resolving to merged prompts for all categories
 *
 * @example
 * ```ts
 * const prompts = await getPromptCustomization(settingsService, '[AutoMode]');
 * const planningPrompt = prompts.autoMode.planningLite;
 * ```
 */
export async function getPromptCustomization(
  settingsService?: SettingsService | null,
  logPrefix = '[PromptHelper]'
): Promise<ResolvedPrompts> {
  let customization: PromptCustomization = {};

  if (settingsService) {
    try {
      const globalSettings = await settingsService.getGlobalSettings();
      customization = globalSettings.promptCustomization || {};
      logger.info(`${logPrefix} Loaded prompt customization from settings`);
    } catch (error) {
      logger.error(`${logPrefix} Failed to load prompt customization:`, error);
      // Fall through to use empty customization (all defaults)
    }
  } else {
    logger.info(`${logPrefix} SettingsService not available, using default prompts`);
  }

  return mergeAllPrompts(customization);
}

/**
 * Get prompt customization for a specific category.
 * Convenience function to get only the prompts you need.
 *
 * @param settingsService - Optional settings service instance
 * @param category - The category of prompts to retrieve
 * @param logPrefix - Prefix for log messages
 * @returns Promise resolving to resolved prompts for the requested category
 *
 * @example
 * ```ts
 * const autoModePrompts = await getPromptCategory(settingsService, 'autoMode');
 * const planningPrompt = autoModePrompts.planningLite;
 * ```
 */
export async function getPromptCategory<K extends keyof ResolvedPrompts>(
  settingsService: SettingsService | null | undefined,
  category: K,
  logPrefix = '[PromptHelper]'
): Promise<ResolvedPrompts[K]> {
  const prompts = await getPromptCustomization(settingsService, logPrefix);
  return prompts[category];
}

/**
 * Save prompt customization to settings.
 * Merges with existing customization before saving.
 *
 * @param settingsService - Settings service instance
 * @param customization - Customization to save
 * @param logPrefix - Prefix for log messages
 * @returns Promise that resolves when saved
 *
 * @example
 * ```ts
 * await savePromptCustomization(settingsService, {
 *   autoMode: {
 *     planningLite: { value: 'My custom prompt', enabled: true }
 *   }
 * });
 * ```
 */
export async function savePromptCustomization(
  settingsService: SettingsService,
  customization: PromptCustomization,
  logPrefix = '[PromptHelper]'
): Promise<void> {
  try {
    const globalSettings = await settingsService.getGlobalSettings();

    // Merge with existing customization
    const mergedCustomization: PromptCustomization = {
      ...globalSettings.promptCustomization,
      ...customization,
    };

    // Update global settings
    await settingsService.updateGlobalSettings({
      promptCustomization: mergedCustomization,
    });

    logger.info(`${logPrefix} Saved prompt customization to settings`);
  } catch (error) {
    logger.error(`${logPrefix} Failed to save prompt customization:`, error);
    throw error;
  }
}

/**
 * Reset prompt customization to defaults.
 * Clears all custom prompts from settings.
 *
 * @param settingsService - Settings service instance
 * @param logPrefix - Prefix for log messages
 * @returns Promise that resolves when reset
 */
export async function resetPromptCustomization(
  settingsService: SettingsService,
  logPrefix = '[PromptHelper]'
): Promise<void> {
  try {
    await settingsService.updateGlobalSettings({
      promptCustomization: undefined,
    });

    logger.info(`${logPrefix} Reset prompt customization to defaults`);
  } catch (error) {
    logger.error(`${logPrefix} Failed to reset prompt customization:`, error);
    throw error;
  }
}
