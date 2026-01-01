/**
 * Beads Issue Tracker Type Definitions
 *
 * Types for integrating with the Beads CLI task management system.
 * Beads provides dependency tracking, ready work detection, and
 * hierarchical task management.
 */

/**
 * Issue status in Beads
 */
export type BeadsIssueStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

/**
 * Issue type in Beads
 */
export type BeadsIssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';

/**
 * Issue priority (0=highest, 4=lowest)
 */
export type BeadsIssuePriority = 0 | 1 | 2 | 3 | 4;

/**
 * Dependency types in Beads
 * - blocks: Hard blocker (must complete before)
 * - related: Soft relationship (connected work)
 * - parent: Hierarchical (epic -> feature -> task)
 * - discovered-from: Discovered during work on another issue
 */
export type BeadsDependencyType = 'blocks' | 'related' | 'parent' | 'discovered-from';

/**
 * A Beads issue
 */
export interface BeadsIssue {
  /** Issue ID (e.g., bd-a1b2 or bd-a1b2.1 for child issues) */
  id: string;
  /** Issue title */
  title: string;
  /** Detailed description */
  description: string;
  /** Current status */
  status: BeadsIssueStatus;
  /** Issue type */
  type: BeadsIssueType;
  /** Priority (0=highest, 4=lowest) */
  priority: BeadsIssuePriority;
  /** Labels for categorization */
  labels: string[];
  /** Dependencies on other issues */
  dependencies?: BeadsDependency[];
  /** ISO timestamp of creation */
  createdAt?: string;
  /** ISO timestamp of last update */
  updatedAt?: string;
  /** ISO timestamp of closure (if closed) */
  closedAt?: string;
  /** Parent issue ID (for child issues) - also aliased as parentId for compatibility */
  parentIssueId?: string;
  /** Alias for parentIssueId for CLI compatibility */
  parentId?: string;
  /** Child issue IDs (for parent issues) */
  childIssueIds?: string[];
  /** Optional link to DevFlow feature */
  featureId?: string;
}

/**
 * A dependency relationship
 */
export interface BeadsDependency {
  /** ID of the issue this depends on */
  issueId?: string;
  /** Type of dependency */
  type?: BeadsDependencyType;
  /** Target issue ID (as returned by CLI) */
  to?: string;
  /** From issue ID (as returned by CLI) */
  from?: string;
}

/**
 * Input for creating a new issue
 */
export interface CreateBeadsIssueInput {
  /** Issue title */
  title: string;
  /** Detailed description */
  description?: string;
  /** Issue status */
  status?: BeadsIssueStatus;
  /** Issue type */
  type?: BeadsIssueType;
  /** Priority (0=highest, 4=lowest) */
  priority?: number;
  /** Optional labels */
  labels?: string[];
  /** Optional dependencies to add */
  dependencies?: Array<{ issueId: string; type: BeadsDependencyType }>;
  /** Optional parent issue ID (for subtasks) */
  parentIssueId?: string;
}

/**
 * Input for updating an existing issue
 */
export interface UpdateBeadsIssueInput {
  /** Updated title */
  title?: string;
  /** Updated description */
  description?: string;
  /** Updated status */
  status?: BeadsIssueStatus;
  /** Updated type */
  type?: BeadsIssueType;
  /** Updated priority (0=highest, 4=lowest) */
  priority?: number;
  /** Updated labels */
  labels?: string[];
}

/**
 * Filters for listing issues
 */
export interface ListBeadsIssuesFilters {
  /** Filter by status */
  status?: BeadsIssueStatus[];
  /** Filter by type */
  type?: BeadsIssueType[];
  /** Filter by labels (AND) */
  labels?: string[];
  /** Filter by priority range (0-4, where 0 is highest) */
  priorityMin?: number;
  priorityMax?: number;
  /** Search in title */
  titleContains?: string;
  /** Search in description */
  descContains?: string;
  /** Specific issue IDs */
  ids?: string[];
}

/**
 * Result of validating Beads installation
 */
export interface BeadsValidationResult {
  /** Whether bd CLI is installed */
  installed: boolean;
  /** Whether beads is initialized in the project */
  initialized: boolean;
  /** Version of bd CLI (if installed) */
  version?: string;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Statistics about the Beads database
 */
export interface BeadsStats {
  /** Total number of issues */
  totalIssues: number;
  /** Number of open issues */
  openIssues: number;
  /** Number of in-progress issues */
  inProgressIssues: number;
  /** Number of closed issues */
  closedIssues: number;
  /** Number of ready issues (no blockers) */
  readyIssues: number;
  /** Number of blocked issues */
  blockedIssues: number;
}

/**
 * Result from searching codebase
 */
export interface CodeSearchResult {
  /** File path where code was found */
  filePath: string;
  /** Matching code snippet */
  code: string;
  /** Line number where code appears */
  line: number;
  /** Repository name */
  repository: string;
}

/**
 * Result from searching GitHub issues
 */
export interface GitHubIssue {
  /** Issue title */
  title: string;
  /** Issue URL */
  url: string;
  /** Repository name */
  repository: string;
  /** Issue state */
  state: 'open' | 'closed' | 'unknown';
}

/**
 * Dependency analysis result
 */
export interface DependencyAnalysis {
  /** List of conflicting dependencies */
  conflicts: string[];
  /** List of all dependencies */
  dependencies: string[];
}

/**
 * Research result for a Beads issue
 */
export interface IssueResearchResult {
  /** Issue ID that was researched */
  issueId: string;
  /** Code examples found during research */
  codeExamples: CodeSearchResult[];
  /** Similar issues found on GitHub */
  similarGitHubIssues: GitHubIssue[];
  /** Dependency conflicts detected */
  dependencyConflicts: string[];
  /** Actionable recommendations */
  recommendations: string[];
  /** ISO timestamp when research was completed */
  researchedAt: string;
  /** Optional: Research duration in milliseconds */
  duration?: number;
}

/**
 * Agent assignment status for a Beads issue
 */
export interface AgentAssignment {
  /** Issue ID that is assigned */
  issueId: string;
  /** Type of agent assigned */
  agentType: string;
  /** Agent session ID */
  sessionId: string;
  /** Assignment status */
  status: 'working' | 'waiting' | 'blocked';
  /** ISO timestamp when assignment started */
  assignedAt: string;
  /** Optional: Agent display name */
  agentName?: string;
}

/**
 * Map of issue IDs to their agent assignments
 */
export type AgentAssignments = Record<string, AgentAssignment>;
