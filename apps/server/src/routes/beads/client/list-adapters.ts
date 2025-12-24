/**
 * List Adapters - Map subscription types to Beads CLI commands
 *
 * Port of server/list-adapters.js from beads-ui to TypeScript
 * Maps subscription types to their corresponding Beads CLI commands
 */

import { runBdJsonOutput, type BdOptions } from './cli-wrapper.js';

export interface BdIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  dependencies?: { issue_id: string; type: string }[];
  [key: string]: unknown;
}

export type BdIssueList = BdIssue[];

/**
 * Adapter configuration for a subscription type
 */
export interface ListAdapter<T = BdIssueList> {
  key: string;
  fetch: (options?: BdOptions) => Promise<T>;
  parse?: (raw: unknown) => T;
}

/**
 * Fetch function for all-issues subscription
 * bd list --json
 */
export async function fetchAllIssues(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', [], options);
}

/**
 * Fetch function for issues tab subscription
 * bd list --filter tab:issues --json
 */
export async function fetchTabIssues(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'tab:issues'], options);
}

/**
 * Fetch function for epics tab subscription
 * bd list --filter tab:epics --json
 */
export async function fetchTabEpics(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'tab:epics'], options);
}

/**
 * Fetch function for ready subscription (issues with no blockers)
 * bd ready --json
 */
export async function fetchReady(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('ready', [], options);
}

/**
 * Fetch function for open issues
 * bd list --filter status:open --json
 */
export async function fetchOpenIssues(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'status:open'], options);
}

/**
 * Fetch function for in-progress issues
 * bd list --filter status:in_progress --json
 */
export async function fetchInProgressIssues(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'status:in_progress'], options);
}

/**
 * Fetch function for blocked issues
 * bd list --filter status:blocked --json
 */
export async function fetchBlockedIssues(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'status:blocked'], options);
}

/**
 * Fetch function for closed issues
 * bd list --filter status:closed --json
 */
export async function fetchClosedIssues(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'status:closed'], options);
}

/**
 * Fetch function for issue detail by ID
 * bd show {id} --json
 */
export async function fetchIssueDetail(id: string, options?: BdOptions): Promise<BdIssue> {
  return runBdJsonOutput<BdIssue>('show', [id], options);
}

/**
 * Fetch function for issues by type
 * bd list --filter type:{type} --json
 */
export async function fetchByType(type: string, options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', `type:${type}`], options);
}

/**
 * Fetch function for issues by priority
 * bd list --filter priority:{priority} --json
 */
export async function fetchByPriority(priority: number, options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', `priority:${priority}`], options);
}

/**
 * Fetch function for issues by label
 * bd list --filter label:{label} --json
 */
export async function fetchByLabel(label: string, options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', `label:${label}`], options);
}

/**
 * Fetch function for issues by assignee
 * bd list --filter assignee:{assignee} --json
 */
export async function fetchByAssignee(assignee: string, options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', `assignee:${assignee}`], options);
}

/**
 * Fetch function for dependencies (blocking/blocked by)
 * bd list --filter has-dependencies --json
 */
export async function fetchWithDependencies(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'has-dependencies'], options);
}

/**
 * Fetch function for issues without dependencies
 * bd list --filter no-dependencies --json
 */
export async function fetchWithoutDependencies(options?: BdOptions): Promise<BdIssueList> {
  return runBdJsonOutput<BdIssueList>('list', ['--filter', 'no-dependencies'], options);
}

/**
 * Mapping of subscription types to their fetch functions
 */
export const listAdapters: Record<string, ListAdapter> = {
  'all-issues': {
    key: 'all-issues',
    fetch: fetchAllIssues,
  },
  'tab:issues': {
    key: 'tab:issues',
    fetch: fetchTabIssues,
  },
  'tab:epics': {
    key: 'tab:epics',
    fetch: fetchTabEpics,
  },
  ready: {
    key: 'ready',
    fetch: fetchReady,
  },
  open: {
    key: 'open',
    fetch: fetchOpenIssues,
  },
  'in-progress': {
    key: 'in-progress',
    fetch: fetchInProgressIssues,
  },
  blocked: {
    key: 'blocked',
    fetch: fetchBlockedIssues,
  },
  closed: {
    key: 'closed',
    fetch: fetchClosedIssues,
  },
} as const;

/**
 * Get a list adapter by key
 */
export function getListAdapter(key: string): ListAdapter | undefined {
  return listAdapters[key];
}

/**
 * Check if a list adapter exists
 */
export function hasListAdapter(key: string): boolean {
  return key in listAdapters;
}

/**
 * Get all list adapter keys
 */
export function getListAdapterKeys(): string[] {
  return Object.keys(listAdapters);
}

/**
 * Create a dynamic list adapter for custom filters
 */
export function createDynamicAdapter(key: string, filter: string): ListAdapter {
  return {
    key,
    fetch: (options?: BdOptions) => {
      return runBdJsonOutput<BdIssueList>('list', ['--filter', filter], options);
    },
  };
}
