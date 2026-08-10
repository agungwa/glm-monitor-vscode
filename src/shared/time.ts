// Ported from Chrome extension src/lib/time.ts.
import type { TimeRange } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Format a Date as `yyyy-MM-dd HH:mm:ss` (local time). */
export function formatZaiTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function dayRange(now: Date = new Date()): TimeRange {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { startTime: formatZaiTime(start), endTime: formatZaiTime(now) };
}

export function monthRange(now: Date = new Date()): TimeRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { startTime: formatZaiTime(start), endTime: formatZaiTime(now) };
}

/** Last 7 days, day-aligned. */
export function weekRange(now: Date = new Date()): TimeRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6); // include today as the 7th day
  start.setHours(0, 0, 0, 0);
  return { startTime: formatZaiTime(start), endTime: formatZaiTime(end) };
}

/** Last 30 days, day-aligned. */
export function last30DaysRange(now: Date = new Date()): TimeRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { startTime: formatZaiTime(start), endTime: formatZaiTime(end) };
}
