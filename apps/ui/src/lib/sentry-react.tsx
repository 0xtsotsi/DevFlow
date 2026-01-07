/**
 * Sentry React Integration Components
 *
 * Provides React components and HOCs for Sentry integration
 */

import { useEffect, JSX } from 'react';
import type { SeverityLevel } from './sentry';
import { captureException as sentryCaptureException } from './sentry';
import * as SentryReact from '@sentry/react';

// Type for fallback render function
type FallbackRender = (error: Error, eventId: string) => JSX.Element;

// Stub ErrorBoundary when Sentry is not enabled
const StubErrorBoundary = ({
  children,
}: {
  children: React.ReactNode;
  fallback?: FallbackRender;
}) => <>{children}</>;

// Use real Sentry if enabled
const SENTRY_ENABLED =
  (import.meta.env?.VITE_SENTRY_ENABLED as string) === 'true' ||
  (import.meta.env?.NODE_ENV as string) === 'production' ||
  !!(import.meta.env?.VITE_SENTRY_DSN as string);

// Use conditional types to properly type stub vs real Sentry
type SentryType = typeof SentryReact;
type StubSentryType = {
  ErrorBoundary: React.ComponentType<{
    fallback?: FallbackRender;
    children: React.ReactNode;
  }>;
  addBreadcrumb: () => void;
  withSentryReactRouterV6Routing: undefined;
  startTransaction: (name: string, operation?: string) => null;
};

const Sentry = (SENTRY_ENABLED ? SentryReact : createStubSentry()) as SentryType | StubSentryType;

function createStubSentry(): StubSentryType {
  return {
    ErrorBoundary: StubErrorBoundary,
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
  fallback?: FallbackRender;
}) {
  const ErrorBoundaryComp =
    (Sentry as SentryType).ErrorBoundary ?? (Sentry as StubSentryType).ErrorBoundary;

  // Create fallback render function
  const fallbackRender = (error: Error, eventId: string) => {
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
  };

  // Use ErrorBoundary from Sentry if available
  return (
    <ErrorBoundaryComp
      fallback={fallbackRender as any} // eslint-disable-line @typescript-eslint/no-explicit-any
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

    const sentry = Sentry as StubSentryType;
    return sentry.startTransaction(name, operation || 'ui.action');
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
