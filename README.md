# GLM Monitor for VSCode

[![Build](https://github.com/agungwa/glm-monitor-vscode/actions/workflows/build.yml/badge.svg)](https://github.com/agungwa/glm-monitor-vscode/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VSCode](https://img.shields.io/badge/VSCode-1.85+-007ACC.svg)](https://code.visualstudio.com/)

> Live Z.ai GLM quota, rate-limit status, and local Claude Code token spend — visible across every machine where you've configured Claude Code.

## Features

- **Status bar** — compact live indicator: `GLM: 73% • 5.2 ok`
- **Sidebar TreeView** — quota limits, per-model usage, top sessions, model availability
- **Webview panel** with charts:
  - Live token + rate-window quota
  - Usage over time — **Today / 7 days / This month / Per-model** tabs
  - Local spend (this machine) — today / month / all-time per model
  - **Highest-token sessions** — top 20 sessions by total spend
  - Model availability groups (with 1308 rate-limit detection)
- **Notifications** — fires once when quota crosses warn/danger threshold or a model hits the 5-hour rate-limit window

## Zero-config

Reads the API key from `~/.claude/settings.json` (`env.ANTHROPIC_AUTH_TOKEN`). If you already use Claude Code with GLM, it just works — no settings dialog, no key paste.

## Cross-machine

The Z.ai quota is account-wide, so every machine sees the same live numbers. The extension also parses `~/.claude/projects/*/*.jsonl` locally on each machine to surface that machine's own session-level token spend — no shared backend needed.

## Install

### Option A — Download the prebuilt .vsix (easiest)

Grab the latest release artifact and install:

```bash
gh release download --repo agungwa/glm-monitor-vscode --pattern '*.vsix'
code --install-extension glm-monitor-vscode-*.vsix
```

Then reload VSCode (`Cmd/Ctrl+Shift+P` → `Developer: Reload Window`).

### Option B — Build from source

```bash
git clone https://github.com/agungwa/glm-monitor-vscode.git
cd glm-monitor-vscode
npm install && npm run build
npm run package          # produces glm-monitor-vscode-0.1.0.vsix
code --install-extension glm-monitor-vscode-0.1.0.vsix
```

## Releasing a new version

CI auto-builds on every push to `master`. To cut a release:

```bash
# bump version in package.json first
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow will build the `.vsix` and attach it to a GitHub Release automatically.

## Commands

- `GLM Monitor: Show Panel` — open the webview charts
- `GLM Monitor: Refresh Now` — force a refresh
- `GLM Monitor: Open Settings` — adjust thresholds / refresh cadence

## Settings

| Setting | Default | Description |
|---|---|---|
| `glmMonitor.refreshIntervalSec` | `300` | Seconds between live Z.ai quota refreshes |
| `glmMonitor.localSpendRefreshSec` | `900` | Seconds between local session-spend re-parses |
| `glmMonitor.warnThreshold` | `80` | Percentage that turns the indicator yellow |
| `glmMonitor.dangerThreshold` | `90` | Percentage that turns the indicator red |
| `glmMonitor.apiKey` | `""` | Optional override (otherwise read from `~/.claude/settings.json`) |
| `glmMonitor.baseUrl` | `https://api.z.ai/api/monitor` | Z.ai monitor API base URL |
| `glmMonitor.claudeDir` | `~/.claude` | Claude Code config dir (for API key + session logs) |

## Development

```bash
npm install
npm run build            # build extension + webview
npm run watch:extension  # rebuild on save
```

Press `F5` in VSCode to launch an Extension Development Host with the extension loaded.

## Tech

- TypeScript + esbuild (extension host)
- React + Vite + Recharts + Tailwind (webview)
- Native `fetch` to Z.ai's `/api/monitor` + Anthropic-compatible `/api/anthropic` endpoints
- Streams `~/.claude/projects/<slug>/<sessionId>.jsonl` with mtime-based caching

## License

[MIT](./LICENSE) © agungwa
