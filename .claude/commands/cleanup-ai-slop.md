---
name: cleanup-ai-slop
description: Check diff against main and remove all AI-generated slop from this branch
---

# Cleanup AI-Generated Slop

This command reviews the current branch against main and removes AI-generated additions that don't belong.

## Step 1: Get the Diff

Get the diff between the current branch and main:

```bash
git diff main...HEAD --name-status
git diff main...HEAD
```

## Step 2: Identify and Remove AI-Generated Slop

Review the diff and remove the following categories of AI-generated additions:

### 1. Extra Markdown Documentation Files

Remove any markdown files that are just AI change logs, summaries, or explanations that aren't official documentation. Look for patterns like:

- `*_SUMMARY.md`, `*SUMMARY.md`
- `*_CHANGES.md`, `*CHANGES.md`
- `*_REPORT.md`, `*REPORT.md`
- `*_AUDIT*.md`
- `*_REVIEW*.md`
- `pr_description.md`
- `BEADS_*.md`
- Any variations in uppercase, lowercase, mixed case

**Keep**: Official README.md files, legitimate docs/ content, actual project documentation.

### 2. Extra Comments

Remove comments that:

- A human developer wouldn't write
- Are inconsistent with the commenting style of the rest of the file
- State the obvious (e.g., `// Get the user` before `getUser()`)
- Are overly verbose or defensive explanations
- Use AI-style phrases like "ensure that", "note that", "important to"

**Keep**: Comments that explain complex logic, document edge cases, or match the existing codebase style.

### 3. Extra Defensive Checks

Remove defensive code that's abnormal for the context:

- Extra try/catch blocks in codepaths called by trusted/validated code
- Redundant validation checks
- Defensive null checks when TypeScript already guarantees non-null
- Overly defensive error handling that doesn't match the surrounding code style

**Keep**: Error handling that matches the existing patterns in the file and is appropriate for the context.

### 4. Type Casts to Any

Remove casts to `any` used to bypass type checking:

- `as any` casts that mask type issues
- `@ts-ignore` comments
- `@ts-expect-error` comments

**Fix properly**: If a cast was added, fix the underlying type issue instead.

### 5. Style Inconsistencies

Remove or fix any style that doesn't match the file:

- Inconsistent spacing or formatting
- Different import style than the rest of the file
- Different variable naming conventions
- Any code that stands out as "not matching" the surrounding codebase

## Step 3: Process Files

For each affected file:

1. Read the file
2. Identify AI-generated additions using the diff
3. Remove the offending content
4. Ensure the file still compiles/lints

## Step 4: Final Summary

Report a **1-3 sentence summary** of what was changed. Example format:

> "Removed 3 AI-generated markdown files (_\_SUMMARY.md, _\_REPORT.md), stripped redundant comments from auth-service.ts and user-controller.ts, and removed unnecessary defensive checks from api-handler.ts. The branch now contains only substantive changes."

## Important Notes

- **Be conservative**: When in doubt, keep it. Only remove clear AI-generated slop.
- **Preserve functionality**: Don't remove actual logic changes, just the "noise" around them.
- **Match existing style**: The goal is to make the changes look like a human wrote them.
