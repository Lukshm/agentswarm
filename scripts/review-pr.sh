#!/usr/bin/env bash
# review-pr.sh — Trigger AI code reviews on a PR using Claude Code
# Usage: ./scripts/review-pr.sh <pr-number>
# Posts review comments directly on the PR

set -euo pipefail

PR_NUMBER="${1:?Usage: review-pr.sh <pr-number>}"

echo "🔍 Starting AI code review for PR #$PR_NUMBER..."

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Get PR diff
echo "📥 Fetching PR diff..."
PR_DIFF=$(gh pr diff "$PR_NUMBER" 2>&1)
PR_INFO=$(gh pr view "$PR_NUMBER" --json title,body,files 2>&1)
PR_TITLE=$(echo "$PR_INFO" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).title)")

echo "📋 PR: $PR_TITLE"
echo ""

# ─── Claude Code Review ────────────────────────────────────────────────────────
echo "🤖 Claude Code review..."

CLAUDE_REVIEW=$(claude --model claude-opus-4-5 --dangerously-skip-permissions -p "
You are a senior code reviewer. Review this PR diff critically and precisely.

PR Title: $PR_TITLE

Diff:
\`\`\`diff
$PR_DIFF
\`\`\`

Focus on:
- Critical bugs or logic errors (mark as CRITICAL)
- Security vulnerabilities (mark as CRITICAL)
- Missing error handling
- Race conditions or async issues
- Type safety issues

Format each issue as:
**[SEVERITY]** file.ts:line — Description

Only report real issues. Skip style suggestions. Be direct." 2>&1)

echo "Claude review complete."

# Post Claude review as PR comment
gh pr comment "$PR_NUMBER" --body "## 🤖 Claude Code Review

$CLAUDE_REVIEW

---
*Automated review by TenSoon Agent Swarm*"

# ─── Codex Review ──────────────────────────────────────────────────────────────
echo "🤖 Codex review..."

CODEX_REVIEW=$(CODEX_REASONING_EFFORT="high" codex \
  --model o4-mini \
  --dangerously-bypass-approvals-and-sandbox \
  "You are an expert code reviewer focusing on edge cases, logic errors, and missing error handling. Review this diff and report only real bugs.

PR: $PR_TITLE

Diff:
$PR_DIFF

Format: **[SEVERITY]** file:line — issue. Only critical findings." 2>&1)

echo "Codex review complete."

gh pr comment "$PR_NUMBER" --body "## ⚡ Codex Review

$CODEX_REVIEW

---
*Automated review by TenSoon Agent Swarm*"

# ─── Update task registry ──────────────────────────────────────────────────────
REGISTRY="$REPO_ROOT/.clawdbot/active-tasks.json"
node - <<NODEEOF
const fs = require('fs');
const reg = JSON.parse(fs.readFileSync('$REGISTRY', 'utf8') || '[]');
const task = reg.find(t => t.pr === $PR_NUMBER);
if (task) {
  task.checks.claudeReviewPassed = true;
  task.checks.codexReviewPassed = true;
  task.status = 'reviewed';
}
fs.writeFileSync('$REGISTRY', JSON.stringify(reg, null, 2));
NODEEOF

echo ""
echo "✅ AI reviews posted to PR #$PR_NUMBER"
