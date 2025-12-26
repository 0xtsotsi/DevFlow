# Phase 1: Auth Code Map - CLI Subscription Feature Investigation

**Date:** 2025-12-26
**Status:** COMPLETE
**Agent:** Archaeologist (a130df4)

---

## Executive Summary

The CLI subscription feature is **100% implemented but completely isolated**. All code exists but nothing actually uses it. The execution path (AgentService, AutoModeService) only uses Claude Agent SDK, bypassing the entire auth management system.

---

## ACTIVE Code Paths (used in execution)

### Authentication & Provider Architecture

| File | Line | Function | Purpose |
|------|------|----------|---------|
| `apps/server/src/lib/auth.ts` | 21 | `initializeAuth()` | Called on server startup, validates API key auth |
| `apps/server/src/lib/auth.ts` | 39 | `authMiddleware()` | Applied to all /api routes except health |
| `apps/server/src/providers/provider-factory.ts` | 20 | `getProviderForModel()` | Gets ClaudeProvider for all Claude models |
| `apps/server/src/providers/claude-provider.ts` | 26 | `executeQuery()` | ONLY uses Claude Agent SDK, hard-coded |
| `apps/server/src/services/agent-service.ts` | 215 | `ProviderFactory.getProviderForModel()` | Routes to provider |
| `apps/server/src/services/auto-mode-service.ts` | 1094 | `ProviderFactory.getProviderForModel()` | Routes to provider |
| `apps/server/src/index.ts` | 90 | `initializeAuth()` | Server initialization |
| `apps/server/src/index.ts` | 184 | `authMiddleware()` | Applied to all API routes |

### API Key Management

| File | Line | Function | Purpose |
|------|------|----------|---------|
| `apps/server/src/routes/setup/routes/store-api-key.ts` | - | - | Stores API keys in secure storage |
| `apps/server/src/routes/setup/routes/delete-api-key.ts` | - | - | Deletes stored API keys |
| `apps/server/src/routes/setup/get-claude-status.ts` | - | - | Reports auth status |
| `apps/server/src/routes/setup/routes/verify-claude-auth.ts` | - | - | Tests auth with actual queries |

---

## ORPHANED Code (CLI subscription feature)

### Complete Auth System But Never Used

| File | Line | Function | Status |
|------|------|----------|--------|
| `apps/server/src/lib/claude-auth-manager.ts` | 105 | `getAuthStatus()` | Comprehensive dual auth management - NEVER CALLED |
| `apps/server/src/lib/claude-auth-manager.ts` | 34 | `setAuthConfig()` | Configuration setter - NEVER CALLED |
| `apps/server/src/lib/unified-claude-client.ts` | 44 | `executeUnifiedQuery()` | Routes between CLI and SDK - NO IMPORTERS |
| `apps/server/src/lib/claude-cli.ts` | 105 | `checkCLIAuth()` | CLI authentication detection - UNUSED |
| `apps/server/src/lib/claude-cli.ts` | 222 | `spawnCLIProcess()` | CLI process spawning - UNUSED |
| `apps/server/src/lib/claude-cli-client.ts` | 93 | `streamCliQuery()` | CLI streaming interface - NO CALLERS |

### Frontend UI Components

| File | Purpose |
|------|---------|
| `apps/ui/src/components/views/settings-view/cli-status/claude-cli-status.tsx` | Shows CLI status |
| `apps/ui/src/components/views/settings-view.tsx` | Has CLI settings section |

---

## CRITICAL Gaps (where integration is missing)

### 1. Provider Factory Doesn't Support CLI Mode

**File:** `apps/server/src/providers/provider-factory.ts:24-26`
```typescript
if (lowerModel.startsWith('claude-') || ['haiku', 'sonnet', 'opus'].includes(lowerModel)) {
  return new ClaudeProvider();
}
```
**Problem:** Always returns ClaudeProvider, no auth routing consideration
**Missing:** Should check auth config and return CLI-compatible provider when `method='cli'`

### 2. ClaudeProvider Only Uses SDK

**File:** `apps/server/src/providers/claude-provider.ts:84-95`
```typescript
const stream = query({ prompt: promptPayload, options: sdkOptions });
for await (const msg of stream) {
  yield msg as ProviderMessage;
}
```
**Problem:** Only uses SDK query(), ignores auth method
**Missing:** Should check auth config and route to unified client when needed

### 3. Agent Service Bypasses Auth System

**File:** `apps/server/src/services/agent-service.ts:214-216`
```typescript
const provider = ProviderFactory.getProviderForModel(effectiveModel);
const stream = provider.executeQuery(options);
```
**Problem:** Gets provider but doesn't consider auth method
**Missing:** Should pass auth method to provider or use unified client

### 4. Auto Mode Service Bypasses Auth System

**File:** `apps/server/src/services/auto-mode-service.ts:1094-1105`
**Problem:** Gets provider but ignores CLI auth
**Missing:** Should use unified client or pass auth context

### 5. Unified Client Isolated

**File:** `apps/server/src/lib/unified-claude-client.ts`
**Problem:** Complete implementation but NO importers
**Missing:** AgentService and AutoModeService should use this instead of raw providers

### 6. Auth Manager Never Queried

**File:** `apps/server/src/lib/claude-auth-manager.ts`
**Problem:** Full implementation but only imported by unified client
**Missing:** All services should query `getAuthStatus()` to determine auth method

### 7. Environment Variables Hard-Coded

**File:** `apps/server/src/providers/claude-provider.ts:102`
```typescript
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
```
**Problem:** Only checks `ANTHROPIC_API_KEY`, ignores CLI auth possibility
**Missing:** Should check auth config for CLI vs API key preference

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ACTUAL EXECUTION PATH                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   AgentService.sendMessage()                                                │
│   AutoModeService.executeFeature()                                          │
│          │                                                                   │
│          ▼                                                                   │
│   ProviderFactory.getProviderForModel()                                     │
│          │                                                                   │
│          ▼                                                                   │
│   ClaudeProvider.executeQuery() ──► @anthropic-ai/claude-agent-sdk          │
│                                          │                                  │
│                                          ▼                                  │
│                                  ANTHROPIC_API_KEY only                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    ORPHANED CLI SUBSCRIPTION SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   claude-cli.ts               →  CLI detection, spawning                    │
│          │                                                                   │
│          ▼                                                                   │
│   claude-cli-client.ts       →  Streaming CLI interface                      │
│          │                                                                   │
│          ▼                                                                   │
│   claude-auth-manager.ts     →  Auth mode selection, caching                 │
│          │                                                                   │
│          ▼                                                                   │
│   unified-claude-client.ts   →  Transparent SDK/CLI switching                │
│          │                                                                   │
│          ▼                                                                   │
│      (NO CONNECTION TO ABOVE)                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Function Name Collision Alert

| File | Function | Purpose |
|------|----------|---------|
| `lib/claude-auth-manager.ts` | `getAuthStatus()` | CLI subscription auth status |
| `lib/auth.ts` | `getAuthStatus()` | API endpoint authentication status |

**These are DIFFERENT functions with the SAME NAME.** Any integration must namespace properly.

---

## Key Findings

1. **The CLI subscription feature is a complete parallel implementation** that runs alongside the main application but never gets called.

2. **ProviderFactory is the critical missing link** - it needs to be auth-aware and route to CLI-compatible providers when needed.

3. **UnifiedClaudeClient exists but is orphaned** - It was designed to bridge the gap but no service imports it.

4. **The auth status system exists but isn't used** - Services don't query `getAuthStatus()` to determine which auth method to use.

---

## Next Steps

Proceed to **Phase 2: Persistence Investigation** to understand why settings don't persist after server reload.
