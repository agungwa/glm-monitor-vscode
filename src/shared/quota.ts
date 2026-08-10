// Ported from Chrome extension src/lib/quota.ts, without the React class names.
import type { QuotaData, QuotaLimitItem, QuotaStatus, Settings } from './types';

export interface QuotaSummary {
  tokensPct: number | null;
  tokensNextReset: number | null;
  timePct: number | null;
  timeCurrent: number | null;
  timeUsage: number | null;
  timeRemaining: number | null;
  timeNextReset: number | null;
  timeUsageDetails: QuotaLimitItem['usageDetails'];
  level: string | null;
}

export function summarizeQuota(data: QuotaData | null | undefined): QuotaSummary {
  const empty: QuotaSummary = {
    tokensPct: null,
    tokensNextReset: null,
    timePct: null,
    timeCurrent: null,
    timeUsage: null,
    timeRemaining: null,
    timeNextReset: null,
    timeUsageDetails: undefined,
    level: data?.level ?? null,
  };
  if (!data?.limits) return empty;
  for (const item of data.limits) {
    if (item.type === 'TOKENS_LIMIT') {
      empty.tokensPct = num(item.percentage);
      empty.tokensNextReset = item.nextResetTime ?? null;
    } else if (item.type === 'TIME_LIMIT') {
      empty.timePct = num(item.percentage);
      empty.timeCurrent = num(item.currentValue);
      empty.timeUsage = num(item.usage);
      empty.timeRemaining = num(item.remaining);
      empty.timeNextReset = item.nextResetTime ?? null;
      empty.timeUsageDetails = item.usageDetails;
    }
  }
  return empty;
}

export function evaluateQuota(pct: number | null, settings: Settings): QuotaStatus {
  if (pct == null) return 'unknown';
  if (pct >= settings.dangerThreshold) return 'danger';
  if (pct >= settings.warnThreshold) return 'warn';
  return 'ok';
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
