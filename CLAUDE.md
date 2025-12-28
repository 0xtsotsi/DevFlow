# DevFlow

An autonomous AI development studio where you describe features on a Kanban board and AI agents powered by Claude Code automatically implement them. Build entire applications in days by orchestrating AI agents as a team of developers.

**Note:** DevFlow is a fork of [Automaker](https://github.com/AutoMaker-Org/automaker) with additional features and enhancements.

**Target Users:** Software developers and teams adopting agentic coding workflows with AI agents while maintaining control over architecture and business logic.

## Project Structure

```
apps/
  ├── server/              # Backend API server (Express + WebSocket)
  │   ├── src/
  │   │   ├── index.ts     # Main entry point (port 3008)
  │   │   ├── routes/      # API endpoints (fs, agent, worktree, terminal, etc.)
  │   │   ├── services/    # Business logic (agent-service, auto-mode, etc.)
  │   │   └── lib/         # Core libraries (auth, events, middleware)
  │   └── tests/           # Unit and integration tests
  │
  └── ui/                  # Frontend React application (Electron + Web)
      ├── src/
      │   ├── main.ts      # Electron main process entry
      │   ├── components/  # React components (views, dialogs, ui, layout)
      │   ├── hooks/       # Custom React hooks
      │   ├── lib/         # Frontend utilities
      │   ├── store/       # Zustand state management
      │   └── types/       # TypeScript type definitions
      └── tests/           # E2E tests (Playwright)

libs/                      # Shared libraries (monorepo)
  ├── @automaker/types     # Shared TypeScript type definitions
  ├── @automaker/utils     # Utility functions and helpers
  ├── @automaker/platform  # Platform-specific utilities (Node.js, paths)
  ├── @automaker/prompts   # AI prompt templates
  ├── @automaker/model-resolver   # Model resolution and config
  ├── @automaker/dependency-resolver  # Dependency management
  └── @automaker/git-utils # Git operation utilities

test/                      # Test configuration and fixtures
  ├── config/              # Test configs (claude-settings, gitignore, etc.)
  └── fixtures/            # Sample data for testing

scripts/                   # Build and utility scripts
init.mjs                   # Development launcher (web/electron modes)
vitest.config.ts           # Test configuration
```

## Organization Rules

**Keep code organized and modularized:**

- API routes → `apps/server/src/routes/`, one file per route/resource
- Services → `apps/server/src/services/`, one service per file
- React components → `apps/ui/src/components/`, grouped by feature
- Shared types → `libs/@automaker/types/src/`
- Utilities → Group in appropriate lib package or `lib/` folders
- Tests → Next to source code or in `tests/` directories

**Modularity principles:**

- Single responsibility per file
- Clear, descriptive file names
- Group related functionality together
- Avoid monolithic files (>300 lines)
- Export types from `@automaker/types` for shared use

## Code Quality - Zero Tolerance

After editing ANY file, run:

```bash
# UI changes
npm run lint

# Server changes
npm run lint --workspace=apps/server
npm run test:server

# Library changes
npm run build:packages
npm run test:packages

# Format all changes
npm run format
```

Fix ALL errors/warnings before continuing.

**If server changes require restart:**

1. Stop server (Ctrl+C or kill process)
2. Restart: `npm run dev:server`
3. Check for startup warnings/errors
4. Fix ALL issues before continuing

**TypeScript compilation:**

```bash
# Server typecheck
npx tsc -p apps/server/tsconfig.json --noEmit

# UI typecheck (via Vite build)
npm run build --workspace=apps/ui
```

**Before committing:**

1. Run linting: `npm run lint`
2. Run tests: `npm run test:all`
3. Format code: `npm run format`

**Lockfile validation:**

```bash
npm run lint:lockfile
```
