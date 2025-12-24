/**
 * Beads Integration Types
 *
 * Type definitions for Beads issue tracking integration.
 * These types match Beads core Go structures.
 */

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
 * Beads priority levels (0-4, where 0 is highest)
 */
export type BeadsPriority = 0 | 1 | 2 | 3 | 4;

/**
 * Dependency relationship types
 */
export enum BeadsDependencyType {
  Blocks = 'blocks',
  BlockedBy = 'blocked-by',
  DependsOn = 'depends-on',
}

/**
 * Issue dependency reference
 */
export interface BeadsDependency {
  issue_id: string;
  type: BeadsDependencyType;
}

/**
 * Core Beads issue structure
 */
export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: BeadsStatus;
  priority: BeadsPriority;
  issue_type: BeadsIssueType;
  labels: string[];
  assignee?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  dependencies?: BeadsDependency[];
  comments?: BeadsComment[];
  [key: string]: unknown;
}

/**
 * Issue comment/timeline entry
 */
export interface BeadsComment {
  id: string;
  issue_id: string;
  author: string;
  content: string;
  created_at: string;
  updated_at?: string;
  comment_type?: 'user' | 'system' | 'ai';
}

/**
 * Work filter specification for querying issues
 */
export interface BeadsWorkFilter {
  status?: BeadsStatus | BeadsStatus[];
  type?: BeadsIssueType | BeadsIssueType[];
  priority?: BeadsPriority | BeadsPriority[];
  labels?: string[];
  assignee?: string;
  hasDependencies?: boolean;
  blocking?: boolean;
  blocked?: boolean;
  tab?: 'issues' | 'epics';
}

/**
 * Beads integration settings for DevFlow
 */
export interface BeadsIntegration {
  enabled: boolean;
  dbPath: string | null;
  projectPath: string;
  mode: 'database' | 'jsonl-only' | 'unknown';
  autoSync: boolean;
  syncBranch?: string;
  lastSync?: string;
}

/**
 * Beads connection status
 */
export interface BeadsConnectionStatus {
  connected: boolean;
  projectPath: string;
  mode: 'database' | 'jsonl-only' | 'unknown';
  hasDb: boolean;
  hasJsonL: boolean;
  dbPath: string | null;
}

/**
 * Beads filter settings for UI display
 */
export interface BeadsFilters {
  status?: BeadsStatus[];
  type?: BeadsIssueType[];
  priority?: BeadsPriority[];
  labels?: string[];
  assignee?: string;
  searchQuery?: string;
}

/**
 * Beads view preferences
 */
export interface BeadsViewSettings {
  displayMode: 'compact' | 'detailed';
  groupBy?: 'status' | 'type' | 'priority' | 'none';
  sortBy?: 'priority' | 'created' | 'updated' | 'title';
  sortOrder?: 'asc' | 'desc';
  showDependencies: boolean;
  showComments: boolean;
}

/**
 * Issue update operation
 */
export type BeadsIssueUpdate =
  | { status: BeadsStatus }
  | { priority: BeadsPriority }
  | { type: BeadsIssueType }
  | { title: string }
  | { description: string }
  | { addLabels: string[] }
  | { removeLabels: string[] }
  | { addDependencies: string[] }
  | { removeDependencies: string[] }
  | { assignee: string };

/**
 * Issue create parameters
 */
export interface BeadsIssueCreate {
  title: string;
  description?: string;
  type?: BeadsIssueType;
  priority?: BeadsPriority;
  labels?: string[];
  dependencies?: string[];
  assignee?: string;
}

/**
 * API response wrapper
 */
export interface BeadsApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Issues list response
 */
export interface BeadsIssuesListResponse {
  issues: BeadsIssue[];
  count: number;
}

/**
 * Ready issues response (work with no blockers)
 */
export interface BeadsReadyResponse extends BeadsIssuesListResponse {
  // Issues that have no blocking dependencies
}

/**
 * Delta update for real-time subscriptions
 */
export interface BeadsDelta {
  added: BeadsIssue[];
  updated: BeadsIssue[];
  removed: string[];
}

/**
 * Subscription snapshot
 */
export interface BeadsSnapshot {
  items: BeadsIssue[];
  version?: number;
}

/**
 * WebSocket message types
 */
export type BeadsWsMessage =
  | { type: 'snapshot'; key: string; version: number; items: BeadsIssue[] }
  | ({ type: 'list-delta'; key: string; version: number } & BeadsDelta)
  | { type: 'upsert'; issue: BeadsIssue }
  | { type: 'delete'; issueId: string }
  | { type: 'error'; error: string };

/**
 * Beads statistics
 */
export interface BeadsStats {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  closed: number;
  byType: Record<BeadsIssueType, number>;
  byPriority: Record<BeadsPriority, number>;
}
