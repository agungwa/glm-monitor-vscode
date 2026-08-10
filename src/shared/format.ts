// Ported from Chrome extension src/lib/format.ts.

export function formatNumber(n: number | undefined | null, fallback = '—'): string {
  if (n == null || !Number.isFinite(n)) return fallback;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPercent(n: number | undefined | null, fallback = '—'): string {
  if (n == null || !Number.isFinite(n)) return fallback;
  return `${n.toFixed(1)}%`;
}

export function formatRelativeTime(ts: number | undefined | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatClock(ts: number | undefined | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Humanize an epoch-ms reset time as a relative countdown, e.g. "in 4h 12m". */
export function formatCountdown(ts: number | undefined | null): string {
  if (!ts) return '—';
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `in ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `in ${hr}h ${remMin}m` : `in ${hr}h`;
}
