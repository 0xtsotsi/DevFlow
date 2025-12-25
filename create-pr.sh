#!/bin/bash
# Run this script when internet connectivity is restored

echo "Creating PR for UX-improvements-#1..."

# Create the PR
gh pr create \
  --title "feat: Comprehensive UX improvements - Beads integration, Kanban board, and stability enhancements" \
  --body-file PR_DESCRIPTION.md \
  --base main

echo "PR created successfully!"
echo "Don't forget to update Beads issue DevFlow-cto with the PR link."
