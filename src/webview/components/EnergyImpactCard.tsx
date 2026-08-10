import { useState } from 'react';
import { formatNumber, formatDecimal } from '../../shared/format';
import { computeEnergyImpactFromModels } from '../../shared/energy';
import type { FetchResult } from '../../shared/types';

interface Props {
  result: FetchResult | null;
}

type Range = 'today' | 'month' | 'allTime';

const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This month' },
  { id: 'allTime', label: 'All time' },
];

export function EnergyImpactCard({ result }: Props) {
  const [range, setRange] = useState<Range>('allTime');
  const [showPerModel, setShowPerModel] = useState(false);

  const spend = result?.localSpend;
  if (!spend || spend.perModel.length === 0) {
    return (
      <div className="glm-card">
        <div className="glm-section">Energy & CO₂ impact</div>
        <div className="text-xs opacity-60">No local spend data yet.</div>
      </div>
    );
  }

  const impact = computeEnergyImpactFromModels(
    spend.perModel.map((m) => ({
      model: m.model,
      inputTokens: m[range].inputTokens,
      outputTokens: m[range].outputTokens,
      cacheReadTokens: m[range].cacheReadTokens,
      cacheCreationTokens: m[range].cacheCreationTokens,
      totalTokens: m[range].totalTokens,
    })),
  );

  return (
    <div className="glm-card">
      <div className="flex items-center justify-between mb-2">
        <div className="glm-section m-0">Energy & CO₂ impact ({spend.machineName})</div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className="px-2 py-0.5 rounded text-xs border border-solid border-white/15 cursor-pointer"
              style={
                range === r.id
                  ? {
                      background: 'var(--vscode-button-background)',
                      color: 'var(--vscode-button-foreground)',
                      borderColor: 'transparent',
                    }
                  : { background: 'transparent' }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Token breakdown */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <TokenStat label="Input tokens" value={impact.inputTokens} />
        <TokenStat label="Output tokens" value={impact.outputTokens} />
        <TokenStat
          label="Cached tokens"
          value={impact.cachedTokens}
          dim={impact.cachedTokens === 0}
        />
        <TokenStat label="Total tokens" value={impact.totalTokens} bold />
      </div>

      {/* Headline energy stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <HeadlineStat
          icon="⚡"
          label="Electricity"
          value={`${formatDecimal(impact.kWh)} kWh`}
          sub={`${formatDecimal(impact.kWhPer1M)} kWh / 1M tokens`}
        />
        <HeadlineStat
          icon="💰"
          label="Cost (IDR)"
          value={formatIDR(impact.costIDR)}
          sub={`≈ $${formatDecimal(impact.costUSD)}`}
        />
        <HeadlineStat
          icon="🌍"
          label="CO₂ emissions"
          value={`${formatDecimal(impact.co2Kg)} kg`}
          sub={`${formatDecimal(impact.co2Kg / 1000, 3)} tonnes`}
        />
        <HeadlineStat
          icon="📊"
          label="Efficiency"
          value={`${formatDecimal(impact.kWhPer1M)} kWh`}
          sub="per 1M tokens"
        />
      </div>

      {/* Equivalencies */}
      <div className="glm-section mt-3">Real-world equivalents</div>
      <div className="flex flex-col gap-1 text-xs">
        <EquivRow
          icon="🏠"
          label="Household electricity"
          value={`${formatDecimal(impact.householdDays, 1)} days`}
          sub="of avg Indonesian home (290 kWh/month)"
        />
        <EquivRow
          icon="🚗"
          label="Driving distance"
          value={`${formatDecimal(impact.carKm, 0)} km`}
          sub={`≈ ${formatDecimal(impact.carKm / 1.609, 0)} miles (petrol car, ~120 g CO₂/km)`}
        />
        <EquivRow
          icon="⛽"
          label="Petrol consumed"
          value={`${formatDecimal(impact.petrolLiters)} L`}
          sub="≈ 2.3 kg CO₂ per litre"
        />
      </div>

      {/* Per-model breakdown toggle */}
      <button
        onClick={() => setShowPerModel((s) => !s)}
        className="mt-3 text-xs opacity-70 hover:opacity-100 cursor-pointer"
        style={{ background: 'transparent', border: 'none', padding: 0 }}
      >
        {showPerModel ? '▼' : '▶'} Per-model breakdown ({impact.perModel.length})
      </button>
      {showPerModel && (
        <div className="mt-2 flex flex-col gap-2">
          {impact.perModel.map((m) => (
            <div
              key={m.model}
              style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 8px', borderRadius: 4 }}
              className="text-xs"
            >
              <div className="flex justify-between font-mono">
                <span>{m.model}</span>
                <span className="font-semibold">{formatDecimal(m.kWh)} kWh</span>
              </div>
              <div className="opacity-60 mt-0.5" style={{ fontSize: 10 }}>
                {formatNumber(m.totalTokens)} tokens ·{' '}
                {formatDecimal(m.kWhPer1M)} kWh/1M ·{' '}
                {formatDecimal(m.co2Kg)} kg CO₂ · {formatIDR(m.costIDR)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs opacity-50 mt-3" style={{ fontSize: 10 }}>
        Per-model factors (Wh/1K tokens) calibrated from Luccioni 2023 + H100-class throughput.
        Applies PUE 1.18× and network 0.05 Wh/1K. Indonesia grid 0.761 kg CO₂/kWh, PLN R1 1,444 IDR/kWh.
        Actual figures vary by quantization, batching, and provider.
      </div>
    </div>
  );
}

function TokenStat({
  label,
  value,
  bold,
  dim,
}: {
  label: string;
  value: number;
  bold?: boolean;
  dim?: boolean;
}) {
  return (
    <div className={dim ? 'opacity-50' : ''}>
      <div className="opacity-60">{label}</div>
      <div className={`font-mono ${bold ? 'font-semibold' : ''}`}>{formatNumber(value)}</div>
    </div>
  );
}

function HeadlineStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 6 }}>
      <div className="text-xs opacity-70">
        {icon} {label}
      </div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function EquivRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex-1 min-w-0">
        <span className="opacity-70">{icon}</span> {label}
        {sub && (
          <div className="opacity-50 mt-0.5" style={{ fontSize: 10 }}>
            {sub}
          </div>
        )}
      </span>
      <span className="font-mono font-semibold whitespace-nowrap">{value}</span>
    </div>
  );
}

function formatIDR(value: number): string {
  const rounded = Math.round(value);
  return `Rp ${rounded.toLocaleString('id-ID')}`;
}
