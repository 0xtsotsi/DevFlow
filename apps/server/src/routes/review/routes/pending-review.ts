/**
 * GET /review/pending endpoint - List pending reviews
 *
 * Returns all tasks currently being watched by the review watcher service.
 * This includes tasks in `inreview` status with their comment counts and iteration status.
 */

import type { Request, Response } from 'express';
import type { ReviewWatcherService } from '../../../services/review-watcher.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Review');

export function createPendingReviewHandler(reviewWatcherService: ReviewWatcherService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const watchedTasks = reviewWatcherService.getWatchedTasks();

      logger.info(`[Review] Fetched ${watchedTasks.length} pending reviews`);

      res.json({
        success: true,
        data: {
          tasks: watchedTasks,
          count: watchedTasks.length,
          isRunning: reviewWatcherService.getStatus().isRunning,
        },
      });
    } catch (error) {
      logger.error('[Review] Failed to fetch pending reviews:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
