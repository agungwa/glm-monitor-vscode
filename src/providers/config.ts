import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const SECTION = 'glmMonitor';

function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Parse ~/.claude/settings.json if present; returns {} on any failure. */
function readClaudeSettings(claudeDir: string): Record<string, unknown> {
  try {
    const file = path.join(expandHome(claudeDir), 'settings.json');
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readApiKey(claudeDir: string): string {
  const claude = readClaudeSettings(claudeDir);
  const env = (claude.env as Record<string, unknown> | undefined) ?? {};
  const fromClaude =
    (env.ANTHROPIC_AUTH_TOKEN as string | undefined) ??
    (env.ANTHROPIC_API_KEY as string | undefined) ??
    '';
  if (fromClaude) return fromClaude;
  return vscode.workspace.getConfiguration(SECTION).get<string>('apiKey', '');
}

export function readSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const claudeDir = cfg.get<string>('claudeDir', DEFAULT_SETTINGS.claudeDir);
  return {
    apiKey: readApiKey(claudeDir),
    baseUrl: cfg.get<string>('baseUrl', DEFAULT_SETTINGS.baseUrl),
    refreshIntervalSec: cfg.get<number>('refreshIntervalSec', DEFAULT_SETTINGS.refreshIntervalSec),
    localSpendRefreshSec: cfg.get<number>(
      'localSpendRefreshSec',
      DEFAULT_SETTINGS.localSpendRefreshSec,
    ),
    warnThreshold: cfg.get<number>('warnThreshold', DEFAULT_SETTINGS.warnThreshold),
    dangerThreshold: cfg.get<number>('dangerThreshold', DEFAULT_SETTINGS.dangerThreshold),
    claudeDir,
  };
}

/**
 * Watch both VSCode setting changes and the Claude settings.json file so a
 * key rotation or threshold tweak is picked up without reloading the window.
 */
export function watchSettings(cb: () => void): vscode.Disposable {
  const subs: vscode.Disposable[] = [];

  subs.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) cb();
  }));

  try {
    const claudeDir = vscode.workspace.getConfiguration(SECTION).get<string>(
      'claudeDir',
      DEFAULT_SETTINGS.claudeDir,
    );
    const file = path.join(expandHome(claudeDir), 'settings.json');
    if (fs.existsSync(file)) {
      const watcher = fs.watch(file, () => cb());
      subs.push(new vscode.Disposable(() => watcher.close()));
    }
  } catch {
    /* ignore */
  }

  return vscode.Disposable.from(...subs);
}
