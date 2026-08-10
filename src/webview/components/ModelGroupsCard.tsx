import { errorCodeLabel } from '../../shared/models';
import type { FetchResult } from '../../shared/types';

interface Props {
  result: FetchResult | null;
}

export function ModelGroupsCard({ result }: Props) {
  const groups = result?.modelGroups;
  if (!groups || groups.length === 0) {
    return null;
  }
  return (
    <div className="glm-card">
      <div className="glm-section">Model availability</div>
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const isOk = g.status === 'ok';
          const toneClass = isOk ? 'text-ok' : g.code === 1308 ? 'text-warn' : 'text-danger';
          const label = isOk ? 'Available' : errorCodeLabel(g.code);
          return (
            <div key={g.key} className="text-xs">
              <div className={`font-semibold ${toneClass}`}>{label}</div>
              <div className="opacity-80">{g.models.join(', ')}</div>
              {g.resetTime && <div className="opacity-60">Resets at {g.resetTime}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
