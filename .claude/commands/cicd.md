---
name: cicd
description: Run comprehensive CI/CD validation (lint, typecheck, tests, build, E2E, security)
---

# CI/CD Skill

Run complete CI/CD validation pipeline with automated reporting.

## Step 1: Parse CI/CD Request

Identify which stages to run (default: all):

- **lint**: ESLint validation
- **typecheck**: TypeScript compilation check
- **tests**: Unit tests (Vitest)
- **build**: Production build verification
- **e2e**: End-to-end tests (Playwright)
- **security**: Security vulnerability scan

## Step 2: Run Validation Stages

Execute each stage sequentially, collecting results:

```bash
# Linting
npm run lint

# Type checking
npx tsc --noEmit

# Unit tests
npm run test

# Build
npm run build

# E2E tests (if configured)
npx playwright test

# Security scan
npm audit --json
```

For each stage:

1. Run the command
2. Capture output
3. Parse results
4. Track issues found
5. Record duration
6. Emit events for monitoring

## Step 3: Generate Report

Create HTML report with:

- Overall status (PASSED/FAILED)
- Per-stage results with:
  - Success/failure status
  - Duration
  - Issues found
  - Error messages (if any)
- Timestamp

Example report structure:

```html
<div class="header success">
  <h1>CI/CD Pipeline Report</h1>
  <div class="status">✓ PASSED</div>
</div>
<div class="stage success">
  <h3>✓ LINT</h3>
  <div class="details">Duration: 2.5s | Issues: 0</div>
</div>
```

## Step 4: Auto-Commit (Optional)

If all stages pass and auto-commit is enabled:

1. Stage all changes: `git add .`
2. Commit with message: `git commit -m "ci: automated commit"`
3. Return commit hash

## Step 5: Present Results

Display summary:

```markdown
# CI/CD Pipeline Complete

**Status**: PASSED ✅

**Stages**:

- Lint: PASSED (2.5s, 0 issues)
- Typecheck: PASSED (5.2s, 0 issues)
- Tests: PASSED (15.3s, 0/0 failures)
- Build: PASSED (45.1s)
- E2E: SKIPPED (Playwright not configured)
- Security: PASSED (1.8s, 0 vulnerabilities)

**Report**: .cicd-reports/cicd-report-1234567890.html
**Duration**: 70s total
**Commit**: abc123def (if auto-committed)
```

## Error Handling

If any stage fails:

- Mark pipeline as FAILED
- Include error details in report
- Skip remaining stages (fail-fast)
- Suggest fixes based on error type
- Create Beads issue if critical

## Notes

- Stages run sequentially for clean error output
- HTML reports saved to `.cicd-reports/`
- All progress emitted as events
- Auto-commit only on full success
- E2E and Security are optional (skip if not configured)
