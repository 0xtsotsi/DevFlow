/**
 * Common utilities for pipeline routes
 *
 * Provides logger and error handling utilities shared across all pipeline endpoints.
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage, createLogError } from '../common.js';

/** Logger instance for pipeline-related operations */
export const logger = createLogger('Pipeline');

/**
 * Extract user-friendly error message from error objects
 */
export { getErrorMessage };

/**
 * Log error with automatic logger binding
 */
export const logError = createLogError(logger);
