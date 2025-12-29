/**
 * Provider routes - HTTP API for provider management
 *
 * Provides endpoints for:
 * - Listing all registered providers
 * - Testing provider authentication
 * - Probing provider capabilities
 * - Getting provider status and fallbacks
 */

import { Router } from 'express';
import { createListProvidersHandler } from './routes/list.js';
import { createTestProviderHandler } from './routes/test.js';
import { createProbeProviderHandler, createProbeAllProvidersHandler } from './routes/probe.js';
import { createStatusHandler } from './routes/status.js';

export function createProvidersRoutes(): Router {
  const router = Router();

  // List all providers
  router.get('/list', createListProvidersHandler());

  // Get provider status and fallbacks
  router.get('/status', createStatusHandler());

  // Test a specific provider's authentication
  router.post('/test/:providerId', createTestProviderHandler());

  // Probe a specific provider's capabilities
  router.post('/probe/:providerId', createProbeProviderHandler());

  // Probe all providers
  router.post('/probe/all', createProbeAllProvidersHandler());

  return router;
}
