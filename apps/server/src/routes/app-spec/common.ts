/**
 * Common utilities and state management for spec regeneration
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('SpecRegeneration');

// Shared state for tracking generation status - private
let isRunning = false;
let currentAbortController: AbortController | null = null;

/**
 * Get the current running state
 */
export function getSpecRegenerationStatus(): {
  isRunning: boolean;
  currentAbortController: AbortController | null;
} {
  return { isRunning, currentAbortController };
}

/**
 * Set the running state and abort controller
 */
export function setRunningState(running: boolean, controller: AbortController | null = null): void {
  isRunning = running;
  currentAbortController = controller;
}

/**
 * Helper to log authentication status
 */
export function logAuthStatus(context: string): void {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  logger.info(`${context} - Auth Status:`);
  logger.info(
    `  ANTHROPIC_API_KEY: ${
      hasApiKey ? 'SET (' + process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...)' : 'NOT SET'
    }`
  );

  if (!hasApiKey) {
    logger.warn('⚠️  WARNING: No authentication configured! SDK will fail.');
  }
}

/**
 * Log error details consistently
 */
export function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`);
  if (error && typeof error === 'object') {
    logger.error('Error name:', 'name' in error ? error.name : undefined);
    logger.error('Error message:', 'message' in error ? (error as Error).message : undefined);
    logger.error('Error stack:', 'stack' in error ? (error as Error).stack : undefined);
  }
  logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
}

import { getErrorMessage as getErrorMessageShared } from '../common.js';

// Re-export shared utility
export { getErrorMessageShared as getErrorMessage };
