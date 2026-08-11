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

/**
 * Decode a Claude-Code project folder slug back into a best-guess path.
 * e.g. "-Users-mymac--claude" -> "/Users/mymac/.claude".
 */
function decodeProjectSlug(slug: string): string {
  if (!slug) return slug;
  let s = slug.replace(/^-+/, '');
  s = s.replace(/-/g, '/');
  s = s.replace(/\/{2,}/g, (m) => '/.' + m.slice(1).replace(/\//g, ''));
  return '/' + s;
}

export function createClaudeCodeParser(claudeDir: string): SessionParser {
  const root = expandHome(claudeDir);
  return {
    id: 'claude-code',
    label: 'Claude Code',

    discoverFiles(): string[] {
      const projectsDir = path.join(root, 'projects');
      const files: string[] = [];
      try {
        for (const project of fs.readdirSync(projectsDir)) {
          const projectPath = path.join(projectsDir, project);
          let stat: fs.Stats;
          try {
            stat = fs.statSync(projectPath);
          } catch {
            continue;
          }
          if (!stat.isDirectory()) continue;
          for (const entry of fs.readdirSync(projectPath)) {
            if (entry.endsWith('.jsonl')) files.push(path.join(projectPath, entry));
          }
        }
      } catch {
        /* projects dir missing — no local data yet */
      }
      return files;
    },

    parseLine(line: string, _ctx: ParseContext): ParsedUsage | null {
      if (!line.includes('"usage"')) return null;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        return null;
      }
      const msg = obj?.message;
      if (!msg || typeof msg !== 'object') return null;
      const usage = msg.usage;
      if (!usage || typeof usage !== 'object') return null;

      const ts: number | null =
        typeof obj.timestamp === 'number'
          ? obj.timestamp
          : typeof obj.timestamp === 'string'
            ? Date.parse(obj.timestamp)
            : null;

      const bucket: Partial<LocalSpendBucket> = {
        inputTokens: num(usage.input_tokens),
        outputTokens: num(usage.output_tokens),
        cacheReadTokens: num(usage.cache_read_input_tokens),
        cacheCreationTokens: num(usage.cache_creation_input_tokens),
      };
      if (
        bucket.inputTokens == null &&
        bucket.outputTokens == null &&
        bucket.cacheReadTokens == null &&
        bucket.cacheCreationTokens == null
      ) {
        return null;
      }

      return {
        model: normalizeModel(typeof msg.model === 'string' ? msg.model : null),
        ts,
        bucket,
      };
    },

    decodeProject(file: string, _ctx: ParseContext): SessionMeta {
      const projectSlug = path.basename(path.dirname(file));
      return {
        projectSlug,
        projectPath: decodeProjectSlug(projectSlug),
      };
    },
  };
}
