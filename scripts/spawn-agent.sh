#!/usr/bin/env bash
# spawn-agent.sh — Creates a git worktree and launches a coding agent in the background
# Usage: ./scripts/spawn-agent.sh <task-id> <branch-name> <agent> <prompt>
# Example: ./scripts/spawn-agent.sh feat-auth feat/auth claude "Implement JWT auth..."
# Agents: claude | codex

set -euo pipefail

TASK_ID="${1:?Usage: spawn-agent.sh <task-id> <branch-name> <agent> <prompt>}"
BRANCH="${2:?Missing branch name}"
AGENT="${3:-claude}"       # claude | codex
PROMPT="${4:?Missing prompt}"

REPO_ROOT="$(git rev parse --show-toplevel 2>/dev/null || pwd)"
WORKTREES_DIR="$(dirname "$REPO_ROOT")/worktrees"
WORKTREE_PATH="$WORKTREES_DIR/$TASK_ID"
LOGS_DIR="$REPO_ROOT/.clawdbot/agent-logs"
REGISTRY="$REPO_ROOT/.clawdbot/active-tasks.json"
LOG_FILE="$LOGS_DIR/$TASK_ID.log"

mkdir -p "$WORKTREES_DIR" "$LOGS_DIR"

echo "🚀 Spawning agent: $TASK_ID ($AGENT)"
echo "   Branch: $BRANCH"
echo "   Worktree: $WORKTREE_PATH"

# Create worktree on a new branch from origin/main
git worktree add "$WORKTREE_PATH" -b "$BRANCH" origin/main
cd "$WORKTREE_PATH"

# Install deps
if [ -f "package.json" ]; then
  echo "📦 Installing dependencies..."
  npm install --silent >> "$LOG_FILE" 2>&1
fi

# Build the launch command
case "$AGENT" in
  claude)
    CMD="claude --model claude-opus-4-5 --dangerously-skip-permissions -p $(printf '%q' "$PROMPT")"
    ;;
  codex)
    CMD="codex --model o4-mini -c 'model_reasoning_effort=high' --dangerously-bypass-approvals-and-sandbox $(printf '%q' "$PROMPT")"
    ;;
  *)
    echo "❌ Unknown agent: $AGENT. Use 'claude' or 'codex'."
    exit 1
    ;;
esac

# Launch agent in background, capture PID
echo "🤖 Launching $AGENT agent..."
nohup bash -c "cd '$WORKTREE_PATH' && $CMD" >> "$LOG_FILE" 2>&1 &
AGENT_PID=$!

echo "   PID: $AGENT_PID → $LOG_FILE"

# Register task in active-tasks.json
TIMESTAMP=$(date +%s000)
NEW_TASK=$(cat <<EOF
{
  "id": "$TASK_ID",
  "pid": $AGENT_PID,
  "agent": "$AGENT",
  "branch": "$BRANCH",
  "worktree": "$WORKTREE_PATH",
  "logFile": "$LOG_FILE",
  "description": "$PROMPT",
  "startedAt": $TIMESTAMP,
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
EOF
)

# Append to registry (requires Node for JSON manipulation)
node - <<NODEEOF
const fs = require('fs');
const registry = JSON.parse(fs.readFileSync('$REGISTRY', 'utf8') || '[]');
// Remove existing task with same ID if any
const filtered = registry.filter(t => t.id !== '$TASK_ID');
filtered.push($NEW_TASK);
fs.writeFileSync('$REGISTRY', JSON.stringify(filtered, null, 2));
console.log('✅ Task registered:', '$TASK_ID');
NODEEOF

echo ""
echo "✅ Agent spawned successfully!"
echo "   Monitor: tail -f $LOG_FILE"
echo "   Status:  cat $REGISTRY | node -e \"const d=require('fs').readFileSync('/dev/stdin','utf8');JSON.parse(d).filter(t=>t.id==='$TASK_ID').forEach(t=>console.log(t.status))\""
