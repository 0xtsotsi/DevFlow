/**
 * Sentry React Integration Components
 *
 * Provides React components and HOCs for Sentry integration
 */

import { useEffect, JSX } from 'react';
import type { SeverityLevel } from './sentry';
import { captureException as sentryCaptureException } from './sentry';
import * as SentryReact from '@sentry/react';

// Stub ErrorBoundary when Sentry is not enabled
const StubErrorBoundary = ({
  children,
}: {
  children: React.ReactNode;
  fallback?: (error: Error, eventId: string) => JSX.Element;
}) => <>{children}</>;

// Use real Sentry if enabled
const SENTRY_ENABLED =
  (import.meta.env?.VITE_SENTRY_ENABLED as string) === 'true' ||
  (import.meta.env?.NODE_ENV as string) === 'production' ||
  !!(import.meta.env?.VITE_SENTRY_DSN as string);

const Sentry = SENTRY_ENABLED ? SentryReact : createStubSentry();

function createStubSentry() {
  return {
    ErrorBoundary: StubErrorBoundary as React.ComponentType<{
      fallback?: (error: Error, eventId: string) => JSX.Element;
      children: React.ReactNode;
    }>,
    addBreadcrumb: () => {},
    withSentryReactRouterV6Routing: undefined,
    startTransaction: () => null,
  };
}

/**
 * Sentry Error Boundary Component
 *
 * Wrap your app or specific components with this to capture React errors
 */
export function SentryBoundary({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: (error: Error, eventId: string) => JSX.Element;
}) {
  const ErrorBoundaryComp = Sentry.ErrorBoundary;

  // Use ErrorBoundary from Sentry if available
  return (
    <ErrorBoundaryComp
      fallback={(error: Error, eventId: string) => {
        console.error('[Sentry] Error caught by boundary:', error, eventId);
        if (fallback) {
          return fallback(error, eventId);
        }
        return (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>Something went wrong</h2>
            <p>Error ID: {eventId}</p>
            <p>Please check the console for details.</p>
          </div>
        );
      }}
    >
      {children}
    </ErrorBoundaryComp>
  );
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
    Sentry.addBreadcrumb({
      message,
      category,
      level,
    });
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
  const SentryRoutes = Sentry.withSentryReactRouterV6Routing;

  if (!SentryRoutes) {
    return <>{children}</>;
  }

  return <SentryRoutes>{children}</SentryRoutes>;
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
    useEffect(() => {
      Sentry.addBreadcrumb({
        message: `Component mounted: ${displayName}`,
        category: 'component',
        level: 'info',
      });
      return () => {
        Sentry.addBreadcrumb({
          message: `Component unmounted: ${displayName}`,
          category: 'component',
          level: 'info',
        });
      };
    }, [displayName]);

    return <WrappedComponent {...props} />;
  };
}

/**
 * Performance monitoring hook
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const startTransaction = useSentryPerformance();
 *
 *   const handleClick = () => {
 *     const transaction = startTransaction('button_click');
 *     // ... do work
 *     transaction?.finish();
 *   };
 *
 *   return <button onClick={handleClick}>Click me</button>;
 * }
 * ```
 */
export function useSentryPerformance() {
  return (name: string, operation?: string) => {
    if (!SENTRY_ENABLED) {
      return null;
    }

    return Sentry.startTransaction({
      name,
      op: operation || 'ui.action',
    });
  };
}

// Export for routing instrumentation
export const withSentryRouting = Sentry.withSentryReactRouterV6Routing
  ? (props: { children: React.ReactNode }) => {
      const SentryRoutes = Sentry.withSentryReactRouterV6Routing!;
      return <SentryRoutes>{props.children}</SentryRoutes>;
    }
  : (props: { children: React.ReactNode }) => <>{props.children}</>;
