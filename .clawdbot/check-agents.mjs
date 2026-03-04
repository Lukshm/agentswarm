#!/usr/bin/env node
/**
 * check-agents.mjs — Agent monitor (Windows-compatible, no bash needed)
 * Called by OpenClaw cron every 10 minutes via TenSoon
 * Reads active-tasks.json, checks process/CI/PR status, writes notifications.json
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Ensure gh and other tools are in PATH (Windows isolated sessions may not have full PATH)
process.env.PATH = [
  process.env.PATH,
  'C:\\Program Files\\GitHub CLI',
  'C:\\Users\\Luke\\AppData\\Local\\pnpm',
  'C:\\Program Files\\nodejs',
].filter(Boolean).join(';');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(REPO_ROOT, '.clawdbot', 'active-tasks.json');
const NOTIFY_FILE = path.join(REPO_ROOT, '.clawdbot', 'notifications.json');
const MAX_ATTEMPTS = 3;

function readJSON(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function addNotification(type, taskId, message, extra = {}) {
  const notifs = readJSON(NOTIFY_FILE, []);
  notifs.push({ type, taskId, message, ...extra, timestamp: Date.now(), sent: false });
  writeJSON(NOTIFY_FILE, notifs);
}

function isProcessAlive(pid) {
  try {
    // Windows: tasklist check
    const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
    return result.includes(String(pid));
  } catch {
    return false;
  }
}

async function checkPR(prNumber) {
  try {
    const json = execSync(`gh pr view ${prNumber} --json state,statusCheckRollup,mergedAt`, {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });
    return JSON.parse(json);
  } catch (e) {
    console.warn(`  ⚠️  Could not check PR #${prNumber}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log(`🔍 Agent check at ${new Date().toISOString()}`);

  let tasks = readJSON(REGISTRY, []);
  let changed = false;

  for (const task of tasks) {
    if (['done', 'merged', 'skipped'].includes(task.status)) continue;

    console.log(`  → ${task.id} [${task.status}] ${task.agent}`);

    // 1. Check if agent process is still alive
    if (task.status === 'running' && task.pid) {
      const alive = isProcessAlive(task.pid);
      if (!alive) {
        console.log(`  ⚠️  Process ${task.pid} dead`);
        task.status = 'failed';
        task.lastUpdated = Date.now();
        changed = true;
      }
    }

    // 2. Check PR + CI status
    if (task.pr && ['pr-open', 'reviewing', 'ready-for-review'].includes(task.status)) {
      const prInfo = await checkPR(task.pr);
      if (prInfo) {
        // Check if merged
        if (prInfo.state === 'MERGED') {
          console.log(`  ✅ PR #${task.pr} merged!`);
          task.status = 'done';
          task.mergedAt = Date.now();
          changed = true;
          addNotification('merged', task.id, `✅ PR #${task.pr} merged: ${task.description.substring(0, 60)}`);
          continue;
        }

        // Check CI
        const checks = prInfo.statusCheckRollup || [];
        if (checks.length > 0) {
          const allPassed = checks.every(c => c.conclusion === 'SUCCESS');
          const anyFailed = checks.some(c => ['FAILURE', 'TIMED_OUT'].includes(c.conclusion));

          if (allPassed && !task.checks.ciPassed) {
            task.checks.ciPassed = true;
            changed = true;
            console.log(`  ✅ CI passed`);
          }

          if (anyFailed && task.status !== 'ci-failed') {
            task.status = 'ci-failed';
            changed = true;
            console.log(`  ❌ CI failed`);
            addNotification('ci-failed', task.id, `❌ CI failed on PR #${task.pr}: ${task.description.substring(0, 60)}`);
          }
        }

        // All checks done → notify human
        if (
          task.checks.ciPassed &&
          task.status !== 'ready-for-review' &&
          task.status !== 'done' &&
          task.notifyOnComplete &&
          !task.notifiedHuman
        ) {
          task.status = 'ready-for-review';
          task.notifiedHuman = true;
          changed = true;
          console.log(`  🎉 PR #${task.pr} READY FOR REVIEW`);
          addNotification(
            'ready-for-review',
            task.id,
            `🎉 PR #${task.pr} ready for review!\n\n${task.description.substring(0, 100)}\n\nhttps://github.com/Lukshm/agentswarm/pull/${task.pr}`,
            { prNumber: task.pr }
          );
        }
      }
    }

    // 3. Handle failures: auto-respawn or escalate
    if (task.status === 'failed') {
      if (task.attempts < MAX_ATTEMPTS) {
        task.attempts += 1;
        task.status = 'needs-respawn';
        changed = true;
        console.log(`  🔄 Queuing respawn (attempt ${task.attempts}/${MAX_ATTEMPTS})`);
        addNotification(
          'agent-respawn',
          task.id,
          `🔄 Agent ${task.id} failed. Queuing respawn (${task.attempts}/${MAX_ATTEMPTS})`
        );
      } else {
        task.status = 'needs-human';
        changed = true;
        console.log(`  🆘 Needs human intervention`);
        addNotification(
          'needs-human',
          task.id,
          `🆘 Agent ${task.id} failed ${MAX_ATTEMPTS} times. Needs your attention.\n\nLast log: ${task.logFile}`
        );
      }
    }
  }

  if (changed) {
    writeJSON(REGISTRY, tasks);
    console.log('  📝 Registry updated');
  }

  const running = tasks.filter(t => t.status === 'running').length;
  const active = tasks.filter(t => !['done', 'merged', 'skipped'].includes(t.status)).length;
  const needsHuman = tasks.filter(t => t.status === 'needs-human').length;

  console.log(`\n  Summary: ${running} running | ${active} active | ${needsHuman} need attention`);

  if (needsHuman > 0) {
    process.exit(2); // signal to caller that human action needed
  }
}

main().catch(e => {
  console.error('check-agents failed:', e);
  process.exit(1);
});
