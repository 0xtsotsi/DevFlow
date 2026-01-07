/**
 * Beads Real-Time Events Hook (Refactored for DRY Principle)
 *
 * Extracted duplicate event handler logic into reusable helpers.
 */

import { useEffect, useState, useCallback } from 'react';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import type {
  BeadsAgentEvent,
  BeadsAgentErrorEvent,
  BeadsHelperEvent,
  BeadsIssueEvent,
  BeadsIssueDeletedEvent,
} from '@/lib/electron';
import type { AgentAssignment, BeadsIssue } from '@devflow/types';

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

// ============================================================================
// HELPER FUNCTIONS (Extracted for DRY)
// ============================================================================

/**
 * Creates a project-scoped event handler that filters events by project path.
 * Provides error handling and logging.
 *
 * @param currentProject - Current project to filter events for
 * @param handler - The actual event handler logic
 * @returns A wrapped event handler with project filtering and error handling
 */
function createProjectScopedHandler<T extends { projectPath: string }>(
  currentProject: { path: string; id: string } | null,
  handler: (event: T) => void,
  logPrefix: string
): (event: T) => void {
  return (event: T) => {
    // Filter events by project
    if (!currentProject || event.projectPath !== currentProject.path) {
      return;
    }

    try {
      handler(event);
    } catch (error) {
      console.error(`[BeadsRealtime] ${logPrefix} error:`, error);
    }
  };
}

/**
 * Creates an activity event for the feed.
 */
function createActivityEvent(
  type: BeadsAgentActivity['type'],
  event: { sessionId: string; issueId: string; agentType: string },
  issueTitle: string,
  extra?: Partial<BeadsAgentActivity>
): BeadsAgentActivity {
  return {
    id: `${type}-${event.sessionId}-${Date.now()}`,
    type,
    issueId: event.issueId,
    issueTitle,
    agentType: event.agentType,
    timestamp: Date.now(),
    ...extra,
  };
}

/**
 * Updates agent assignments map with proper immutability.
 */
function updateAgentAssignments(
  prev: Map<string, AgentAssignment>,
  updater: (map: Map<string, AgentAssignment>) => void
): Map<string, AgentAssignment> {
  const updated = new Map(prev);
  updater(updated);
  return updated;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

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

  // Store methods for updating Beads issues
  const updateBeadsIssue = useAppStore((state) => state.updateBeadsIssue);
  const addBeadsIssue = useAppStore((state) => state.addBeadsIssue);
  const removeBeadsIssue = useAppStore((state) => state.removeBeadsIssue);

  // Add activity event to the feed (keep only last 50)
  const addActivity = useCallback((activity: BeadsAgentActivity) => {
    setAgentActivity((prev) => [activity, ...prev].slice(0, 50));
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
    if (!api?.beads) return;

    console.log('[BeadsRealtime] Subscribing to Beads events for', currentProject.path);

    // ========================================================================
    // AGENT ASSIGNED HANDLER
    // ========================================================================
    const unsubAgentAssigned = api.beads.onAgentAssigned(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsAgentEvent) => {
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
          setAgentAssignments((prev) =>
            updateAgentAssignments(prev, (map) => {
              map.set(event.issueId, assignment);
            })
          );

          // Add to activity feed
          addActivity(createActivityEvent('agent-assigned', event, getIssueTitle(event.issueId)));
        },
        'onAgentAssigned'
      )
    );

    // ========================================================================
    // AGENT COMPLETED HANDLER
    // ========================================================================
    const unsubAgentCompleted = api.beads.onAgentCompleted(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsAgentEvent) => {
          console.log('[BeadsRealtime] Agent completed:', event);

          // Remove from assignments
          setAgentAssignments((prev) =>
            updateAgentAssignments(prev, (map) => {
              map.delete(event.issueId);
            })
          );

          // Add to activity feed
          addActivity(
            createActivityEvent('agent-completed', event, getIssueTitle(event.issueId), {
              success: true,
            })
          );
        },
        'onAgentCompleted'
      )
    );

    // ========================================================================
    // AGENT FAILED HANDLER
    // ========================================================================
    const unsubAgentFailed = api.beads.onAgentFailed(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsAgentErrorEvent) => {
          console.error('[BeadsRealtime] Agent failed:', event);

          // Remove from assignments
          setAgentAssignments((prev) =>
            updateAgentAssignments(prev, (map) => {
              map.delete(event.issueId);
            })
          );

          // Add to activity feed
          addActivity(
            createActivityEvent('agent-failed', event, getIssueTitle(event.issueId), {
              success: false,
              error: event.error,
            })
          );
        },
        'onAgentFailed'
      )
    );

    // ========================================================================
    // HELPER SPAWNED HANDLER
    // ========================================================================
    const unsubHelperSpawned = api.beads.onHelperSpawned(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsHelperEvent) => {
          console.log('[BeadsRealtime] Helper spawned:', event);

          // Add to activity feed (helper agents don't get assignments)
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
        },
        'onHelperSpawned'
      )
    );

    // ========================================================================
    // ISSUE CREATED HANDLER
    // ========================================================================
    const unsubIssueCreated = api.beads.onIssueCreated(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsIssueEvent) => {
          console.log('[BeadsRealtime] Issue created:', event);
          addBeadsIssue(currentProject.path, event.issue);
        },
        'onIssueCreated'
      )
    );

    // ========================================================================
    // ISSUE UPDATED HANDLER
    // ========================================================================
    const unsubIssueUpdated = api.beads.onIssueUpdated(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsIssueEvent) => {
          console.log('[BeadsRealtime] Issue updated:', event);

          // Update the issue data in store
          updateBeadsIssue(currentProject.path, event.issue.id, event.issue);

          // If issue was closed, remove assignment
          if (event.issue.status === 'closed') {
            setAgentAssignments((prev) =>
              updateAgentAssignments(prev, (map) => {
                map.delete(event.issue.id);
              })
            );
          }
        },
        'onIssueUpdated'
      )
    );

    // ========================================================================
    // ISSUE DELETED HANDLER
    // ========================================================================
    const unsubIssueDeleted = api.beads.onIssueDeleted(
      createProjectScopedHandler(
        currentProject,
        (event: BeadsIssueDeletedEvent) => {
          console.log('[BeadsRealtime] Issue deleted:', event);

          // Remove from store
          removeBeadsIssue(currentProject.path, event.issueId);

          // Remove assignment
          setAgentAssignments((prev) =>
            updateAgentAssignments(prev, (map) => {
              map.delete(event.issueId);
            })
          );
        },
        'onIssueDeleted'
      )
    );

    // Cleanup on unmount
    return () => {
      console.log('[BeadsRealtime] Unsubscribing from Beads events');
      unsubAgentAssigned();
      unsubAgentCompleted();
      unsubAgentFailed();
      unsubHelperSpawned();
      unsubIssueCreated();
      unsubIssueUpdated();
      unsubIssueDeleted();
    };
  }, [
    currentProject,
    issues,
    getIssueTitle,
    addActivity,
    updateBeadsIssue,
    addBeadsIssue,
    removeBeadsIssue,
  ]);

  return {
    agentAssignments,
    agentActivity,
  };
}
