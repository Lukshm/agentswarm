# Agent Swarm 🦴

Automated AI-powered development pipeline. Spawn coding agents, monitor them, auto-review PRs, and get notified on Telegram when things are ready.

## Architecture

```
TenSoon (OpenClaw)
├── Spawns agents → git worktree + background process
├── Monitors via cron every 10 min → check-agents.sh
├── Triggers AI reviews on PRs → review-pr.sh
└── Notifies via Telegram when PRs are ready
```

## Quick Start

```bash
# Spawn a Claude Code agent on a new feature branch
npm run spawn feat-auth feat/auth claude "Implement JWT authentication with refresh tokens. Use src/lib/auth.ts. Write tests."

# Spawn a Codex agent
npm run spawn feat-payments feat/payments codex "Add Stripe payment integration..."

# Check agent status manually
npm run check-agents

# Review a PR with AI
npm run review 42

# Daily cleanup (also runs via cron)
npm run cleanup
```

## File Structure

```
agentswarm/
├── .clawdbot/
│   ├── active-tasks.json      # Task registry (source of truth)
│   ├── notifications.json     # Pending Telegram notifications
│   └── agent-logs/            # Per-agent log files
├── .github/workflows/
│   └── ci.yml                 # Lint + types + tests + screenshot check
├── scripts/
│   ├── spawn-agent.sh         # Create worktree + launch agent
│   ├── run-agent.sh           # Agent runner (called by spawn)
│   ├── check-agents.sh        # Monitor loop (runs every 10 min)
│   ├── review-pr.sh           # Trigger AI code reviews
│   └── cleanup.sh             # Daily worktree + registry cleanup
└── src/                       # Your Next.js app
```

## The 8-Step Workflow

1. **You describe a task** → TenSoon scopes it and spawns an agent
2. **Agent gets its own worktree** → isolated branch, no conflicts
3. **Cron monitors every 10 min** → checks PID, CI, PR status
4. **Agent commits and opens PR** → via `gh pr create --fill`
5. **AI reviews run automatically** → Claude + Codex post comments
6. **CI runs** → lint, types, tests, screenshot check
7. **You get Telegram notification** → "PR #42 ready for review"
8. **You review and merge** → cron cleans up worktree + branch

## Task Registry Schema

```json
{
  "id": "feat-auth",
  "pid": 12345,
  "agent": "claude",
  "branch": "feat/auth",
  "worktree": "../worktrees/feat-auth",
  "description": "Implement JWT auth...",
  "startedAt": 1740268800000,
  "status": "running",
  "attempts": 1,
  "pr": null,
  "checks": {
    "prCreated": false,
    "ciPassed": false,
    "claudeReviewPassed": false,
    "codexReviewPassed": false
  },
  "notifyOnComplete": true
}
```

**Status flow:** `running` → `pr-open` → `reviewing` → `ready-for-review` → `done`

**Failure flow:** `failed` → auto-respawn (max 3) → `needs-human`

## Monitoring

OpenClaw cron runs `check-agents.sh` every 10 minutes. Notifications land in `.clawdbot/notifications.json`. TenSoon reads them and sends Telegram messages.

## Prerequisites

- Node.js 22+
- Git
- `claude` CLI (`npm install -g @anthropic-ai/claude-code`)
- `codex` CLI (`npm install -g @openai/codex`)
- `gh` CLI ([cli.github.com](https://cli.github.com))
- OpenAI API key (for Codex)
- OpenClaw with Telegram configured
