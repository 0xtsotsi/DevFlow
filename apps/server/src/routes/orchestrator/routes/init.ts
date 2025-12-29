/**
 * Orchestrator Initialization Route
 *
 * Provides a programmatic way to check initialization status
 * and get configuration guidance for the Vibe-Kanban board lifecycle system.
 *
 * IMPORTANT: This is for Vibe-Kanban automations ONLY.
 * It is completely independent from any target project.
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import { getOrchestratorService } from '../../../services/orchestrator-service.js';
import { existsSync } from 'fs';
import path from 'path';
import { getVibeKanbanClient } from '../../../services/vibe-kanban-client.js';

/**
 * Initialization check result
 */
interface InitCheckResult {
  category: string;
  check: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  message: string;
  recommendation?: string;
}

/**
 * System initialization status
 */
interface InitStatusResponse {
  success: boolean;
  initialized: boolean;
  checks: InitCheckResult[];
  config: {
    hasApiKey: boolean;
    hasWebhookSecret: boolean;
    hasGithubRepo: boolean;
    serverUrl: string;
    webhookUrl: string;
    githubRepo: string;
    vibeKanbanConnected: boolean;
  };
  nextSteps: string[];
}

/**
 * Create initialization check handler
 */
export function createInitCheckHandler(events: EventEmitter) {
  return async (_req: Request, res: Response): Promise<void> => {
    const checks: InitCheckResult[] = [];
    const port = process.env.PORT || '3008';
    const serverUrl = `http://localhost:${port}`;

    // Check 1: Anthropic API Key
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    checks.push({
      category: 'Environment',
      check: 'ANTHROPIC_API_KEY',
      status: hasApiKey ? 'pass' : 'fail',
      message: hasApiKey ? 'Claude API key is configured' : 'Claude API key is missing',
      recommendation: hasApiKey ? undefined : 'Add ANTHROPIC_API_KEY to your .env file',
    });

    // Check 2: GitHub Webhook Secret
    const hasWebhookSecret = !!process.env.GITHUB_WEBHOOK_SECRET;
    checks.push({
      category: 'Environment',
      check: 'GITHUB_WEBHOOK_SECRET',
      status: hasWebhookSecret ? 'pass' : 'warn',
      message: hasWebhookSecret
        ? 'Webhook secret is configured'
        : 'Webhook secret not set (webhooks will not work)',
      recommendation: hasWebhookSecret
        ? undefined
        : 'Generate a secret and add GITHUB_WEBHOOK_SECRET to .env',
    });

    // Check 3: GitHub Repository Configuration
    let githubRepo = process.env.ORCHESTRATOR_GITHUB_REPO || '';
    if (!githubRepo) {
      try {
        // Try to get from git remote
        const { execSync } = await import('child_process');
        const origin = execSync('git remote get-url origin 2>/dev/null || echo ""', {
          cwd: process.cwd(),
          encoding: 'utf-8',
        }).trim();
        if (origin) {
          githubRepo = origin.replace(/.*[:/]([^/]+\/[^/.]+)\.git/, '$1');
        }
      } catch {
        githubRepo = 'owner/repo';
      }
    }
    const hasGithubRepo: boolean = !!(githubRepo && githubRepo !== 'owner/repo');
    checks.push({
      category: 'Environment',
      check: 'ORCHESTRATOR_GITHUB_REPO',
      status: hasGithubRepo ? 'pass' : 'warn',
      message: hasGithubRepo ? `GitHub repo: ${githubRepo}` : 'GitHub repo not configured',
      recommendation: hasGithubRepo
        ? undefined
        : 'Set ORCHESTRATOR_GITHUB_REPO in .env (e.g., "owner/repo")',
    });

    // Check 4: Vibe-Kanban Connectivity
    let vibeKanbanConnected = false;
    try {
      const vk = getVibeKanbanClient();
      const projects = await vk.listProjects();
      vibeKanbanConnected = projects.length > 0;
      checks.push({
        category: 'Vibe-Kanban',
        check: 'MCP Connection',
        status: vibeKanbanConnected ? 'pass' : 'fail',
        message: vibeKanbanConnected
          ? `Connected to Vibe-Kanban (${projects.length} projects available)`
          : 'Cannot connect to Vibe-Kanban MCP server',
        recommendation: vibeKanbanConnected
          ? undefined
          : 'Ensure Vibe-Kanban MCP server is running and configured',
      });
    } catch (error) {
      checks.push({
        category: 'Vibe-Kanban',
        check: 'MCP Connection',
        status: 'fail',
        message: `Vibe-Kanban connection failed: ${(error as Error).message}`,
        recommendation: 'Check MCP server configuration and restart',
      });
    }

    // Check 5: Orchestrator Service
    let orchestratorRunning = false;
    try {
      const orchestrator = getOrchestratorService(events);
      const state = orchestrator.getState();
      orchestratorRunning = state.isRunning;
      checks.push({
        category: 'Orchestrator',
        check: 'Service Status',
        status: orchestratorRunning ? 'pass' : 'warn',
        message: orchestratorRunning ? 'Orchestrator is running' : 'Orchestrator is not started',
        recommendation: orchestratorRunning
          ? undefined
          : 'Start orchestrator: POST /api/orchestrator/start',
      });
    } catch (error) {
      checks.push({
        category: 'Orchestrator',
        check: 'Service Status',
        status: 'fail',
        message: `Orchestrator error: ${(error as Error).message}`,
      });
    }

    // Check 6: Task State Persistence
    const stateDir = path.join(process.cwd(), '.automaker');
    const stateFile = path.join(stateDir, 'task-state.json');
    const hasStateDir = existsSync(stateDir);
    const hasStateFile = existsSync(stateFile);
    checks.push({
      category: 'Persistence',
      check: 'Task State Storage',
      status: hasStateDir ? 'pass' : 'warn',
      message: hasStateFile
        ? 'Task state file exists'
        : hasStateDir
          ? 'State directory ready, no state file yet'
          : 'State directory not created',
      recommendation: hasStateDir ? undefined : 'State directory will be created on first use',
    });

    // Check 7: GitHub Webhook Registration
    const webhookUrl = `${serverUrl}/api/github/webhook`;
    checks.push({
      category: 'GitHub',
      check: 'Webhook Registration',
      status: 'skip',
      message: 'Webhook registration requires manual setup',
      recommendation: `Register webhook at https://github.com/${githubRepo}/settings/hooks`,
    });

    // Calculate overall initialization status
    const failedChecks = checks.filter((c) => c.status === 'fail');
    const warnedChecks = checks.filter((c) => c.status === 'warn');
    const isInitialized = failedChecks.length === 0 && warnedChecks.length === 0;

    // Generate next steps
    const nextSteps: string[] = [];

    if (!hasApiKey) {
      nextSteps.push('1. Set ANTHROPIC_API_KEY in .env file');
    }
    if (!hasWebhookSecret) {
      nextSteps.push(
        "2. Generate webhook secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
      nextSteps.push('3. Add GITHUB_WEBHOOK_SECRET to .env file');
    }
    if (!hasGithubRepo) {
      nextSteps.push(`4. Set ORCHESTRATOR_GITHUB_REPO in .env (e.g., "owner/repo")`);
    }
    if (!vibeKanbanConnected) {
      nextSteps.push('5. Ensure Vibe-Kanban MCP server is running');
    }
    if (!orchestratorRunning && vibeKanbanConnected) {
      nextSteps.push(`6. Start orchestrator: curl -X POST ${serverUrl}/api/orchestrator/start`);
    }
    if (nextSteps.length === 0) {
      nextSteps.push(`✅ System is fully initialized! Start creating tasks in Vibe-Kanban.`);
    }

    const response: InitStatusResponse = {
      success: true,
      initialized: isInitialized,
      checks,
      config: {
        hasApiKey,
        hasWebhookSecret,
        hasGithubRepo,
        serverUrl,
        webhookUrl,
        githubRepo,
        vibeKanbanConnected,
      },
      nextSteps,
    };

    res.json(response);
  };
}

/**
 * Create webhook setup instructions handler
 */
export function createWebhookSetupHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    const port = process.env.PORT || '3008';
    const serverUrl = `http://localhost:${port}`;
    const webhookUrl = `${serverUrl}/api/github/webhook`;
    const githubRepo = process.env.ORCHESTRATOR_GITHUB_REPO || 'owner/repo';

    res.json({
      success: true,
      webhook: {
        url: webhookUrl,
        githubSettingsUrl: `https://github.com/${githubRepo}/settings/hooks`,
        events: ['pull_request', 'push', 'workflow_run'],
        contentType: 'application/json',
      },
      instructions: {
        cli: `gh webhook create --repo ${githubRepo} --url ${webhookUrl} --secret $GITHUB_WEBHOOK_SECRET --events pull_request,push,workflow_run`,
        manual: `1. Go to: https://github.com/${githubRepo}/settings/hooks
2. Click "Add webhook"
3. Payload URL: ${webhookUrl}
4. Content type: application/json
5. Secret: Use your GITHUB_WEBHOOK_SECRET value
6. Events: Pull requests, Pushes, Workflow runs
7. Click "Add webhook"`,
        localDev: `For local development, expose localhost via tunnel:
  cloudflared tunnel --url http://localhost:3008
  or
  ngrok http 3008`,
      },
    });
  };
}
