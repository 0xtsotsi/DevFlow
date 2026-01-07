/**
 * Sentry React Integration Components
 *
 * Provides React components and HOCs for Sentry integration
 */

import { useEffect, JSX } from 'react';
import type { SeverityLevel } from './sentry';
import { captureException as sentryCaptureException } from './sentry';
import * as SentryReact from '@sentry/react';

// Re-export Sentry's FallbackRender type for consistency
type FallbackRender = SentryReact.FallbackRender;

// Type for fallback render function parameters (matches Sentry's ErrorBoundary fallback props)
// Note: Sentry v8+ uses 'error: unknown' instead of 'error: Error'
type FallbackParams = Parameters<FallbackRender>[0];

// Type for fallback prop - matches Sentry's ErrorBoundary API:
// ReactElement | FallbackRender function | undefined
type FallbackProp = React.ReactElement | FallbackRender;

// Stub ErrorBoundary when Sentry is not enabled
const StubErrorBoundary = ({
  children,
}: {
  children?: React.ReactNode;
  fallback?: FallbackProp;
}) => <>{children}</>;

// Use real Sentry if enabled
const SENTRY_ENABLED =
  (import.meta.env?.VITE_SENTRY_ENABLED as string) === 'true' ||
  (import.meta.env?.NODE_ENV as string) === 'production' ||
  !!(import.meta.env?.VITE_SENTRY_DSN as string);

// Use conditional types to properly type stub vs real Sentry
type SentryType = typeof SentryReact;

// Span interface for the new Sentry API (v8+)
interface Span {
  end(): void;
  setAttribute(key: string, value: unknown): void;
  spanContext(): {
    traceId: string;
    spanId: string;
  };
}

type StubSentryType = {
  ErrorBoundary: typeof StubErrorBoundary;
  addBreadcrumb: () => void;
  withSentryReactRouterV6Routing: undefined;
  startSpan: <T>(
    options: { name: string; op?: string; attributes?: Record<string, unknown> },
    callback: (span: Span) => T
  ) => T | null;
  startSpanManual: <T>(
    options: { name: string; op?: string; attributes?: Record<string, unknown> },
    callback: (span: Span) => T
  ) => T | null;
  startInactiveSpan: (options: {
    name: string;
    op?: string;
    attributes?: Record<string, unknown>;
  }) => Span | null;
};

const Sentry = (SENTRY_ENABLED ? SentryReact : createStubSentry()) as SentryType | StubSentryType;

function createStubSentry(): StubSentryType {
  const noopSpan: Span = {
    end: () => {},
    setAttribute: () => {},
    spanContext: () => ({ traceId: '', spanId: '' }),
  };

  return {
    ErrorBoundary: StubErrorBoundary,
    addBreadcrumb: () => {},
    withSentryReactRouterV6Routing: undefined,
    startSpan: (_options, callback) => callback(noopSpan),
    startSpanManual: (_options, callback) => callback(noopSpan),
    startInactiveSpan: () => noopSpan,
  };
}

/**
 * Sentry Error Boundary Component
 *
 * Wrap your app or specific components with this to capture React errors
 *
 * @example
 * ```tsx
 * // Simple fallback
 * <SentryBoundary fallback={<p>Something went wrong</p>}>
 *   <App />
 * </SentryBoundary>
 *
 * // Fallback with reset function
 * <SentryBoundary
 *   fallback={({ error, resetError }) => (
 *     <div>
 *       <p>Error: {String(error)}</p>
 *       <button onClick={resetError}>Try again</button>
 *     </div>
 *   )}
 * >
 *   <App />
 * </SentryBoundary>
 * ```
 */
export function SentryBoundary({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: FallbackProp;
}) {
  const ErrorBoundaryComp =
    (Sentry as SentryType).ErrorBoundary ?? (Sentry as StubSentryType).ErrorBoundary;

  // Pass fallback directly - types match Sentry's ErrorBoundary API
  return <ErrorBoundaryComp fallback={fallback}>{children}</ErrorBoundaryComp>;
}

/**
 * Custom hook to track user actions as Sentry breadcrumbs
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useSentryTrack('button_click', { button: 'submit' });
 *   return <button>Submit</button>;
 * }
 * ```
 */
export function useSentryTrack(
  message: string,
  category: string = 'user-action',
  level: SeverityLevel = 'info',
  dependencies: unknown[] = []
) {
  useEffect(() => {
    const sentry = SENTRY_ENABLED ? (Sentry as SentryType) : (Sentry as StubSentryType);
    sentry.addBreadcrumb({
      message,
      category,
      level,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [message, category, level, ...dependencies]);
}

/**
 * Custom hook to capture component errors
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useSentryCapture(error);
 *   return <div>...</div>;
 * }
 * ```
 */
export function useSentryCapture(error: Error | null, context?: Record<string, unknown>) {
  useEffect(() => {
    if (error) {
      sentryCaptureException(error, context);
    }
  }, [error, context]);
}

/**
 * Higher-Order Component for Sentry routing instrumentation
 *
 * This component wraps the router and provides performance monitoring
 */
export function SentryRoutingInstrumentation({ children }: { children: React.ReactNode }) {
  const SentryRoutes = SENTRY_ENABLED
    ? (Sentry as SentryType).withSentryReactRouterV6Routing
    : (Sentry as StubSentryType).withSentryReactRouterV6Routing;

  if (!SentryRoutes) {
    return <>{children}</>;
  }

  // Type assertion for FC with children
  const RoutesComponent = SentryRoutes as React.FC<{ children: React.ReactNode }>;
  return <RoutesComponent>{children}</RoutesComponent>;
}

/**
 * HOC to add Sentry tracking to a component
 */
export function withSentryTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const displayName =
    componentName ||
    (WrappedComponent as { displayName?: string }).displayName ||
    (WrappedComponent as { name?: string }).name ||
    'Component';

  return function WithSentryTracking(props: P) {
    const sentry = SENTRY_ENABLED ? (Sentry as SentryType) : (Sentry as StubSentryType);
    useEffect(() => {
      sentry.addBreadcrumb({
        message: `Component mounted: ${displayName}`,
        category: 'component',
        level: 'info',
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      return () => {
        sentry.addBreadcrumb({
          message: `Component unmounted: ${displayName}`,
          category: 'component',
          level: 'info',
        } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      };
    }, [displayName]);

    return <WrappedComponent {...props} />;
  };
}

/**
 * Performance monitoring hook
 *
 * Uses Sentry's new startSpanManual API (v8+) for manual span management.
 * Returns an object with a span that you must manually end by calling .end()
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const startSpan = useSentryPerformance();
 *
 *   const handleClick = () => {
 *     const span = startSpan('button_click', 'ui.action');
 *     // ... do work
 *     span?.end();
 *   };
 *
 *   return <button onClick={handleClick}>Click me</button>;
 * }
 * ```
 */
export function useSentryPerformance() {
  return (name: string, operation: string = 'ui.action') => {
    if (!SENTRY_ENABLED) {
      return null;
    }

    const sentry = Sentry as SentryType;
    // Use startInactiveSpan for manual span management
    // This creates a span that doesn't require a callback and must be manually ended
    return sentry.startInactiveSpan({
      name,
      op: operation,
    });
  };
}

// Export for routing instrumentation
export const withSentryRouting =
  SENTRY_ENABLED && (Sentry as SentryType).withSentryReactRouterV6Routing
    ? (props: { children: React.ReactNode }) => {
        const SentryRoutes = (Sentry as SentryType).withSentryReactRouterV6Routing as React.FC<{
          children: React.ReactNode;
        }>;
        return <SentryRoutes>{props.children}</SentryRoutes>;
      }
    : (props: { children: React.ReactNode }) => <>{props.children}</>;
