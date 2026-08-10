import * as vscode from 'vscode';
import {
  createClient,
  listModels,
  probeAllModels,
} from '../shared/quotaApi';
import { dayRange, monthRange, weekRange } from '../shared/time';
import { groupProbeResults } from '../shared/models';
import type { ApiEnvelope, FetchResult, ModelUsageData, QuotaData, Settings } from '../shared/types';
import { getLocalSpend } from '../providers/localSpend';

export interface RefreshOutput {
  result: FetchResult;
  ok: boolean;
  error?: string;
}

/**
 * One-shot fetch of all live data + local spend. Stateless — callers manage
 * cadence. Never throws: failures land in `result.error`.
 */
export async function refreshAll(settings: Settings): Promise<RefreshOutput> {
  const out: FetchResult = {
    quota: null,
    dailyUsage: null,
    weeklyUsage: null,
    monthlyUsage: null,
    modelList: null,
    modelGroups: null,
    localSpend: null,
    fetchedAt: Date.now(),
  };

  let error: string | undefined;

  // Network calls run in parallel; local spend is independent and never fails the request.
  try {
    const client = createClient(settings.apiKey, settings.baseUrl);
    const [quota, dailyUsage, weeklyUsage, monthlyUsage] = await Promise.all([
      client.quota(),
      client.modelUsage(dayRange()).catch((e) => {
        error = errMsg(e);
        return null as unknown as ApiEnvelope<ModelUsageData>;
      }),
      client.modelUsage(weekRange()).catch(() => null as unknown as ApiEnvelope<ModelUsageData>),
      client.modelUsage(monthRange()).catch(() => null as unknown as ApiEnvelope<ModelUsageData>),
    ]);
    out.quota = quota;
    out.dailyUsage = dailyUsage;
    out.weeklyUsage = weeklyUsage;
    out.monthlyUsage = monthlyUsage;
  } catch (e) {
    error = errMsg(e);
  }

  // Model list + probes: skip if no key (saves a round trip on first run).
  if (settings.apiKey) {
    try {
      const models = await listModels(settings.apiKey, settings.baseUrl);
      out.modelList = models;
      const probes = await probeAllModels(models, settings.apiKey, settings.baseUrl);
      out.modelGroups = groupProbeResults(probes);
    } catch (e) {
      error = error ?? errMsg(e);
    }
  }

  // Local spend never throws the whole refresh.
  try {
    out.localSpend = await getLocalSpend(settings.claudeDir);
  } catch (e) {
    /* local-spend failures are silent */
  }

  out.error = error;
  return { result: out, ok: !error, error };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Periodic refresh loop with independent cadences for quota vs local spend.
 * The onResult callback fires after every cycle.
 */
export class RefreshLoop {
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<RefreshOutput> | null = null;

  constructor(
    private readonly getSettings: () => Settings,
    private readonly onResult: (out: RefreshOutput) => void,
  ) {}

  start(): void {
    if (this.timer) return;
    const tick = async () => {
      this.inflight = refreshAll(this.getSettings());
      try {
        this.onResult(await this.inflight);
      } finally {
        this.inflight = null;
      }
    };
    // Fire immediately, then on the configured cadence.
    void tick();
    const settings = this.getSettings();
    const intervalMs = Math.max(30, settings.refreshIntervalSec) * 1000;
    this.timer = setInterval(() => void tick(), intervalMs);
  }

  async refreshNow(): Promise<RefreshOutput> {
    if (this.inflight) return this.inflight;
    const out = await refreshAll(this.getSettings());
    this.onResult(out);
    return out;
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export interface RefreshCommandMarker {}
