# PR Automation Scripts

A collection of scripts for automating Pull Request workflows with GitHub CLI.

## Prerequisites

- [GitHub CLI](https://cli.github.com/) installed and authenticated
- Bash shell

## Available Scripts

### 1. `get-pr-comments`

Fetches and displays all comments for a PR.

```bash
# Get comments for current branch's PR
bin/get-pr-comments

# Get comments for specific PR
bin/get-pr-comments 123
```

**Output:**

- Review comments (line-level)
- Issue comments
- Reviews
- Unresolved comment count

### 2. `resolve-pr-thread`

Resolves a PR review comment thread.

```bash
# Resolve thread without reply
bin/resolve-pr-thread 1234567890

# Resolve thread with reply
bin/resolve-pr-thread 1234567890 "Fixed the issue by adding validation"
```

**Output:**

- Posts reply (if provided)
- Marks thread as resolved
- Shows remaining unresolved count

### 3. `push-with-pr`

Pushes changes and optionally creates a PR.

```bash
# Interactive (prompts for commit message)
bin/push-with-pr

# With commit message
bin/push-with-pr "fix: resolve security issues"

# Push and create PR
bin/push-with-pr "fix: resolve security issues" --create-pr

# Create as draft
bin/push-with-pr "fix: resolve security issues" --create-pr --draft
```

**Features:**

- Stages all changes
- Commits with message
- Pushes to remote
- Optionally creates PR
- Checks if PR already exists

### 4. `auto-pr-create`

Automatically creates a PR with intelligent title and description.

```bash
# Create PR from current branch
bin/auto-pr-create

# Create as draft
bin/auto-pr-create --draft

# Use custom base branch
bin/auto-pr-create --base develop

# Use custom title
bin/auto-pr-create "Custom PR Title"
```

**Features:**

- Auto-generates title from commits or branch name
- Auto-generates description from commit history
- Shows file changes
- Includes checklist
- Checks if PR already exists
- Auto-pushes branch if needed

## Complete Workflow Example

### Resolve PR Comments in Parallel

```bash
# 1. Get all unresolved comments
bin/get-pr-comments

# 2. For each comment, spawn a resolver agent
# (This would be done via the /resolve_pr_parallel skill)

# 3. After all fixes, commit and push
bin/push-with-pr "fix(pr): resolve all review comments" --create-pr

# 4. Resolve comment threads
bin/resolve-pr-thread 1234567890 "Fixed as requested"
bin/resolve-pr-thread 0987654321 "Added the missing test"
```

## Error Handling

All scripts include:

- Color-coded output (green=success, red=error, yellow=warning, blue=info)
- Clear error messages
- Exit codes for scripting
- Validation of inputs

## Network Issues

If you encounter GitHub API errors:

1. Check your internet connection
2. Verify `gh` is authenticated: `gh auth status`
3. Check GitHub status: https://www.githubstatus.com

## Troubleshooting

### "No PR found for current branch"

- Push your branch first: `git push -u origin <branch>`
- Create PR manually or use `bin/auto-pr-create`

### "error connecting to api.github.com"

- Check network connection
- Try again later if GitHub is down
- Verify `gh` authentication

### Script not found

- Make sure you're in the repository root
- Use full path: `./bin/script-name`
- Or add to PATH: `export PATH="$PATH:./bin"`
