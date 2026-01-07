# Sentry Tracing Enhancements

This document describes the enhancements made to the Sentry tracing configuration in DevFlow.

## Overview

The Sentry tracing implementation has been enhanced with:

1. **Dynamic Transaction Sampling** - Intelligent sampling based on transaction type
2. **Custom Span Helpers** - Easy-to-use functions for creating performance spans
3. **Trace Propagation Targets** - Control distributed tracing behavior (UI)
4. **Environment Configuration** - Fine-grained control via environment variables

## Key Features

### 1. Dynamic Transaction Sampling

Instead of a single sample rate for all transactions, the system now intelligently samples based on transaction type:

#### Server (apps/server/src/lib/sentry.ts)

- **Agent/LLM/Pipeline transactions**: Default 100% sampling (configurable via `SENTRY_TRACES_SAMPLER_AGENT_RATE`)
  - These are critical operations that need full visibility
  - Includes all agent operations, LLM calls, and pipeline workflows

- **Health check transactions**: Default 0% sampling (configurable via `SENTRY_TRACES_SAMPLER_HEALTH_RATE`)
  - High-volume, low-value transactions
  - Includes `/health`, `/ping`, and similar endpoints

- **Other transactions**: Default 10% sampling (configurable via `SENTRY_TRACES_SAMPLER_DEFAULT_RATE`)
  - General API requests and background tasks

#### UI (apps/ui/src/lib/sentry.ts)

- **Agent-related transactions**: 100% sampling
  - Transactions containing 'agent' or 'llm' in the name

- **Health check transactions**: 0% sampling
  - Transactions containing 'health' or 'ping' in the name

- **Other transactions**: Default 10% sampling (configurable via `VITE_SENTRY_TRACES_SAMPLER_DEFAULT_RATE`)

### 2. Custom Span Helpers

Both server and UI now include helper functions for creating custom performance spans:

#### Server Helpers

```typescript
// Track agent operations
await startAgentSpan('research', 'execute', async (span) => {
  span?.setAttribute('query', 'How to implement auth');
  return await agent.execute();
});

// Track custom operations with full control
await startCustomSpan(
  'DataProcessing',
  'server.process',
  { records: 100, type: 'export' },
  async (span) => {
    span?.setAttributes({ status: 'processing' });
    return await processData();
  }
);

// Track pipeline workflow steps
await recordPipelineStep('build', 'my-pipeline', async (span) => {
  span?.setAttribute('status', 'running');
  return await runBuild();
});
```

#### UI Helpers

```typescript
// Track UI operations
await startUiSpan('ComponentRender', 'ui.render', async () => {
  return await fetchData();
});

// Track custom operations with full control
await startCustomSpan(
  'DataProcessing',
  'ui.process',
  { records: 100, type: 'export' },
  async (span) => {
    span?.setAttributes({ status: 'processing' });
    return await processData();
  }
);
```

### 3. Trace Propagation Targets (UI)

The UI now supports configurable trace propagation targets, which control which downstream requests receive trace headers for distributed tracing.

**Environment Variable**: `VITE_SENTRY_TRACE_PROPAGATION_TARGETS`

**Format**: Comma-separated list of URLs or regex patterns

**Examples**:

```bash
# Trace all API routes and local paths (default)
VITE_SENTRY_TRACE_PROPAGATION_TARGETS=

# Trace specific API routes
VITE_SENTRY_TRACE_PROPAGATION_TARGETS=/^\/api/

# Trace specific backend domain
VITE_SENTRY_TRACE_PROPAGATION_TARGETS=https://backend.example.com

# Multiple targets
VITE_SENTRY_TRACE_PROPAGATION_TARGETS=/^\/api/,https://api.example.com,/^\/graphql/
```

**Code Implementation**:

```typescript
Sentry.browserTracingIntegration({
  tracePropagationTargets:
    TRACE_PROPAGATION_TARGETS.length > 0 ? TRACE_PROPAGATION_TARGETS : [/^\/api/, /^\//], // Default: trace all API routes and local paths
});
```

## Environment Variables

### Server Configuration

| Variable                             | Default | Description                              |
| ------------------------------------ | ------- | ---------------------------------------- |
| `SENTRY_TRACES_SAMPLE_RATE`          | `0.1`   | Legacy single sample rate (deprecated)   |
| `SENTRY_TRACES_SAMPLER_DEFAULT_RATE` | `0.1`   | Default rate for most transactions       |
| `SENTRY_TRACES_SAMPLER_AGENT_RATE`   | `1.0`   | Rate for agent/LLM/pipeline transactions |
| `SENTRY_TRACES_SAMPLER_HEALTH_RATE`  | `0.0`   | Rate for health check transactions       |

### UI Configuration

| Variable                                  | Default             | Description                            |
| ----------------------------------------- | ------------------- | -------------------------------------- |
| `VITE_SENTRY_TRACES_SAMPLE_RATE`          | `0.1`               | Legacy single sample rate (deprecated) |
| `VITE_SENTRY_TRACES_SAMPLER_DEFAULT_RATE` | `0.1`               | Default rate for most transactions     |
| `VITE_SENTRY_TRACE_PROPAGATION_TARGETS`   | `[/^\/api/, /^\//]` | Trace propagation targets              |

## Usage Examples

### Example 1: Tracking an Agent Operation

```typescript
import { startAgentSpan } from './lib/sentry';

async function executeAgent(agentType: string, task: string) {
  return await startAgentSpan(agentType, 'execute', async (span) => {
    span?.setAttribute('task', task);
    span?.setAttribute('start_time', Date.now());

    try {
      const result = await agentService.execute(agentType, task);
      span?.setStatus({ code: 1, message: 'success' });
      return result;
    } catch (error) {
      span?.setStatus({ code: 2, message: 'error' });
      span?.setAttribute('error', error.message);
      throw error;
    }
  });
}
```

### Example 2: Tracking a Pipeline Step

```typescript
import { recordPipelineStep } from './lib/sentry';

async function runBuildStep(projectPath: string) {
  return await recordPipelineStep('build', 'ci-cd-pipeline', async (span) => {
    span?.setAttribute('project_path', projectPath);
    span?.setAttribute('start_time', Date.now());

    try {
      const result = await buildService.build(projectPath);
      span?.setAttribute('build_duration_ms', result.duration);
      span?.setStatus({ code: 1, message: 'success' });
      return result;
    } catch (error) {
      span?.setStatus({ code: 2, message: 'error' });
      span?.setAttribute('error', error.message);
      throw error;
    }
  });
}
```

### Example 3: Tracking a UI Operation

```typescript
import { startUiSpan } from '../lib/sentry';

async function loadDashboardData() {
  return await startUiSpan('DashboardLoad', 'ui.data_load', async () => {
    const startTime = Date.now();

    try {
      const data = await fetchDashboardData();
      return data;
    } catch (error) {
      console.error('Failed to load dashboard', error);
      throw error;
    }
  });
}
```

### Example 4: Tracking Custom Server Operation

```typescript
import { startCustomSpan } from './lib/sentry';

async function processExport(data: ExportData) {
  return await startCustomSpan(
    'ExportData',
    'server.export',
    { type: data.type, records: data.records.length },
    async (span) => {
      span?.setAttribute('start_time', Date.now());

      try {
        const result = await exportService.process(data);
        span?.setAttribute('export_size_bytes', result.size);
        span?.setAttribute('duration_ms', result.duration);
        span?.setStatus({ code: 1, message: 'success' });
        return result;
      } catch (error) {
        span?.setStatus({ code: 2, message: 'error' });
        span?.setAttribute('error', error.message);
        throw error;
      }
    }
  );
}
```

## Benefits

1. **Cost Optimization**: Reduce Sentry quota usage by sampling only the most important transactions at high rates
2. **Better Debugging**: 100% sampling on agent/LLM/pipeline transactions provides complete visibility into critical operations
3. **Reduced Noise**: 0% sampling on health checks eliminates high-volume, low-value traces
4. **Flexible Configuration**: Fine-grained control via environment variables for different environments
5. **Distributed Tracing**: Trace propagation targets enable end-to-end tracing across service boundaries
6. **Easy to Use**: Custom span helpers simplify instrumenting code with performance tracking

## Migration Guide

### From Old to New Configuration

If you were using the old `SENTRY_TRACES_SAMPLE_RATE`:

1. **Server**: Replace with one of:
   - `SENTRY_TRACES_SAMPLER_DEFAULT_RATE` for general transactions
   - `SENTRY_TRACES_SAMPLER_AGENT_RATE` for agent/LLM/pipeline transactions
   - `SENTRY_TRACES_SAMPLER_HEALTH_RATE` for health checks

2. **UI**: Replace with:
   - `VITE_SENTRY_TRACES_SAMPLER_DEFAULT_RATE` for general transactions

### Backward Compatibility

The implementation maintains backward compatibility:

- `SENTRY_TRACES_SAMPLE_RATE` (server) and `VITE_SENTRY_TRACES_SAMPLE_RATE` (UI) still work
- They are used as fallbacks if the new variables are not set
- Default trace propagation targets match the previous behavior

## Testing

To verify the implementation:

1. **Check initialization logs**:

   ```bash
   # Server
   [Sentry] Initialized with environment: development

   # UI (browser console)
   [Sentry] Initialized with environment: development
   ```

2. **Verify transaction sampling**:
   - Check Sentry dashboard for agent/LLM/pipeline transactions (should be 100%)
   - Check health check endpoints (should be 0%)
   - Check general API requests (should be ~10%)

3. **Test custom span helpers**:
   - Use the helpers in your code
   - Verify spans appear in Sentry performance dashboard
   - Check that attributes are properly attached

4. **Test trace propagation**:
   - Make requests from UI to server
   - Verify `traceparent` header is sent
   - Check Sentry for distributed traces

## Troubleshooting

### Issue: Spans not appearing in Sentry

**Check**:

1. Sentry is enabled (`SENTRY_ENABLED=true`)
2. DSN is configured correctly
3. Sample rates are not 0
4. Network requests can reach Sentry

### Issue: High quota usage

**Solution**:

1. Reduce `SENTRY_TRACES_SAMPLER_DEFAULT_RATE`
2. Verify `SENTRY_TRACES_SAMPLER_HEALTH_RATE=0`
3. Consider reducing `SENTRY_TRACES_SAMPLER_AGENT_RATE` if needed

### Issue: Trace propagation not working

**Check**:

1. `VITE_SENTRY_TRACE_PROPAGATION_TARGETS` includes the target URL/pattern
2. Backend CORS allows the `sentry-trace` header
3. Server Sentry is initialized and receiving traces

## References

- [Sentry Performance Monitoring](https://docs.sentry.io/platforms/javascript/performance/)
- [Sentry Distributed Tracing](https://docs.sentry.io/platforms/javascript/performance/distributed-tracing/)
- [Sentry Sampling](https://docs.sentry.io/platforms/javascript/performance/sampling/)
