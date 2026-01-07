# Sentry Tracing Best Practices & Patterns for DevFlow

**Research Date:** January 6, 2026
**DevFlow Version:** AI agent orchestration platform with Node.js/Express backend (port 3008), React frontend (Vite), Electron support

---

## Executive Summary

This research document outlines Sentry tracing best practices specifically tailored to DevFlow's architecture:

- **Multi-process architecture:** Node.js server (3008) + React UI (Vite) + optional Electron
- **AI/LLM workloads:** Agent execution via ClaudeProvider, research services, pipeline orchestration
- **Service-oriented:** 30+ microservices (agent, orchestrator, beads, research, pipeline, etc.)
- **Complex workflows:** Autonomous agents with MCP tool calls, distributed via Beads coordination

---

## 1. Trace Propagation Best Practices

### 1.1 Configuring `tracePropagationTargets` for Development

**Current State:** DevFlow's `apps/server/src/lib/sentry.ts` (line 88-129) uses Sentry v9 with basic setup but **no trace propagation configured**.

**Recommended Configuration:**

```typescript
// apps/server/src/lib/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: ENVIRONMENT,
  enableLogs: true,

  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'info', 'warn', 'error'],
    }),
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
    // NEW: Enable distributed tracing
    Sentry.captureConsoleIntegration({
      levels: ['error', 'warn'],
    }),
  ],

  // CRITICAL: Configure trace propagation for development
  tracePropagationTargets: [
    // Exact match for local development
    'localhost',
    '127.0.0.1',

    // Regex patterns for flexibility
    /^https:\/\/localhost:\d+$/,
    /^https:\/\/127\.0\.0\.1:\d+$/,

    // DevFlow's backend port
    /^https?:\/\/localhost:3008$/,

    // Allow all in development (use with caution)
    ...(ENVIRONMENT === 'development' ? [/^https?:\/\/localhost:\d+$/] : []),

    // Production targets (add your actual domain)
    ...(ENVIRONMENT === 'production'
      ? ['https://your-production-domain.com', 'https://api.your-domain.com']
      : []),
  ],

  // Sample rate for all traces (see Section 2 for dynamic sampling)
  tracesSampleRate: ENVIRONMENT === 'development' ? 1.0 : 0.1,

  beforeSendLog(log) {
    if (process.env.NODE_ENV === 'production' && log.level === 'info') {
      return null;
    }
    return log;
  },
});
```

**Key Recommendations:**

1. **Development:** Use `tracesSampleRate: 1.0` to capture all traces for debugging
2. **Production:** Use `tracesSampler` function (see Section 2) for intelligent sampling
3. **Trace Propagation:** Always include `localhost` and `127.0.0.1` for local development
4. **CORS Headers:** Ensure Express CORS middleware includes `sentry-trace` and `baggage` headers

### 1.2 CORS Configuration for Trace Headers

**Location:** `apps/server/src/index.ts` (Express app initialization)

```typescript
// apps/server/src/index.ts
import cors from 'cors';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin and localhost
      const allowedOrigins = [
        'http://localhost:3008',
        'http://127.0.0.1:3008',
        'http://localhost:5173', // Vite dev server default
        'http://127.0.0.1:5173',
        // Add your production origins
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },

    // CRITICAL: Expose tracing headers for distributed tracing
    exposedHeaders: ['sentry-trace', 'baggage'],

    // Allow credentials (cookies, auth headers)
    credentials: true,
  })
);
```

### 1.3 Electron App Considerations

**Challenge:** Electron has multiple processes (main, renderer) that need separate Sentry instances with linked traces.

**Implementation:**

```typescript
// apps/ui/src/main.ts (Electron main process)
import * as Sentry from '@sentry/electron';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: ENVIRONMENT,

  // Main process tracing
  tracesSampleRate: 1.0,

  // Enable IPC tracing for main <-> renderer communication
  integrations: [
    new Sentry.Integrations.Electron({
      // Automatically trace IPC calls
      ipcMode: 'both',
    }),
  ],
});
```

```typescript
// apps/ui/src/lib/sentry.ts (Electron renderer process)
import * as Sentry from '@sentry/react';

import { BrowserTracing } from '@sentry/tracing'; // Note: Deprecated in v7.47+, use built-in

Sentry.init({
  dsn: SENTRY_DSN,
  environment: ENVIRONMENT,

  // React tracing setup
  tracesSampleRate: 1.0,

  integrations: [
    new Sentry.BrowserTracing({
      // Trace React component renders
      tracingOrigins: [
        'localhost',
        '127.0.0.1',
        /^\//, // Same-origin
      ],

      // Custom request routing
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
        React,
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        routes
      ),
    }),
  ],

  // Link renderer traces to main process traces
  beforeSend(event, hint) {
    // Add Electron-specific context
    event.contexts = {
      ...event.contexts,
      electron: {
        process: 'renderer',
      },
    };
    return event;
  },
});
```

**Critical Pitfalls:**

1. **Missing CORS headers:** Without `exposedHeaders: ['sentry-trace', 'baggage']`, traces won't propagate across origins
2. **Separate DSNs:** Use the SAME DSN for main + renderer processes to link traces
3. **IPC mode:** Set `ipcMode: 'both'` to trace both directions of IPC communication
4. **Tracing origins:** For Electron renderer, include `localhost` even though it's not a browser

---

## 2. Dynamic Sampling Patterns

### 2.1 Best Practices for `tracesSampler` Function

**Why Dynamic Sampling?**

- **Cost control:** Sentry charges by trace volume
- **Performance:** High-volume, low-value operations (health checks) shouldn't consume quota
- **Intelligence:** Capture 100% of important traces (errors, slow requests, critical paths)

**Recommended Implementation:**

```typescript
// apps/server/src/lib/sentry.ts
interface SamplingContext {
  parentSampled?: boolean;
  transactionContext?: {
    name?: string;
    op?: string; // Operation type (e.g., 'http.server', 'agent.execute')
  };
  request?: {
    url?: string;
  };
}

const tracesSampler: (samplingContext: SamplingContext) => number = (samplingContext) => {
  // 1. Always inherit parent's sampling decision if available
  if (samplingContext.parentSampled !== undefined) {
    return samplingContext.parentSampled ? 1 : 0;
  }

  const transactionName = samplingContext.transactionContext?.name || '';
  const operation = samplingContext.transactionContext?.op || '';

  // 2. Sample 100% of agent/LLM operations (high value for debugging)
  if (
    operation.startsWith('agent.') ||
    operation.startsWith('ai.') ||
    operation.startsWith('llm.') ||
    transactionName.includes('agent') ||
    transactionName.includes('claude')
  ) {
    return 1.0;
  }

  // 3. Sample 100% of orchestrator and research operations (complex workflows)
  if (
    transactionName.includes('orchestrator') ||
    transactionName.includes('research') ||
    transactionName.includes('pipeline')
  ) {
    return 1.0;
  }

  // 4. Sample 10% of health checks and low-value endpoints
  if (
    transactionName.includes('GET /health') ||
    transactionName.includes('GET /ping') ||
    transactionName.includes('GET /status')
  ) {
    return 0.1;
  }

  // 5. Sample 50% of WebSocket connections (high volume but useful)
  if (transactionName.includes('WebSocket')) {
    return 0.5;
  }

  // 6. Default sampling rate
  return ENVIRONMENT === 'development' ? 1.0 : 0.2;
};

Sentry.init({
  // ... other config
  tracesSampler, // Use function instead of tracesSampleRate
});
```

### 2.2 Identifying "Important" Transactions

**Categories for 100% Sampling:**

| Category                | Pattern                                                | Rationale                                |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------- |
| **Agent Execution**     | `agent.execute`, `agent.sendMessage`, `agent.tool_use` | Core AI operations, debugging tool calls |
| **LLM API Calls**       | `ai.chat_completions`, `llm.request`, `claude.api`     | Direct API costs, latency tracking       |
| **Orchestrator Phases** | `orchestrator.research`, `orchestrator.implementing`   | Complex multi-step workflows             |
| **Pipeline Steps**      | `pipeline.step.execute`, `pipeline.run`                | Workflow automation, debugging           |
| **MCP Tool Calls**      | `mcp.tool.execute`, `beads.create_issue`               | External service integration             |
| **Error Cases**         | Transactions with `status: 'internal_error'`           | Always capture for root cause analysis   |

**Categories for Low Sampling (10-20%):**

| Category                 | Pattern                          | Rationale                 |
| ------------------------ | -------------------------------- | ------------------------- |
| **Health Checks**        | `GET /health`, `GET /ping`       | Low diagnostic value      |
| **Static Assets**        | `GET /assets/*`, `GET /static/*` | CDN should handle these   |
| **WebSocket Heartbeats** | `ws.heartbeat`                   | High volume, low value    |
| **Polling Operations**   | `GET /poll`, `GET /status`       | Repetitive, low variation |

**Categories for Medium Sampling (50%):**

| Category               | Pattern                  | Rationale                                   |
| ---------------------- | ------------------------ | ------------------------------------------- |
| **WebSocket Messages** | `ws.message`, `ws.event` | Useful but high volume                      |
| **File Operations**    | `fs.read`, `fs.write`    | Useful for performance tuning               |
| **API Route Handlers** | `GET /api/*`             | General observability without 100% overhead |

### 2.3 Performance/Cost Trade-offs

**Sampling Rate vs. Monthly Cost Estimate:**

| Sampling Rate | Traces/Day (est.) | Monthly Cost (Sentry Team) |
| ------------- | ----------------- | -------------------------- |
| 100%          | 1,000,000         | ~$500-1000                 |
| 50%           | 500,000           | ~$250-500                  |
| 20%           | 200,000           | ~$100-250                  |
| 10%           | 100,000           | ~$50-100                   |
| 5%            | 50,000            | ~$25-50                    |

**DevFlow Recommendations:**

- **Development:** 100% sampling (use `tracesSampleRate: 1.0`)
- **Staging:** 50% sampling with intelligent 100% for agent operations
- **Production:** Start with 20%, adjust based on:
  - Monitor "Traces Sampled" metric in Sentry
  - Check monthly quota usage
  - Increase sampling for critical paths during incidents

---

## 3. Agent/LLM Application Tracing

### 3.1 Common Patterns for Tracing LLM API Calls

**Architecture Context:** DevFlow uses a provider architecture (`ProviderFactory` -> `ClaudeProvider` -> `executeQuery`)

**Recommended Span Structure:**

```
POST /api/agent/send (HTTP transaction)
├── agent.prepare_context          (System prompt, context files)
├── agent.build_prompt              (User message + images)
├── llm.request                     (Claude API call)
│   ├── llm.prompting               (Build request payload)
│   ├── llm.api_call                (HTTP request to Anthropic)
│   └── llm.streaming               (Process streaming response)
│       ├── tool_use                (Each tool invocation)
│       └── text_generation         (Content blocks)
└── agent.process_response          (Parse result, update session)
```

**Implementation in `apps/server/src/providers/claude-provider.ts`:**

```typescript
// apps/server/src/providers/claude-provider.ts
import * as Sentry from '@sentry/node';

async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
  // Start root span for entire query execution
  return await Sentry.startSpan(
    {
      op: 'agent.executeQuery',
      name: `Claude Provider: ${options.model}`,
      attributes: {
        'model.name': options.model,
        'agent.provider': 'claude',
        'agent.max_turns': options.maxTurns,
        'agent.session_id': options.sdkSessionId || 'new',
      },
    },
    async (rootSpan) => {
      // Span: Build SDK options
      const sdkOptions = await Sentry.startSpan(
        {
          op: 'agent.prepare_options',
          name: 'Prepare SDK Options',
          parentSpan: rootSpan,
        },
        async () => {
          return {
            model: options.model,
            systemPrompt: options.systemPrompt,
            maxTurns: options.maxTurns,
            allowedTools: options.allowedTools,
            // ... other options
          };
        }
      );

      // Span: Execute LLM request
      const stream = await Sentry.startSpan(
        {
          op: 'llm.request',
          name: `LLM Request: ${options.model}`,
          attributes: {
            'llm.provider': 'anthropic',
            'llm.model': options.model,
            'llm.request_type': 'chat',
            'llm.streaming': 'true',
            'llm.tools_enabled': String(
              options.allowedTools ? options.allowedTools.length > 0 : true
            ),
            'llm.max_turns': options.maxTurns,
          },
        },
        async (llmSpan) => {
          try {
            // Call Claude SDK
            return await query(sdkOptions);
          } catch (error) {
            // Attach error details to span
            llmSpan.setStatus({
              code: SpanStatus.INTERNAL_ERROR,
              message: (error as Error).message,
            });
            throw error;
          }
        }
      );

      // Span: Process streaming response
      await Sentry.startSpan(
        {
          op: 'llm.streaming',
          name: 'Process Streaming Response',
          parentSpan: rootSpan,
        },
        async (streamSpan) => {
          const toolUses: Array<{ name: string; input: unknown }> = [];

          for await (const msg of stream) {
            // Capture SDK session ID
            if (msg.session_id) {
              rootSpan.setAttribute('agent.session_id', msg.session_id);
            }

            if (msg.type === 'assistant') {
              if (msg.message?.content) {
                for (const block of msg.message.content) {
                  if (block.type === 'text') {
                    // Span: Text generation
                    await Sentry.startSpan(
                      {
                        op: 'llm.text_generation',
                        name: 'Generate Text Content',
                        parentSpan: streamSpan,
                        attributes: {
                          'llm.content_type': 'text',
                          'llm.block_length': block.text?.length || 0,
                        },
                      },
                      () => {
                        // Process text
                        return block;
                      }
                    );
                  } else if (block.type === 'tool_use') {
                    // Span: Tool execution
                    const toolName = block.name || 'unknown';
                    toolUses.push({
                      name: toolName,
                      input: block.input,
                    });

                    await Sentry.startSpan(
                      {
                        op: 'tool.execute',
                        name: `Tool: ${toolName}`,
                        attributes: {
                          'tool.name': toolName,
                          'tool.input_size': JSON.stringify(block.input).length,
                        },
                      },
                      () => {
                        // Record tool use metric
                        incrementCounter('agent.tool.use', 1, {
                          toolName,
                          model: options.model,
                        });
                        return block;
                      }
                    );
                  }
                }
              }
            } else if (msg.type === 'result') {
              // Record completion metrics
              const duration = Date.now() - rootSpan.startTime;
              recordDistribution('agent.execution.duration_ms', duration, {
                model: options.model,
                provider: 'claude',
                tool_count: String(toolUses.length),
              });

              incrementCounter('agent.execution.completed', 1, {
                model: options.model,
                provider: 'claude',
                has_tools: String(toolUses.length > 0),
              });
            }
          }

          // Finalize stream span
          streamSpan.setAttribute('agent.tool_count', toolUses.length);
        }
      );
    }
  );
}
```

### 3.2 Span Naming Conventions for AI Operations

**Follow Sentry's LLM Monitoring conventions:**

| Span Operation (`op`)       | Description                             | Example                                       |
| --------------------------- | --------------------------------------- | --------------------------------------------- |
| **`ai.pipeline.run`**       | Top-level agent execution               | `ai.pipeline.run.devflow.orchestrator`        |
| **`ai.run.*`**              | Unit of work (tool call, LLM execution) | `ai.run.tool.beads_create_issue`              |
| **`ai.chat_completions.*`** | LLM chat operation                      | `ai.chat_completions.anthropic`               |
| **`agent.executeQuery`**    | Provider-level execution                | `Claude Provider: claude-3-5-sonnet-20241022` |
| **`llm.request`**           | LLM API request                         | `LLM Request: claude-3-5-sonnet-20241022`     |
| **`llm.prompting`**         | Build prompt/context                    | `Build Prompt with Context`                   |
| **`llm.api_call`**          | HTTP request to LLM provider            | `POST https://api.anthropic.com/v1/messages`  |
| **`llm.streaming`**         | Process streaming response              | `Process Streaming Response`                  |
| **`llm.text_generation`**   | Text content generation                 | `Generate Text Content`                       |
| **`tool.execute`**          | MCP/Tool function execution             | `Tool: beads.create_issue`                    |
| **`mcp.tool.call`**         | MCP bridge tool invocation              | `MCP: exa.web_search`                         |

**Span Name Format:**

```
<Operation>: <Description>

Examples:
- agent.executeQuery: Claude Provider: claude-3-5-sonnet-20241022
- llm.request: LLM Request: claude-3-5-sonnet-20241022
- tool.execute: Tool: Read
- ai.pipeline.run: Orchestrator Research Phase
```

### 3.3 Attributes to Include for LLM Operations

**Required Attributes (Sentry LLM Monitoring spec):**

| Attribute               | Type    | Description                  | Example                           |
| ----------------------- | ------- | ---------------------------- | --------------------------------- |
| **`llm.provider`**      | string  | LLM provider name            | `anthropic`, `openai`             |
| **`llm.model`**         | string  | Model identifier             | `claude-3-5-sonnet-20241022`      |
| **`llm.request_type`**  | string  | Type of request              | `chat`, `completion`, `embedding` |
| **`llm.streaming`**     | boolean | Whether response is streamed | `true`                            |
| **`llm.tools_enabled`** | string  | Whether tools are available  | `"true"`, `"false"`               |
| **`agent.provider`**    | string  | DevFlow provider name        | `claude`, `cursor`                |
| **`agent.session_id`**  | string  | SDK session for continuity   | `"sess_abc123"`                   |

**Recommended Attributes for DevFlow:**

| Attribute              | Type   | Description                | Example                      |
| ---------------------- | ------ | -------------------------- | ---------------------------- |
| **`agent.max_turns`**  | number | Max conversation turns     | `20`                         |
| **`agent.tool_count`** | number | Tools used in execution    | `5`                          |
| **`agent.workspace`**  | string | Working directory path     | `/home/user/project`         |
| **`tool.name`**        | string | Tool function name         | `Read`, `Write`, `Bash`      |
| **`tool.input_size`**  | number | Size of tool input (bytes) | `1024`                       |
| **`mcp.server`**       | string | MCP server name            | `exa`, `beads`, `greptile`   |
| **`mcp.tool`**         | string | MCP tool name              | `web_search`, `create_issue` |
| **`llm.content_type`** | string | Response block type        | `text`, `tool_use`           |
| **`llm.block_length`** | number | Character count            | `4500`                       |

**Implementation Example:**

```typescript
span.setAttribute('llm.provider', 'anthropic');
span.setAttribute('llm.model', 'claude-3-5-sonnet-20241022');
span.setAttribute('llm.request_type', 'chat');
span.setAttribute('llm.streaming', 'true');
span.setAttribute('llm.tools_enabled', 'true');

// Custom DevFlow attributes
span.setAttribute('agent.provider', 'claude');
span.setAttribute('agent.session_id', session.sdkSessionId || 'new');
span.setAttribute('agent.workspace', workingDirectory);
span.setAttribute('agent.max_turns', maxTurns);
```

---

## 4. Distributed Tracing in Microservices

### 4.1 Service Architecture Overview

**DevFlow Service Landscape (30+ services):**

```
Express Server (port 3008)
├── Agent Service (agent-service.ts)
│   └── Provider Factory → ClaudeProvider → executeQuery
├── Orchestrator Service (orchestrator-service.ts)
│   ├── Research Service (research-service.ts)
│   │   ├── Exa Research Client (exa-research-client.ts)
│   │   ├── Greptile Client (greptile-client.ts)
│   │   └── MCP Bridge (mcp-bridge.ts)
│   ├── PR Review Service (pr-review-service.ts)
│   └── Beads Orchestrator (beads-orchestrator.ts)
├── Beads Services
│   ├── Beads Service (beads-service.ts)
│   ├── Beads Live Link (beads-live-link-service.ts)
│   ├── Beads Memory (beads-memory-service.ts)
│   └── Beads Agent Coordinator (beads-agent-coordinator.ts)
├── Pipeline Service (pipeline-service.ts)
│   └── Pipeline Beads Integration (pipeline-beads-integration.ts)
├── Auto Mode Service (auto-mode-service.ts)
│   └── Auto Mode Agent Integration (automode-agent-integration.ts)
└── [25+ other services...]
```

### 4.2 Parent/Child Span Relationships

**Recommended Trace Hierarchy for Orchestrator Workflow:**

```
orchestrator.poll                          (Root span, every 30s)
├── orchestrator.phase.research            (Phase 1)
│   ├── research.service.conduct           (ResearchService)
│   │   ├── exa.client.web_search          (ExaResearchClient)
│   │   │   └── mcp.tool.call              (Exa MCP)
│   │   ├── greptile.client.search         (GreptileClient)
│   │   │   └── mcp.tool.call              (Greptile MCP)
│   │   └── lsp.analysis                   (TypeScript LSP)
│   └── orchestrator.create_subtasks       (VibeKanban)
├── orchestrator.phase.implementing        (Phase 2)
│   ├── agent.execute_query               (AgentService)
│   │   ├── provider.execute               (ClaudeProvider)
│   │   │   ├── llm.request                (Anthropic API)
│   │   │   └── llm.streaming              (Process response)
│   │   │       ├── tool.execute           (Read tool)
│   │   │       ├── tool.execute           (Write tool)
│   │   │       └── tool.execute           (Bash tool)
│   │   └── agent.save_session             (Persist state)
│   └── beads.memory.query                (BeadsMemoryService)
│       └── beads.service.list             (BeadsService)
├── orchestrator.phase.reviewing           (Phase 3)
│   ├── orchestrator.validate_task         (Validation)
│   └── pr_review.check_ci                 (PRReviewService)
├── orchestrator.phase.creating_pr         (Phase 4)
│   └── github.cli.pr_create               (GitHub CLI)
└── orchestrator.phase.monitoring_pr       (Phase 5)
    ├── pr_review.check_conflicts          (PRReviewService)
    └── pr_review.analyze_comments         (PRReviewService)
```

### 4.3 Service Boundary Span Pattern

**Implementation Pattern for Service Calls:**

```typescript
// apps/server/src/services/orchestrator-service.ts

import * as Sentry from '@sentry/node';

class OrchestratorService {
  /**
   * Phase 1: Process tasks in todo status
   */
  private async processTodoTasks(): Promise<void> {
    // Create span for this phase
    return await Sentry.startSpan(
      {
        op: 'orchestrator.phase.research',
        name: 'Orchestrator Phase: Research',
        attributes: {
          'orchestrator.phase': 'researching',
          'orchestrator.project': this.config.projectName,
        },
      },
      async (phaseSpan) => {
        try {
          const tasks = await this.vibeKanban.listTasks({ status: 'todo' });

          for (const task of tasks) {
            if (this.trackedTasks.has(task.id)) {
              continue;
            }

            // Span: Research individual task
            const research = await Sentry.startSpan(
              {
                op: 'research.service.conduct',
                name: `Research Task: ${task.id}`,
                parentSpan: phaseSpan,
                attributes: {
                  'task.id': task.id,
                  'task.title': task.title,
                  'research.categories': ['greptile', 'exa', 'lsp'],
                },
              },
              async (researchSpan) => {
                // Call ResearchService (automatically creates child spans)
                const result = await this.researchService.conductResearch(
                  task.id,
                  task.description,
                  {
                    repositoryPath: process.cwd(),
                    repository: this.config.githubRepository,
                    branch: this.config.defaultBaseBranch,
                  }
                );

                // Attach research results to span
                researchSpan.setAttribute(
                  'research.greptile_results',
                  result.greptileResults.length
                );
                researchSpan.setAttribute('research.exa_results', result.exaResults.length);
                researchSpan.setAttribute('research.subtasks_created', result.subtasks.length);

                return result;
              }
            );

            // Create subtasks in Vibe-Kanban
            for (const subtask of research.subtasks) {
              await Sentry.startSpan(
                {
                  op: 'vibekanban.create_subtask',
                  name: `Create Subtask: ${subtask.title}`,
                  parentSpan: phaseSpan,
                  attributes: {
                    'subtask.id': subtask.id,
                    'subtask.complexity': subtask.complexity,
                    'subtask.dependencies_count': subtask.dependencies.length,
                  },
                },
                async () => {
                  return await this.vibeKanban.createSubtask(
                    task.id,
                    subtask.title,
                    subtask.description
                  );
                }
              );
            }

            // Track task
            this.trackTask(task.id, 'todo', 'researching');
            phaseSpan.setAttribute(
              'tasks_processed',
              ((phaseSpan.getAttribute('tasks_processed') as number) || 0) + 1
            );
          }
        } catch (error) {
          phaseSpan.setStatus({
            code: SpanStatus.INTERNAL_ERROR,
            message: (error as Error).message,
          });
          throw error;
        }
      }
    );
  }
}
```

### 4.4 Automatic Service-to-Service Tracing

**Pattern: Wrap service methods with tracing decorator**

```typescript
// apps/server/src/lib/tracing-decorator.ts

import * as Sentry from '@sentry/node';

/**
 * Tracing decorator for service methods
 * Automatically creates spans with consistent naming and attributes
 */
export function traceService(serviceName: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);

        // Wrap all methods with tracing
        const proto = constructor.prototype;
        const methodNames = Object.getOwnPropertyNames(proto).filter(
          (name) => typeof proto[name] === 'function' && name !== 'constructor'
        );

        for (const methodName of methodNames) {
          const originalMethod = proto[methodName];
          proto[methodName] = async function (...methodArgs: any[]) {
            const operationName = `${serviceName}.${methodName}`;
            const className = constructor.name;

            return await Sentry.startSpan(
              {
                op: operationName,
                name: `${className}.${methodName}`,
                attributes: {
                  'service.name': serviceName,
                  'service.method': methodName,
                  'service.class': className,
                },
              },
              async (span) => {
                try {
                  const result = await originalMethod.apply(this, methodArgs);

                  // Attach result metadata if applicable
                  if (result && typeof result === 'object') {
                    if ('length' in result) {
                      span.setAttribute('result.count', (result as unknown[]).length);
                    }
                  }

                  return result;
                } catch (error) {
                  span.setStatus({
                    code: SpanStatus.INTERNAL_ERROR,
                    message: (error as Error).message,
                  });
                  throw error;
                }
              }
            );
          };
        }
      }
    };
  };
}

// Usage:
@traceService('BeadsService')
export class BeadsService {
  async createIssue(input: CreateBeadsIssueInput): Promise<BeadsIssue> {
    // Automatically wrapped with span: "BeadsService.createIssue"
    // Span op: "beads.create_issue"
  }
}
```

### 4.5 Cross-Process Trace Propagation

**Scenario:** Agent in Node.js server spawns helper agent (new process via CLI)

**Challenge:** How to propagate trace context to child process?

**Solution: Environment variable inheritance**

```typescript
// apps/server/src/services/beads-agent-coordinator.ts

import * as Sentry from '@sentry/node';
import { spawn } from 'child_process';

class BeadsAgentCoordinator {
  async spawnHelperAgent(
    parentSessionId: string,
    helperType: string,
    taskDescription: string
  ): Promise<string> {
    return await Sentry.startSpan(
      {
        op: 'agent.spawn_helper',
        name: `Spawn Helper Agent: ${helperType}`,
        attributes: {
          'agent.type': 'helper',
          'agent.helper_type': helperType,
          'agent.parent_session': parentSessionId,
        },
      },
      async (span) => {
        // Get current trace context from Sentry scope
        const scope = Sentry.getCurrentScope();
        const traceId = scope.getTraceId();
        const parentSpanId = scope.getSpan()?.spanId;

        // Spawn child process with trace context in env vars
        const childProcess = spawn('node', ['agent-worker.js'], {
          env: {
            ...process.env,
            // Propagate Sentry trace context
            SENTRY_TRACE_ID: traceId,
            SENTRY_PARENT_SPAN_ID: parentSpanId,
            SENTRY_TRANSACTION: `Helper Agent: ${helperType}`,
            // Additional context
            AGENT_HELPER_TYPE: helperType,
            AGENT_TASK_DESCRIPTION: taskDescription,
          },
          stdio: 'inherit',
        });

        // Wait for child to initialize and return its session ID
        return new Promise((resolve, reject) => {
          childProcess.on('message', (msg) => {
            if (msg.type === 'initialized') {
              span.setAttribute('agent.session_id', msg.sessionId);
              resolve(msg.sessionId);
            }
          });

          childProcess.on('error', (error) => {
            span.setStatus({
              code: SpanStatus.INTERNAL_ERROR,
              message: error.message,
            });
            reject(error);
          });
        });
      }
    );
  }
}
```

**Child Process (agent-worker.js):**

```typescript
// agent-worker.js
import * as Sentry from '@sentry/node';

// Initialize Sentry with propagated trace context
const traceId = process.env.SENTRY_TRACE_ID;
const parentSpanId = process.env.SENTRY_PARENT_SPAN_ID;
const transactionName = process.env.SENTRY_TRANSACTION || 'Helper Agent';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,

  // Create continuation span from parent trace
  initialScope: {
    trace_id: traceId,
    parent_span_id: parentSpanId,
  },
});

// Continue trace
Sentry.startSpan(
  {
    op: 'agent.helper.execute',
    name: transactionName,
  },
  async (span) => {
    // Execute helper agent logic
    // This span will be a child of the parent's span
  }
);
```

---

## 5. Common Pitfalls to Avoid

### 5.1 Missing Trace Headers

**Problem:** Traces don't propagate between services, creating disjoint traces

**Solution:**

```typescript
// Ensure CORS middleware exposes trace headers
app.use(
  cors({
    exposedHeaders: ['sentry-trace', 'baggage'],
  })
);

// Verify headers are present in HTTP client
fetch('http://localhost:3008/api/agent/send', {
  headers: {
    // Sentry SDK automatically adds these if tracing is enabled
    'sentry-trace': Sentry.getCurrentScope().getTraceId(),
  },
});
```

### 5.2 Over-Sampling High-Volume Operations

**Problem:** Health checks and WebSocket heartbeats consume trace quota

**Solution:** Use `tracesSampler` to down-sample (see Section 2.1)

```typescript
const tracesSampler = (context) => {
  if (context.transactionContext?.name?.includes('health')) {
    return 0.1; // Only 10% of health checks
  }
  return 1.0;
};
```

### 5.3 Missing Span Status on Errors

**Problem:** Errors don't mark spans as failed, making debugging difficult

**Solution:**

```typescript
try {
  await someOperation();
} catch (error) {
  span.setStatus({
    code: SpanStatus.INTERNAL_ERROR,
    message: (error as Error).message,
  });
  throw error;
}
```

### 5.4 Not Linking Main and Renderer Processes (Electron)

**Problem:** Electron traces are separate, can't see main-to-renderer flow

**Solution:** Use the SAME DSN and enable IPC mode

```typescript
// Main process
Sentry.init({
  dsn: 'https://...@sentry.io/123',
  integrations: [
    new Electron({
      ipcMode: 'both', // Trace both directions
    }),
  ],
});

// Renderer process - SAME DSN
Sentry.init({
  dsn: 'https://...@sentry.io/123', // Same as main
});
```

### 5.5 Forgetting to Flush on Shutdown

**Problem:** Traces lost when server restarts

**Solution:**

```typescript
// apps/server/src/index.ts
import { flushMetrics } from './lib/sentry.js';

async function shutdown() {
  console.log('Shutting down gracefully...');

  // Flush pending traces and metrics
  await flushMetrics(5000); // Wait up to 5 seconds

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### 5.6 Not Using Dynamic Sampling Context

**Problem:** Can't make intelligent sampling decisions

**Solution:** Always include `tracesSampler` with context

```typescript
const tracesSampler = (context) => {
  // Use parent's decision if available
  if (context.parentSampled !== undefined) {
    return context.parentSampled ? 1 : 0;
  }

  // Use operation name to make decisions
  const op = context.transactionContext?.op || '';
  if (op.startsWith('agent.')) {
    return 1.0; // Always sample agent operations
  }

  return 0.2; // Default
};
```

### 5.7 Inconsistent Span Naming

**Problem:** Can't filter/group traces effectively in Sentry UI

**Solution:** Follow naming conventions

```
✅ Good:
- agent.executeQuery: Claude Provider: claude-3-5-sonnet-20241022
- llm.request: LLM Request: claude-3-5-sonnet-20241022
- tool.execute: Tool: Read

❌ Bad:
- Execute Query
- LLM Call
- Tool used
```

---

## 6. Implementation Checklist

### Phase 1: Basic Setup (Week 1)

- [ ] Configure `tracePropagationTargets` in `apps/server/src/lib/sentry.ts`
- [ ] Add CORS headers for trace propagation in `apps/server/src/index.ts`
- [ ] Set `tracesSampleRate: 1.0` for development
- [ ] Test trace propagation: Call API from UI and verify linked traces in Sentry

### Phase 2: Agent/LLM Tracing (Week 2)

- [ ] Add spans to `ClaudeProvider.executeQuery()` in `apps/server/src/providers/claude-provider.ts`
- [ ] Instrument `llm.request`, `llm.streaming`, `tool.execute` spans
- [ ] Add LLM attributes: `llm.provider`, `llm.model`, `agent.session_id`
- [ ] Implement custom metrics for tool usage and token counts
- [ ] Test: Run agent execution and verify spans in Sentry

### Phase 3: Service-to-Service Tracing (Week 3)

- [ ] Instrument `OrchestratorService` phases with spans
- [ ] Add spans to `ResearchService` for Exa, Greptile, LSP calls
- [ ] Trace `BeadsService` operations
- [ ] Implement `@traceService` decorator for automatic method wrapping
- [ ] Test: Run orchestrator workflow and verify distributed trace

### Phase 4: Dynamic Sampling (Week 4)

- [ ] Implement `tracesSampler` function
- [ ] Configure 100% sampling for agent operations
- [ ] Configure 10% sampling for health checks
- [ ] Set production sampling rate to 20% baseline
- [ ] Monitor trace volume in Sentry and adjust

### Phase 5: Electron Integration (Optional, Week 5)

- [ ] Initialize Sentry in Electron main process with IPC tracing
- [ ] Initialize Sentry in Electron renderer process
- [ ] Verify trace linkage across main <-> renderer boundary
- [ ] Test IPC communication spans

---

## 7. Recommended Next Steps

1. **Immediate (This Week):**
   - Update `apps/server/src/lib/sentry.ts` with `tracePropagationTargets`
   - Add CORS headers for trace propagation
   - Test basic trace propagation from UI to server

2. **Short-term (Next 2 Weeks):**
   - Instrument `ClaudeProvider` with LLM spans
   - Add attributes for model, tokens, tool usage
   - Implement `tracesSampler` for intelligent sampling

3. **Medium-term (Next Month):**
   - Instrument `OrchestratorService` and `ResearchService`
   - Implement distributed tracing across service boundaries
   - Add custom metrics for agent performance

4. **Long-term (Next Quarter):**
   - Implement `@traceService` decorator for all services
   - Add Electron tracing support
   - Create dashboards in Sentry for agent performance monitoring

---

## 8. References

### Official Documentation

- [Sentry Node.js Distributed Tracing](https://docs.sentry.io/platforms/javascript/guides/node/tracing/distributed-tracing/)
- [Sentry React Distributed Tracing](https://docs.sentry.io/platforms/javascript/guides/react/tracing/distributed-tracing/)
- [Sentry Electron Distributed Tracing](https://docs.sentry.io/platforms/javascript/guides/electron/tracing/distributed-tracing/)
- [Sentry LLM Monitoring](https://develop.sentry.dev/sdk/telemetry/traces/modules/llm-monitoring/)
- [Dynamic Sampling](https://docs.sentry.io/organization/dynamic-sampling/)

### DevFlow Codebase

- `apps/server/src/lib/sentry.ts` - Sentry configuration
- `apps/server/src/providers/claude-provider.ts` - Claude agent execution
- `apps/server/src/services/agent-service.ts` - Agent conversation management
- `apps/server/src/services/orchestrator-service.ts` - Workflow orchestration
- `apps/server/src/services/research-service.ts` - Research coordination

### External Resources

- [Sentry Tracing for Node.js (Gajus)](https://gajus.com/blog/how-to-add-sentry-tracing-to-your-node-js-app)
- [OpenTelemetry Distributed Tracing (Better Stack)](https://betterstack.com/community/guides/observability/opentelemetry-nodejs-tracing/)
- [Dynamic Sampling Context (Sentry Internal)](https://develop.sentry.dev/sdk/telemetry/traces/dynamic-sampling-context/)

---

**Document Version:** 1.0
**Last Updated:** January 6, 2026
**Maintained By:** DevFlow Team
