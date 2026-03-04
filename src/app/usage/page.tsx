import styles from './page.module.css';

interface UsageData {
  today: { inputTokens: number; outputTokens: number; costUSD: number; calls: number };
  thisWeek: {
    inputTokens: number; outputTokens: number; costUSD: number;
    calls: number; budgetUSD: number; remainingUSD: number; percentUsed: number;
  };
  byDay: { date: string; costUSD: number; inputTokens: number; outputTokens: number }[];
  byTask: { taskId: string; calls: number; inputTokens: number; outputTokens: number; costUSD: number }[];
  byModel: { model: string; calls: number; inputTokens: number; outputTokens: number; costUSD: number }[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

async function fetchUsage(): Promise<UsageData> {
  // Use internal import for server component
  const { GET } = await import('../api/usage/route');
  const response = await GET();
  return response.json();
}

export default async function UsagePage() {
  const data = await fetchUsage();
  const { today, thisWeek, byDay, byModel, byTask } = data;

  const weekTokens = thisWeek.inputTokens + thisWeek.outputTokens;
  const maxDayCost = Math.max(...byDay.map((d) => d.costUSD), 0.01);

  const budgetColor =
    thisWeek.percentUsed > 80 ? styles.budgetRed
      : thisWeek.percentUsed > 50 ? styles.budgetYellow
        : styles.budgetGreen;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>AI Usage Tracker</h1>

      {/* Stat cards */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Today Cost</div>
          <div className={styles.statValue}>{formatCost(today.costUSD)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>This Week</div>
          <div className={styles.statValue}>{formatCost(thisWeek.costUSD)}</div>
          <div className={styles.statSub}>of {formatCost(thisWeek.budgetUSD)} budget</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Tokens This Week</div>
          <div className={styles.statValue}>{formatTokens(weekTokens)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>API Calls Today</div>
          <div className={styles.statValue}>{today.calls}</div>
        </div>
      </div>

      {/* Budget bar */}
      <div className={styles.budgetSection}>
        <div className={styles.budgetHeader}>
          <span>Weekly Budget</span>
          <span>{thisWeek.percentUsed.toFixed(1)}% used &middot; {formatCost(thisWeek.remainingUSD)} remaining</span>
        </div>
        <div className={styles.budgetTrack}>
          <div
            className={`${styles.budgetFill} ${budgetColor}`}
            style={{ width: `${Math.min(thisWeek.percentUsed, 100)}%` }}
          />
        </div>
      </div>

      {/* Bar chart */}
      <div className={styles.chartSection}>
        <div className={styles.chartTitle}>Last 14 Days</div>
        <div className={styles.chart}>
          {byDay.map((day) => (
            <div key={day.date} className={styles.chartCol}>
              <div
                className={styles.chartBar}
                style={{ height: `${(day.costUSD / maxDayCost) * 100}%` }}
                title={`${day.date}: ${formatCost(day.costUSD)}`}
              />
              <span className={styles.chartLabel}>{day.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tables */}
      <div className={styles.tablesRow}>
        <div className={styles.tableSection}>
          <div className={styles.tableTitle}>By Model</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Calls</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((m) => (
                <tr key={m.model}>
                  <td className={styles.mono}>{m.model}</td>
                  <td>{m.calls}</td>
                  <td>{formatTokens(m.inputTokens + m.outputTokens)}</td>
                  <td>{formatCost(m.costUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.tableSection}>
          <div className={styles.tableTitle}>By Task</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Task</th>
                <th>Calls</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {byTask.map((t) => (
                <tr key={t.taskId}>
                  <td className={styles.mono}>{t.taskId}</td>
                  <td>{t.calls}</td>
                  <td>{formatTokens(t.inputTokens + t.outputTokens)}</td>
                  <td>{formatCost(t.costUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
