/**
 * Common utilities for GitHub routes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getGitHubCliEnv } from '../../../lib/github-cli-path.js';

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
  console.error(`[GitHub] ${context}:`, error);
}
