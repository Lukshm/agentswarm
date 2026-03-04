#!/usr/bin/env bash
# check-agents.sh — The monitoring loop (Ralph Loop V2)
# Run via OpenClaw cron every 10 minutes
# Checks: PID alive, CI status, PR status → notifies via .clawdbot/notifications.json
# TenSoon reads notifications.json and sends Telegram messages

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REGISTRY="$REPO_ROOT/.clawdbot/active-tasks.json"
NOTIFY_FILE="$REPO_ROOT/.clawdbot/notifications.json"
LOGS_DIR="$REPO_ROOT/.clawdbot/agent-logs"
MAX_ATTEMPTS=3

echo "🔍 Checking agents at $(date)..."

# Ensure notifications file exists
[ -f "$NOTIFY_FILE" ] || echo "[]" > "$NOTIFY_FILE"

add_notification() {
  local type="$1"
  local task_id="$2"
  local message="$3"
  node - <<NODEEOF
const fs = require('fs');
const notifs = JSON.parse(fs.readFileSync('$NOTIFY_FILE', 'utf8') || '[]');
notifs.push({
  type: '$type',
  taskId: '$task_id',
  message: ${message},
  timestamp: Date.now(),
  sent: false
});
fs.writeFileSync('$NOTIFY_FILE', JSON.stringify(notifs, null, 2));
NODEEOF
}

# Read registry and check each task
node - <<'NODEEOF'
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = execSync('git rev-parse --show-toplevel 2>/dev/null || pwd', {encoding:'utf8'}).trim();
const REGISTRY = path.join(REPO_ROOT, '.clawdbot/active-tasks.json');
const MAX_ATTEMPTS = 3;

let tasks = JSON.parse(fs.readFileSync(REGISTRY, 'utf8') || '[]');
let changed = false;

for (const task of tasks) {
  if (['done', 'merged', 'skipped'].includes(task.status)) continue;

  console.log(`  Checking: ${task.id} [${task.status}]`);

  // 1. Check if agent process is still alive
  if (task.status === 'running' && task.pid) {
    let alive = false;
    try {
      execSync(`kill -0 ${task.pid} 2>/dev/null`);
      alive = true;
    } catch (e) { alive = false; }

    if (!alive) {
      console.log(`  ⚠️  Agent ${task.id} (PID ${task.pid}) is no longer running`);
      task.status = 'failed';
      changed = true;
    }
  }

  // 2. Check PR status + CI
  if (task.pr && ['pr-open', 'reviewing'].includes(task.status)) {
    try {
      const prInfo = JSON.parse(
        execSync(`gh pr view ${task.pr} --json state,statusCheckRollup,reviews`, {encoding:'utf8'})
      );

      // Check CI
      const checks = prInfo.statusCheckRollup || [];
      const allPassed = checks.length > 0 && checks.every(c => c.conclusion === 'SUCCESS');
      const anyFailed = checks.some(c => c.conclusion === 'FAILURE');

      if (allPassed && !task.checks.ciPassed) {
        task.checks.ciPassed = true;
        changed = true;
        console.log(`  ✅ CI passed for ${task.id}`);
      }

      if (anyFailed) {
        console.log(`  ❌ CI failed for ${task.id}`);
        task.status = 'ci-failed';
        changed = true;
      }

      // Check if all conditions met → notify human
      if (task.checks.ciPassed && !task.notifiedHuman && task.notifyOnComplete) {
        task.notifiedHuman = true;
        task.status = 'ready-for-review';
        changed = true;
        console.log(`  🎉 ${task.id} is READY FOR REVIEW`);

        // Write notification
        const notifs = JSON.parse(fs.readFileSync(
          path.join(REPO_ROOT, '.clawdbot/notifications.json'), 'utf8') || '[]');
        notifs.push({
          type: 'ready-for-review',
          taskId: task.id,
          message: `PR #${task.pr} ready for review: ${task.description.substring(0, 80)}`,
          prNumber: task.pr,
          timestamp: Date.now(),
          sent: false
        });
        fs.writeFileSync(path.join(REPO_ROOT, '.clawdbot/notifications.json'), JSON.stringify(notifs, null, 2));
      }

    } catch (e) {
      console.log(`  ⚠️  Could not check PR ${task.pr}: ${e.message}`);
    }
  }

  // 3. Auto-respawn failed agents (max 3 attempts)
  if (task.status === 'failed' && task.attempts < MAX_ATTEMPTS) {
    console.log(`  🔄 Respawning ${task.id} (attempt ${task.attempts + 1}/${MAX_ATTEMPTS})`);
    task.attempts += 1;
    task.status = 'respawning';
    changed = true;

    // Write respawn notification
    const notifs = JSON.parse(fs.readFileSync(
      path.join(REPO_ROOT, '.clawdbot/notifications.json'), 'utf8') || '[]');
    notifs.push({
      type: 'agent-respawn',
      taskId: task.id,
      message: `Agent ${task.id} failed. Respawning (attempt ${task.attempts}/${MAX_ATTEMPTS})`,
      timestamp: Date.now(),
      sent: false
    });
    fs.writeFileSync(path.join(REPO_ROOT, '.clawdbot/notifications.json'), JSON.stringify(notifs, null, 2));
  } else if (task.status === 'failed' && task.attempts >= MAX_ATTEMPTS) {
    task.status = 'needs-human';
    changed = true;
    console.log(`  🆘 ${task.id} needs human intervention (${MAX_ATTEMPTS} attempts exhausted)`);

    const notifs = JSON.parse(fs.readFileSync(
      path.join(REPO_ROOT, '.clawdbot/notifications.json'), 'utf8') || '[]');
    notifs.push({
      type: 'needs-human',
      taskId: task.id,
      message: `🆘 Agent ${task.id} failed ${MAX_ATTEMPTS} times. Needs your attention.`,
      timestamp: Date.now(),
      sent: false
    });
    fs.writeFileSync(path.join(REPO_ROOT, '.clawdbot/notifications.json'), JSON.stringify(notifs, null, 2));
  }
}

if (changed) {
  fs.writeFileSync(REGISTRY, JSON.stringify(tasks, null, 2));
  console.log('  📝 Registry updated');
}

const running = tasks.filter(t => t.status === 'running').length;
const pending = tasks.filter(t => !['done','merged','skipped'].includes(t.status)).length;
console.log(`\n  Summary: ${running} running | ${pending} total active`);
NODEEOF

echo "✅ Check complete"
