import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface UsageRecord {
  timestamp: string;
  date: string;
  weekId: string;
  taskId: string;
  model: string;
  source: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

interface DaySummary {
  date: string;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
}

interface TaskSummary {
  taskId: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

interface ModelSummary {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

function getWeekId(date: Date): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseLog(): UsageRecord[] {
  const logPath = join(process.cwd(), '.clawdbot', 'usage-log.jsonl');
  if (!existsSync(logPath)) return [];

  const content = readFileSync(logPath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as UsageRecord);
}

function loadBudget(): number {
  const configPath = join(process.cwd(), '.clawdbot', 'usage-config.json');
  if (!existsSync(configPath)) return 20;
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  return config.weeklyBudgetUSD ?? 20;
}

export async function GET() {
  const records = parseLog();
  const budgetUSD = loadBudget();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentWeekId = getWeekId(now);

  // Today
  const todayRecords = records.filter((r) => r.date === todayStr);
  const today = {
    inputTokens: todayRecords.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: todayRecords.reduce((s, r) => s + r.outputTokens, 0),
    costUSD: parseFloat(todayRecords.reduce((s, r) => s + r.costUSD, 0).toFixed(6)),
    calls: todayRecords.length,
  };

  // This week
  const weekRecords = records.filter((r) => r.weekId === currentWeekId);
  const weekCost = parseFloat(weekRecords.reduce((s, r) => s + r.costUSD, 0).toFixed(6));
  const thisWeek = {
    inputTokens: weekRecords.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: weekRecords.reduce((s, r) => s + r.outputTokens, 0),
    costUSD: weekCost,
    calls: weekRecords.length,
    budgetUSD,
    remainingUSD: parseFloat((budgetUSD - weekCost).toFixed(6)),
    percentUsed: parseFloat(((weekCost / budgetUSD) * 100).toFixed(2)),
  };

  // By day (last 14 days)
  const dayMap = new Map<string, DaySummary>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dayMap.set(dateStr, { date: dateStr, costUSD: 0, inputTokens: 0, outputTokens: 0 });
  }
  for (const r of records) {
    const entry = dayMap.get(r.date);
    if (entry) {
      entry.costUSD = parseFloat((entry.costUSD + r.costUSD).toFixed(6));
      entry.inputTokens += r.inputTokens;
      entry.outputTokens += r.outputTokens;
    }
  }
  const byDay = Array.from(dayMap.values());

  // By task
  const taskMap = new Map<string, TaskSummary>();
  for (const r of records) {
    const entry = taskMap.get(r.taskId) ?? {
      taskId: r.taskId, calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
    };
    entry.calls++;
    entry.inputTokens += r.inputTokens;
    entry.outputTokens += r.outputTokens;
    entry.costUSD = parseFloat((entry.costUSD + r.costUSD).toFixed(6));
    taskMap.set(r.taskId, entry);
  }
  const byTask = Array.from(taskMap.values());

  // By model
  const modelMap = new Map<string, ModelSummary>();
  for (const r of records) {
    const entry = modelMap.get(r.model) ?? {
      model: r.model, calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
    };
    entry.calls++;
    entry.inputTokens += r.inputTokens;
    entry.outputTokens += r.outputTokens;
    entry.costUSD = parseFloat((entry.costUSD + r.costUSD).toFixed(6));
    modelMap.set(r.model, entry);
  }
  const byModel = Array.from(modelMap.values());

  return NextResponse.json({ today, thisWeek, byDay, byTask, byModel });
}
