#!/usr/bin/env bash
# cleanup.sh — Daily cleanup of merged worktrees and stale tasks
# Run via OpenClaw cron daily at midnight

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REGISTRY="$REPO_ROOT/.clawdbot/active-tasks.json"
WORKTREES_DIR="$(dirname "$REPO_ROOT")/worktrees"

echo "🧹 Daily cleanup at $(date)..."

# Remove merged worktrees
node - <<'NODEEOF'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = execSync('git rev-parse --show-toplevel', {encoding:'utf8'}).trim();
const REGISTRY = path.join(REPO_ROOT, '.clawdbot/active-tasks.json');
let tasks = JSON.parse(fs.readFileSync(REGISTRY, 'utf8') || '[]');
const before = tasks.length;

// Check which PRs are merged
for (const task of tasks) {
  if (!task.pr || task.status === 'done') continue;
  try {
    const prState = JSON.parse(
      execSync(`gh pr view ${task.pr} --json state,mergedAt`, {encoding:'utf8'})
    );
    if (prState.state === 'MERGED') {
      console.log(`  ✅ PR #${task.pr} merged — cleaning up ${task.id}`);
      task.status = 'done';
      task.mergedAt = Date.now();

      // Remove worktree
      if (task.worktree && fs.existsSync(task.worktree)) {
        try {
          execSync(`git worktree remove "${task.worktree}" --force`, {cwd: REPO_ROOT});
          console.log(`  🗑️  Worktree removed: ${task.worktree}`);
        } catch(e) {
          console.log(`  ⚠️  Could not remove worktree: ${e.message}`);
        }
      }

      // Delete remote branch
      try {
        execSync(`git push origin --delete "${task.branch}"`, {cwd: REPO_ROOT});
        console.log(`  🗑️  Branch deleted: ${task.branch}`);
      } catch(e) { /* branch may not exist */ }
    }
  } catch(e) {
    console.log(`  ⚠️  Could not check PR ${task.pr}: ${e.message}`);
  }
}

// Archive done tasks older than 7 days
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const now = Date.now();
tasks = tasks.filter(t => {
  if (t.status === 'done' && t.mergedAt && (now - t.mergedAt) > SEVEN_DAYS) {
    console.log(`  📦 Archiving old task: ${t.id}`);
    return false;
  }
  return true;
});

fs.writeFileSync(REGISTRY, JSON.stringify(tasks, null, 2));
console.log(`\n  Done: ${before} → ${tasks.length} tasks in registry`);
NODEEOF

echo "✅ Cleanup complete"
