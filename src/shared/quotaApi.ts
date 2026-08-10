// Ported from Chrome extension src/lib/api.ts. Uses global fetch (Node 18+).
import type {
  ApiEnvelope,
  ModelInfo,
  ModelProbeResult,
  ModelUsageData,
  QuotaData,
  TimeRange,
} from './types';

export const DEFAULT_BASE_URL = 'https://api.z.ai/api/monitor';

export function anthropicBaseFrom(monitorBase: string): string {
  const base = (monitorBase || '').trim().replace(/\/+$/, '');
  if (base.endsWith('/api/monitor')) return base.slice(0, -'/api/monitor'.length) + '/api/anthropic';
  if (base.endsWith('/monitor')) return base.slice(0, -'/monitor'.length) + '/anthropic';
  return 'https://api.z.ai/api/anthropic';
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`Z.ai API ${status} ${url}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
  }
}

export function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

async function request<T>(
  path: string,
  apiKey: string,
  baseUrl: string,
  query?: Record<string, string>,
): Promise<T> {
  if (!apiKey) throw new ApiError(0, path, 'API key is not set');
  const base = normalizeBaseUrl(baseUrl) || DEFAULT_BASE_URL;
  const url = new URL(base + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, path, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return { data: text } as unknown as T;
  }
}

export interface MonitorClient {
  quota(): Promise<ApiEnvelope<QuotaData>>;
  modelUsage(range: TimeRange): Promise<ApiEnvelope<ModelUsageData>>;
}

export function createClient(apiKey: string, baseUrl: string = DEFAULT_BASE_URL): MonitorClient {
  return {
    quota: () => request<ApiEnvelope<QuotaData>>('/usage/quota/limit', apiKey, baseUrl),
    modelUsage: (range) =>
      request<ApiEnvelope<ModelUsageData>>('/usage/model-usage', apiKey, baseUrl, range),
  };
}

export function unwrap<T>(envelope: ApiEnvelope<T> | null | undefined): T | null {
  if (!envelope) return null;
  if (envelope.data !== undefined) return envelope.data;
  return envelope as unknown as T;
}

export async function testConnection(
  apiKey: string,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<{ ok: boolean; status: number; sample: unknown }> {
  try {
    const r = await createClient(apiKey, baseUrl).quota();
    return { ok: true, status: 200, sample: r };
  } catch (e) {
    const err = e as ApiError;
    return { ok: false, status: err.status ?? 0, sample: err.body };
  }
}

// ── model list + probing ───────────────────────────────────────────

interface ModelsResponse {
  data?: Array<{ id?: string; display_name?: string }>;
}

export async function listModels(
  apiKey: string,
  monitorBase: string = DEFAULT_BASE_URL,
): Promise<ModelInfo[]> {
  const base = anthropicBaseFrom(monitorBase);
  const res = await fetch(`${base}/v1/models`, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, '/v1/models', text);
  const json = JSON.parse(text) as ModelsResponse;
  const out: ModelInfo[] = [];
  for (const m of json.data ?? []) {
    if (m.id) out.push({ id: m.id, displayName: m.display_name ?? m.id });
  }
  return out;
}

const RESET_RE = /reset at\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i;
const CODE_RE = /\[(\d+)\]/;

export async function probeModel(
  modelId: string,
  apiKey: string,
  monitorBase: string = DEFAULT_BASE_URL,
): Promise<ModelProbeResult> {
  const base = anthropicBaseFrom(monitorBase);
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (res.ok) return { model: modelId, ok: true };
    const text = await res.text();
    let message = text;
    let code: number | undefined;
    try {
      const j = JSON.parse(text) as {
        error?: { code?: string | number; message?: string };
        message?: string;
      };
      message = j.error?.message ?? j.message ?? text;
      const c = j.error?.code;
      if (c != null) code = Number(c);
    } catch {
      /* keep raw */
    }
    if (code == null) {
      const m = message.match(CODE_RE);
      if (m) code = Number(m[1]);
    }
    const resetMatch = message.match(RESET_RE);
    return {
      model: modelId,
      ok: false,
      code,
      message: message.slice(0, 300),
      resetTime: resetMatch?.[1],
    };
  } catch (e) {
    return { model: modelId, ok: false, message: (e as Error).message };
  }
}

export async function probeAllModels(
  models: ModelInfo[],
  apiKey: string,
  monitorBase: string = DEFAULT_BASE_URL,
): Promise<ModelProbeResult[]> {
  return Promise.all(models.map((m) => probeModel(m.id, apiKey, monitorBase)));
}
