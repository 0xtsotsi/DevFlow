# Beads - AI-Native Issue Tracking

Welcome to Beads! This repository uses **Beads** for issue tracking - a modern, AI-native tool designed to live directly in your codebase alongside your code.

## What is Beads?

Beads is issue tracking that lives in your repo, making it perfect for AI coding agents and developers who want their issues close to their code. No web UI required - everything works through the CLI and integrates seamlessly with git.

**Learn more:** [github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## DevFlow Beads Integration

**Status:** Backend implementation complete (df-1 through df-7 done)

### Completed Tasks

| ID   | Task                                       | Status |
| ---- | ------------------------------------------ | ------ |
| df-1 | Verify Beads CLI Installation              | ✓ Done |
| df-2 | Create Beads Backend Integration Structure | ✓ Done |
| df-3 | Port beads-ui CLI Wrapper to TypeScript    | ✓ Done |
| df-4 | Port Subscription Registry from beads-ui   | ✓ Done |
| df-5 | Port List Adapters from beads-ui           | ✓ Done |
| df-6 | Implement Beads API Routes                 | ✓ Done |
| df-7 | Add Beads Integration Types to DevFlow     | ✓ Done |

### Backend API Endpoints

```
POST   /api/beads/connect  - Initialize Beads connection
GET    /api/beads/ready    - Get work with no blockers
GET    /api/beads/list     - List all issues (with filters)
GET    /api/beads/show/:id - Get issue details
POST   /api/beads/create   - Create new issue
POST   /api/beads/update   - Update issue
POST   /api/beads/sync     - Git synchronization
```

### Implementation Structure

```
apps/server/src/routes/beads/
├── index.ts                    # Route registration
├── common.ts                   # Shared utilities and enums
├── client/
│   ├── cli-wrapper.ts         # Beads CLI wrapper (spawn, exec)
│   ├── subscription-registry.ts  # Real-time subscription management
│   └── list-adapters.ts       # Filter adapters for queries
├── routes/
│   ├── connect.ts             # POST /connect
│   ├── ready.ts               # GET /ready
│   ├── list.ts                # GET /list
│   ├── show.ts                # GET /show/:id
│   ├── create.ts              # POST /create
│   ├── update.ts              # POST /update
│   └── sync.ts                # POST /sync
└── services/                   # Business logic layer

libs/types/src/
└── beads.ts                    # Shared Beads type definitions
```

### Remaining Tasks (Frontend)

- df-8: Add Beads State to DevFlow Zustand Store
- df-9: Add Beads View Mode and Navigation Entry
- df-10: Create Beads View Component Structure
- df-11: Implement HTTP API Client for Beads
- df-12: Implement Beads Issue List View
- df-13: Implement Beads Issue Detail View
- df-14: Implement Dependency Graph Visualization
- df-15: Implement WebSocket for Real-Time Updates
- df-16: Create Issue Creation and Editing UI
- df-17: Add Beads Settings Section
- df-18: Write Tests for Beads Integration
- df-19: Documentation for Beads Integration
- df-20: Integration Testing and Polish

## Quick Start

### Essential Commands

```bash
# Create new issues
bd create "Add user authentication"

# View all issues
bd list

# View issue details
bd show <issue-id>

# Update issue status
bd update <issue-id> --status in_progress
bd update <issue-id> --status done

# Sync with git remote
bd sync
```

### Working with Issues

Issues in Beads are:

- **Git-native**: Stored in `.beads/issues.jsonl` and synced like code
- **AI-friendly**: CLI-first design works perfectly with AI coding agents
- **Branch-aware**: Issues can follow your branch workflow
- **Always in sync**: Auto-syncs with your commits

## Why Beads?

✨ **AI-Native Design**

- Built specifically for AI-assisted development workflows
- CLI-first interface works seamlessly with AI coding agents
- No context switching to web UIs

🚀 **Developer Focused**

- Issues live in your repo, right next to your code
- Works offline, syncs when you push
- Fast, lightweight, and stays out of your way

🔧 **Git Integration**

- Automatic sync with git commits
- Branch-aware issue tracking
- Intelligent JSONL merge resolution

## Get Started with Beads

Try Beads in your own projects:

```bash
# Install Beads
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize in your repo
bd init

# Create your first issue
bd create "Try out Beads"
```

## Learn More

- **Documentation**: [github.com/steveyegge/beads/docs](https://github.com/steveyegge/beads/tree/main/docs)
- **Quick Start Guide**: Run `bd quickstart`
- **Examples**: [github.com/steveyeggie/beads/examples](https://github.com/steveyeggie/beads/tree/main/examples)

---

_Beads: Issue tracking that moves at the speed of thought_ ⚡
