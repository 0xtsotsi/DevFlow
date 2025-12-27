/**
 * Review routes - HTTP API for review watcher
 *
 * Provides endpoints to manage the review watcher service that monitors
 * Vibe Kanban tasks in `inreview` status and auto-iterates on feedback.
 */

import { Router } from 'express';
import type { ReviewWatcherService } from '../../services/review-watcher.js';
import { createPendingReviewHandler } from './routes/pending-review.js';

export function createReviewRoutes(reviewWatcherService: ReviewWatcherService): Router {
  const router = Router();

  router.get('/pending', createPendingReviewHandler(reviewWatcherService));

  return router;
}
