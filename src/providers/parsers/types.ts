import type { LocalSpendBucket } from '../../shared/types';

/** Single usage record extracted from a session log line. */
export interface ParsedUsage {
  /** Normalized model id, e.g. "glm-5.2" (provider prefix stripped). */
  model: string | null;
  /** epoch ms; null if unknown. */
  ts: number | null;
  /** Partial bucket — only fields present in the source format. */
  bucket: Partial<LocalSpendBucket> | null;
}

/** Mutable per-file bag so parsers can carry state across lines (e.g. session model). */
export interface ParseContext {
  filePath: string;
  /** Free-form — parsers can stash whatever they need. */
  state: Record<string, unknown>;
}

/** Per-session metadata handed back to the orchestrator. */
export interface SessionMeta {
  /** Best-effort human-readable project path or CWD. */
  projectPath: string;
  /** Raw identifier (folder slug, file stem) for sorting stability. */
  projectSlug: string;
}

/**
 * A parser knows how to (a) find its own log files and (b) extract usage records
 * from a single line of those files. Add one impl per CLI agent.
 */
export interface SessionParser {
  /** Stable id used as the `source` tag on sessions and per-model rows. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** Discover absolute paths to log files. Empty array if CLI not installed. */
  discoverFiles(): string[];
  /**
   * Parse one JSONL line. May read/write ctx.state to carry data across lines
   * within a single file (e.g. session-level model captured on an early line,
   * applied to usage lines later). Return null if the line has no usage data.
   */
  parseLine(line: string, ctx: ParseContext): ParsedUsage | null;
  /** Decode the session's project path from file path / slug / ctx state. */
  decodeProject(file: string, ctx: ParseContext): SessionMeta;
}

/**
 * Strip a leading provider prefix like "glm/" or "anthropic/" from a model id
 * so the energy-factor lookup matches ("glm/glm-5" → "glm-5").
 */
export function normalizeModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const slash = model.indexOf('/');
  const stripped = slash >= 0 ? model.slice(slash + 1) : model;
  return stripped || model;
}
