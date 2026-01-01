import { useState, useCallback, useEffect } from 'react';
import { getElectronAPI } from '@/lib/electron';
import type { AgentAssignment } from '@automaker/types';

interface UseAgentAssignmentsProps {
  currentProject: { path: string; id: string } | null;
  enabled?: boolean;
}

/**
 * Hook that loads agent assignments for Beads issues.
 *
 * @param currentProject - The active project (contains `path` and `id`), or `null` when no project is selected.
 * @param enabled - Whether to fetch assignments (default: true)
 * @returns An object with:
 *  - `assignments`: map of issue ID to agent assignment
 *  - `isLoading`: `true` while the hook is loading assignments
 *  - `error`: an error message when loading fails, or `null` when there is no error
 *  - `loadAssignments`: a function to trigger a manual reload of assignments
 */
export function useAgentAssignments(
  { currentProject, enabled = true }: UseAgentAssignmentsProps = {
    currentProject: null,
    enabled: true,
  }
) {
  const [assignments, setAssignments] = useState<Record<string, AgentAssignment>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    if (!currentProject || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api.beads) {
        console.error('[useAgentAssignments] Beads API not available');
        setError('Beads API not available');
        return;
      }

      const result = await api.beads.getAssignments(currentProject.path);

      if (result.success && result.assignments) {
        // Convert array to map for easy lookup by issue ID
        const assignmentsMap: Record<string, AgentAssignment> = {};
        for (const assignment of result.assignments) {
          assignmentsMap[assignment.issueId] = assignment;
        }
        setAssignments(assignmentsMap);
      } else {
        console.error('[useAgentAssignments] API returned error:', result.error);
        setError(result.error || 'Failed to load assignments');
      }
    } catch (err) {
      console.error('Failed to load assignments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, enabled]);

  // Load assignments when project changes
  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Auto-refresh every 5 seconds to get latest assignment status
  useEffect(() => {
    if (!currentProject || !enabled) return;

    const interval = setInterval(() => {
      loadAssignments();
    }, 5000);

    return () => clearInterval(interval);
  }, [currentProject, loadAssignments, enabled]);

  return {
    assignments,
    isLoading,
    error,
    loadAssignments,
  };
}
