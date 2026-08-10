import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { FetchResult } from '../shared/types';

export class WebviewPanelManager {
  private panel: vscode.WebviewPanel | null = null;
  private lastResult: FetchResult | null = null;
  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  show(result: FetchResult | null): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
    } else {
      const distWebview = vscode.Uri.joinPath(this.extensionUri, 'dist-webview');
      this.panel = vscode.window.createWebviewPanel(
        'glmMonitorPanel',
        'GLM Monitor',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [distWebview],
          retainContextWhenHidden: true,
        },
      );
      this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.svg');
      this.panel.webview.html = this.html(this.panel.webview);
      this.panel.onDidDispose(() => {
        this.panel = null;
      });
      this.panel.webview.onDidReceiveMessage((msg) => {
        if (msg?.type === 'refresh') {
          vscode.commands.executeCommand('glm-monitor.refresh');
        }
      });
    }
    if (result) {
      this.lastResult = result;
      void this.panel.webview.postMessage({ type: 'data', result });
    }
  }

  update(result: FetchResult): void {
    this.lastResult = result;
    if (this.panel) void this.panel.webview.postMessage({ type: 'data', result });
  }

  private html(webview: vscode.Webview): string {
    const distWebview = vscode.Uri.joinPath(this.extensionUri, 'dist-webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebview, 'webview.js'));

    // Inline a minimal CSS reset + VSCode theme variables (Tailwind isn't available
    // at HTML time without a separate stylesheet; the React app inlines classes).
    const cssUri = this.findAsset(webview, distWebview, 'assets', 'main.css');

    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GLM Monitor</title>
  ${cssUri ? `<link rel="stylesheet" href="${cssUri}" />` : ''}
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private findAsset(webview: vscode.Webview, distWebview: vscode.Uri, ...segments: string[]): string | null {
    const fsPath = vscode.Uri.joinPath(distWebview, ...segments).fsPath;
    if (fs.existsSync(fsPath)) {
      return webview.asWebviewUri(vscode.Uri.file(fsPath)).toString();
    }
    return null;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Reference path to silence unused-import warning in some bundlers.
void path;
