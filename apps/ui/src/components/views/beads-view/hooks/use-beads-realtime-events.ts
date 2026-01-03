import { useEffect, useState, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import type {
  BeadsAgentEvent,
  BeadsAgentErrorEvent,
  BeadsHelperEvent,
  BeadsIssueEvent,
  BeadsIssueDeletedEvent,
} from '@/lib/electron';
import type { AgentAssignment, BeadsIssue } from '@automaker/types';

/**
 * Real-time Beads events and agent assignments
 */
export interface BeadsRealtimeState {
  /** Map of issue ID to agent assignment */
  agentAssignments: Map<string, AgentAssignment>;
  /** Recent agent activity events */
  agentActivity: BeadsAgentActivity[];
}

/** Agent activity event for display in the activity feed */
export interface BeadsAgentActivity {
  id: string;
  type: 'agent-assigned' | 'agent-completed' | 'agent-failed' | 'helper-spawned';
  issueId: string;
  issueTitle: string;
  agentType: string;
  timestamp: number;
  success?: boolean;
  error?: string;
  helperInfo?: {
    parentIssueId: string;
    helperIssueId: string;
  };
}

interface UseBeadsRealtimeEventsProps {
  currentProject: { path: string; id: string } | null;
  issues: BeadsIssue[];
}

/**
 * Hook that subscribes to Beads real-time events via WebSocket.
 *
 * Provides:
 * - Agent assignments (which agent is working on which issue)
 * - Agent activity feed (recent assignments, completions, failures)
 * - Automatic cleanup on unmount
 *
 * Events are received from backend via WebSocket and update local state.
 */
export function useBeadsRealtimeEvents({ currentProject, issues }: UseBeadsRealtimeEventsProps) {
  const [agentAssignments, setAgentAssignments] = useState<Map<string, AgentAssignment>>(new Map());
  const [agentActivity, setAgentActivity] = useState<BeadsAgentActivity[]>([]);

  // Add activity event to the feed (keep only last 50)
  const addActivity = useCallback((activity: BeadsAgentActivity) => {
    setAgentActivity((prev) => {
      const updated = [activity, ...prev].slice(0, 50);
      return updated;
    });
  }, []);

  // Get issue title by ID
  const getIssueTitle = useCallback(
    (issueId: string): string => {
      const issue = issues.find((i) => i.id === issueId);
      return issue?.title || issueId;
    },
    [issues]
  );

  // Subscribe to Beads WebSocket events
  useEffect(() => {
    if (!currentProject) return;

    const api = getElectronAPI();
    if (!api.beads) return;

    console.log('[BeadsRealtime] Subscribing to Beads events for', currentProject.path);

    // Handler: Agent assigned to an issue
    const unsubAgentAssigned = api.beads.onAgentAssigned((event: BeadsAgentEvent) => {
      console.log('[BeadsRealtime] Agent assigned:', event);

      // Create agent assignment
      const assignment: AgentAssignment = {
        issueId: event.issueId,
        agentType: event.agentType,
        sessionId: event.sessionId,
        status: 'working',
        assignedAt: event.timestamp || new Date().toISOString(),
      };

      // Update assignments map
      setAgentAssignments((prev) => {
        const updated = new Map(prev);
        updated.set(event.issueId, assignment);
        return updated;
      });

      // Add to activity feed
      addActivity({
        id: `assigned-${event.sessionId}-${Date.now()}`,
        type: 'agent-assigned',
        issueId: event.issueId,
        issueTitle: getIssueTitle(event.issueId),
        agentType: event.agentType,
        timestamp: Date.now(),
      });
    });

    // Handler: Agent completed an issue
    const unsubAgentCompleted = api.beads.onAgentCompleted((event: BeadsAgentEvent) => {
      console.log('[BeadsRealtime] Agent completed:', event);

      // Remove from assignments
      setAgentAssignments((prev) => {
        const updated = new Map(prev);
        updated.delete(event.issueId);
        return updated;
      });

      // Add to activity feed
      addActivity({
        id: `completed-${event.sessionId}-${Date.now()}`,
        type: 'agent-completed',
        issueId: event.issueId,
        issueTitle: getIssueTitle(event.issueId),
        agentType: event.agentType,
        timestamp: Date.now(),
        success: true,
      });
    });

    // Handler: Agent failed on an issue
    const unsubAgentFailed = api.beads.onAgentFailed((event: BeadsAgentErrorEvent) => {
      console.error('[BeadsRealtime] Agent failed:', event);

      // Remove from assignments
      setAgentAssignments((prev) => {
        const updated = new Map(prev);
        updated.delete(event.issueId);
        return updated;
      });

      // Add to activity feed
      addActivity({
        id: `failed-${event.sessionId}-${Date.now()}`,
        type: 'agent-failed',
        issueId: event.issueId,
        issueTitle: getIssueTitle(event.issueId),
        agentType: event.agentType,
        timestamp: Date.now(),
        success: false,
        error: event.error,
      });
    });

    // Handler: Helper agent spawned
    const unsubHelperSpawned = api.beads.onHelperSpawned((event: BeadsHelperEvent) => {
      console.log('[BeadsRealtime] Helper spawned:', event);

      // Add to activity feed
      addActivity({
        id: `helper-${event.helperSessionId}-${Date.now()}`,
        type: 'helper-spawned',
        issueId: event.helperIssueId,
        issueTitle: getIssueTitle(event.helperIssueId),
        agentType: event.helperAgentType,
        timestamp: Date.now(),
        success: true,
        helperInfo: {
          parentIssueId: event.parentIssueId,
          helperIssueId: event.helperIssueId,
        },
      });
    });

    // Handler: Issue updated (refresh assignments if status changed)
    const unsubIssueUpdated = api.beads.onIssueUpdated((event: BeadsIssueEvent) => {
      console.log('[BeadsRealtime] Issue updated:', event);

      // If issue was closed, remove assignment
      if (event.issue.status === 'closed') {
        setAgentAssignments((prev) => {
          const updated = new Map(prev);
          updated.delete(event.issue.id);
          return updated;
        });
      }
    });

    // Handler: Issue deleted
    const unsubIssueDeleted = api.beads.onIssueDeleted((event: BeadsIssueDeletedEvent) => {
      console.log('[BeadsRealtime] Issue deleted:', event);

      // Remove assignment
      setAgentAssignments((prev) => {
        const updated = new Map(prev);
        updated.delete(event.issueId);
        return updated;
      });
    });

    // Cleanup on unmount
    return () => {
      console.log('[BeadsRealtime] Unsubscribing from Beads events');
      unsubAgentAssigned();
      unsubAgentCompleted();
      unsubAgentFailed();
      unsubHelperSpawned();
      unsubIssueUpdated();
      unsubIssueDeleted();
    };
  }, [currentProject, issues, getIssueTitle, addActivity]);

  return {
    agentAssignments,
    agentActivity,
  };
}
