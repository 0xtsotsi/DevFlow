---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

# Project Code Quality Check

This command runs all linting and typechecking tools for this monorepo project, collects errors, groups them by domain, and spawns parallel agents to fix them.

## Step 1: Run Linting and Typechecking

Run the appropriate commands for this TypeScript monorepo project:

### UI Application (apps/ui)

```bash
# Lint check
npm run lint --workspace=apps/ui

# Typecheck
npx tsc --noEmit --project apps/ui/tsconfig.json
```

### Server Application (apps/server)

```bash
# Lint check
npm run lint --workspace=apps/server

# Typecheck
npx tsc --noEmit --project apps/server/tsconfig.json
```

### Library Packages

```bash
# Typecheck all library packages
npx tsc --noEmit --project libs/types/tsconfig.json
npx tsc --noEmit --project libs/platform/tsconfig.json
npx tsc --noEmit --project libs/utils/tsconfig.json
npx tsc --noEmit --project libs/prompts/tsconfig.json
npx tsc --noEmit --project libs/model-resolver/tsconfig.json
npx tsc --noEmit --project libs/dependency-resolver/tsconfig.json
npx tsc --noEmit --project libs/git-utils/tsconfig.json
```

### Formatting Check

```bash
# Check code formatting with Prettier
npm run format:check
```

## Step 2: Collect and Parse Errors

Parse the output from the linting and typechecking commands. Group errors by domain:

- **Type errors**: Issues from TypeScript compiler (tsc) - parse the output to find files with type errors, line numbers, and error messages
- **Lint errors**: Issues from ESLint - parse the output to find files with lint violations, line numbers, rules violated, and error messages
- **Format errors**: Issues from Prettier - parse the output to find files that need formatting

Create a structured list of all files with issues and the specific problems in each file. For each domain:

- Count total number of issues
- List affected files
- Group errors by file with line numbers and descriptions

## Step 3: Spawn Parallel Agents

**CRITICAL**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

For each domain that has issues, spawn an agent in parallel using the Task tool:

### Type Error Fixer Agent

- **Agent type**: "general-purpose"
- **Task**: Fix all TypeScript type errors
- **Input**: Provide the complete list of type errors with file paths, line numbers, and error messages
- **Instructions**:
  - Fix each type error by reading the affected file and understanding the context
  - Make minimal changes to fix the type issues without changing functionality
  - Preserve existing code style and patterns
  - After fixing all errors, run typechecking again to verify all issues are resolved
  - Report any errors that couldn't be fixed automatically

### Lint Error Fixer Agent

- **Agent type**: "general-purpose"
- **Task**: Fix all ESLint errors and warnings
- **Input**: Provide the complete list of lint errors with file paths, line numbers, rules violated, and error messages
- **Instructions**:
  - Fix each lint error by reading the affected file
  - Follow the project's ESLint configuration rules
  - Use auto-fix where possible
  - For complex issues, make careful manual fixes
  - After fixing all errors, run linting again to verify all issues are resolved
  - Report any errors that couldn't be fixed automatically

### Format Fixer Agent

- **Agent type**: "general-purpose"
- **Task**: Fix all code formatting issues
- **Input**: Provide the complete list of files that need formatting
- **Instructions**:
  - Run `npm run format` to automatically format all files with Prettier
  - Verify formatting with `npm run format:check`
  - Report completion

**Example of spawning agents in parallel:**

```
In a SINGLE message, make THREE Task tool calls:
1. Task tool call for type-fixer agent
2. Task tool call for lint-fixer agent
3. Task tool call for format-fixer agent
```

## Step 4: Verify All Fixes

After all agents complete, run the full check again to ensure all issues are resolved:

```bash
# Run all checks
npm run lint --workspace=apps/ui
npm run lint --workspace=apps/server
npx tsc --noEmit --project apps/ui/tsconfig.json
npx tsc --noEmit --project apps/server/tsconfig.json
npx tsc --noEmit --project libs/types/tsconfig.json
npx tsc --noEmit --project libs/platform/tsconfig.json
npx tsc --noEmit --project libs/utils/tsconfig.json
npx tsc --noEmit --project libs/prompts/tsconfig.json
npx tsc --noEmit --project libs/model-resolver/tsconfig.json
npx tsc --noEmit --project libs/dependency-resolver/tsconfig.json
npx tsc --noEmit --project libs/git-utils/tsconfig.json
npm run format:check
```

Report the final status:

- Total issues found initially
- Total issues fixed
- Any remaining issues that need manual attention
