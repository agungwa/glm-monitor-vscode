import * as vscode from 'vscode';
import { readSettings, watchSettings } from './providers/config';
import { invalidateCache } from './providers/localSpend';
import { RefreshLoop } from './services/refresh';
import { NotificationService } from './services/notifications';
import { StatusBarManager } from './ui/statusBar';
import { QuotaTreeProvider } from './ui/treeView';
import { WebviewPanelManager } from './ui/webview';
import type { FetchResult } from './shared/types';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  const treeProvider = new QuotaTreeProvider();
  const treeView = vscode.window.createTreeView('glm-monitor.quota', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  const webviewManager = new WebviewPanelManager(context.extensionUri);
  const notifications = new NotificationService();

  let currentSettings = readSettings();
  let latestResult: FetchResult | null = null;

  const loop = new RefreshLoop(
    () => currentSettings,
    (out) => {
      latestResult = out.result;
      statusBar.update(out.result, currentSettings);
      treeProvider.update(out.result, currentSettings);
      webviewManager.update(out.result);
      notifications.evaluate(out.result, currentSettings);
    },
  );

  const settingsWatcher = watchSettings(() => {
    const next = readSettings();
    // If claudeDir moved, drop the local-spend cache so files re-resolve.
    if (next.claudeDir !== currentSettings.claudeDir) invalidateCache();
    currentSettings = next;
    void loop.refreshNow();
  });

  context.subscriptions.push(
    statusBar,
    treeView,
    vscode.commands.registerCommand('glm-monitor.showPanel', () => {
      webviewManager.show(latestResult);
    }),
    vscode.commands.registerCommand('glm-monitor.refresh', () => {
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'GLM Monitor: refreshing…' },
        () => loop.refreshNow().then(() => undefined),
      );
    }),
    vscode.commands.registerCommand('glm-monitor.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'glmMonitor');
    }),
    loop,
    settingsWatcher,
  );

  loop.start();
}

export function deactivate(): void {
  /* subscriptions auto-disposed */
}
