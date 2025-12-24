---
name: commit
description: Run quality checks, commit with AI message, and push
---

1. Run quality checks:

   ```bash
   npm run lint --workspace=apps/ui
   npm run lint --workspace=apps/server
   npx tsc --noEmit --project apps/ui/tsconfig.json
   npx tsc --noEmit --project apps/server/tsconfig.json
   npm run format:check
   ```

   Fix ALL errors before continuing.

2. Review changes:

   ```bash
   git status
   git diff --staged
   git diff
   ```

3. Generate commit message:
   - Start with verb: Add, Update, Fix, Remove, Refactor
   - Be specific about what changed
   - Keep it under 72 characters
   - Example: "Fix keyboard shortcuts conflict detection"

4. Commit and push:
   ```bash
   git add -A
   git commit -m "your generated message here"
   git push
   ```
