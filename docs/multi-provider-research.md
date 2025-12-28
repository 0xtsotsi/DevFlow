# Multi-Provider Support Research

## Overview

This document researches how to integrate multiple AI providers (Cursor, OpenCode, etc.) into DevFlow's HYBRID orchestration system.

## Current Provider Architecture

### BaseProvider Interface

Located at: `apps/server/src/providers/base-provider.ts`

```typescript
abstract class BaseProvider {
  abstract getName(): string;
  abstract executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage>;
  abstract getAvailableModels(): ModelInfo[];
  abstract detectInstallation(): Promise<InstallationStatus>;
}
```

### ProviderFactory

Located at: `apps/server/src/providers/provider-factory.ts`

- Routes model IDs to appropriate providers
- Model-based routing (e.g., "claude-\*" → ClaudeProvider)
- Currently supports Claude only

## Cursor CLI Integration

### Installation

```bash
curl https://cursor.com/install -fsS | bash
```

### Authentication Methods

1. **Interactive Login**: `cursor-agent login`
2. **API Key**: `CURSOR_API_KEY` environment variable

### Configuration File

- **macOS/Linux**: `~/.cursor/cli-config.json`
- **Windows**: `$USERPROFILE\.cursor\cli-config.json`

### Available Commands

Based on official documentation:

| Command                             | Description                    |
| ----------------------------------- | ------------------------------ |
| `cursor-agent login`                | Authenticate with browser flow |
| `cursor-agent -p <prompt>`          | Prompt mode (non-interactive)  |
| `cursor-agent --model <name>`       | Specify model                  |
| `cursor-agent --force`              | Skip confirmations             |
| `cursor-agent --output-format text` | Output format                  |

### Available Models

```
/model auto      - Auto-select best model
/model sonnet-4.5 - Claude 4.5 Sonnet
/model gpt-5.2    - GPT-5.2
/model opus-4.5   - Claude 4.5 Opus
/model grok      - Grok
```

### Scripting Example

```bash
cursor-agent -p --force --output-format text \
  "Review recent changes and provide feedback"
```

## Provider Capability Detection

### Required Capabilities

Each provider must support:

1. **Model Selection** - Choose which model to use
2. **Streaming Output** - Real-time response streaming
3. **Tool Use** - Execute commands, read files, search code
4. **Multi-turn Conversations** - Context preservation
5. **Abort Control** - Cancel running requests

### Cursor CLI Capabilities

| Capability      | Supported | Notes                           |
| --------------- | --------- | ------------------------------- |
| Model Selection | ✅        | Via `--model` flag              |
| Streaming       | ⚠️        | Limited in CLI mode             |
| Tool Use        | ✅        | Built-in file ops, terminal     |
| Multi-turn      | ⚠️        | Limited in non-interactive mode |
| Abort Control   | ❓        | Needs verification              |

## Implementation Strategy

### Phase 1: Cursor Provider (M1)

1. Create `CursorProvider` class extending `BaseProvider`
2. Implement CLI subprocess execution
3. Handle prompt streaming via stdout
4. Add model routing to `ProviderFactory`

### Phase 2: Auth Cache (M1)

1. Detect Cursor auth status
2. Cache auth tokens if available
3. Provide login guidance if not authenticated

### Phase 3: Capability Probe (M1)

1. Probe each provider for available models
2. Detect provider-specific features
3. Build capability matrix

## OpenCode / Other Providers

**Status**: Needs research

- OpenCode CLI capabilities not yet documented
- Will research after Cursor provider is implemented

## Security Considerations

### 2025 Vulnerabilities (Critical)

1. **CVE-2025-54135** - RCE via malicious context
2. **CVE-2025-61593** - Prompt injection via cli-config.json
3. **GHSA-v64q-396f-7m79** - Permissive config RCE

**Mitigation**: Always run Cursor CLI in sandboxed/isolated worktrees (already implemented in DevFlow)

## References

- [Cursor CLI Official](https://cursor.com/cli)
- [Cursor CLI Parameters](https://cursor.com/docs/cli/reference/parameters)
- [Cursor CLI Configuration](https://cursor.com/docs/cli/reference/configuration)
- [How to Setup Cursor CLI 2025](https://zoer.ai/posts/zoer/how-to-setup-cursor-cli)
- [Getting Started with Cursor CLI](https://www.codecademy.com/article/getting-started-cursor-cli)

## Next Steps

1. ✅ Research complete
2. ⏳ Implement CursorProvider class
3. ⏳ Add ProviderFactory routing for Cursor models
4. ⏳ Test Cursor integration in sandboxed worktree
