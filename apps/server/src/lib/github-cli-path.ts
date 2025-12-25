/**
 * Standardized PATH configuration for GitHub CLI detection
 * Used across all GitHub CLI detection points to ensure consistency
 */

import path from 'path';

/**
 * Get extended PATH for GitHub CLI detection
 * @returns Enhanced PATH string with common GitHub CLI installation locations
 */
export function getGitHubCliExtendedPath(): string {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  const additionalPaths: string[] = [];

  if (isWindows) {
    // Windows-specific paths
    if (process.env.LOCALAPPDATA) {
      additionalPaths.push(
        `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`,
        `${process.env.LOCALAPPDATA}\\Programs\\gh\\bin`
      );
    }
    if (process.env.PROGRAMFILES) {
      additionalPaths.push(
        `${process.env.PROGRAMFILES}\\Git\\cmd`,
        `${process.env.PROGRAMFILES}\\GitHub CLI\\bin`
      );
    }
    if (process.env['ProgramFiles(x86)']) {
      additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
    }
    // Scoop package manager
    if (process.env.USERPROFILE) {
      additionalPaths.push(`${process.env.USERPROFILE}\\scoop\\apps\\gh\\current\\bin`);
    }
  } else {
    // Unix/Mac paths
    additionalPaths.push(
      '/opt/homebrew/bin', // Homebrew on Apple Silicon
      '/usr/local/bin', // Homebrew on Intel Mac, common Linux
      '/home/linuxbrew/.linuxbrew/bin', // Linuxbrew
      `${process.env.HOME}/.local/bin` // pipx, user-local installs
    );
  }

  // Use proper path separator for platform
  const pathSeparator = isWindows ? ';' : ':';
  const basePaths = (process.env.PATH || '').split(pathSeparator);

  // Combine and deduplicate
  const allPaths = [...basePaths, ...additionalPaths];
  const uniquePaths = [...new Set(allPaths.filter(Boolean))];

  return uniquePaths.join(pathSeparator);
}

/**
 * Get environment object with extended PATH for GitHub CLI operations
 * @returns Environment object with enhanced PATH
 */
export function getGitHubCliEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getGitHubCliExtendedPath(),
  };
}
