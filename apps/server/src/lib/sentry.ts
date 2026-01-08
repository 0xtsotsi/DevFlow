/**
 * Sentry Configuration for DevFlow Server
 *
 * This module initializes Sentry with structured logging and metrics enabled.
 * It captures console logs, provides structured logging API, and custom metrics.
 */

import * as Sentry from '@sentry/node';
import type { SeverityLevel } from '@sentry/node';
import { piiRedactor } from './pii-redaction.js';

// Forward declaration of MetricsOptions (defined below)
export interface MetricsOptions {
  unit?: string;
  attributes?: Record<string, string | number | boolean>;
}

// Type for Sentry with metrics (not fully typed in @sentry/node@9.x)
type SentryMetrics = {
  increment: (name: string, value: number, options?: MetricsOptions) => void;
  gauge: (name: string, value: number, options?: MetricsOptions) => void;
  distribution: (name: string, value: number, options?: MetricsOptions) => void;
};

// Use any to avoid circular type issues with typeof Sentry
type SentryWithMetrics = typeof Sentry & {
  metrics?: SentryMetrics;
};

/**
 * Validate Sentry DSN format
 *
 * DSN format: https://examplePublicKey@o0.ingest.sentry.io/0
 * Components: protocol://publicKey@host/projectId
 *
 * @throws Error if DSN is invalid
 */
export function validateDSN(dsn?: string): void {
  if (!dsn) {
    throw new Error(
      'SENTRY_DSN is required in production. Set SENTRY_DSN environment variable or disable Sentry with SENTRY_ENABLED=false.'
    );
  }

  const dsnPattern = /^https?:\/\/[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+\/[0-9]+$/;
  if (!dsnPattern.test(dsn)) {
    throw new Error(
      `Invalid SENTRY_DSN format. Expected: https://publicKey@host/projectId, got: ${dsn}`
    );
  }
}

// Get DSN from environment (no hardcoded default)
const SENTRY_DSN = process.env.SENTRY_DSN;

// Validate DSN in production
if (process.env.NODE_ENV === 'production' && !SENTRY_DSN) {
  console.warn(
    '[Sentry] SENTRY_DSN not set in production. Set SENTRY_DSN or disable with SENTRY_ENABLED=false'
  );
}

// Environment (default to development)
const ENVIRONMENT = process.env.NODE_ENV || process.env.SENTRY_ENVIRONMENT || 'development';

// Enable Sentry in production or when explicitly enabled
const SENTRY_ENABLED =
  process.env.SENTRY_ENABLED === 'true' ||
  process.env.NODE_ENV === 'production' ||
  !!process.env.SENTRY_DSN;

// Sample rates for different transaction types
const DEFAULT_TRACES_SAMPLE_RATE = process.env.SENTRY_TRACES_SAMPLER_DEFAULT_RATE
  ? parseFloat(process.env.SENTRY_TRACES_SAMPLER_DEFAULT_RATE)
  : process.env.SENTRY_TRACES_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0.1;

const AGENT_TRACES_SAMPLE_RATE = process.env.SENTRY_TRACES_SAMPLER_AGENT_RATE
  ? parseFloat(process.env.SENTRY_TRACES_SAMPLER_AGENT_RATE)
  : 1.0; // Default to 100% for agent operations

const HEALTH_TRACES_SAMPLE_RATE = process.env.SENTRY_TRACES_SAMPLER_HEALTH_RATE
  ? parseFloat(process.env.SENTRY_TRACES_SAMPLER_HEALTH_RATE)
  : 0.0; // Default to 0% for health checks

// Use real Sentry if enabled and available, otherwise use stub
const SentryInstance = SENTRY_ENABLED
  ? (Sentry as SentryWithMetrics)
  : (createStubSentry() as unknown as SentryWithMetrics);

function createStubSentry() {
  return {
    init: () => {
      console.log('[Sentry] Stub - logging disabled');
    },
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
    },
    consoleLoggingIntegration: () => ({}) as never,
    httpIntegration: () => ({}) as never,
    expressIntegration: () => ({}) as never,
    startSpan: () => ({}) as never,
    setUser: () => {},
    setTag: () => {},
    addBreadcrumb: () => {},
    captureException: () => {},
    captureMessage: () => {},
    metrics: {
      increment: () => {},
      gauge: () => {},
      distribution: () => {},
    },
    flush: async () => true,
  };
}

/**
 * Initialize Sentry with logging enabled
 */
export function initSentry(): void {
  if (!SENTRY_ENABLED) {
    console.log('[Sentry] Logging disabled (SENTRY_ENABLED=false or no DSN provided)');
    return;
  }

  // Validate DSN if provided
  if (SENTRY_DSN) {
    try {
      validateDSN(SENTRY_DSN);
    } catch (error) {
      console.error('[Sentry]', error);
      return;
    }
  } else {
    console.log('[Sentry] No DSN provided, skipping initialization');
    return;
  }

  SentryInstance.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    enableLogs: true,
    // Note: Metrics are enabled by default in SDK 9.25.0+
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: ['log', 'info', 'warn', 'error'],
      }),
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    // Use tracesSampler for dynamic sampling based on transaction type
    tracesSampler: (samplingContext) => {
      const transactionName = samplingContext.transactionContext?.name || '';

      // Sample all agent/LLM/pipeline transactions at 100% (or configured rate)
      if (
        transactionName.includes('agent') ||
        transactionName.includes('llm') ||
        transactionName.includes('pipeline')
      ) {
        return AGENT_TRACES_SAMPLE_RATE;
      }

      // Don't sample health check transactions
      if (
        transactionName.includes('health') ||
        transactionName.includes('ping') ||
        transactionName.startsWith('GET /health')
      ) {
        return HEALTH_TRACES_SAMPLE_RATE;
      }

      // Use default rate for everything else
      return DEFAULT_TRACES_SAMPLE_RATE;
    },
    beforeSendLog(log) {
      if (process.env.NODE_ENV === 'production' && log.level === 'info') {
        return null;
      }
      return log;
    },
    beforeSend(event, hint) {
      try {
        // Redact PII from event before sending
        event = piiRedactor.redactEvent(event);
      } catch (error) {
        console.error('[Sentry] Failed to redact PII from event:', error);
      }

      if (event.exception) {
        const error = hint.originalException;
        if (ENVIRONMENT === 'development' && error instanceof Error) {
          if (error.message.includes('ECONNREFUSED')) {
            return null;
          }
        }
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      try {
        // Redact PII from breadcrumb before sending
        breadcrumb = piiRedactor.redactBreadcrumb(breadcrumb);
      } catch (error) {
        console.error('[Sentry] Failed to redact PII from breadcrumb:', error);
      }
      return breadcrumb;
    },
    initialScope: {
      tags: {
        component: 'server',
        runtime: 'node',
      },
      user: {
        id: process.env.USER || 'unknown',
      },
    },
  });

  console.log(`[Sentry] Initialized with environment: ${ENVIRONMENT}`);
}

/**
 * Get a configured Sentry logger instance
 */
export const sentryLogger = SentryInstance.logger;

/**
 * Helper functions for structured logging
 */
export const logger = {
  trace: (message: string, attributes?: Record<string, unknown>) => {
    SentryInstance.logger.trace(message, attributes);
    console.debug(message, attributes);
  },

  debug: (message: string, attributes?: Record<string, unknown>) => {
    SentryInstance.logger.debug(message, attributes);
    console.debug(message, attributes);
  },

  info: (message: string, attributes?: Record<string, unknown>) => {
    SentryInstance.logger.info(message, attributes);
    console.info(message, attributes);
  },

  warn: (message: string, attributes?: Record<string, unknown>) => {
    SentryInstance.logger.warn(message, attributes);
    console.warn(message, attributes);
  },

  error: (message: string, attributes?: Record<string, unknown>) => {
    SentryInstance.logger.error(message, attributes);
    console.error(message, attributes);
  },

  fatal: (message: string, attributes?: Record<string, unknown>) => {
    SentryInstance.logger.fatal(message, attributes);
    console.error('[FATAL]', message, attributes);
  },
};

/**
 * Set user context for logged events
 */
export function setSentryUser(user: { id: string; email?: string; username?: string }): void {
  SentryInstance.setUser(user);
}

/**
 * Set a tag for contextual information
 */
export function setSentryTag(key: string, value: string): void {
  SentryInstance.setTag(key, value);
}

/**
 * Set a custom breadcrumb for tracking user actions
 */
export function addSentryBreadcrumb(
  message: string,
  category?: string,
  level?: SeverityLevel
): void {
  SentryInstance.addBreadcrumb({
    message,
    category: category || 'custom',
    level: level || 'info',
  });
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  SentryInstance.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message manually
 */
export function captureMessage(message: string, level: SeverityLevel = 'info'): void {
  SentryInstance.captureMessage(message, level);
}

// ============================================================================
// Sentry Metrics API
// ============================================================================

/**
 * Increment a counter metric
 *
 * Use for tracking cumulative occurrences: API calls, events, errors
 *
 * @example
 *   incrementCounter('agent.execution', 1, { model: 'claude-3-5-sonnet' })
 */
export function incrementCounter(name: string, value: number = 1, options?: MetricsOptions): void {
  if (!SENTRY_ENABLED) return;
  // Check if metrics API is available
  const sentryWithMetrics = Sentry as SentryWithMetrics;
  if (sentryWithMetrics.metrics && typeof sentryWithMetrics.metrics.increment === 'function') {
    sentryWithMetrics.metrics.increment(name, value, options);
  }
}

/**
 * Set a gauge metric
 *
 * Use for point-in-time snapshots: queue depth, memory, active connections
 *
 * @example
 *   setGauge('agent.active_count', 5, { project: 'my-app' })
 */
export function setGauge(name: string, value: number, options?: MetricsOptions): void {
  if (!SENTRY_ENABLED) return;
  // Check if metrics API is available
  const sentryWithMetrics = Sentry as SentryWithMetrics;
  if (sentryWithMetrics.metrics && typeof sentryWithMetrics.metrics.gauge === 'function') {
    sentryWithMetrics.metrics.gauge(name, value, options);
  }
}

/**
 * Record a distribution metric
 *
 * Use for statistical analysis: response times, durations, values
 *
 * @example
 *   recordDistribution('agent.duration_ms', 1234, { agent_type: 'research' })
 */
export function recordDistribution(name: string, value: number, options?: MetricsOptions): void {
  if (!SENTRY_ENABLED) return;
  // Check if metrics API is available
  const sentryWithMetrics = Sentry as SentryWithMetrics;
  if (sentryWithMetrics.metrics && typeof sentryWithMetrics.metrics.distribution === 'function') {
    sentryWithMetrics.metrics.distribution(name, value, options);
  }
}

/**
 * Timing helper - measures async function execution time
 *
 * @example
 *   const result = await withTiming('db.query', () => User.findById(id), { table: 'users' })
 */
export async function withTiming<T>(
  name: string,
  fn: () => Promise<T> | T,
  options?: MetricsOptions
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    recordDistribution(`${name}_duration_ms`, duration, {
      unit: 'millisecond',
      ...options,
    });
    incrementCounter(`${name}_executed`, 1, options);
  }
}

/**
 * Flush metrics immediately (useful before shutdown)
 */
export async function flushMetrics(timeout: number = 2000): Promise<boolean> {
  if (!SENTRY_ENABLED) return true;
  return SentryInstance.flush(timeout);
}

// ============================================================================
// Custom Span Helpers
// ============================================================================

/**
 * Start an agent-specific span for performance tracking
 *
 * Use this to track agent operations like execution, planning, etc.
 *
 * @param agentType - The type of agent (e.g., 'research', 'implementation')
 * @param operation - The operation being performed (e.g., 'execute', 'plan')
 * @param fn - The function to execute within the span
 * @returns The result of the function
 *
 * @example
 *   const result = await startAgentSpan('research', 'execute', async (span) => {
 *     span?.setAttribute('query', 'How to implement auth');
 *     return await agent.execute();
 *   });
 */
export async function startAgentSpan<T>(
  agentType: string,
  operation: string,
  fn: (span: ReturnType<typeof Sentry.startSpan>) => Promise<T> | T
): Promise<T> {
  if (!SENTRY_ENABLED) {
    return await fn({} as ReturnType<typeof Sentry.startSpan>);
  }

  return Sentry.startSpan(
    {
      name: `agent.${agentType}.${operation}`,
      op: `agent.${operation}`,
      attributes: {
        component: 'server',
        agent_type: agentType,
      },
    },
    fn
  );
}

/**
 * Start a custom span with full control
 *
 * Use this for custom performance tracking with full control over span attributes
 *
 * @param name - The name of the span/operation
 * @param op - The operation type
 * @param attributes - Additional attributes to attach to the span
 * @param fn - The function to execute within the span
 * @returns The result of the function
 *
 * @example
 *   const result = await startCustomSpan(
 *     'DataProcessing',
 *     'server.process',
 *     { records: 100, type: 'export' },
 *     async (span) => {
 *       span?.setAttributes({ status: 'processing' });
 *       return await processData();
 *     }
 *   );
 */
export async function startCustomSpan<T>(
  name: string,
  op: string,
  attributes: Record<string, string | number | boolean> = {},
  fn: (span: ReturnType<typeof Sentry.startSpan>) => Promise<T> | T
): Promise<T> {
  if (!SENTRY_ENABLED) {
    return await fn({} as ReturnType<typeof Sentry.startSpan>);
  }

  return Sentry.startSpan(
    {
      name,
      op,
      attributes: {
        ...attributes,
        component: 'server',
      },
    },
    fn
  );
}

/**
 * Record a pipeline step as a span
 *
 * Use this to track pipeline workflow steps for performance monitoring
 *
 * @param stepName - The name of the pipeline step
 * @param pipelineName - The name of the pipeline
 * @param fn - The function to execute within the span
 * @returns The result of the function
 *
 * @example
 *   const result = await recordPipelineStep('build', 'my-pipeline', async (span) => {
 *     span?.setAttribute('status', 'running');
 *     return await runBuild();
 *   });
 */
export async function recordPipelineStep<T>(
  stepName: string,
  pipelineName: string,
  fn: (span: ReturnType<typeof Sentry.startSpan>) => Promise<T> | T
): Promise<T> {
  if (!SENTRY_ENABLED) {
    return await fn({} as ReturnType<typeof Sentry.startSpan>);
  }

  return Sentry.startSpan(
    {
      name: `pipeline.${pipelineName}.${stepName}`,
      op: 'pipeline.step',
      attributes: {
        component: 'server',
        pipeline_name: pipelineName,
        step_name: stepName,
      },
    },
    fn
  );
}
