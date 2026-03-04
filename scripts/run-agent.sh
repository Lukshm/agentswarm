#!/usr/bin/env bash
# run-agent.sh — Called by spawn-agent.sh to run a coding agent with full logging
# This script is the actual agent runner (equivalent to the article's run-agent.sh)
# Usage: run-agent.sh <task-id> <agent> <reasoning-level> <prompt>

set -euo pipefail

TASK_ID="${1:?Missing task-id}"
AGENT="${2:-claude}"
REASONING="${3:-high}"   # low | medium | high
PROMPT="${4:?Missing prompt}"

echo "═══════════════════════════════════════"
echo "  Agent: $AGENT | Task: $TASK_ID"
echo "  Reasoning: $REASONING"
echo "  Started: $(date)"
echo "═══════════════════════════════════════"
echo ""

# Update task status to 'running'
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REGISTRY="$REPO_ROOT/.clawdbot/active-tasks.json"

update_status() {
  local status="$1"
  node - <<NODEEOF
const fs = require('fs');
const reg = JSON.parse(fs.readFileSync('$REGISTRY', 'utf8') || '[]');
const task = reg.find(t => t.id === '$TASK_ID');
if (task) { task.status = '$status'; task.lastUpdated = Date.now(); }
fs.writeFileSync('$REGISTRY', JSON.stringify(reg, null, 2));
NODEEOF
}

update_status "running"

# Run the agent
case "$AGENT" in
  claude)
    claude \
      --model claude-opus-4-5 \
      --dangerously-skip-permissions \
      -p "$PROMPT"
    EXIT_CODE=$?
    ;;
  codex)
    CODEX_REASONING_EFFORT="$REASONING" codex \
      --model o4-mini \
      --dangerously-bypass-approvals-and-sandbox \
      "$PROMPT"
    EXIT_CODE=$?
    ;;
esac

if [ "$EXIT_CODE" -eq 0 ]; then
  echo ""
  echo "✅ Agent completed successfully"
  update_status "agent-done"
  
  # Attempt to create PR
  echo "📬 Creating pull request..."
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git push origin "$BRANCH" 2>&1 || true
  
  PR_URL=$(gh pr create --fill --base master 2>&1 || echo "")
  PR_NUMBER=$(echo "$PR_URL" | grep -oP '(?<=/pull/)\d+' || echo "")
  
  if [ -n "$PR_NUMBER" ]; then
    echo "✅ PR created: $PR_URL"
    node - <<NODEEOF
const fs = require('fs');
const reg = JSON.parse(fs.readFileSync('$REGISTRY', 'utf8') || '[]');
const task = reg.find(t => t.id === '$TASK_ID');
if (task) {
  task.status = 'pr-open';
  task.pr = parseInt('$PR_NUMBER');
  task.checks.prCreated = true;
  task.completedAt = Date.now();
}
fs.writeFileSync('$REGISTRY', JSON.stringify(reg, null, 2));
NODEEOF
  else
    echo "⚠️  Could not create PR automatically"
    update_status "needs-review"
  fi
else
  echo "❌ Agent failed (exit: $EXIT_CODE)"
  update_status "failed"
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Finished: $(date)"
echo "═══════════════════════════════════════"
