/**
 * GitHub Webhook Handler
 *
 * Handles incoming GitHub webhook events for real-time PR/CI updates.
 * This enables Vibe-Kanban tasks to automatically update when PRs are merged.
 *
 * Critical: This maintains separation of concerns - Vibe-Kanban coordinates
 * tasks but never writes project files. Only agents write to the repo.
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';

/**
 * GitHub webhook event payload structure
 * See: https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads
 */
export interface GitHubWebhookPayload {
  action?: string;
  pull_request?: {
    number: number;
    merged?: boolean;
    merged_at?: string | null;
    state?: string;
    html_url?: string;
    head?: {
      sha?: string;
      ref?: string;
    };
    base?: {
      ref?: string;
      repo?: {
        full_name?: string;
        name?: string;
        owner?: {
          login?: string;
        };
      };
    };
    user?: {
      login?: string;
    };
  };
  repository?: {
    full_name?: string;
    name?: string;
    owner?: {
      login?: string;
    };
  };
  sender?: {
    login?: string;
  };
  installation?: {
    id?: number;
  };
}

/**
 * Result of webhook processing
 */
export interface WebhookResult {
  success: boolean;
  processed?: boolean;
  error?: string;
  eventType?: string;
}

/**
 * Verify GitHub webhook signature
 *
 * GitHub signs webhook payloads with HMAC-SHA256 using the webhook secret.
 * This ensures the webhook actually came from GitHub.
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - Webhook secret configured in GitHub
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  // GitHub signatures start with "sha256="
  const sigPrefix = 'sha256=';
  if (!signature.startsWith(sigPrefix)) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = `${sigPrefix}${hmac.digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Handle GitHub pull_request webhook event
 *
 * Emits events when PRs are merged, enabling automatic task completion.
 *
 * Events emitted:
 * - `github:pr:merged` - When a PR is merged
 * - `github:pr:closed` - When a PR is closed without merge
 * - `github:pr:opened` - When a PR is opened
 */
function handlePullRequestEvent(payload: GitHubWebhookPayload, events: EventEmitter): void {
  const pr = payload.pull_request;
  if (!pr) return;

  const prNumber = pr.number;
  const sha = pr.head?.sha || '';
  const url = pr.html_url || '';
  const branch = pr.head?.ref || '';
  const baseBranch = pr.base?.ref || '';
  const repo = payload.repository?.full_name || '';

  const eventData = {
    prNumber,
    sha,
    url,
    branch,
    baseBranch,
    repo,
    mergedBy: pr.user?.login,
    mergedAt: pr.merged_at,
    title: pr.title, // Will be added by accessing full PR data
  };

  switch (payload.action) {
    case 'closed':
      if (pr.merged) {
        // PR was merged - trigger task completion
        events.emit('github:pr:merged', eventData);
        console.log(`[GitHub Webhook] PR #${prNumber} merged in ${repo}`);
      } else {
        // PR was closed without merging
        events.emit('github:pr:closed', eventData);
        console.log(`[GitHub Webhook] PR #${prNumber} closed (unmerged) in ${repo}`);
      }
      break;

    case 'opened':
      events.emit('github:pr:opened', eventData);
      console.log(`[GitHub Webhook] PR #${prNumber} opened in ${repo}`);
      break;

    case 'reopened':
      events.emit('github:pr:reopened', eventData);
      console.log(`[GitHub Webhook] PR #${prNumber} reopened in ${repo}`);
      break;

    case 'synchronize':
      // New commits pushed to PR
      events.emit('github:pr:updated', eventData);
      console.log(`[GitHub Webhook] PR #${prNumber} updated in ${repo}`);
      break;
  }
}

/**
 * Handle GitHub workflow_run webhook event
 *
 * Emits events when CI workflows complete, enabling automatic
 * task status updates based on CI results.
 */
function handleWorkflowRunEvent(payload: GitHubWebhookPayload, events: EventEmitter): void {
  // @ts-expect-error - workflow_run not in our interface but exists in payload
  const workflow = payload.workflow_run;
  if (!workflow) return;

  // @ts-expect-error - workflow has properties not in our interface
  const status = workflow.conclusion || workflow.status; // success, failure, pending
  const workflowName = workflow.name;
  const repo = payload.repository?.full_name || '';

  const eventData = {
    // @ts-expect-error - workflow has properties not in our interface
    workflowRunId: workflow.id,
    workflowName,
    status,
    repo,
    // @ts-expect-error - workflow has properties not in our interface
    headBranch: workflow.head_branch,
    // @ts-expect-error - workflow has properties not in our interface
    headSha: workflow.head_sha,
  };

  // @ts-expect-error - action and conclusion not in interface
  if (payload.action === 'completed' && workflow.conclusion) {
    events.emit('github:ci:completed', eventData);
    console.log(`[GitHub Webhook] CI workflow "${workflowName}" ${status} in ${repo}`);
  }
}

/**
 * Handle GitHub ping event (webhook registration verification)
 */
function handlePingEvent(payload: GitHubWebhookPayload): WebhookResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zen = (payload as any).zen;
  console.log(`[GitHub Webhook] Ping received: ${zen || 'Hello!'}`);

  return {
    success: true,
    processed: true,
    eventType: 'ping',
  };
}

/**
 * Main webhook handler
 *
 * Processes incoming GitHub webhook events and emits internal events
 * for the orchestrator and other services to consume.
 *
 * @param payload - Parsed webhook payload
 * @param signature - X-Hub-Signature-256 header
 * @param secret - Webhook secret for verification
 * @param events - EventEmitter to dispatch internal events
 * @returns Processing result
 */
export function handleGitHubWebhook(
  payload: GitHubWebhookPayload,
  signature: string,
  secret: string,
  events: EventEmitter
): WebhookResult {
  // Verify webhook signature
  const rawPayload = JSON.stringify(payload);
  if (!verifyWebhookSignature(rawPayload, signature, secret)) {
    console.error('[GitHub Webhook] Invalid signature');
    return {
      success: false,
      error: 'Invalid signature',
    };
  }

  // Determine event type from payload
  // Note: Express middleware should extract X-GitHub-Event header
  // and pass it as part of extended payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventType = (payload as any).githubEvent as string;

  switch (eventType) {
    case 'ping':
      return handlePingEvent(payload);

    case 'pull_request':
    case 'pull_request_review':
      handlePullRequestEvent(payload, events);
      return {
        success: true,
        processed: true,
        eventType: 'pull_request',
      };

    case 'workflow_run':
      handleWorkflowRunEvent(payload, events);
      return {
        success: true,
        processed: true,
        eventType: 'workflow_run',
      };

    case 'push':
      // Push events - could be used for branch-based triggers
      events.emit('github:push', {
        // @ts-expect-error - ref not in interface
        ref: payload.ref,
        // @ts-expect-error - repository exists in payload
        repo: payload.repository?.full_name,
      });
      return {
        success: true,
        processed: true,
        eventType: 'push',
      };

    default:
      console.log(`[GitHub Webhook] Unhandled event type: ${eventType}`);
      return {
        success: true,
        processed: false,
        eventType,
      };
  }
}

/**
 * Express handler factory for GitHub webhooks
 *
 * Creates an Express middleware handler that processes GitHub webhooks.
 * The handler expects:
 * - X-GitHub-Event header with event type
 * - X-Hub-Signature-256 header with signature
 * - GITHUB_WEBHOOK_SECRET environment variable set
 *
 * Usage:
 * ```typescript
 * app.post('/api/webhooks/github', createGitHubWebhookHandler(events));
 * ```
 */
export function createGitHubWebhookHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const eventType = req.headers['x-github-event'] as string;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    // Check if webhook secret is configured
    if (!secret) {
      console.error('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not configured');
      res.status(500).json({ error: 'Webhook not configured' });
      return;
    }

    // Attach event type to payload for handler
    const payload = {
      ...req.body,
      githubEvent: eventType,
    };

    // Process webhook
    const result = handleGitHubWebhook(payload, signature, secret, events);

    if (result.success) {
      if (result.processed) {
        console.log(`[GitHub Webhook] Processed ${result.eventType} event`);
      }
      res.status(200).json({
        received: true,
        eventType: result.eventType,
      });
    } else {
      res.status(401).json({
        error: result.error,
        eventType: result.eventType,
      });
    }
  };
}

/**
 * Configuration loader for webhook settings
 *
 * Loads per-project GitHub webhook configuration from
 * `.automaker/config.json` or environment variables.
 */
export interface GitHubWebhookConfig {
  repository?: string;
  webhookSecret?: string;
  autoMergeBranches: string[];
  manualMergeBranches: string[];
  requireApprovalFor: string[];
}

export function loadGitHubWebhookConfig(_projectPath?: string): GitHubWebhookConfig {
  // Default configuration
  const config: GitHubWebhookConfig = {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    autoMergeBranches: ['feature/*', 'hotfix/*', 'fix/*'],
    manualMergeBranches: ['main', 'develop', 'release/*'],
    requireApprovalFor: ['security', 'breaking-change'],
  };

  // TODO: Load project-specific config from .automaker/config.json
  // if (projectPath) {
  //   const configPath = path.join(projectPath, '.automaker', 'config.json');
  //   // ... load and merge config
  // }

  return config;
}
