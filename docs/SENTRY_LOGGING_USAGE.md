# Sentry Logging Usage Guide

This guide demonstrates how to use Sentry's structured logging feature in DevFlow.

## Overview

Sentry logging is configured for both:

- **Server** (Node.js/Express) - `apps/server/src/lib/sentry.ts`
- **UI** (React/Electron) - `apps/ui/src/lib/sentry.ts`

## Features Enabled

1. **Console Log Capture** - Automatically captures `console.log`, `console.warn`, `console.error`
2. **Structured Logging** - Use `Sentry.logger.*` for structured logs with searchable attributes
3. **Error Tracking** - Automatic error capturing with stack traces
4. **Performance Monitoring** - HTTP request tracing and transaction monitoring

---

## Server Logging Examples

### Basic Usage

```typescript
import { logger } from './lib/sentry.js';

// Basic logging (also outputs to console)
logger.info('Server started successfully');
logger.warn('High memory usage detected');
logger.error('Database connection failed');

// Logging with attributes (structured data)
logger.info('User logged in', {
  userId: 'user_123',
  method: 'oauth',
  provider: 'github',
});

logger.error('Payment processing failed', {
  orderId: 'order_456',
  amount: 99.99,
  currency: 'USD',
  errorCode: 'CARD_DECLINED',
});

// All available log levels
logger.trace('Detailed trace information');
logger.debug('Debug information for development');
logger.info('General informational message');
logger.warn('Warning message');
logger.error('Error occurred');
logger.fatal('Fatal error - application cannot continue');
```

### Template Literal Formatting

```typescript
import * as Sentry from '@sentry/node';

// Creates searchable attributes from template literals
Sentry.logger.info(
  Sentry.logger.fmt`User '${userName}' performed '${action}' on resource '${resourceId}'`
);
// Results in attributes: { userName: "...", action: "...", resourceId: "..." }
```

### Error Context

```typescript
import { captureException, setSentryTag } from './lib/sentry.js';

// Set contextual tags
setSentryTag('environment', 'production');
setSentryTag('feature', 'user-authentication');

// Capture exceptions with extra context
try {
  await riskyOperation();
} catch (error) {
  captureException(error as Error, {
    userId: 'user_123',
    action: 'process_payment',
    amount: 99.99,
  });
}
```

### Breadcrumbs (User Action Tracking)

```typescript
import { addSentryBreadcrumb } from './lib/sentry.js';

// Track user actions for debugging
addSentryBreadcrumb('User clicked save button', 'user-action', 'info');
addSentryBreadcrumb('Form validation started', 'validation', 'debug');
```

---

## UI Logging Examples

### Basic Usage

```typescript
import { logger } from './lib/sentry';

// Basic logging
logger.info('Application initialized');
logger.warn('API rate limit approaching');
logger.error('Failed to load user data');

// Logging with attributes
logger.info('Feature accessed', {
  featureName: 'kanban-board',
  userId: 'user_123',
  sessionId: 'sess_456',
});
```

### React Component Integration

```typescript
import { useSentryTrack, useSentryCapture } from './lib/sentry-react';

function MyComponent() {
  const [error, setError] = useState<Error | null>(null);

  // Track component mounting
  useSentryTrack('my_component_mounted', 'lifecycle');

  // Capture errors
  useSentryCapture(error, {
    component: 'MyComponent',
    props: { /* ... */ },
  });

  const handleClick = () => {
    // Track user actions
    logger.info('Button clicked', {
      button: 'submit',
      page: 'checkout',
    });
  };

  return <button onClick={handleClick}>Submit</button>;
}
```

### Error Boundary

```typescript
import { SentryBoundary } from './lib/sentry-react';

function App() {
  return (
    <SentryBoundary
      fallback={(error, eventId) => (
        <div>
          <h2>Something went wrong</h2>
          <p>Error ID: {eventId}</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
    >
      <YourAppComponent />
    </SentryBoundary>
  );
}
```

### Performance Monitoring

```typescript
import { useSentryPerformance } from './lib/sentry-react';

function SlowComponent() {
  const startTransaction = useSentryPerformance();

  const handleExpensiveOperation = async () => {
    const transaction = startTransaction('expensive_operation', 'ui.action');

    try {
      // ... do expensive work
      await fetchLargeData();
    } finally {
      transaction?.finish();
    }
  };

  return <button onClick={handleExpensiveOperation}>Load Data</button>;
}
```

---

## Configuration

### Environment Variables

```bash
# .env file

# Sentry DSN (required)
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Enable/disable Sentry
SENTRY_ENABLED=true

# Environment name
SENTRY_ENVIRONMENT=development

# Performance sampling (0.0 to 1.0)
SENTRY_TRACES_SAMPLE_RATE=0.1

# Error replay sampling for UI (0.0 to 1.0)
SENTRY_ERROR_REPLAY_SAMPLE_RATE=1.0
```

### Log Filtering

```typescript
// In apps/server/src/lib/sentry.ts or apps/ui/src/lib/sentry.ts

beforeSendLog(log) {
  // Drop info-level logs in production
  if (process.env.NODE_ENV === 'production' && log.level === 'info') {
    return null;
  }
  // Drop logs with specific attributes
  if (log.attributes?.category === 'debug') {
    return null;
  }
  return log;
}
```

---

## Viewing Logs in Sentry

1. Navigate to your Sentry project
2. Click **Logs** in the sidebar
3. Use the search bar to filter:
   - `level:error` - Show only errors
   - `user.id:user_123` - Filter by user
   - `environment:production` - Filter by environment
   - `server:node` - Filter by server logs
   - `logger.attribute:"value"` - Filter by custom attribute

---

## Verification

### Server Verification

```bash
# Start the server
npm run dev:server

# Logs should show:
# [Sentry] Initialized with environment: development
```

Add temporary test code in `apps/server/src/index.ts`:

```typescript
import { logger } from './lib/sentry.js';

// Test after initialization
setTimeout(() => {
  logger.info('Sentry logging test', {
    test: true,
    timestamp: new Date().toISOString(),
  });
}, 2000);
```

### UI Verification

```bash
# Start the UI
npm run dev

# Check browser console:
# [Sentry] Initialized with environment: development
```

Add temporary test code in `apps/ui/src/app.tsx`:

```typescript
useEffect(() => {
  logger.info('UI Sentry logging test', {
    test: true,
    timestamp: new Date().toISOString(),
  });
}, []);
```

---

## Best Practices

1. **Use Attributes** - Always include relevant attributes for better searchability

   ```typescript
   // Good
   logger.error('Payment failed', { orderId, amount, errorCode });

   // Bad
   logger.error(`Payment failed for order ${orderId}`);
   ```

2. **Appropriate Log Levels**
   - `trace` - Very detailed debugging info
   - `debug` - Development debugging info
   - `info` - General informational messages
   - `warn` - Warning conditions that don't stop execution
   - `error` - Error conditions that need attention
   - `fatal` - Critical errors that prevent the application from running

3. **Don't Log Sensitive Data**
   - No passwords, API keys, tokens
   - No full credit card numbers
   - No personal health information (PHI)

4. **Use Breadcrumbs** - Track user actions to debug errors

---

## Troubleshooting

### Logs not appearing in Sentry

1. Check `SENTRY_ENABLED` is true
2. Verify `SENTRY_DSN` is correct
3. Check browser console for errors
4. Look at the **Logs** section (not Issues) in Sentry

### Too many logs

1. Reduce `SENTRY_TRACES_SAMPLE_RATE`
2. Use `beforeSendLog` to filter logs
3. Reduce console log levels captured

### Console integration not working

1. Verify SDK version is 9.41.0+
2. Check `consoleLoggingIntegration` is in integrations array
3. Verify desired levels are in `levels` array
