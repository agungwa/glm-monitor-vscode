// Ported from Chrome extension src/lib/models.ts.
import type { ModelGroup, ModelProbeResult } from './types';

export function groupProbeResults(results: ModelProbeResult[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const r of results) {
    const key = r.ok ? 'ok' : `${r.code ?? 'err'}|${r.resetTime ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.models.push(r.model);
    } else {
      groups.set(key, {
        key,
        status: r.ok ? 'ok' : 'fail',
        code: r.code,
        message: r.message,
        resetTime: r.resetTime,
        models: [r.model],
      });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
    return (a.code ?? 9999) - (b.code ?? 9999);
  });
}

export function errorCodeLabel(code: number | undefined): string {
  switch (code) {
    case 1308:
      return 'Rate limit (5h window)';
    case 1113:
      return 'Insufficient balance';
    case 1234:
      return 'Network error';
    case 1211:
      return 'Unknown model';
    default:
      return code ? `Error ${code}` : 'Error';
  }
}
