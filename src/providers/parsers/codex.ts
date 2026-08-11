import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LocalSpendBucket } from '../../shared/types';
import { type ParsedUsage, type SessionParser, type SessionMeta, type ParseContext, normalizeModel } from './types';

function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

interface CodexFileState {
  /** Resolved once we see the session_meta line. */
  model: string | null;
  cwd: string | null;
}

const STATE_KEY = 'codex';

function getState(ctx: ParseContext): CodexFileState {
  let s = ctx.state[STATE_KEY] as CodexFileState | undefined;
  if (!s) {
    s = { model: null, cwd: null };
    ctx.state[STATE_KEY] = s;
  }
  return s;
}

/**
 * Parser for OpenAI Codex CLI session rollouts.
 *
 * Log location: ~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
 *
 * Format:
 *   Line 1 (usually): {"type":"session_meta","payload":{"model":"glm/glm-5",
 *                       "cwd":"/path/to/project", "cli_version": "..."}}
 *   Usage lines: {"type":"event_msg","timestamp":"...",
 *                 "payload":{"type":"token_count",
 *                            "info":{"last_token_usage":{
 *                              "input_tokens": N,
 *                              "cached_input_tokens": N,
 *                              "output_tokens": N,
 *                              "reasoning_output_tokens": N,
 *                              "total_tokens": N}}}}
 *
 * `last_token_usage` is per-turn deltas; `total_token_usage` is cumulative.
 * Subscription plans report only `total_tokens` (others 0) — we fall back to
 * treating total as input tokens so the energy calc still has a number to work with.
 */
export function createCodexParser(): SessionParser {
  const root = expandHome('~/.codex/sessions');

  return {
    id: 'codex',
    label: 'Codex CLI',

    discoverFiles(): string[] {
      const out: string[] = [];
      try {
        for (const year of fs.readdirSync(root)) {
          const yearDir = path.join(root, year);
          if (!fs.statSync(yearDir).isDirectory()) continue;
          for (const month of fs.readdirSync(yearDir)) {
            const monthDir = path.join(yearDir, month);
            if (!fs.statSync(monthDir).isDirectory()) continue;
            for (const day of fs.readdirSync(monthDir)) {
              const dayDir = path.join(monthDir, day);
              if (!fs.statSync(dayDir).isDirectory()) continue;
              for (const entry of fs.readdirSync(dayDir)) {
                if (entry.endsWith('.jsonl')) out.push(path.join(dayDir, entry));
              }
            }
          }
        }
      } catch {
        /* sessions dir missing — Codex CLI not installed */
      }
      return out;
    },

    parseLine(line: string, ctx: ParseContext): ParsedUsage | null {
      // Capture model + cwd opportunistically from any metadata-like line.
      // session_meta has cwd + model_provider; turn_context carries the
      // resolved model. Whichever we see first wins.
      if (
        line.includes('"session_meta"') ||
        line.includes('"turn_context"') ||
        line.includes('"thread_settings_applied"')
      ) {
        try {
          const obj = JSON.parse(line);
          const payload = obj?.payload;
          if (payload && typeof payload === 'object') {
            const s = getState(ctx);
            if (!s.model && typeof payload.model === 'string' && payload.model) {
              s.model = payload.model;
            }
            if (!s.cwd && typeof payload.cwd === 'string' && payload.cwd) {
              s.cwd = payload.cwd;
            }
          }
        } catch {
          /* ignore malformed */
        }
        if (!line.includes('"token_count"')) return null;
      }

      if (!line.includes('"token_count"')) return null;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        return null;
      }
      if (obj?.type !== 'event_msg') return null;
      const payload = obj?.payload;
      if (!payload || payload?.type !== 'token_count') return null;

      const info = payload?.info;
      if (!info || typeof info !== 'object') return null;
      const usage = info.last_token_usage ?? info.total_token_usage;
      if (!usage || typeof usage !== 'object') return null;

      const ts: number | null =
        typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : null;

      const inputTokens = num(usage.input_tokens);
      const outputTokens = num(usage.output_tokens);
      const cachedTokens = num(usage.cached_input_tokens);
      const reasoningTokens = num(usage.reasoning_output_tokens);
      const totalFallback = num(usage.total_tokens);

      const bucket: Partial<LocalSpendBucket> = {
        inputTokens,
        outputTokens,
        cacheReadTokens: cachedTokens,
        cacheCreationTokens: undefined,
      };

      // Subscription plans report only total_tokens; fall back to using it as input.
      const hasDirectional =
        (inputTokens ?? 0) > 0 || (outputTokens ?? 0) > 0 || (cachedTokens ?? 0) > 0;
      if (!hasDirectional && totalFallback != null) {
        bucket.inputTokens = totalFallback;
      }

      // Include reasoning output in the output tally.
      if (reasoningTokens != null && reasoningTokens > 0) {
        bucket.outputTokens = (bucket.outputTokens ?? 0) + reasoningTokens;
      }

      if (
        (bucket.inputTokens ?? 0) === 0 &&
        (bucket.outputTokens ?? 0) === 0 &&
        (bucket.cacheReadTokens ?? 0) === 0
      ) {
        return null;
      }

      return {
        model: normalizeModel(getState(ctx).model),
        ts,
        bucket,
      };
    },

    decodeProject(file: string, ctx: ParseContext): SessionMeta {
      const stem = path.basename(file, '.jsonl');
      const cwd = getState(ctx).cwd;
      return {
        projectSlug: stem,
        projectPath: cwd ?? stem,
      };
    },
  };
}
