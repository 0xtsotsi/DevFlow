/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import { GitHubIssuePollerService } from '../../services/github-issue-poller-service.js';
import {
  createStartAutoClaimHandler,
  createStopAutoClaimHandler,
  createGetAutoClaimStatusHandler,
} from './routes/auto-claim.js';

export function createGitHubRoutes(pollerService?: GitHubIssuePollerService): Router {
  const router = Router();

  router.post('/check-remote', createCheckGitHubRemoteHandler());
  router.post('/issues', createListIssuesHandler());
  router.post('/prs', createListPRsHandler());

  // Auto-claim routes (require pollerService)
  if (pollerService) {
    router.post('/auto-claim/start', createStartAutoClaimHandler(pollerService));
    router.post('/auto-claim/stop', createStopAutoClaimHandler(pollerService));
    router.get('/auto-claim/status', createGetAutoClaimStatusHandler(pollerService));
  }

  return router;
}
