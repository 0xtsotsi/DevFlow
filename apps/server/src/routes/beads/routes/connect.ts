/**
 * POST /api/beads/connect - Initialize Beads connection
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import { isJsonLonlyMode, checkBeadsDb, getBeadsDbPath } from '../client/cli-wrapper.js';

export function createConnectHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Check if .beads directory exists
      const { stat } = await import('fs/promises');
      const beadsDir = `${projectPath}/.beads`;

      try {
        await stat(beadsDir);
      } catch {
        res.status(404).json({
          success: false,
          error: 'No .beads directory found. Run "bd init" first.',
        });
        return;
      }

      // Check if using JSONL-only mode or database mode
      const jsonLonlyMode = await isJsonLonlyMode(projectPath);
      const dbPath = getBeadsDbPath(projectPath);
      const hasDb = await checkBeadsDb(dbPath);

      // Check for issues.jsonl
      let hasJsonL = false;
      try {
        await stat(`${projectPath}/.beads/issues.jsonl`);
        hasJsonL = true;
      } catch {
        // Ignore
      }

      res.json({
        success: true,
        data: {
          connected: true,
          projectPath,
          mode: jsonLonlyMode ? 'jsonl-only' : hasDb ? 'database' : 'unknown',
          hasDb,
          hasJsonL,
          dbPath: hasDb ? dbPath : null,
        },
      });
    } catch (error) {
      logError(error, 'Connect failed');
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}
