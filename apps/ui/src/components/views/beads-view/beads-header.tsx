import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Filter } from 'lucide-react';
import type { BeadsStats } from './hooks/use-beads-column-issues';

interface BeadsHeaderProps {
  projectName: string;
  stats: BeadsStats;
  onAddIssue: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const BeadsHeader = memo(function BeadsHeader({
  projectName,
  stats,
  onAddIssue,
  searchQuery,
  onSearchChange,
}: BeadsHeaderProps) {
  return (
    <div className="border-b px-4 py-3 bg-card/50 backdrop-blur-sm">
      {/* Top Row: Title and Statistics */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">Beads Issue Tracker</h1>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </div>

        {/* Statistics */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium">{stats.total}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Open:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">{stats.open}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">In Progress:</span>
            <span className="font-medium text-yellow-600 dark:text-yellow-400">
              {stats.inProgress}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Blocked:</span>
            <span className="font-medium text-red-600 dark:text-red-400">{stats.blocked}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Done:</span>
            <span className="font-medium text-green-600 dark:text-green-400">{stats.closed}</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Search, Filters, and Add Button */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9"
          />
        </div>

        {/* Filters (placeholder for future) */}
        <div className="flex items-center gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="w-[140px] h-9">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="epic">Epic</SelectItem>
              <SelectItem value="chore">Chore</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add Issue Button */}
        <Button onClick={onAddIssue} size="sm" className="h-9">
          <Plus className="h-4 w-4 mr-2" />
          Add Issue
        </Button>
      </div>
    </div>
  );
});
