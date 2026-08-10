// Ported from the Chrome extension's src/lib/types.ts, plus local-spend additions.

/** Standard Z.ai envelope: `{ code, msg, success, data }`. */
export interface ApiEnvelope<T = unknown> {
  code?: number;
  msg?: string;
  message?: string;
  success?: boolean;
  data?: T;
}

// ── /usage/quota/limit ──────────────────────────────────────────────

export interface QuotaUsageDetail {
  modelCode: string;
  usage: number;
}

export interface QuotaLimitItem {
  /** "TIME_LIMIT" (rate window) or "TOKENS_LIMIT" (total token quota). */
  type: string;
  unit?: number;
  number?: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  /** 0-100. Present for both limit types. */
  percentage?: number;
  /** epoch ms */
  nextResetTime?: number;
  usageDetails?: QuotaUsageDetail[];
}

export interface QuotaData {
  limits: QuotaLimitItem[];
  level?: string;
}

// ── /usage/model-usage ──────────────────────────────────────────────

export interface ModelSummaryItem {
  modelName: string;
  totalTokens: number;
  sortOrder: number;
}

export interface ModelSeries extends ModelSummaryItem {
  tokensUsage: number[];
}

export interface ModelUsageData {
  x_time: string[];
  modelCallCount: number[];
  tokensUsage: number[];
  totalUsage: {
    totalModelCallCount: number;
    totalTokensUsage: number;
    modelSummaryList: ModelSummaryItem[];
  };
  modelDataList: ModelSeries[];
  modelSummaryList: ModelSummaryItem[];
  granularity: string;
}

// ── /anthropic/v1/models + per-model probing ────────────────────────

export interface ModelInfo {
  id: string;
  displayName: string;
}

export interface ModelProbeResult {
  model: string;
  ok: boolean;
  code?: number;
  message?: string;
  resetTime?: string;
}

export interface ModelGroup {
  key: string;
  status: 'ok' | 'fail';
  code?: number;
  message?: string;
  resetTime?: string;
  models: string[];
}

// ── local session spend (parsed from ~/.claude/projects/*/*.jsonl) ──

export interface LocalSpendBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
}

export interface LocalModelSpend {
  model: string;
  today: LocalSpendBucket;
  month: LocalSpendBucket;
  allTime: LocalSpendBucket;
}

export interface SessionSpend {
  sessionId: string;
  /** Human-readable project path decoded from the parent folder slug. */
  projectPath: string;
  /** Raw slug (parent folder name) for sorting stability. */
  projectSlug: string;
  allTime: LocalSpendBucket;
  /** Most recent message timestamp (epoch ms). */
  lastActivity: number | null;
  /** First message timestamp (epoch ms). */
  firstActivity: number | null;
  /** Model that consumed the most tokens in this session. */
  topModel: string | null;
  /** Number of assistant turns with usage data. */
  turnCount: number;
}

export interface LocalSpendResult {
  today: LocalSpendBucket;
  month: LocalSpendBucket;
  allTime: LocalSpendBucket;
  perModel: LocalModelSpend[];
  /** Top sessions by all-time total tokens, descending. */
  topSessions: SessionSpend[];
  machineName: string;
  parsedFiles: number;
  parsedAt: number;
}

// ── aggregated app state ────────────────────────────────────────────

export interface FetchResult {
  quota: ApiEnvelope<QuotaData> | null;
  dailyUsage: ApiEnvelope<ModelUsageData> | null;
  /** Last 7 days, day-aligned. */
  weeklyUsage: ApiEnvelope<ModelUsageData> | null;
  monthlyUsage: ApiEnvelope<ModelUsageData> | null;
  modelList: ModelInfo[] | null;
  modelGroups: ModelGroup[] | null;
  localSpend: LocalSpendResult | null;
  fetchedAt: number;
  error?: string;
}

export interface Settings {
  apiKey: string;
  baseUrl: string;
  refreshIntervalSec: number;
  localSpendRefreshSec: number;
  warnThreshold: number;
  dangerThreshold: number;
  claudeDir: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: 'https://api.z.ai/api/monitor',
  refreshIntervalSec: 300,
  localSpendRefreshSec: 900,
  warnThreshold: 80,
  dangerThreshold: 90,
  claudeDir: '~/.claude',
};

export type QuotaStatus = 'ok' | 'warn' | 'danger' | 'unknown';

export type TimeRange = { startTime: string; endTime: string };

export const EMPTY_BUCKET: LocalSpendBucket = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens: 0,
};

export function addInto(dst: LocalSpendBucket, src: Partial<LocalSpendBucket>): void {
  dst.inputTokens += src.inputTokens ?? 0;
  dst.outputTokens += src.outputTokens ?? 0;
  dst.cacheReadTokens += src.cacheReadTokens ?? 0;
  dst.cacheCreationTokens += src.cacheCreationTokens ?? 0;
  dst.totalTokens = dst.inputTokens + dst.outputTokens + dst.cacheReadTokens + dst.cacheCreationTokens;
}

export function emptyBucket(): LocalSpendBucket {
  return { ...EMPTY_BUCKET };
}
