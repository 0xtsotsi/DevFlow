---
name: update-app
description: Update dependencies, fix deprecations and warnings
---

# Dependency Update & Deprecation Fix

## Step 1: Check for Updates

```bash
npm outdated
```

Review the output for outdated packages, especially those with higher major/minor versions available.

## Step 2: Update Dependencies

```bash
# Update all dependencies
npm update

# Fix security vulnerabilities
npm audit fix

# If audit fix can't resolve automatically, run:
npm audit fix --force
```

## Step 3: Check for Deprecations & Warnings

Run a clean install and check for warnings:

```bash
rm -rf node_modules package-lock.json
npm install
```

**Read ALL output carefully.** Look for:
- Deprecation warnings (e.g., "package X is deprecated")
- Security vulnerabilities
- Peer dependency warnings
- Breaking changes
- Unresolved dependencies

## Step 4: Fix Issues

For each warning/deprecation found:

1. **Research the recommended replacement or fix**
   - Check the package's documentation
   - Look for migration guides
   - Review GitHub issues/PRs

2. **Update code/dependencies accordingly**
   - Update deprecated packages to replacements
   - Refactor code using deprecated APIs
   - Update peer dependency versions

3. **Re-run installation**
   ```bash
   npm install
   ```

4. **Verify no warnings remain**
   - Run `npm install` again
   - Ensure ZERO warnings/errors

## Step 5: Rebuild Packages

Since this is a workspace monorepo, rebuild shared packages:

```bash
npm run build:packages
```

## Step 6: Run Quality Checks

```bash
# Lint all code
npm run lint

# Typecheck server
npx tsc -p apps/server/tsconfig.json --noEmit

# Run tests
npm run test:all

# Format code
npm run format
```

**Fix ALL errors before continuing.**

## Step 7: Verify Lockfile

Ensure lockfile is properly formatted (no git+ssh URLs):

```bash
npm run lint:lockfile
```

If this fails, run:
```bash
npm run fix:lockfile
```

## Step 8: Verify Clean Install

Ensure a fresh install works with ZERO warnings:

```bash
# Complete clean slate
rm -rf node_modules package-lock.json
rm -rf apps/*/node_modules libs/*/node_modules

# Clean install
npm install

# Rebuild packages
npm run build:packages

# Verify success
npm run lint
npm run test:all
```

## Step 9: Confirm All Workspaces Build

```bash
# Build server
npm run build:server

# Build UI
npm run build

# Build Electron (if applicable)
npm run build:electron:dir
```

## Summary

After completing all steps:
- ✅ All dependencies updated
- ⚠️ ZERO deprecation warnings
- 🛡️ All security vulnerabilities addressed
- 🔒 Lockfile properly formatted
- ✅ All tests passing
- 📦 All workspaces build successfully
- 🎨 Code properly formatted
