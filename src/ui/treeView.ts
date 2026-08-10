import * as vscode from 'vscode';
import { summarizeQuota } from '../shared/quota';
import { formatCountdown, formatNumber, formatPercent, formatRelativeTime } from '../shared/format';
import { errorCodeLabel } from '../shared/models';
import type { FetchResult, LocalSpendBucket, QuotaLimitItem, Settings } from '../shared/types';

type NodeKind =
  | { type: 'root'; label: string; tooltip: string; collapsible: vscode.TreeItemCollapsibleState }
  | { type: 'quota'; item: QuotaLimitItem }
  | { type: 'spend-bucket'; label: string; bucket: LocalSpendBucket }
  | { type: 'model-spend'; model: string; bucket: LocalSpendBucket; range: 'today' | 'month' | 'allTime' }
  | { type: 'group'; key: string; status: 'ok' | 'fail'; models: string[]; code?: number; resetTime?: string }
  | { type: 'info'; label: string; tooltip?: string };

class TreeNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    tooltip?: string,
    iconPath?: vscode.ThemeIcon,
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
    this.iconPath = iconPath;
    this.contextValue = typeof kind === 'object' ? kind.type : kind;
  }
}

export class QuotaTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  private current: FetchResult | null = null;
  private settings: Settings | null = null;

  update(result: FetchResult, settings: Settings): void {
    this.current = result;
    this.settings = settings;
    this.emitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): TreeNode {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.current || !this.settings) return [];
    if (!element) return this.roots();
    return this.childrenOf(element.kind);
  }

  private roots(): TreeNode[] {
    const cur = this.current!;
    return [
      new TreeNode(
        { type: 'root', label: 'Live quota', tooltip: 'Z.ai account quota', collapsible: vscode.TreeItemCollapsibleState.Expanded },
        'Live quota',
        vscode.TreeItemCollapsibleState.Expanded,
        'Z.ai account quota',
        new vscode.ThemeIcon('dashboard'),
      ),
      new TreeNode(
        { type: 'root', label: 'Local spend', tooltip: `This machine (${cur.localSpend?.machineName ?? '?'})`, collapsible: vscode.TreeItemCollapsibleState.Expanded },
        `Local spend (${cur.localSpend?.machineName ?? 'this machine'})`,
        vscode.TreeItemCollapsibleState.Expanded,
        `Parsed from ~/.claude/projects/{project}/{file}.jsonl at ${formatRelativeTime(cur.localSpend?.parsedAt)}`,
        new vscode.ThemeIcon('server'),
      ),
      new TreeNode(
        { type: 'root', label: 'Model availability', tooltip: 'Per-model probe results', collapsible: vscode.TreeItemCollapsibleState.Collapsed },
        'Model availability',
        vscode.TreeItemCollapsibleState.Collapsed,
        'From probing each model with a 1-token request',
        new vscode.ThemeIcon('symbol-event'),
      ),
    ];
  }

  private childrenOf(kind: NodeKind): TreeNode[] {
    if (typeof kind === 'object') {
      switch (kind.type) {
        case 'root':
          if (kind.label === 'Live quota') return this.quotaChildren();
          if (kind.label === 'Local spend') return this.spendChildren();
          if (kind.label === 'Model availability') return this.groupChildren();
          return [];
        case 'quota':
          return [];
        case 'spend-bucket':
          return this.spendBucketChildren(kind.bucket);
        case 'model-spend':
          return [];
        case 'group':
          return kind.models.map((m) =>
            this.leaf(m, `model ${m}`, new vscode.ThemeIcon('chevron-right')),
          );
        case 'info':
          return [];
      }
    }
    return [];
  }

  private quotaChildren(): TreeNode[] {
    const data = this.current?.quota?.data;
    if (!data?.limits?.length) {
      return [this.leaf('No quota data', 'API error or unset key', new vscode.ThemeIcon('warning'))];
    }
    const summary = summarizeQuota(data);
    const items = data.limits.map((item) => {
      const reset = item.nextResetTime ? ` • resets ${formatCountdown(item.nextResetTime)}` : '';
      const pct = formatPercent(item.percentage);
      const label =
        item.type === 'TIME_LIMIT'
          ? `Rate window ${pct}${reset}`
          : `Token quota ${pct}${reset}`;
      const tooltip = new vscode.MarkdownString(
        [
          `**${item.type}**`,
          `Percentage: ${pct}`,
          item.remaining != null ? `Remaining: ${formatNumber(item.remaining)}` : '',
          item.currentValue != null ? `Current: ${formatNumber(item.currentValue)} / ${formatNumber(item.usage)}` : '',
          item.nextResetTime ? `Reset at ${new Date(item.nextResetTime).toLocaleString()}` : '',
          (item.usageDetails ?? [])
            .map((d) => `- ${d.modelCode}: ${formatNumber(d.usage)}`)
            .join('\n'),
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
      const icon =
        (item.percentage ?? 0) >= (this.settings!.dangerThreshold)
          ? new vscode.ThemeIcon('error')
          : (item.percentage ?? 0) >= (this.settings!.warnThreshold)
            ? new vscode.ThemeIcon('warning')
            : new vscode.ThemeIcon('check');
      return new TreeNode({ type: 'quota', item }, label, vscode.TreeItemCollapsibleState.None, undefined, icon);
    });
    items.push(
      this.leaf(
        `Account tier: ${summary.level ?? '—'}`,
        `Z.ai account level`,
        new vscode.ThemeIcon('shield'),
      ),
    );
    return items;
  }

  private spendChildren(): TreeNode[] {
    const spend = this.current?.localSpend;
    if (!spend) return [this.leaf('No local data', 'Run Claude Code to populate ~/.claude/projects', new vscode.ThemeIcon('info'))];
    return [
      this.spendBucketNode('Today', spend.today),
      this.spendBucketNode('This month', spend.month),
      this.spendBucketNode('All time', spend.allTime),
      ...spend.perModel.map((m) =>
        new TreeNode(
          { type: 'model-spend', model: m.model, bucket: m.allTime, range: 'allTime' },
          `${m.model} — ${formatNumber(m.allTime.totalTokens)} (all-time)`,
          vscode.TreeItemCollapsibleState.None,
          `Today: ${formatNumber(m.today.totalTokens)}\nMonth: ${formatNumber(m.month.totalTokens)}\nAll time: ${formatNumber(m.allTime.totalTokens)}`,
          new vscode.ThemeIcon('graph'),
        ),
      ),
      ...spend.topSessions.slice(0, 10).map((s, i) =>
        new TreeNode(
          { type: 'info', label: `session-${s.sessionId.slice(0, 8)}`, tooltip: s.projectPath },
          `#${i + 1} ${formatNumber(s.allTime.totalTokens)} tok — ${s.topModel ?? '?'}`,
          vscode.TreeItemCollapsibleState.None,
          `${s.projectPath}\n${s.turnCount} turns · last ${formatRelativeTime(s.lastActivity)}\nsession ${s.sessionId}`,
          new vscode.ThemeIcon('history'),
        ),
      ),
      this.leaf(
        `${spend.parsedFiles} file(s) • ${spend.machineName}`,
        `Parsed at ${new Date(spend.parsedAt).toLocaleString()}`,
        new vscode.ThemeIcon('info'),
      ),
    ];
  }

  private spendBucketNode(label: string, bucket: LocalSpendBucket): TreeNode {
    return new TreeNode(
      { type: 'spend-bucket', label, bucket },
      `${label}: ${formatNumber(bucket.totalTokens)}`,
      vscode.TreeItemCollapsibleState.Collapsed,
      `Input: ${formatNumber(bucket.inputTokens)}\nOutput: ${formatNumber(bucket.outputTokens)}\nCache read: ${formatNumber(bucket.cacheReadTokens)}\nCache create: ${formatNumber(bucket.cacheCreationTokens)}`,
      new vscode.ThemeIcon('database'),
    );
  }

  private spendBucketChildren(bucket: LocalSpendBucket): TreeNode[] {
    return [
      this.leaf(`Input: ${formatNumber(bucket.inputTokens)}`, undefined, new vscode.ThemeIcon('arrow-down')),
      this.leaf(`Output: ${formatNumber(bucket.outputTokens)}`, undefined, new vscode.ThemeIcon('arrow-up')),
      this.leaf(`Cache read: ${formatNumber(bucket.cacheReadTokens)}`, undefined, new vscode.ThemeIcon('history')),
      this.leaf(`Cache create: ${formatNumber(bucket.cacheCreationTokens)}`, undefined, new vscode.ThemeIcon('plus')),
    ];
  }

  private groupChildren(): TreeNode[] {
    const groups = this.current?.modelGroups;
    if (!groups || groups.length === 0) {
      return [this.leaf('No probe data', 'Set the API key to probe models', new vscode.ThemeIcon('info'))];
    }
    return groups.map((g) => {
      const label =
        g.status === 'ok'
          ? `Available (${g.models.length})`
          : `${errorCodeLabel(g.code)} (${g.models.length})`;
      const tooltip = new vscode.MarkdownString(
        [
          `**${label}**`,
          `Models: ${g.models.join(', ')}`,
          g.code ? `Code: ${g.code}` : '',
          g.resetTime ? `Reset at ${g.resetTime}` : '',
          g.message ? `Message: ${g.message}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
      const icon =
        g.status === 'ok'
          ? new vscode.ThemeIcon('check')
          : g.code === 1308
            ? new vscode.ThemeIcon('clock')
            : new vscode.ThemeIcon('x');
      return new TreeNode(
        { type: 'group', key: g.key, status: g.status, models: g.models, code: g.code, resetTime: g.resetTime },
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        icon,
      );
    });
  }

  private leaf(label: string, tooltip: string | undefined, iconPath: vscode.ThemeIcon): TreeNode {
    return new TreeNode({ type: 'info', label, tooltip }, label, vscode.TreeItemCollapsibleState.None, tooltip, iconPath);
  }
}
