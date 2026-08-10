import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import {
  addInto,
  emptyBucket,
  type LocalSpendBucket,
  type LocalSpendResult,
  type LocalModelSpend,
  type SessionSpend,
} from '../shared/types';

interface ModelAccumulator {
  today: LocalSpendBucket;
  month: LocalSpendBucket;
  allTime: LocalSpendBucket;
}

interface SessionAccumulator {
  bucket: LocalSpendBucket;
  firstTs: number | null;
  lastTs: number | null;
  turnCount: number;
  /** Per-model totals within this single session file. */
  perModel: Map<string, number>;
}

interface FileParseResult {
  byModel: Map<string, ModelAccumulator>;
  session: SessionAccumulator | null;
}

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  result: FileParseResult;
}

const fileCache = new Map<string, FileCacheEntry>();

/** Cap on top-N sessions kept (avoids unbounded sort cost). */
const TOP_SESSIONS_LIMIT = 20;

function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function startOfDay(d = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function startOfMonth(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function emptyAccumulator(): ModelAccumulator {
  return { today: emptyBucket(), month: emptyBucket(), allTime: emptyBucket() };
}

function emptySession(): SessionAccumulator {
  return {
    bucket: emptyBucket(),
    firstTs: null,
    lastTs: null,
    turnCount: 0,
    perModel: new Map(),
  };
}

interface ParsedUsage {
  model: string | null;
  ts: number | null;
  bucket: Partial<LocalSpendBucket> | null;
}

function extractUsage(line: string): ParsedUsage | null {
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

  return { model: typeof msg.model === 'string' ? msg.model : null, ts, bucket };
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function addTo(dst: ModelAccumulator, src: Partial<LocalSpendBucket>, ts: number | null): void {
  if (ts != null && ts >= startOfDay()) addInto(dst.today, src);
  if (ts != null && ts >= startOfMonth()) addInto(dst.month, src);
  addInto(dst.allTime, src);
}

/**
 * Decode a Claude-Code project folder slug back into a best-guess path.
 * e.g. "-Users-mymac--claude" -> "/Users/mymac/.claude".
 * Lossy: the original encoding maps both "/" and "." to "-", so we heuristically
 * collapse "//"-style runs. Callers should also keep the raw slug as a fallback.
 */
export function decodeProjectSlug(slug: string): string {
  if (!slug) return slug;
  // Strip a leading dash (the leading "/"), then replace dashes with slashes.
  let s = slug.replace(/^-+/, '');
  s = s.replace(/-/g, '/');
  // A double-slash in the result implies the original had a "." there (since
  // "/foo/.bar" encodes to "-foo--bar" → decodes to "/foo//bar").
  s = s.replace(/\/{2,}/g, (m) => '/.' + m.slice(1).replace(/\//g, ''));
  return '/' + s;
}

async function parseFile(filePath: string): Promise<FileParseResult> {
  const byModel = new Map<string, ModelAccumulator>();
  const session = emptySession();
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    if (!line.includes('"usage"')) continue;
    const parsed = extractUsage(line);
    if (!parsed || !parsed.bucket) continue;

    // Per-session totals (across all models in this file).
    addInto(session.bucket, parsed.bucket);
    session.turnCount++;
    if (parsed.ts != null) {
      if (session.firstTs == null || parsed.ts < session.firstTs) session.firstTs = parsed.ts;
      if (session.lastTs == null || parsed.ts > session.lastTs) session.lastTs = parsed.ts;
    }
    if (parsed.model) {
      const modelTotal = (session.perModel.get(parsed.model) ?? 0) + totalOf(parsed.bucket);
      session.perModel.set(parsed.model, modelTotal);
    }

    if (!parsed.model) continue;
    let acc = byModel.get(parsed.model);
    if (!acc) {
      acc = emptyAccumulator();
      byModel.set(parsed.model, acc);
    }
    addTo(acc, parsed.bucket, parsed.ts);
  }

  return { byModel, session: session.turnCount > 0 ? session : null };
}

function totalOf(b: Partial<LocalSpendBucket>): number {
  return (
    (b.inputTokens ?? 0) +
    (b.outputTokens ?? 0) +
    (b.cacheReadTokens ?? 0) +
    (b.cacheCreationTokens ?? 0)
  );
}

function listSessionFiles(claudeDir: string): string[] {
  const projectsDir = path.join(expandHome(claudeDir), 'projects');
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
}

export async function getLocalSpend(claudeDir: string): Promise<LocalSpendResult> {
  const files = listSessionFiles(claudeDir);
  const today = emptyBucket();
  const month = emptyBucket();
  const allTime = emptyBucket();
  const perModel = new Map<string, ModelAccumulator>();
  const sessions: SessionSpend[] = [];

  let parsedFiles = 0;
  for (const file of files) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }

    let fileResult: FileParseResult;
    const cached = fileCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      fileResult = cached.result;
    } else {
      try {
        fileResult = await parseFile(file);
      } catch {
        continue;
      }
      fileCache.set(file, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        result: fileResult,
      });
    }

    parsedFiles++;

    for (const [model, acc] of fileResult.byModel) {
      addInto(today, acc.today);
      addInto(month, acc.month);
      addInto(allTime, acc.allTime);
      let dst = perModel.get(model);
      if (!dst) {
        dst = emptyAccumulator();
        perModel.set(model, dst);
      }
      addInto(dst.today, acc.today);
      addInto(dst.month, acc.month);
      addInto(dst.allTime, acc.allTime);
    }

    if (fileResult.session) {
      const sessionId = path.basename(file, '.jsonl');
      const projectSlug = path.basename(path.dirname(file));
      // Find the top model within the session by tokens.
      let topModel: string | null = null;
      let topModelTokens = -1;
      for (const [m, t] of fileResult.session.perModel) {
        if (t > topModelTokens) {
          topModelTokens = t;
          topModel = m;
        }
      }
      sessions.push({
        sessionId,
        projectSlug,
        projectPath: decodeProjectSlug(projectSlug),
        allTime: fileResult.session.bucket,
        firstActivity: fileResult.session.firstTs,
        lastActivity: fileResult.session.lastTs,
        topModel,
        turnCount: fileResult.session.turnCount,
      });
    }
  }

  const modelList: LocalModelSpend[] = [...perModel.entries()]
    .map(([model, acc]) => ({ model, ...acc }))
    .sort((a, b) => b.allTime.totalTokens - a.allTime.totalTokens);

  sessions.sort((a, b) => b.allTime.totalTokens - a.allTime.totalTokens);
  const topSessions = sessions.slice(0, TOP_SESSIONS_LIMIT);

  return {
    today,
    month,
    allTime,
    perModel: modelList,
    topSessions,
    machineName: os.hostname(),
    parsedFiles,
    parsedAt: Date.now(),
  };
}

export function invalidateCache(): void {
  fileCache.clear();
}
