/**
 * @devflow/git-utils
 * Git operations utilities for DevFlow
 */

// Export types and constants
export { BINARY_EXTENSIONS, GIT_STATUS_MAP, type FileStatus } from './types.js';

// Export status utilities
export { isGitRepo, parseGitStatus } from './status.js';

// Export diff utilities
export {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory,
  getGitRepositoryDiffs,
} from './diff.js';

// Export reliability utilities
export { execWithRetry, execGh } from './reliability.js';
export type { ExecResult, ExecRetryOptions } from './reliability.js';
