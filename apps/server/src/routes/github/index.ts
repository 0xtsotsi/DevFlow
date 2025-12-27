/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import { PRWatcherService } from '../../services/github-pr-watcher.js';
import {
  createPRCommentHandler,
  createPRCommentStatusHandler,
  createTestWebhookHandler,
} from './routes/pr-comment-handler.js';

export function createGitHubRoutes(prWatcherService?: PRWatcherService): Router {
  const router = Router();

  router.post('/check-remote', createCheckGitHubRemoteHandler());
  router.post('/issues', createListIssuesHandler());
  router.post('/prs', createListPRsHandler());

  // Webhook endpoints for PR comment monitoring
  if (prWatcherService) {
    router.post('/webhook/pr-comment', createPRCommentHandler(prWatcherService));
    router.get('/webhook/pr-comment/status/:commentId', createPRCommentStatusHandler(prWatcherService));
    router.post('/webhook/test', createTestWebhookHandler());
  }

  return router;
}
