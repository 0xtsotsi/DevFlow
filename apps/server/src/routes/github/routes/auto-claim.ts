/**
 * POST /auto-claim endpoint - Start/stop automatic GitHub issue claiming
 */

import type { Request, Response } from 'express';
import type { GitHubIssuePollerService } from '../../../services/github-issue-poller-service.js';

export interface StartAutoClaimRequest {
  projectPath: string;
  vibeProjectId?: string;
  pollIntervalMs?: number;
}

export interface StopAutoClaimRequest {
  projectPath?: string; // Optional - if not provided, stops all polling
}

export interface AutoClaimStatusResponse {
  success: boolean;
  isRunning: boolean;
  projectPath?: string;
  pollIntervalMs?: number;
  error?: string;
}

export function createStartAutoClaimHandler(pollerService: GitHubIssuePollerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, vibeProjectId, pollIntervalMs } = req.body as StartAutoClaimRequest;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Check if already running
      if (pollerService.isPolling()) {
        res.status(400).json({
          success: false,
          error: 'GitHub Issue Poller is already running',
        });
        return;
      }

      // Start polling
      await pollerService.startPolling({
        projectPath,
        vibeProjectId,
        pollIntervalMs,
      });

      res.json({
        success: true,
        isRunning: true,
        projectPath,
        pollIntervalMs: pollIntervalMs || 60000,
      });
    } catch (error) {
      console.error('[GitHub] Start auto-claim failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function createStopAutoClaimHandler(pollerService: GitHubIssuePollerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Stop polling (ignores projectPath, stops all)
      await pollerService.stopPolling();

      res.json({
        success: true,
        isRunning: false,
      });
    } catch (error) {
      console.error('[GitHub] Stop auto-claim failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function createGetAutoClaimStatusHandler(pollerService: GitHubIssuePollerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const isRunning = pollerService.isPolling();

      res.json({
        success: true,
        isRunning,
      });
    } catch (error) {
      console.error('[GitHub] Get auto-claim status failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
