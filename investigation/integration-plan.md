# Phase 3: Integration Plan - CLI Subscription Feature

**Date:** 2025-12-26
**Status:** COMPLETE
**Agent:** Architect

---

## Executive Summary

This document outlines the precise surgical changes needed to integrate the CLI subscription feature into DevFlow's execution path. The plan follows existing patterns in the codebase and makes minimal, reversible changes.

---

## Design Principles

1. **Follow existing patterns** - Use SettingsService like other settings
2. **Minimal changes** - Only modify what's necessary
3. **Reversible** - Each change can be independently rolled back
4. **Testable** - Each step can be verified before proceeding
5. **No breaking changes** - Existing API key flow must continue to work

---

## Startup Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Server Startup Flow (AFTER Integration)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Server starts (index.ts:507)                                            │
│           │                                                                   │
│           ▼                                                                   │
│  2. Create SettingsService (index.ts:166)                                   │
│           │                                                                   │
│           ▼                                                                   │
│  3. ⭐ NEW: Load auth config from settings (index.ts:~175)                   │
│     │                                                                        │
│     │  const globalSettings = await settingsService.getGlobalSettings();    │
│     │  setAuthConfig({ method: globalSettings.claudeAuthMethod || 'auto' });│
│     │                                                                        │
│     ▼                                                                        │
│  4. Initialize AgentService (index.ts:172)                                  │
│           │                                                                   │
│           ▼                                                                   │
│  5. ⭐ NEW: Wire ClaudeProvider to use unified client (see below)           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Modification Plan

### Change 1: Add `claudeAuthMethod` to GlobalSettings

**File:** `libs/types/src/settings.ts`

**Location:** After line 261 (in `GlobalSettings` interface, after `enhancementModel`)

**Change:**
```typescript
export interface GlobalSettings {
  // ... existing fields ...

  // AI Model Selection
  /** Which model to use for feature name/description enhancement */
  enhancementModel: AgentModel;

  // ⭐ NEW: Claude Authentication Method
  /** Preferred Claude authentication method (api_key, cli, auto) */
  claudeAuthMethod?: 'api_key' | 'cli' | 'auto';

  // ... rest of fields ...
}
```

**Also add to DEFAULT_GLOBAL_SETTINGS (after line 439):**
```typescript
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  // ... existing ...
  enhancementModel: 'sonnet',
  claudeAuthMethod: 'auto', // ⭐ NEW
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  // ... rest ...
}
```

---

### Change 2: Load Auth Config on Server Startup

**File:** `apps/server/src/index.ts`

**Location:** After line 166 (after settingsService creation)

**Add:**
```typescript
// Import at top of file
import { setAuthConfig } from './lib/claude-auth-manager.js';

// After line 166 (after settingsService creation):
// Load Claude authentication configuration from settings
(async () => {
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const authMethod = globalSettings.claudeAuthMethod || 'auto';
    setAuthConfig({ method: authMethod });
    console.log(`[Server] Claude auth config loaded: ${authMethod}`);
  } catch (error) {
    console.warn('[Server] Failed to load auth config, using default:', error);
    setAuthConfig({ method: 'auto' });
  }
})();
```

---

### Change 3: Wire ClaudeProvider to Use Unified Client

**File:** `apps/server/src/providers/claude-provider.ts`

**Location:** Modify `executeQuery()` method (lines 26-95)

**Strategy:** Create a new internal method that routes through unified client when auth method is 'cli' or 'auto' with CLI available.

**Change:**
```typescript
import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
} from './types.js';
import { getAuthStatus } from '../lib/claude-auth-manager.js'; // ⭐ NEW

export class ClaudeProvider extends BaseProvider {
  getName(): string {
    return 'claude';
  }

  /**
   * Execute a query using Claude Agent SDK or CLI (if configured)
   *
   * Routes through unified client when CLI auth is configured.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
    } = options;

    // ⭐ NEW: Check if we should use CLI auth
    const authStatus = await getAuthStatus();
    const useCLI = authStatus.method === 'cli' ||
                   (authStatus.method === 'auto' && authStatus.cli?.installed && authStatus.cli?.authenticated);

    if (useCLI) {
      // Use unified client for CLI mode
      const { executeUnifiedQuery } = await import('../lib/unified-claude-client.js');
      yield* executeUnifiedQuery({
        prompt,
        model,
        cwd,
        systemPrompt,
        maxTurns,
        allowedTools,
        abortController,
        conversationHistory,
        sdkSessionId,
        forceAuthMethod: 'cli',
      });
      return;
    }

    // Original SDK-only code (unchanged)
    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];
    const toolsToUse = allowedTools || defaultTools;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      allowedTools: toolsToUse,
      permissionMode: 'acceptEdits',
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
      abortController,
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
    };

    let promptPayload: string | AsyncIterable<SDKUserMessage>;

    if (Array.isArray(prompt)) {
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt as ContentBlock[],
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt as SDKUserMessage;
      })();
    } else {
      promptPayload = prompt;
    }

    try {
      const stream = query({ prompt: promptPayload, options: sdkOptions });
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      console.error('[ClaudeProvider] executeQuery() error during execution:', error);
      throw error;
    }
  }

  // ... rest of class unchanged ...
}
```

---

### Change 4: Add Auth Settings API Routes

**File:** `apps/server/src/routes/settings/index.ts`

**Location:** After line 58 (after credentials routes)

**Add new route handler:**
```typescript
import { createAuthStatusHandler } from './routes/auth-status.js';
import { createUpdateAuthMethodHandler } from './routes/update-auth-method.js';

// In createSettingsRoutes(), after credentials routes:
// Auth configuration
router.get('/auth', createAuthStatusHandler(settingsService));
router.put('/auth', createUpdateAuthMethodHandler(settingsService));
```

---

### Change 5: Create Auth Status Handler

**File:** `apps/server/src/routes/settings/routes/auth-status.ts` (NEW FILE)

```typescript
/**
 * GET /api/settings/auth - Get Claude authentication status
 *
 * Returns current auth configuration including:
 * - Configured auth method (api_key, cli, auto)
 * - CLI detection status
 * - API key status
 * - Effective auth method (what will actually be used)
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { getAuthStatus } from '../../../lib/claude-auth-manager.js';

export function createAuthStatusHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const authStatus = await getAuthStatus();
      const globalSettings = await settingsService.getGlobalSettings();

      res.json({
        success: true,
        config: {
          method: globalSettings.claudeAuthMethod || 'auto',
        },
        status: authStatus,
      });
    } catch (error) {
      console.error('[Settings] Auth status error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get auth status',
      });
    }
  };
}
```

---

### Change 6: Create Update Auth Method Handler

**File:** `apps/server/src/routes/settings/routes/update-auth-method.ts` (NEW FILE)

```typescript
/**
 * PUT /api/settings/auth - Update Claude authentication method
 *
 * Updates the preferred authentication method and persists to settings.
 *
 * Body: { claudeAuthMethod: 'api_key' | 'cli' | 'auto' }
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { setAuthConfig, getAuthStatus } from '../../../lib/claude-auth-manager.js';

export function createUpdateAuthMethodHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { claudeAuthMethod } = req.body as { claudeAuthMethod?: 'api_key' | 'cli' | 'auto' };

      // Validate
      if (!claudeAuthMethod || !['api_key', 'cli', 'auto'].includes(claudeAuthMethod)) {
        res.status(400).json({
          success: false,
          error: 'Invalid auth method. Must be api_key, cli, or auto',
        });
        return;
      }

      // Update in-memory config
      setAuthConfig({ method: claudeAuthMethod });

      // Persist to settings
      await settingsService.updateGlobalSettings({ claudeAuthMethod });

      // Return updated status
      const authStatus = await getAuthStatus();

      res.json({
        success: true,
        config: {
          method: claudeAuthMethod,
        },
        status: authStatus,
      });
    } catch (error) {
      console.error('[Settings] Update auth method error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update auth method',
      });
    }
  };
}
```

---

## Implementation Checklist

```
[ ] 1. Add claudeAuthMethod to GlobalSettings interface
[ ] 2. Add claudeAuthMethod to DEFAULT_GLOBAL_SETTINGS
[ ] 3. Add setAuthConfig import to index.ts
[ ] 4. Add auth config loading to server startup (index.ts)
[ ] 5. Add getAuthStatus import to claude-provider.ts
[ ] 6. Modify ClaudeProvider.executeQuery() to route to CLI when configured
[ ] 7. Create auth-status.ts route handler
[ ] 8. Create update-auth-method.ts route handler
[ ] 9. Add new routes to settings/index.ts
[ ] 10. Test: Server restart preserves settings
[ ] 11. Test: PUT /api/settings/auth with 'cli' method
[ ] 12. Test: CLI mode actually executes queries via CLI
[ ] 13. Test: Fallback to SDK when CLI unavailable
[ ] 14. Test: Existing API key flow still works
```

---

## Rollback Plan

If any change breaks functionality:

1. **Revert specific file** using git:
   ```bash
   git checkout HEAD -- libs/types/src/settings.ts
   git checkout HEAD -- apps/server/src/index.ts
   git checkout HEAD -- apps/server/src/providers/claude-provider.ts
   git checkout HEAD -- apps/server/src/routes/settings/index.ts
   ```

2. **Delete new files**:
   ```bash
   rm apps/server/src/routes/settings/routes/auth-status.ts
   rm apps/server/src/routes/settings/routes/update-auth-method.ts
   ```

3. **Server will continue working** with API key auth only

---

## Testing Strategy

### Test 1: Verify Settings Persist
```bash
# Start server
npm run dev:server

# Set auth method to CLI
curl -X PUT http://localhost:3008/api/settings/auth \
  -H "Content-Type: application/json" \
  -d '{"claudeAuthMethod": "cli"}'

# Restart server
# Verify setting persists
curl http://localhost:3008/api/settings/auth
```

### Test 2: Verify CLI Mode Works
```bash
# Ensure CLI is installed and authenticated
claude --version
claude login  # if needed

# Set to CLI mode and run a query
# Check server logs for "[ClaudeProvider] Using CLI authentication"
```

### Test 3: Verify Fallback
```bash
# Set to 'auto' mode
curl -X PUT http://localhost:3008/api/settings/auth \
  -H "Content-Type: application/json" \
  -d '{"claudeAuthMethod": "auto"}'

# Should use CLI if available, otherwise API key
```

### Test 4: Verify API Key Mode Still Works
```bash
# Set to API key mode
curl -X PUT http://localhost:3008/api/settings/auth \
  -H "Content-Type: application/json" \
  -d '{"claudeAuthMethod": "api_key"}'

# Should only use API key, ignore CLI
```

---

## Remaining Work (Out of Scope for This Fix)

1. **Frontend UI** - Add settings UI to select auth method (backend-only fix)
2. **CLI credential detection** - Enhance to detect Pro vs Max vs Free tier
3. **Billing status** - Check if subscription has hit limits
4. **Error messages** - Improve guidance when CLI auth fails
5. **Function name collision** - Namespace `getAuthStatus()` in lib/auth.ts

---

## Next Steps

Proceed to **Phase 4: Implementation** to make these surgical changes.
