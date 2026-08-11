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
  type ParsedSourceSummary,
  type SessionSpend,
} from '../shared/types';
import { type ParseContext, type ParsedUsage, type SessionParser } from './parsers/types';
import { createClaudeCodeParser } from './parsers/claudeCode';
import { createCodexParser } from './parsers/codex';

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
  /** True if any line yielded usage — used to count "active" files. */
  hasUsage: boolean;
}

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  result: FileParseResult;
}

const fileCache = new Map<string, FileCacheEntry>();

/** Cap on top-N sessions kept (avoids unbounded sort cost). */
const TOP_SESSIONS_LIMIT = 20;

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

function totalOf(b: Partial<LocalSpendBucket>): number {
  return (
    (b.inputTokens ?? 0) +
    (b.outputTokens ?? 0) +
    (b.cacheReadTokens ?? 0) +
    (b.cacheCreationTokens ?? 0)
  );
}

function addTo(dst: ModelAccumulator, src: Partial<LocalSpendBucket>, ts: number | null): void {
  if (ts != null && ts >= startOfDay()) addInto(dst.today, src);
  if (ts != null && ts >= startOfMonth()) addInto(dst.month, src);
  addInto(dst.allTime, src);
}

/**
 * Build the active parser list. Each parser is responsible for discovering its
 * own log files and knowing its own line format. To support another CLI agent,
 * add a parser in ./parsers/ and append it here.
 */
function buildParsers(claudeDir: string): SessionParser[] {
  return [createClaudeCodeParser(claudeDir), createCodexParser()];
}

async function parseFile(
  filePath: string,
  parser: SessionParser,
): Promise<FileParseResult> {
  const byModel = new Map<string, ModelAccumulator>();
  const session = emptySession();
  const ctx: ParseContext = { filePath, state: {} };
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let hasUsage = false;

  for await (const line of rl) {
    if (!line) continue;
    const parsed: ParsedUsage | null = parser.parseLine(line, ctx);
    if (!parsed || !parsed.bucket) continue;
    hasUsage = true;

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

  return { byModel, session: session.turnCount > 0 ? session : null, hasUsage };
}

export async function getLocalSpend(claudeDir: string): Promise<LocalSpendResult> {
  const parsers = buildParsers(claudeDir);

  const today = emptyBucket();
  const month = emptyBucket();
  const allTime = emptyBucket();
  // Keyed by `${source}::${model}` so models with the same name across
  // different CLIs are kept distinct in the per-model breakdown.
  const perModel = new Map<string, ModelAccumulator & { model: string; source: string }>();
  const sessions: SessionSpend[] = [];
  const sources: ParsedSourceSummary[] = [];

  let parsedFiles = 0;

  for (const parser of parsers) {
    let files: string[] = [];
    try {
      files = parser.discoverFiles();
    } catch {
      files = [];
    }

    let sourceFiles = 0;
    let sourceTokens = 0;

    for (const file of files) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }

      let fileResult: FileParseResult;
      const cacheKey = `${parser.id}::${file}`;
      const cached = fileCache.get(cacheKey);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        fileResult = cached.result;
      } else {
        try {
          fileResult = await parseFile(file, parser);
        } catch {
          continue;
        }
        fileCache.set(cacheKey, {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          result: fileResult,
        });
      }

      // Count every scanned file (matches the Chrome extension's UX).
      parsedFiles++;
      sourceFiles++;

      for (const [model, acc] of fileResult.byModel) {
        addInto(today, acc.today);
        addInto(month, acc.month);
        addInto(allTime, acc.allTime);
        sourceTokens += acc.allTime.totalTokens;

        const key = `${parser.id}::${model}`;
        let dst = perModel.get(key);
        if (!dst) {
          dst = { ...emptyAccumulator(), model, source: parser.id };
          perModel.set(key, dst);
        }
        addInto(dst.today, acc.today);
        addInto(dst.month, acc.month);
        addInto(dst.allTime, acc.allTime);
      }

      if (fileResult.session) {
        const sessionId = path.basename(file, '.jsonl');
        const ctx: ParseContext = { filePath: file, state: {} };
        const meta = parser.decodeProject(file, ctx);
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
          source: parser.id,
          projectSlug: meta.projectSlug,
          projectPath: meta.projectPath,
          allTime: fileResult.session.bucket,
          firstActivity: fileResult.session.firstTs,
          lastActivity: fileResult.session.lastTs,
          topModel,
          turnCount: fileResult.session.turnCount,
        });
      }
    }

    sources.push({
      id: parser.id,
      label: parser.label,
      files: sourceFiles,
      totalTokens: sourceTokens,
    });
  }

  const modelList: LocalModelSpend[] = [...perModel.values()]
    .sort((a, b) => b.allTime.totalTokens - a.allTime.totalTokens);

  sessions.sort((a, b) => b.allTime.totalTokens - a.allTime.totalTokens);
  const topSessions = sessions.slice(0, TOP_SESSIONS_LIMIT);

  return {
    today,
    month,
    allTime,
    perModel: modelList,
    topSessions,
    sources,
    machineName: os.hostname(),
    parsedFiles,
    parsedAt: Date.now(),
  };
}

export function invalidateCache(): void {
  fileCache.clear();
}
