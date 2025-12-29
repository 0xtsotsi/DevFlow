/**
 * Constants for Beads Kanban Board
 */

export interface BeadsColumn {
  id: string;
  title: string;
  colorClass: string;
  beadsStatus: string[];
}

export const BEADS_COLUMNS: readonly BeadsColumn[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    colorClass: 'bg-slate-500',
    beadsStatus: ['open'],
  },
  {
    id: 'ready',
    title: 'Ready',
    colorClass: 'bg-blue-500',
    beadsStatus: ['open'],
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-yellow-500',
    beadsStatus: ['in_progress'],
  },
  {
    id: 'blocked',
    title: 'Blocked',
    colorClass: 'bg-red-500',
    beadsStatus: ['open'],
  },
  {
    id: 'done',
    title: 'Done',
    colorClass: 'bg-green-500',
    beadsStatus: ['closed'],
  },
] as const;

export type BeadsColumnId = (typeof BEADS_COLUMNS)[number]['id'];

// Priority labels
export const PRIORITY_LABELS: Record<number, string> = {
  0: 'CRITICAL',
  1: 'HIGH',
  2: 'MEDIUM',
  3: 'LOW',
  4: 'LOWEST',
};

// Priority colors
export const PRIORITY_COLORS: Record<number, string> = {
  0: 'text-red-600 dark:text-red-400',
  1: 'text-orange-600 dark:text-orange-400',
  2: 'text-yellow-600 dark:text-yellow-400',
  3: 'text-blue-600 dark:text-blue-400',
  4: 'text-gray-600 dark:text-gray-400',
};

// Issue type colors
export const TYPE_COLORS: Record<string, string> = {
  bug: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  feature: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  task: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  epic: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
  chore: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
};

export const DEFAULT_PRIORITY = 2; // MEDIUM
