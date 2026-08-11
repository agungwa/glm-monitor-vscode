import { formatNumber, formatRelativeTime } from '../../shared/format';
import type { FetchResult } from '../../shared/types';

interface Props {
  result: FetchResult | null;
}

/**
 * Lists the sessions (each Claude Code conversation = one .jsonl file) that
 * have consumed the most tokens on this machine. Sorted descending.
 */
export function TopSessionsCard({ result }: Props) {
  const sessions = result?.localSpend?.topSessions ?? [];
  if (sessions.length === 0) {
    return (
      <div className="glm-card">
        <div className="glm-section">Highest-token sessions (this machine)</div>
        <div className="text-xs opacity-60">No session data yet.</div>
      </div>
    );
  }

  const max = sessions[0].allTime.totalTokens || 1;

  return (
    <div className="glm-card">
      <div className="glm-section">
        Highest-token sessions — {result?.localSpend?.machineName}
      </div>
      <div className="flex flex-col gap-2">
        {sessions.map((s, i) => {
          const widthPct = Math.max(2, (s.allTime.totalTokens / max) * 100);
          return (
            <div key={s.sessionId} className="text-xs">
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-mono truncate" title={s.projectPath}>
                  #{i + 1} {s.projectPath}
                </span>
                <span className="whitespace-nowrap font-semibold">
                  {formatNumber(s.allTime.totalTokens)}
                </span>
              </div>
              <div
                className="mt-1 rounded-sm"
                style={{
                  width: `${widthPct}%`,
                  height: 4,
                  background: 'var(--vscode-textLink-foreground)',
                  opacity: 0.6,
                }}
              />
              <div className="text-xs opacity-60 mt-0.5">
                {s.source ? `[${s.source}] ` : ''}{s.topModel ?? 'unknown'} · {s.turnCount} turns · last{' '}
                {formatRelativeTime(s.lastActivity)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
