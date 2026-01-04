/**
 * Settings Helper Functions
 *
 * Utility functions for working with settings, including prompt customization.
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../services/settings-service.js';
import type { PromptCustomization, ResolvedPrompts } from '@automaker/types';
import { mergeAllPrompts } from '@automaker/prompts';

const logger = createLogger('SettingsHelpers');

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
