# Phase 2: Persistence Analysis - CLI Subscription Feature Investigation

**Date:** 2025-12-26
**Status:** COMPLETE
**Agent:** Detective (a7853b3)

---

## Executive Summary

CLI subscription settings don't persist because:
1. **No persistence mechanism** - Auth config is only stored in a module variable
2. **No saving function** - `setAuthConfig()` is never called to save changes
3. **No loading on startup** - Auth config is never read from settings files
4. **No API endpoint** - Frontend has no route to send auth method changes

The fix requires extending the existing settings system to include the auth method, following the same pattern as other persistable settings.

---

## Current Persistence Mechanism

DevFlow uses a robust file-based persistence system through the `SettingsService` class:

### How Settings Are Currently Saved/Loaded

| Setting Type | Location | Format | API Route |
|--------------|----------|--------|-----------|
| Global Settings | `{DATA_DIR}/settings.json` | JSON | GET/PUT `/api/settings` |
| Credentials | `{DATA_DIR}/credentials.json` | JSON | GET/PUT `/api/settings/credentials` |
| Project Settings | `{projectPath}/.automaker/settings.json` | JSON | GET/PUT `/api/settings/project` |

### DATA_DIR Locations

| Platform | Path |
|----------|------|
| Linux | `~/.config/automaker` |
| Windows | `%APPDATA%\automaker` |
| macOS | `~/Library/Application Support/automaker` |

### What's Currently Stored in Global Settings

```typescript
interface GlobalSettings {
  version: number;
  theme: ThemeMode;
  sidebarOpen: boolean;
  maxConcurrency: number;
  aiProfiles: AIProfile[];
  projects: ProjectRef[];
  // ... 40+ other settings
  // MISSING: claudeAuthMethod
}
```

---

## Why CLI Auth Config Doesn't Persist

### Hypothesis Testing Results

| Hypothesis | Status | Evidence |
|------------|--------|----------|
| `setAuthConfig()` is never called | ✅ CONFIRMED | No imports or calls to `setAuthConfig()` found |
| Config is only in-memory | ✅ CONFIRMED | Stored in module variable `currentAuthConfig` with no disk write |
| No load function on startup | ✅ CONFIRMED | Server startup in `index.ts` doesn't load auth config |
| No API route to receive updates | ✅ CONFIRMED | No `/api/settings/auth` endpoint exists |

### Root Cause: The Auth Config Is Never Saved Anywhere

**File:** `apps/server/src/lib/claude-auth-manager.ts:27-29`
```typescript
let currentAuthConfig: ClaudeAuthConfig = {
  method: 'auto',
};
```

This module-level variable:
- Is never written to disk
- Is never read from disk
- Resets to `{ method: 'auto' }` on every server restart
- Has no functions to persist or load it

---

## Where It SHOULD Be Saved

### Recommended Implementation

1. **Extend GlobalSettings interface** in `libs/types/src/settings.ts`:
```typescript
export interface GlobalSettings {
  // ... existing fields ...

  // Claude authentication method preference
  claudeAuthMethod: 'api_key' | 'cli' | 'auto';
}
```

2. **Save to existing settings.json**:
- File: `{DATA_DIR}/settings.json`
- Same location as other global settings
- Uses existing atomic write mechanism

3. **Load during server startup** in `apps/server/src/index.ts`:
```typescript
// After services are initialized
const globalSettings = await settingsService.getGlobalSettings();
setAuthConfig({ method: globalSettings.claudeAuthMethod || 'auto' });
```

---

## Comparison with Working Features

### How API Keys Persist (Working Example)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API Key Persistence Flow (WORKING)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User enters API key in settings UI                                      │
│           │                                                                   │
│           ▼                                                                   │
│  2. PUT /api/settings/credentials                                           │
│     Body: { apiKeys: { anthropic: "sk-ant-..." } }                          │
│           │                                                                   │
│           ▼                                                                   │
│  3. SettingsService.updateCredentials()                                     │
│           │                                                                   │
│           ▼                                                                   │
│  4. Atomic write to {DATA_DIR}/credentials.json                             │
│     (write to temp file, then rename)                                       │
│           │                                                                   │
│           ▼                                                                   │
│  5. Settings persist across server restarts                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How CLI Auth Should Follow Same Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLI Auth Config Persistence Flow (TO BE IMPLEMENTED)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User selects auth method in settings UI                                 │
│           │                                                                   │
│           ▼                                                                   │
│  2. PUT /api/settings/auth                                                  │
│     Body: { claudeAuthMethod: "cli" }                                       │
│           │                                                                   │
│           ▼                                                                   │
│  3. SettingsService.updateGlobalSettings()                                  │
│           │                                                                   │
│           ▼                                                                   │
│  4. Atomic write to {DATA_DIR}/settings.json                                │
│     (same mechanism as other settings)                                      │
│           │                                                                   │
│           ▼                                                                   │
│  5. Server startup loads config from settings.json                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Startup Sequence Analysis

### Current Startup Flow

**File:** `apps/server/src/index.ts`

```typescript
// Lines 163-178: Service initialization
const agentService = new AgentService(DATA_DIR, events);
const featureLoader = new FeatureLoader();
const autoModeService = new AutoModeService(events);
const settingsService = new SettingsService(DATA_DIR);
const claudeUsageService = new ClaudeUsageService();
const beadsService = new BeadsService();

await agentService.initialize();
console.log('[Server] Agent service initialized');

await autoModeService.initialize();
console.log('[Server] Auto mode service initialized');

// MISSING: Auth config loading
```

### Where Auth Config Load Should Be Inserted

**After line 172 in `apps/server/src/index.ts`:**

```typescript
await agentService.initialize();
console.log('[Server] Agent service initialized');

// ⭐ INSERT HERE: Load auth config from settings ⭐
const globalSettings = await settingsService.getGlobalSettings();
const claudeAuthMethod = globalSettings.claudeAuthMethod || 'auto';
setAuthConfig({ method: claudeAuthMethod });
console.log(`[Server] Auth config loaded: ${claudeAuthMethod}`);

await autoModeService.initialize();
```

---

## Missing API Routes

### Existing Routes (for comparison)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settings` | GET/PUT | Global settings |
| `/api/settings/credentials` | GET/PUT | API keys |
| `/api/settings/project` | GET/PUT | Project settings |

### Needed Routes

| Route | Method | Purpose | Status |
|-------|--------|---------|--------|
| `/api/settings/auth` | GET/PUT | Auth method config | ❌ Missing |
| `/api/settings/auth/status` | GET | Current auth status | ❌ Missing |

---

## SettingsService Analysis

**File:** `apps/server/src/services/settings-service.ts`

### Existing Functions That Can Be Extended

| Function | Current Use | Can Handle Auth Config? |
|----------|-------------|------------------------|
| `getGlobalSettings()` | Loads settings from JSON | ✅ Yes, just needs field added |
| `updateGlobalSettings()` | Saves settings to JSON | ✅ Yes, just needs field added |
| `getCredentialsPath()` | Gets credentials file path | ✅ Already exists |
| `atomicWrite()` | Safe file writes | ✅ Already exists |

### Code That Needs Extension

**File:** `libs/types/src/settings.ts` - Add to interface:
```typescript
export interface GlobalSettings {
  // ... existing ...
  claudeAuthMethod?: ClaudeAuthMethod;
}
```

**File:** `apps/server/src/services/settings-service.ts` - Extend default:
```typescript
const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  // ... existing defaults ...
  claudeAuthMethod: 'auto',
};
```

---

## Frontend UI Status

### Existing UI Components

| File | Purpose | Status |
|------|---------|--------|
| `apps/ui/src/components/views/settings-view/cli-status/claude-cli-status.tsx` | Shows CLI status | ⚠️ Displays but can't persist |
| `apps/ui/src/components/views/settings-view.tsx` | Settings UI | ⚠️ Has section but no backend route |

### Frontend Can Display But Not Save

The frontend has code to display CLI status and select auth method, but:
- No API route to send selection to backend
- Selection is lost on page refresh
- Selection is lost on server restart

---

## Summary

### The Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Current State: Auth Config Is Ephemeral                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User selects "CLI" auth in UI                                              │
│           │                                                                   │
│           ▼                                                                   │
│  Frontend updates local state                                               │
│           │                                                                   │
│           ▼                                                                   │
│  ❌ No API route to send to backend                                         │
│           │                                                                   │
│           ▼                                                                   │
│  ❌ Backend only has in-memory config (resets on restart)                   │
│           │                                                                   │
│           ▼                                                                   │
│  ❌ Server restart → config lost                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Solution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fixed State: Auth Config Persists                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User selects "CLI" auth in UI                                              │
│           │                                                                   │
│           ▼                                                                   │
│  PUT /api/settings/auth { claudeAuthMethod: "cli" }                         │
│           │                                                                   │
│           ▼                                                                   │
│  SettingsService.updateGlobalSettings()                                     │
│           │                                                                   │
│           ▼                                                                   │
│  ✅ Atomic write to {DATA_DIR}/settings.json                                │
│           │                                                                   │
│           ▼                                                                   │
│  ✅ Server startup loads from settings.json                                 │
│           │                                                                   │
│           ▼                                                                   │
│  ✅ Config persists across restarts                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

Proceed to **Phase 3: Integration Design** to create the implementation plan.
