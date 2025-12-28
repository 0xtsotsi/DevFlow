/**
 * Common utilities for GitHub routes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GitHub');

export const execAsync = promisify(exec);

// Use centralized PATH configuration for GitHub CLI detection
export const extendedPath = getGitHubCliEnv().PATH;

export const execEnv = getGitHubCliEnv();

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logError(error: unknown, context: string): void {
  logger.error(`${context}:`, error);
}
