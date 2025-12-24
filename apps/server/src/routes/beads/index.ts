/**
 * Beads routes - HTTP API for Beads issue tracking integration
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { createConnectHandler } from './routes/connect.js';
import { createReadyHandler } from './routes/ready.js';
import { createListHandler } from './routes/list.js';
import { createShowHandler } from './routes/show.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createSyncHandler } from './routes/sync.js';

export function createBeadsRoutes(_events: EventEmitter): Router {
  const router = Router();

  router.post('/connect', createConnectHandler());
  router.get('/ready', createReadyHandler());
  router.get('/list', createListHandler());
  router.get('/show/:id', createShowHandler());
  router.post('/create', createCreateHandler());
  router.post('/update', createUpdateHandler());
  router.post('/sync', createSyncHandler());

  return router;
}
