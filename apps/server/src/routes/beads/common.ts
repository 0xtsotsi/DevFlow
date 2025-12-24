/**
 * Common utilities for Beads routes
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

const logger = createLogger('Beads');

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);

/**
 * Resolve the path to the Beads CLI executable
 */
export function getBdBin(): string {
  const bdPath = process.env.BD_PATH || '/home/codespace/.local/bin/bd';
  return bdPath;
}

/**
 * Beads issue status enumeration
 */
export enum BeadsStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Blocked = 'blocked',
  Deferred = 'deferred',
  Closed = 'closed',
}

/**
 * Beads issue type enumeration
 */
export enum BeadsIssueType {
  Bug = 'bug',
  Feature = 'feature',
  Task = 'task',
  Epic = 'epic',
  Chore = 'chore',
}

/**
 * Beads priority levels
 */
export enum BeadsPriority {
  P0 = 0,
  P1 = 1,
  P2 = 2,
  P3 = 3,
  P4 = 4,
}
