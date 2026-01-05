# Claude Code Skills & Reflection System - Comprehensive Guide

## The Frustration

### You Keep Saying:

- ❌ "Always validate inputs first"
- ❌ "Use our logging format"
- ❌ "Follow our naming conventions"
- ❌ "I told you this yesterday..."

### The Root Cause:

**No memory between sessions.**

- Your preferences aren't persisted
- You repeat yourself forever

---

## Part 1: The Manual Flow

_Run /reflect when you're done_

### Step 1: Use a Skill

**You Type:**

```bash
/code-review check the auth module
```

**What Happens:**

- Claude generates output using the skill's current instructions
- **Skill reads from:** `~/.claude/skills/code-review/SKILL.md`
- Contains your review checklist, security patterns, naming conventions, constraints...

### Step 2: Work & Correct

**During the Session:**

Claude: "Here's my review of the auth module..."

**You:** "Always check for SQL injection too"

Claude: "Updated review with SQL injection check..."

**You:** "perfect"

**Key Insight:**

- Corrections are signals
- Approvals are confirmations
- The reflect command will extract both

### Step 3: Run /reflect

**Command:**

```bash
/reflect code-review
```

**Claude Analyzes:**

- ✓ Scans conversation for corrections
- ✓ Identifies success patterns
- ✓ Proposes skill updates

**Confidence Levels:**

- **HIGH:** Explicit corrections: "never do X"
- **MEDIUM:** Patterns that worked well
- **LOW:** Observations to review later

### Step 4: Review & Approve

**Skill Reflection Output:**

```
Skill Reflection: code-review
Signals detected: 1 correction, 1 success

Proposed changes:
(HIGH) + Add to Security: "Check for SQL injection"
(MED) + Add: "Flag raw SQL queries for review"
(MED) + Add: "Verify parameterized queries"

Commit: "code-review: add SQL injection checks"
```

**Prompt:**

```
Apply these changes? [Y/n/change] Y
```

### Step 5: Updated & Pushed

**Claude Executes:**

- ✓ Edits `~/.claude/skills/code-review/SKILL.md`
- ✓ `git add + git commit`
- ✓ `git push origin main`

**Result:**

```
Skill Updated ─────────────────
✓ Edited SKILL.md
✓ Committed: 8959723
✓ Pushed to origin/main
```

**Next session uses the improved skill**

---

## Part 2: The Automatic Flow

_Hooks trigger reflection automatically_

### The Stop Hook

**Trigger:**
Claude Code supports **hooks** - commands that run on events.

The **Stop** hook fires when Claude stops responding.

Perfect for end-of-session analysis.

**Configuration: `~/.claude/settings.json`**

```json
{
  "hooks": {
    "Stop": {
      "hooks": [
        {
          "type": "command",
          "command": "~/.claude/skills/reflect/reflect.sh"
        }
      ]
    }
  }
}
```

### Automatic Detection

**Flow:**

1. **Work + Correct** →
2. **Session Ends** →
3. **Hook Analyzes** →
4. **✓ Learned**

**Example Result:**

```
✓ Learned from session → frontend-design
```

**Silent notification. No prompts. Session ends normally.**

### The reflect.sh Script

**SILENT** - No prompts, just notifies

**What It Does:**

- ✓ Checks toggle (skip if disabled)
- ✓ Reads transcript from session
- ✓ Detects skill + learnable patterns
- ✓ Shows notification, exits

**Sample Code:**

```bash
#!/bin/bash

# Toggle check
[ -f ".../.disabled" ] && exit

# Detect + notify
if patterns_found; then
  jq '{"systemMessage": "✓"}'
fi
```

**Control Commands:**

- `/reflect on` | `/reflect off` to toggle

---

## What Skills Can Learn

### Code Review

- → Style guide rules
- → Security patterns
- → Severity levels
- → False positives

### API Design

- → Naming conventions
- → Error formats
- → Auth patterns
- → Versioning style

### Testing

- → Coverage targets
- → Mocking patterns
- → Assertion styles
- → Test naming

### Documentation

- → Structure/format
- → Code examples
- → Tone preferences
- → Diagram styles

---

## What Are Agent Skills?

### Key Benefits

- **Auto-triggered** — Claude activates skills based on your request
- **Scoped** — Personal, project, or enterprise-wide
- **Lightweight** — Only loads what's needed (progressive disclosure)
- **Shareable** — Git repos, plugins, or marketplaces
- **Composable** — Works with hooks, subagents, MCP

### Learn More

**Official Documentation:**
[code.claude.com/docs/skills](https://code.claude.com/docs/skills)

**Quick Reference:**  
[code.claude.com/docs/llms.txt](https://code.claude.com/docs/llms.txt)

---

## Command Reference

### HOOK (Auto-detect)

```bash
learned → skill
```

**Silent notification. No prompts.**

### MANUAL (/reflect)

```bash
> /reflect
```

**Review, approve, update skill.**

### TOGGLE (on/off)

```bash
> /reflect on
> /reflect off
> /reflect status
```

**Enable/disable the hook.**

---

## The Result

# Correct once.

# Never again.

**Available Methods:**

- **Manual** `/reflect`
- **Auto** Stop Hook
- **Toggle** on/off

---

_This system creates a learning loop where Claude's skills improve based on your corrections and preferences, eliminating the need to repeat the same feedback across sessions._
