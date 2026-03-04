# Agent Swarm

AI-powered development pipeline. Spawn coding agents, monitor CI, merge PRs — while you do other things.

Orchestrated by **TenSoon** 🦴 (OpenClaw AI assistant).

## Architecture

```
You (Luke)
    │
    ▼
TenSoon (OpenClaw) ──── Memory, context, business logic
    │
    ├── spawn-agent.sh ──► Claude Code agent (worktree 1)
    ├── spawn-agent.sh ──► Codex agent      (worktree 2)
    └── spawn-agent.sh ──► Claude Code agent (worktree 3)
              │
              ▼
    GitHub PR + CI/CD
    (lint → types → tests → AI reviews)
              │
              ▼
    check-agents.sh (every 10 min)
              │
              ▼
    Telegram: "PR #42 ready for review"
```

## Quick Start

```bash
# Spawn a Claude Code agent
bash scripts/spawn-agent.sh \
  feat-auth \
  feat/auth \
  claude \
  "Implement JWT authentication with refresh tokens. See src/types/auth.ts for types."

# Check all running agents
bash scripts/check-agents.sh

# Trigger AI code review on a PR
bash scripts/review-pr.sh 42

# Daily cleanup
bash scripts/cleanup.sh
```

## The 8-Step Workflow

1. **Request** — You tell TenSoon what to build (or TenSoon finds work proactively)
2. **Spawn** — TenSoon calls `spawn-agent.sh` with full context prompt
3. **Monitor** — `check-agents.sh` runs every 10 min via OpenClaw cron
4. **PR** — Agent commits, pushes, opens PR via `gh pr create`
5. **Review** — `review-pr.sh` triggers Claude Code + Codex reviews on the PR
6. **CI** — GitHub Actions: lint → typecheck → tests → screenshot check
7. **Notify** — Telegram: "PR #X ready for review"
8. **Merge** — You review in 5-10 min, merge. Done.

## Task Registry

All active tasks live in `.clawdbot/active-tasks.json`:

```json
[{
  "id": "feat-auth",
  "pid": 12345,
  "agent": "claude",
  "branch": "feat/auth",
  "status": "ready-for-review",
  "pr": 42,
  "checks": {
    "prCreated": true,
    "ciPassed": true,
    "claudeReviewPassed": true,
    "codexReviewPassed": true
  }
}]
```

**Status flow:** `running` → `pr-open` → `reviewing` → `ready-for-review` → `done`

## Agent Selection Guide

| Task | Agent |
|------|-------|
| Backend logic, complex bugs, multi-file refactors | Codex |
| Frontend, git operations, fast iterations | Claude Code |
| New UI/dashboard design | Ask TenSoon (uses Claude) |

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/spawn-agent.sh` | Create worktree + launch agent |
| `scripts/run-agent.sh` | Agent runner (called by spawn) |
| `scripts/check-agents.sh` | Monitor all tasks, update registry |
| `scripts/review-pr.sh` | Trigger AI reviews on PR |
| `scripts/cleanup.sh` | Remove merged worktrees, archive tasks |

## Requirements

- Node.js 22+
- Git
- `gh` CLI (GitHub CLI) — authenticated
- `claude` CLI — authenticated  
- `codex` CLI — `OPENAI_API_KEY` set
- OpenClaw (for orchestration + Telegram notifications)

## OpenClaw Cron

The monitoring loop runs via OpenClaw heartbeat every ~30 min.
TenSoon checks `.clawdbot/notifications.json` and sends Telegram alerts.
