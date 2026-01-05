/**
 * Skills Routes - HTTP API for skill execution
 */

import { Router } from 'express';
import type { ResearchSkillService } from '../../services/research-skill-service.js';
import type { ImplementationSkillService } from '../../services/implementation-skill-service.js';
import type { CICDSkillService } from '../../services/cicd-skill-service.js';
import type { WorkflowOrchestratorService } from '../../services/workflow-orchestrator-service.js';
import type { ReflectSkillService } from '../../services/reflect-skill-service.js';
import { getErrorMessage, logError } from '../agent/common.js';

interface SkillServices {
  researchSkillService: ResearchSkillService;
  implementationSkillService: ImplementationSkillService;
  cicdSkillService: CICDSkillService;
  workflowOrchestratorService: WorkflowOrchestratorService;
  reflectSkillService: ReflectSkillService;
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
        {
          id: 'reflect',
          name: 'Reflect',
          description: 'Analyzes conversations and generates reflections for improvement',
          available: await services.reflectSkillService.isAvailable(),
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

  // POST /api/skills/reflect - Execute reflection on conversation
  router.post('/reflect', async (req, res) => {
    try {
      const { projectPath, sessionId, conversation, taskDescription, maxInsights } = req.body;

      if (!projectPath || !sessionId || !conversation) {
        res.status(400).json({
          success: false,
          error: 'projectPath, sessionId, and conversation are required',
        });
        return;
      }

      if (!Array.isArray(conversation)) {
        res.status(400).json({
          success: false,
          error: 'conversation must be an array of messages',
        });
        return;
      }

      const result = await services.reflectSkillService.execute({
        projectPath,
        sessionId,
        conversation,
        taskDescription,
        maxInsights,
        storeInBeads: true,
      });

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Reflect execution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // GET /api/skills/reflect/history - Get reflection history for project
  router.get('/reflect/history', async (req, res) => {
    try {
      const { projectPath } = req.query;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const history = services.reflectSkillService.getHistory(projectPath);

      res.json({ success: true, history });
    } catch (error) {
      logError(error, 'Get reflection history failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // DELETE /api/skills/reflect/history - Clear reflection history for project
  router.delete('/reflect/history', async (req, res) => {
    try {
      const { projectPath } = req.query;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      services.reflectSkillService.clearHistory(projectPath);

      res.json({ success: true, message: 'Reflection history cleared' });
    } catch (error) {
      logError(error, 'Clear reflection history failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
