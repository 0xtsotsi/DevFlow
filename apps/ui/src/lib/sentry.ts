/**
 * Sentry Configuration for DevFlow UI
 *
 * This module initializes Sentry with structured logging enabled for the React/Electron frontend.
 * It captures both console logs and provides structured logging API.
 */

import * as SentryReact from '@sentry/react';

// DSN from environment (required in production)
const SENTRY_DSN = import.meta.env?.VITE_SENTRY_DSN as string;

// Validate production DSN is set
if (!SENTRY_DSN && import.meta.env?.NODE_ENV === 'production') {
  throw new Error('VITE_SENTRY_DSN must be set in production environment');
}

// Environment (default to development)
const ENVIRONMENT =
  (import.meta.env?.NODE_ENV as string) ||
  (import.meta.env?.VITE_SENTRY_ENVIRONMENT as string) ||
  'development';

// Enable Sentry in production or when explicitly enabled
const SENTRY_ENABLED =
  (import.meta.env?.VITE_SENTRY_ENABLED as string) === 'true' ||
  (import.meta.env?.NODE_ENV as string) === 'production' ||
  !!(import.meta.env?.VITE_SENTRY_DSN as string);

// Parse trace propagation targets from environment (kept for future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TRACE_PROPAGATION_TARGETS = (
  (import.meta.env?.VITE_SENTRY_TRACE_PROPAGATION_TARGETS as string) || ''
)
  .split(',')
  .map((target) => target.trim())
  .filter(Boolean);

// Default sample rate for traces
const DEFAULT_TRACES_SAMPLE_RATE = import.meta.env?.VITE_SENTRY_TRACES_SAMPLER_DEFAULT_RATE
  ? parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLER_DEFAULT_RATE as string)
  : import.meta.env?.VITE_SENTRY_TRACES_SAMPLE_RATE
    ? parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string)
    : 0.1;

// Use real Sentry if enabled and available, otherwise use stub
const Sentry = SENTRY_ENABLED ? SentryReact : createStubSentry();

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
    replayIntegration: () => ({}) as never,
    browserTracingIntegration: () => ({}) as never,
    startSpan: () => ({}) as never,
    setUser: () => {},
    setTag: () => {},
    addBreadcrumb: () => {},
    captureException: () => {},
    captureMessage: () => {},
    withSentryReactRouterV6Routing: undefined,
    ErrorBoundary: undefined as never,
  };
}

// Type for Sentry's severity level
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

/**
 * Initialize Sentry with logging enabled
 */
export function initSentry(): void {
  if (!SENTRY_ENABLED) {
    console.log('[Sentry] Logging disabled (SENTRY_ENABLED=false or no DSN provided)');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    enableLogs: true,
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: ['log', 'info', 'warn', 'error'],
      }),
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Use tracesSampler for dynamic sampling based on transaction type
    tracesSampler: (samplingContext) => {
      const transactionName = samplingContext.transactionContext?.name || '';

      // Sample all agent-related transactions at 100%
      if (transactionName.includes('agent') || transactionName.includes('llm')) {
        return 1.0;
      }

      // Don't sample health check transactions
      if (transactionName.includes('health') || transactionName.includes('ping')) {
        return 0.0;
      }

      // Use default rate for everything else
      return DEFAULT_TRACES_SAMPLE_RATE;
    },
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env?.VITE_SENTRY_ERROR_REPLAY_SAMPLE_RATE
      ? parseFloat(import.meta.env.VITE_SENTRY_ERROR_REPLAY_SAMPLE_RATE as string)
      : 1.0,
    beforeSendLog(log) {
      if (ENVIRONMENT === 'production' && log.level === 'info') {
        return null;
      }
      return log;
    },
    beforeSend(event, hint) {
      if (event.exception) {
        const error = hint.originalException;
        if (ENVIRONMENT === 'development' && error instanceof Error) {
          if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
            return null;
          }
        }
      }
      return event;
    },
    initialScope: {
      tags: {
        component: 'ui',
        runtime: 'react',
      },
    },
  });

  console.log(`[Sentry] Initialized with environment: ${ENVIRONMENT}`);
}

/**
 * Get a configured Sentry logger instance
 */
export const sentryLogger = Sentry.logger;

/**
 * Helper functions for structured logging
 */
export const logger = {
  trace: (message: string, attributes?: Record<string, unknown>) => {
    Sentry.logger.trace(message, attributes);
    console.debug(message, attributes);
  },

  debug: (message: string, attributes?: Record<string, unknown>) => {
    Sentry.logger.debug(message, attributes);
    console.debug(message, attributes);
  },

  info: (message: string, attributes?: Record<string, unknown>) => {
    Sentry.logger.info(message, attributes);
    console.info(message, attributes);
  },

  warn: (message: string, attributes?: Record<string, unknown>) => {
    Sentry.logger.warn(message, attributes);
    console.warn(message, attributes);
  },

  error: (message: string, attributes?: Record<string, unknown>) => {
    Sentry.logger.error(message, attributes);
    console.error(message, attributes);
  },

  fatal: (message: string, attributes?: Record<string, unknown>) => {
    Sentry.logger.fatal(message, attributes);
    console.error('[FATAL]', message, attributes);
  },
};

/**
 * Set user context for logged events
 */
export function setSentryUser(user: { id: string; email?: string; username?: string }): void {
  Sentry.setUser(user);
}

/**
 * Set a tag for contextual information
 */
export function setSentryTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * Set a custom breadcrumb for tracking user actions
 */
export function addSentryBreadcrumb(
  message: string,
  category?: string,
  level?: SeverityLevel
): void {
  Sentry.addBreadcrumb({
    message,
    category: category || 'custom',
    level: level || 'info',
  });
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message manually
 */
export function captureMessage(message: string, level: SeverityLevel = 'info'): void {
  Sentry.captureMessage(message, level);
}

// ============================================================================
// Custom Span Helpers
// ============================================================================

/**
 * Start a UI-specific span for performance tracking
 *
 * Use this to track UI operations like component renders, user interactions, etc.
 *
 * @param name - The name of the span/operation
 * @param op - The operation type (e.g., 'ui.render', 'ui.click')
 * @param fn - The function to execute within the span
 * @returns The result of the function
 *
 * @example
 *   const result = await startUiSpan('ComponentRender', 'ui.render', async () => {
 *     return await fetchData();
 *   });
 */
export async function startUiSpan<T>(
  name: string,
  op: string,
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
        component: 'ui',
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
 *     'ui.process',
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
        component: 'ui',
      },
    },
    fn
  );
}

/**
 * React Error Boundary wrapper
 * Use this to wrap components that should capture errors to Sentry
 */
export { SentryBoundary, withSentryRouting } from './sentry-react';
