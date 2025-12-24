import { cn } from '@/lib/utils';
import type { BeadsIssue } from '@automaker/types';
import { TYPE_COLORS, PRIORITY_COLORS, PRIORITY_LABELS } from '../constants';

interface TypeBadgeProps {
  type: BeadsIssue['type'];
  className?: string;
}

export function TypeBadge({ type, className }: TypeBadgeProps) {
  const colors = TYPE_COLORS[type] || TYPE_COLORS.task;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        colors,
        className
      )}
    >
      {type}
    </span>
  );
}

interface PriorityIndicatorProps {
  priority: BeadsIssue['priority'];
  className?: string;
}

export function PriorityIndicator({ priority, className }: PriorityIndicatorProps) {
  const label = PRIORITY_LABELS[priority];
  const colors = PRIORITY_COLORS[priority];

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <div className={cn('w-2 h-2 rounded-full', colors)} title={`Priority: ${label}`} />
      <span className={cn('text-xs font-semibold uppercase', colors)}>{label}</span>
    </div>
  );
}

interface BlockingBadgeProps {
  count: number;
  className?: string;
}

export function BlockingBadge({ count, className }: BlockingBadgeProps) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20',
        className
      )}
      title={`This issue blocks ${count} other ${count === 1 ? 'issue' : 'issues'}`}
    >
      Blocks {count}
    </span>
  );
}

interface BlockedBadgeProps {
  count: number;
  className?: string;
}

export function BlockedBadge({ count, className }: BlockedBadgeProps) {
  if (count === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20',
        className
      )}
      title={`This issue is blocked by ${count} ${count === 1 ? 'issue' : 'issues'}`}
    >
      Blocked by {count}
    </span>
  );
}

interface LabelsListProps {
  labels: string[];
  className?: string;
}

export function LabelsList({ labels, className }: LabelsListProps) {
  if (!labels || labels.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-500/20"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
