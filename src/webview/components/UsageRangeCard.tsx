import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { formatNumber, formatPercent } from '../../shared/format';
import type { FetchResult, ModelUsageData } from '../../shared/types';

interface Props {
  result: FetchResult | null;
}

type Tab = 'today' | 'week' | 'month' | 'models';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: 'This month' },
  { id: 'models', label: 'Per model' },
];

const COLORS = ['#38bdf8', '#a78bfa', '#fb7185', '#fbbf24', '#34d399', '#60a5fa'];

export function UsageRangeCard({ result }: Props) {
  const [tab, setTab] = useState<Tab>('week');

  const data: ModelUsageData | null = pickData(result, tab);

  return (
    <div className="glm-card">
      <div className="flex items-center justify-between mb-2">
        <div className="glm-section m-0">Usage (account)</div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-2 py-0.5 rounded text-xs border border-solid border-white/15 cursor-pointer"
              style={
                tab === t.id
                  ? {
                      background: 'var(--vscode-button-background)',
                      color: 'var(--vscode-button-foreground)',
                      borderColor: 'transparent',
                    }
                  : { background: 'transparent' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {data ? (
        tab === 'models' ? (
          <PerModelView data={data} />
        ) : (
          <TimeSeriesView data={data} mode={tab} />
        )
      ) : (
        <div className="text-xs opacity-60">No data for this range.</div>
      )}
    </div>
  );
}

function pickData(result: FetchResult | null, tab: Tab): ModelUsageData | null {
  if (!result) return null;
  switch (tab) {
    case 'today':
      return result.dailyUsage?.data ?? null;
    case 'week':
      return result.weeklyUsage?.data ?? null;
    case 'month':
    case 'models':
      return result.monthlyUsage?.data ?? null;
  }
}

function TimeSeriesView({ data, mode }: { data: ModelUsageData; mode: 'today' | 'week' | 'month' }) {
  const total = data.totalUsage?.totalTokensUsage ?? 0;
  const calls = data.totalUsage?.totalModelCallCount ?? 0;

  // Bucket size hint based on the range (Z.ai returns granularity but it's
  // sometimes unreliable; we infer from bucket count for the X-axis label).
  const bucketCount = data.x_time.length;
  const labelStep = Math.max(1, Math.ceil(bucketCount / (mode === 'today' ? 8 : 10)));

  // Use a line chart for today (denser hourly buckets) and bars for day-grain ranges.
  const chartData = data.x_time.map((t, i) => ({
    t,
    tokens: data.tokensUsage[i] ?? 0,
    calls: data.modelCallCount[i] ?? 0,
  }));

  // For week/month we can also break down per-model using modelDataList.
  const hasPerModel = (data.modelDataList?.length ?? 0) > 0 && mode !== 'today';

  return (
    <>
      <div className="text-xs opacity-70 mb-2">
        {formatNumber(total)} tokens · {calls} calls ·{' '}
        {mode === 'today' ? 'hourly' : 'daily'} buckets
      </div>
      <div style={{ width: '100%', height: hasPerModel ? 160 : 180 }}>
        <ResponsiveContainer>
          {mode === 'today' ? (
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: 'currentColor' }}
                interval={labelStep - 1}
                tickFormatter={(v: string) => v.slice(11, 16)}
              />
              <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} width={44} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip
                contentStyle={{
                  background: 'var(--vscode-editor-background)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${formatNumber(v)} tokens`, 'Used']}
                labelFormatter={(l: string) => l}
              />
              <Line type="monotone" dataKey="tokens" stroke="var(--vscode-textLink-foreground)" dot={false} strokeWidth={2} />
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: 'currentColor' }}
                interval={labelStep - 1}
                tickFormatter={(v: string) => v.slice(5, 10)}
              />
              <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} width={44} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip
                contentStyle={{
                  background: 'var(--vscode-editor-background)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${formatNumber(v)} tokens`, 'Used']}
                labelFormatter={(l: string) => l}
              />
              <Bar dataKey="tokens" radius={[4, 4, 0, 0]} fill="var(--vscode-textLink-foreground)" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </>
  );
}

function PerModelView({ data }: { data: ModelUsageData }) {
  const monthTotal = data.totalUsage?.totalTokensUsage ?? 0;
  const bars = [...(data.modelSummaryList ?? [])]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((m) => ({
      name: m.modelName.replace(/^glm-/i, ''),
      tokens: m.totalTokens,
      pct: monthTotal > 0 ? (m.totalTokens / monthTotal) * 100 : 0,
    }));

  if (bars.length === 0) {
    return <div className="text-xs opacity-60">No model breakdown available.</div>;
  }

  return (
    <>
      <div className="text-xs opacity-70 mb-2">
        Total this month: {formatNumber(monthTotal)} tokens
      </div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={bars} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} interval={0} />
            <YAxis
              tick={{ fontSize: 10, fill: 'currentColor' }}
              width={50}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--vscode-editor-background)',
                border: '1px solid rgba(255,255,255,0.15)',
                fontSize: 12,
              }}
              formatter={(value: number) => [`${formatNumber(value)} tokens`, 'Used']}
            />
            <Bar dataKey="tokens" radius={[4, 4, 0, 0]}>
              {bars.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1 mt-2">
        {bars.map((b) => (
          <div key={b.name} className="flex justify-between text-xs">
            <span>{b.name}</span>
            <span className="opacity-80">
              {formatNumber(b.tokens)} ({formatPercent(b.pct)})
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
