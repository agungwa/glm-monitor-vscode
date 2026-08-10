import { formatNumber } from '../../shared/format';
import type { FetchResult } from '../../shared/types';

interface Props {
  result: FetchResult | null;
}

export function LocalSpendCard({ result }: Props) {
  const spend = result?.localSpend;
  if (!spend) {
    return (
      <div className="glm-card">
        <div className="glm-section">Local spend (this machine)</div>
        <div className="text-xs opacity-60">No data yet — run Claude Code to populate.</div>
      </div>
    );
  }
  return (
    <div className="glm-card">
      <div className="glm-section">
        Local spend — {spend.machineName} ({spend.parsedFiles} file(s))
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Today" value={formatNumber(spend.today.totalTokens)} />
        <Stat label="This month" value={formatNumber(spend.month.totalTokens)} />
        <Stat label="All time" value={formatNumber(spend.allTime.totalTokens)} />
      </div>
      <div className="glm-section">Per model (all-time)</div>
      <div className="flex flex-col gap-1">
        {spend.perModel.map((m) => (
          <div key={m.model} className="flex justify-between text-xs">
            <span>{m.model}</span>
            <span className="opacity-80">
              {formatNumber(m.allTime.totalTokens)} · today {formatNumber(m.today.totalTokens)}
            </span>
          </div>
        ))}
        {spend.perModel.length === 0 && (
          <div className="text-xs opacity-60">No model entries parsed yet.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
