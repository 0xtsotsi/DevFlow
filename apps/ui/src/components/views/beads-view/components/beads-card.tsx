import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  TypeBadge,
  PriorityIndicator,
  BlockingBadge,
  BlockedBadge,
  LabelsList,
} from './beads-badges';
import type { BeadsIssue } from '@automaker/types';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Edit2, Trash2, Play, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface BeadsCardProps {
  issue: BeadsIssue;
  blockingCount: number;
  blockedCount: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onStart?: () => void;
  onClose?: () => void;
}

export const BeadsCard = memo(function BeadsCard({
  issue,
  blockingCount,
  blockedCount,
  onEdit,
  onDelete,
  onStart,
  onClose,
}: BeadsCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled: issue.status === 'closed', // Can't drag closed issues
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const canDrag = issue.status !== 'closed';

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-grab active:cursor-grabbing relative select-none',
        'transition-all duration-200 ease-out',
        'shadow-sm hover:shadow-md hover:shadow-black/10',
        'hover:-translate-y-0.5',
        'border-border/50',
        canDrag && 'cursor-grab',
        !canDrag && 'cursor-default',
        isDragging && 'scale-105 shadow-xl shadow-black/20 rotate-1'
      )}
      onDoubleClick={onEdit}
      {...attributes}
      {...(canDrag ? listeners : {})}
    >
      <CardContent className="p-3">
        {/* Header Row: Type and Priority */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <TypeBadge type={issue.type} />
          <PriorityIndicator priority={issue.priority} />
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{issue.title}</h3>

        {/* Description (truncated) */}
        {issue.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-3">{issue.description}</p>
        )}

        {/* Dependency Badges */}
        {(blockingCount > 0 || blockedCount > 0) && (
          <div className="flex flex-wrap gap-1 mb-2">
            <BlockingBadge count={blockingCount} />
            <BlockedBadge count={blockedCount} />
          </div>
        )}

        {/* Labels */}
        <LabelsList labels={issue.labels} className="mb-2" />

        {/* Status Badge */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              issue.status === 'open' && 'border-blue-500/50 text-blue-700 dark:text-blue-400',
              issue.status === 'in_progress' &&
                'border-yellow-500/50 text-yellow-700 dark:text-yellow-400',
              issue.status === 'closed' && 'border-green-500/50 text-green-700 dark:text-green-400'
            )}
          >
            {issue.status === 'in_progress' ? 'In Progress' : issue.status.replace('_', ' ')}
          </Badge>

          {/* Action Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {issue.status === 'open' && onStart && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart();
                  }}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </DropdownMenuItem>
              )}
              {issue.status === 'in_progress' && onClose && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Close
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
});
