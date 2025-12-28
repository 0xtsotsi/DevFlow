/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import { createListCommentsHandler } from './routes/list-comments.js';
import { createValidateIssueHandler } from './routes/validate-issue.js';
import {
  createValidationStatusHandler,
  createValidationStopHandler,
  createGetValidationsHandler,
  createDeleteValidationHandler,
  createMarkViewedHandler,
} from './routes/validation-endpoints.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createGitHubRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post('/check-remote', validatePathParams('projectPath'), createCheckGitHubRemoteHandler());
  router.post('/issues', validatePathParams('projectPath'), createListIssuesHandler());
  router.post('/prs', validatePathParams('projectPath'), createListPRsHandler());
  router.post('/issue-comments', validatePathParams('projectPath'), createListCommentsHandler());
  router.post(
    '/validate-issue',
    validatePathParams('projectPath'),
    createValidateIssueHandler(events, settingsService)
  );

  // Validation management endpoints
  router.post(
    '/validation-status',
    validatePathParams('projectPath'),
    createValidationStatusHandler()
  );
  router.post('/validation-stop', validatePathParams('projectPath'), createValidationStopHandler());
  router.post('/validations', validatePathParams('projectPath'), createGetValidationsHandler());
  router.post(
    '/validation-delete',
    validatePathParams('projectPath'),
    createDeleteValidationHandler()
  );
  router.post(
    '/validation-mark-viewed',
    validatePathParams('projectPath'),
    createMarkViewedHandler(events)
  );

  // Webhook endpoints for PR comment monitoring (require prWatcherService)
  if (services?.prWatcherService) {
    router.post('/webhook/pr-comment', createPRCommentHandler(services.prWatcherService));
    router.get(
      '/webhook/pr-comment/status/:commentId',
      createPRCommentStatusHandler(services.prWatcherService)
    );
    router.post('/webhook/test', createTestWebhookHandler());
  }

  // Auto-claim routes (require pollerService)
  if (services?.pollerService) {
    router.post('/auto-claim/start', createStartAutoClaimHandler(services.pollerService));
    router.post('/auto-claim/stop', createStopAutoClaimHandler(services.pollerService));
    router.get('/auto-claim/status', createGetAutoClaimStatusHandler(services.pollerService));
  }

  return router;
}
