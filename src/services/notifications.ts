import * as vscode from 'vscode';
import { summarizeQuota } from '../shared/quota';
import { errorCodeLabel } from '../shared/models';
import { formatCountdown } from '../shared/format';
import type { FetchResult, Settings } from '../shared/types';

interface Tracker {
  lastWarn: boolean;
  lastDanger: boolean;
  /** Set of model-group keys already reported as rate-limited. */
  rateLimited: Set<string>;
  consecutiveErrors: number;
  lastErrorNotifiedAt: number;
}

const ERROR_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;

export class NotificationService {
  private t: Tracker = {
    lastWarn: false,
    lastDanger: false,
    rateLimited: new Set(),
    consecutiveErrors: 0,
    lastErrorNotifiedAt: 0,
  };

  /** Call after every refresh. Idempotent: only fires on transitions. */
  evaluate(result: FetchResult, settings: Settings): void {
    if (result.error) {
      this.t.consecutiveErrors++;
      const now = Date.now();
      if (
        this.t.consecutiveErrors >= 3 &&
        now - this.t.lastErrorNotifiedAt > ERROR_NOTIFY_COOLDOWN_MS
      ) {
        vscode.window.showWarningMessage(`GLM Monitor: repeated API errors — ${result.error}`);
        this.t.lastErrorNotifiedAt = now;
      }
      return;
    }
    this.t.consecutiveErrors = 0;

    const summary = summarizeQuota(result.quota?.data);
    const pct = summary.tokensPct ?? summary.timePct;
    if (pct == null) return;

    const danger = pct >= settings.dangerThreshold;
    const warn = !danger && pct >= settings.warnThreshold;

    if (danger && !this.t.lastDanger) {
      vscode.window
        .showWarningMessage(
          `GLM quota at ${pct.toFixed(0)}% — over the danger threshold (${settings.dangerThreshold}%).`,
          'Show Panel',
        )
        .then((choice) => {
          if (choice === 'Show Panel') void vscode.commands.executeCommand('glm-monitor.showPanel');
        });
    } else if (warn && !this.t.lastWarn && !this.t.lastDanger) {
      vscode.window.showInformationMessage(
        `GLM quota at ${pct.toFixed(0)}% — approaching the limit.`,
      );
    }
    this.t.lastWarn = warn;
    this.t.lastDanger = danger;

    // Rate-limit detection: any new fail group with code 1308.
    if (result.modelGroups) {
      for (const group of result.modelGroups) {
        if (group.status !== 'fail') continue;
        if (group.code !== 1308) continue;
        if (this.t.rateLimited.has(group.key)) continue;
        this.t.rateLimited.add(group.key);
        const resetTs = group.resetTime ? Date.parse(group.resetTime) : NaN;
        const when = Number.isFinite(resetTs) ? formatCountdown(resetTs) : 'soon';
        vscode.window.showWarningMessage(
          `GLM models [${group.models.join(', ')}] rate-limited (${errorCodeLabel(group.code)}) — resets ${when}. Use /model to switch.`,
        );
      }
    }

    // Clear rate-limit flags for groups that have recovered.
    const stillRateLimited = new Set(
      (result.modelGroups ?? [])
        .filter((g) => g.status === 'fail' && g.code === 1308)
        .map((g) => g.key),
    );
    for (const key of [...this.t.rateLimited]) {
      if (!stillRateLimited.has(key)) this.t.rateLimited.delete(key);
    }
  }

  reset(): void {
    this.t = {
      lastWarn: false,
      lastDanger: false,
      rateLimited: new Set(),
      consecutiveErrors: 0,
      lastErrorNotifiedAt: 0,
    };
  }
}
