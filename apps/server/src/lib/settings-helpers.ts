/**
 * Settings Helper Functions
 *
 * Utility functions for working with settings, including prompt customization.
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../services/settings-service.js';
import type {
  PromptCustomization,
  ResolvedPrompts,
  GlobalSettings,
  AgentType,
  AgentModel,
} from '@automaker/types';
import { CLAUDE_MODEL_MAP, DEFAULT_AGENT_MODELS } from '@automaker/types';
import { mergeAllPrompts } from '@automaker/prompts';

const logger = createLogger('SettingsHelpers');

/**
 * Type guard to check if a string is a valid AgentModel alias
 *
 * @param value - The value to check
 * @returns True if the value is a valid AgentModel ('haiku' | 'sonnet' | 'opus')
 */
function isValidModelAlias(value: string): value is AgentModel {
  return ['haiku', 'sonnet', 'opus'].includes(value);
}

/**
 * Type guard to check if a key exists in CLAUDE_MODEL_MAP
 *
 * @param key - The key to check
 * @returns True if the key is a valid key in CLAUDE_MODEL_MAP
 */
function isValidModelMapKey(key: string): key is keyof typeof CLAUDE_MODEL_MAP {
  return key in CLAUDE_MODEL_MAP;
}

/**
 * Get merged prompt customization from settings
 * Merges user custom prompts with built-in defaults
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
 * Get prompt customization for a specific category
 * Convenience function to get only the prompts you need
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
 * Save prompt customization to settings
 * Merges with existing customization before saving
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
 * Reset prompt customization to defaults
 * Clears all custom prompts from settings
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

/**
 * Get the full model ID for an agent based on settings
 *
 * Priority:
 * 1. Explicit model provided
 * 2. Agent preference from settings
 * 3. Default model for agent type
 *
 * @param agentType - The type of agent
 * @param explicitModel - Optional explicit model override
 * @param settings - Global settings containing agent model preferences
 * @returns Full model ID (e.g., "claude-sonnet-4-5-20250929")
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
  // If explicit model provided, validate and use it
  if (explicitModel) {
    // If it's a known alias, convert to full model ID
    if (isValidModelMapKey(explicitModel)) {
      return CLAUDE_MODEL_MAP[explicitModel];
    }
    // Otherwise assume it's already a full model ID and return as-is
    // This maintains backward compatibility for users passing full IDs directly
    return explicitModel;
  }

  // Check agent model preferences from settings
  const preferredModel = settings?.agentModelSettings?.agents?.[agentType];
  if (preferredModel) {
    return CLAUDE_MODEL_MAP[preferredModel];
  }

  // Fall back to default for agent type
  const defaultModel = DEFAULT_AGENT_MODELS[agentType] || 'sonnet';
  return CLAUDE_MODEL_MAP[defaultModel];
}

/**
 * Get the model alias (haiku/sonnet/opus) for an agent
 * Useful for display purposes or logging
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
  const preferredModel = settings?.agentModelSettings?.agents?.[agentType];
  if (preferredModel) {
    return preferredModel;
  }

  // Fall back to default
  return DEFAULT_AGENT_MODELS[agentType] || 'sonnet';
}

/**
 * Async version of getModelForAgent that loads settings from SettingsService
 *
 * @param agentType - The type of agent
 * @param explicitModel - Optional explicit model override
 * @param settingsService - Settings service to load global settings from
 * @returns Promise resolving to full model ID
 */
export async function getModelForAgentAsync(
  agentType: AgentType,
  explicitModel: string | undefined,
  settingsService: SettingsService | null | undefined
): Promise<string> {
  if (!settingsService) {
    return getModelForAgent(agentType, explicitModel, undefined);
  }

  try {
    const globalSettings = await settingsService.getGlobalSettings();
    return getModelForAgent(agentType, explicitModel, globalSettings);
  } catch (error) {
    logger.warn(`Failed to load settings for model resolution, using defaults: ${error}`);
    return getModelForAgent(agentType, explicitModel, undefined);
  }
}
