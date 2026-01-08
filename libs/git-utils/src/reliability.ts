/**
 * Git Network Reliability Utilities
 *
 * Provides timeout and retry logic for Git and GitHub CLI operations
 * to prevent indefinite hangs during network issues.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Result from execWithRetry including retry count
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  retryCount: number;
}

/**
 * Options for execWithRetry
 */
export interface ExecRetryOptions {
  /** Working directory */
  cwd: string;
  /** Timeout in milliseconds (default: 60000 = 1 minute) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
}

/**
 * Execute a command with timeout and exponential backoff retry logic.
 *
 * Retries with exponentially increasing timeouts:
 * - Attempt 1: timeout * 1
 * - Attempt 2: timeout * 2
 * - Attempt 3: timeout * 3
 * - ...
 *
 * @param command - Command to execute
 * @param options - Execution options
 * @returns Promise with stdout, stderr, and retryCount
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await execWithRetry('gh issue list', {
 *   cwd: '/path/to/project',
 *   timeout: 60000,
 *   maxRetries: 3,
 * });
 * console.log(result.stdout); // Issue list
 * console.log(result.retryCount); // 0 = succeeded on first try
 * ```
 */
export async function execWithRetry(
  command: string,
  options: ExecRetryOptions
): Promise<ExecResult> {
  const { timeout = 60000, maxRetries = 3, cwd } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await execAsync(command, {
        cwd,
        timeout: timeout * (attempt + 1), // Exponential backoff
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return { ...result, retryCount: attempt };
    } catch (error) {
      lastError = error as Error;

      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s, ...
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}

/**
 * Execute GitHub CLI command with timeout and retry logic.
 *
 * Convenience wrapper around execWithRetry optimized for gh CLI operations.
 *
 * @param cmd - GitHub CLI command (without 'gh' prefix)
 * @param opts - Execution options
 * @returns Promise with stdout, stderr, and retryCount
 *
 * @example
 * ```typescript
 * import { execGh } from '@devflow/git-utils';
 *
 * // List issues
 * const result = await execGh('gh issue list', { cwd: projectPath });
 *
 * // Create PR
 * const result = await execGh('gh pr create --title "Fix bug"', { cwd: projectPath });
 * ```
 */
export const execGh = (cmd: string, opts: ExecRetryOptions): Promise<ExecResult> => {
  // Ensure command starts with 'gh'
  const command = cmd.startsWith('gh ') ? cmd : `gh ${cmd}`;
  return execWithRetry(command, opts);
};
