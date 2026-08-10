import { summarizeQuota } from '../../shared/quota';
import { formatCountdown, formatNumber, formatPercent } from '../../shared/format';
import type { FetchResult } from '../../shared/types';

interface Props {
  result: FetchResult | null;
}

export function QuotaCard({ result }: Props) {
  const summary = summarizeQuota(result?.quota?.data);
  const tokensPct = summary.tokensPct;
  const timePct = summary.timePct;

  return (
    <div className="glm-card">
      <div className="glm-section">Live quota</div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Token quota"
          value={formatPercent(tokensPct)}
          sub={summary.tokensNextReset ? `Resets ${formatCountdown(summary.tokensNextReset)}` : undefined}
          tone={tone(tokensPct)}
        />
        <Stat
          label="Rate window"
          value={formatPercent(timePct)}
          sub={
            summary.timeRemaining != null
              ? `${formatNumber(summary.timeRemaining)} remaining`
              : undefined
          }
          tone={tone(timePct)}
        />
      </div>
      {summary.level && (
        <div className="text-xs opacity-60 mt-2">Account tier: {summary.level}</div>
      )}
    </div>
  );
}

function tone(pct: number | null): 'ok' | 'warn' | 'danger' {
  if (pct == null) return 'ok';
  if (pct >= 90) return 'danger';
  if (pct >= 80) return 'warn';
  return 'ok';
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'ok' | 'warn' | 'danger';
}) {
  const colorClass =
    tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ok';
  return (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div className={`text-xl font-semibold ${colorClass}`}>{value}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  );
}
