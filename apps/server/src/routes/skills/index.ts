/**
 * Skills Routes - HTTP API for skill execution
 */

import { Router } from 'express';
import type { ResearchSkillService } from '../../services/research-skill-service.js';
import type { ImplementationSkillService } from '../../services/implementation-skill-service.js';
import type { CICDSkillService } from '../../services/cicd-skill-service.js';
import type { WorkflowOrchestratorService } from '../../services/workflow-orchestrator-service.js';
import { getErrorMessage, logError } from '../agent/common.js';

interface SkillServices {
  researchSkillService: ResearchSkillService;
  implementationSkillService: ImplementationSkillService;
  cicdSkillService: CICDSkillService;
  workflowOrchestratorService: WorkflowOrchestratorService;
}

export function createSkillsRoutes(services: SkillServices): Router {
  const router = Router();

  // GET /api/skills - List available skills
  router.get('/', async (req, res) => {
    try {
      const skills = [
        {
          id: 'research',
          name: 'Research',
          description: 'Performs comprehensive research using codebase, web, and memory',
          available: await services.researchSkillService.isAvailable(),
        },
        {
          id: 'implementation',
          name: 'Implementation',
          description: 'Executes implementation tasks with AI agents',
          available: await services.implementationSkillService.isAvailable(),
        },
        {
          id: 'cicd',
          name: 'CI/CD',
          description: 'Runs CI/CD validation tasks',
          available: await services.cicdSkillService.isAvailable(),
        },
        {
          id: 'workflow',
          name: 'Workflow Orchestrator',
          description: 'Orchestrates multi-step workflows',
          available: await services.workflowOrchestratorService.isAvailable(),
        },
      ];

      res.json({ success: true, skills });
    } catch (error) {
      logError(error, 'List skills failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/skills/research - Execute research
  router.post('/research', async (req, res) => {
    try {
      const { projectPath, query, maxResults } = req.body;

      if (!projectPath || !query) {
        res.status(400).json({
          success: false,
          error: 'projectPath and query are required',
        });
        return;
      }

      const result = await services.researchSkillService.execute({
        projectPath,
        query,
        maxResults,
      });

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Research execution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/skills/implement - Execute implementation
  router.post('/implement', async (req, res) => {
    try {
      const { taskId, sessionId, projectPath, description } = req.body;

      if (!taskId || !sessionId || !projectPath || !description) {
        res.status(400).json({
          success: false,
          error: 'taskId, sessionId, projectPath, and description are required',
        });
        return;
      }

      const result = await services.implementationSkillService.executeImplementation(
        description,
        projectPath,
        {
          maxRetries: 3,
          skipTests: false,
        }
      );

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Implementation execution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/skills/cicd - Run CI/CD validation
  router.post('/cicd', async (req, res) => {
    try {
      const { projectPath, runTests } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      const result = await services.cicdSkillService.executeCICD(projectPath, {
        skipE2E: !runTests,
        autoCommit: false,
        reportFormat: 'html',
      });

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'CI/CD execution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /api/skills/workflow - Execute workflow
  router.post('/workflow', async (req, res) => {
    try {
      const { issueId, projectPath, mode } = req.body;

      if (!issueId || !projectPath || !mode) {
        res.status(400).json({
          success: false,
          error: 'issueId, projectPath, and mode are required',
        });
        return;
      }

      if (mode !== 'auto' && mode !== 'semi') {
        res.status(400).json({
          success: false,
          error: 'mode must be either "auto" or "semi"',
        });
        return;
      }

      const result = await services.workflowOrchestratorService.executeWorkflow(
        `Issue ${issueId}`,
        projectPath,
        {
          mode,
          skipResearch: false,
          skipCICD: false,
        }
      );

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Workflow execution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
