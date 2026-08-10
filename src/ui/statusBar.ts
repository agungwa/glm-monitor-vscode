import * as vscode from 'vscode';
import { summarizeQuota, evaluateQuota } from '../shared/quota';
import { formatCountdown } from '../shared/format';
import type { FetchResult, Settings } from '../shared/types';

export class StatusBarManager {
  readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'glm-monitor.showPanel';
    this.item.text = 'GLM: …';
    this.item.tooltip = 'GLM Monitor — fetching…';
    this.item.show();
  }

  update(result: FetchResult, settings: Settings): void {
    if (result.error && !result.quota) {
      this.item.text = `GLM: ⚠ error`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.item.tooltip = `GLM Monitor error: ${result.error}\nClick to open the panel.`;
      return;
    }

    const summary = summarizeQuota(result.quota?.data);
    const pct = summary.tokensPct ?? summary.timePct;
    const status = evaluateQuota(pct, settings);

    // Find a headline model status from the model groups.
    let modelSuffix = '';
    if (result.modelGroups && result.modelGroups.length > 0) {
      const fail = result.modelGroups.find((g) => g.status === 'fail' && g.code === 1308);
      if (fail) {
        const shortName = (fail.models[0] ?? '').replace(/^glm-/i, '');
        modelSuffix = ` • ${shortName} 1308`;
      } else if (result.modelGroups[0].status === 'ok') {
        const okModel = result.modelGroups[0].models[0] ?? '';
        const shortName = okModel.replace(/^glm-/i, '');
        modelSuffix = ` • ${shortName} ok`;
      }
    }

    const pctText = pct == null ? '—' : `${pct.toFixed(0)}%`;
    this.item.text = `GLM: ${pctText}${modelSuffix}`;

    if (status === 'danger') {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (status === 'warn') {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    const resetLine =
      summary.tokensNextReset != null
        ? `\nToken quota resets ${formatCountdown(summary.tokensNextReset)}`
        : '';
    this.item.tooltip = `GLM Monitor\nTokens: ${pctText}${resetLine}\nClick to open the panel.`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
