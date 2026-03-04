#!/usr/bin/env node
import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getWeekId(date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Usage: node log-usage.mjs <taskId> <model> <inputTokens> <outputTokens> [source]');
    process.exit(1);
  }

  const [taskId, model, inputTokensStr, outputTokensStr, source = 'swarm'] = args;
  const inputTokens = parseInt(inputTokensStr, 10);
  const outputTokens = parseInt(outputTokensStr, 10);

  if (isNaN(inputTokens) || isNaN(outputTokens)) {
    console.error('Error: inputTokens and outputTokens must be numbers');
    process.exit(1);
  }

  const configPath = join(__dirname, 'usage-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const modelPricing = config.models[model];

  if (!modelPricing) {
    console.error(`Error: unknown model "${model}". Known models: ${Object.keys(config.models).join(', ')}`);
    process.exit(1);
  }

  const costUSD = parseFloat(
    ((inputTokens / 1_000_000) * modelPricing.inputCostPer1M +
     (outputTokens / 1_000_000) * modelPricing.outputCostPer1M).toFixed(6)
  );

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const record = {
    timestamp: now.toISOString(),
    date,
    weekId: getWeekId(now),
    taskId,
    model,
    source,
    inputTokens,
    outputTokens,
    costUSD,
  };

  const logPath = join(__dirname, 'usage-log.jsonl');
  appendFileSync(logPath, JSON.stringify(record) + '\n');
  console.log(`Logged: ${model} ${inputTokens}in/${outputTokens}out = $${costUSD}`);
}

main();
