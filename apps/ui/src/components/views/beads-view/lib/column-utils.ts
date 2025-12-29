import type { BeadsIssue } from '@automaker/types';
import type { BeadsColumnId } from '../constants';

/**
 * Determine which column an issue belongs to based on its status and blockers
 *
 * This is the shared logic for categorizing issues into columns.
 * Used by both use-beads-column-issues and use-beads-drag-drop.
 *
 * @param issue - The issue to categorize
 * @param allIssues - All issues (needed to check for active blockers)
 * @returns The column ID where this issue belongs
 */
export function getIssueColumn(issue: BeadsIssue, allIssues: BeadsIssue[]): BeadsColumnId {
  const hasActiveBlockers = hasOpenBlockers(issue, allIssues);

  if (issue.status === 'closed') {
    return 'done';
  } else if (hasActiveBlockers) {
    // Issues with open blockers go to Blocked column, regardless of status
    return 'blocked';
  } else if (issue.status === 'in_progress') {
    // In-progress issues without blockers
    return 'in_progress';
  } else if (issue.status === 'open') {
    // Open issues without blockers go to Ready
    return 'ready';
  } else {
    // Other statuses without blockers go to backlog
    return 'backlog';
  }
}

/**
 * Check if an issue has open blockers (dependencies of type 'blocks' that are not closed)
 *
 * @param issue - The issue to check
 * @param allIssues - All issues (needed to find the blocking issues)
 * @returns true if the issue has open blockers, false otherwise
 */
export function hasOpenBlockers(issue: BeadsIssue, allIssues: BeadsIssue[]): boolean {
  if (!issue.dependencies) return false;

  // Check each dependency
  for (const dep of issue.dependencies) {
    // Only check 'blocks' type dependencies
    if (dep.type === 'blocks') {
      const depIssue = allIssues.find((i) => i.id === dep.issueId);
      // If the blocking issue is open or in progress, it's blocking this issue
      if (depIssue && (depIssue.status === 'open' || depIssue.status === 'in_progress')) {
        return true;
      }
    }
  }
  return false;
}
