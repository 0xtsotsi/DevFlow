#!/bin/bash
# Script to update PR #25 with better title and description
# Run this when network connectivity is restored

set -e

PR_NUMBER=25
TITLE="feat: Add Vibe Kanban Review Watcher for automated code quality iteration"

gh pr edit $PR_NUMBER \
  --title "$TITLE" \
  --body-file pr_description.md

echo "✅ PR #$PR_NUMBER updated successfully!"
echo "Title: $TITLE"
