import { useState, useEffect, useCallback } from 'react';
import { Bot, Loader2, Activity, X, Minimize2, Maximize2 } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AutoModeEvent } from '@/types/electron';

interface AgentActivity {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  status: 'starting' | 'planning' | 'action' | 'verification' | 'complete' | 'error';
  currentTask?: string;
  lastTool?: string;
  startTime: number;
}

interface AgentActivityFeedProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentActivityFeed({ open, onOpenChange }: AgentActivityFeedProps) {
  const { currentProject } = useAppStore();
  const [activities, setActivities] = useState<Map<string, AgentActivity>>(new Map());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch current running agents
  const fetchRunningAgents = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api.runningAgents) {
        const result = await api.runningAgents.getAll();
        if (result.success && result.runningAgents) {
          const newActivities = new Map<string, AgentActivity>();

          result.runningAgents.forEach((agent) => {
            const existing = activities.get(agent.featureId);
            newActivities.set(agent.featureId, {
              ...agent,
              status: existing?.status || 'starting',
              currentTask: existing?.currentTask,
              lastTool: existing?.lastTool,
              startTime: existing?.startTime || Date.now(),
            });
          });

          setActivities(newActivities);
        }
      }
    } catch (error) {
      console.error('[AgentActivityFeed] Error fetching running agents:', error);
    } finally {
      setLoading(false);
    }
  }, [activities]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchRunningAgents();

    // Refresh every 5 seconds to catch agents that started/stopped
    const interval = setInterval(fetchRunningAgents, 5000);
    return () => clearInterval(interval);
  }, [fetchRunningAgents]);

  // Subscribe to AutoMode events for real-time updates
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      const featureId = event.featureId;

      if (!featureId) return;

      setActivities((prev) => {
        const updated = new Map(prev);

        switch (event.type) {
          case 'auto_mode_feature_start':
            updated.set(featureId, {
              featureId,
              projectPath: event.projectPath || '',
              projectName: event.projectPath?.split('/').pop() || 'Unknown Project',
              isAutoMode: true,
              status: 'starting',
              startTime: Date.now(),
            });
            break;

          case 'auto_mode_phase':
            if (updated.has(featureId)) {
              const current = updated.get(featureId)!;
              updated.set(featureId, {
                ...current,
                status: event.phase,
                currentTask: event.message,
              });
            }
            break;

          case 'auto_mode_progress':
            if (updated.has(featureId)) {
              const current = updated.get(featureId)!;
              updated.set(featureId, {
                ...current,
                currentTask: event.content,
              });
            }
            break;

          case 'auto_mode_tool':
            if (updated.has(featureId)) {
              const current = updated.get(featureId)!;
              updated.set(featureId, {
                ...current,
                lastTool: event.tool,
              });
            }
            break;

          case 'auto_mode_feature_complete':
            // Remove from activities when complete
            updated.delete(featureId);
            break;

          case 'auto_mode_error':
            // Keep in activities but mark as error
            if (updated.has(featureId)) {
              const current = updated.get(featureId)!;
              updated.set(featureId, {
                ...current,
                status: 'error',
                currentTask: event.error,
              });
            }
            // Auto-remove after 3 seconds
            setTimeout(() => {
              setActivities((prev) => {
                const next = new Map(prev);
                next.delete(featureId);
                return next;
              });
            }, 3000);
            break;
        }

        return updated;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // Don't render if not open and no activities
  if (!open && activities.size === 0) {
    return null;
  }

  const activityArray = Array.from(activities.values());

  return (
    <div
      className={cn(
        'fixed left-16 top-0 z-40 h-full bg-background/95 backdrop-blur-sm border-r border-border transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'flex flex-col shadow-lg',
        open ? 'translate-x-0' : '-translate-x-full',
        isCollapsed ? 'w-16' : 'w-80'
      )}
      data-testid="agent-activity-feed"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-sm">Agent Activity</h2>
            {activityArray.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activityArray.length}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && !isCollapsed && (
        <div className="flex-1 flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Activity List */}
      {!isCollapsed && !loading && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activityArray.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active agents</p>
              <p className="text-xs">Agents will appear here when working on features</p>
            </div>
          ) : (
            activityArray.map((activity) => (
              <ActivityCard
                key={activity.featureId}
                activity={activity}
                isCurrentProject={activity.projectPath === currentProject?.path}
              />
            ))
          )}
        </div>
      )}

      {/* Collapsed State - Show count badge */}
      {isCollapsed && activityArray.length > 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <Bot className="h-6 w-6 text-brand-500 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-medium text-white">
              {activityArray.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActivityCardProps {
  activity: AgentActivity;
  isCurrentProject: boolean;
}

function ActivityCard({ activity, isCurrentProject }: ActivityCardProps) {
  const getStatusColor = (status: AgentActivity['status']) => {
    switch (status) {
      case 'starting':
        return 'text-blue-500';
      case 'planning':
        return 'text-purple-500';
      case 'action':
        return 'text-brand-500';
      case 'verification':
        return 'text-yellow-500';
      case 'complete':
        return 'text-green-500';
      case 'error':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusLabel = (status: AgentActivity['status']) => {
    switch (status) {
      case 'starting':
        return 'Starting...';
      case 'planning':
        return 'Planning';
      case 'action':
        return 'Working';
      case 'verification':
        return 'Verifying';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const elapsedTime = Math.floor((Date.now() - activity.startTime) / 1000);
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-colors',
        isCurrentProject ? 'bg-brand-500/10 border-brand-500/30' : 'bg-muted/30 border-border'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className={cn('h-4 w-4 shrink-0', getStatusColor(activity.status))} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{activity.featureId}</p>
            {activity.projectName && (
              <p className="text-xs text-muted-foreground truncate">{activity.projectName}</p>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {getStatusLabel(activity.status)}
        </Badge>
      </div>

      {/* Current Task */}
      {activity.currentTask && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{activity.currentTask}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {activity.lastTool && (
            <span className="font-mono bg-background px-1.5 py-0.5 rounded">
              {activity.lastTool}
            </span>
          )}
        </div>
        <span>{formatTime(elapsedTime)}</span>
      </div>

      {/* Status indicator */}
      {activity.status !== 'error' && activity.status !== 'complete' && (
        <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 animate-pulse" style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}
