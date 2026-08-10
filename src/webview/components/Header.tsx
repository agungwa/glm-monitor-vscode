import { formatRelativeTime } from '../../shared/format';

interface Props {
  fetchedAt?: number;
  onRefresh: () => void;
  error?: string;
}

export function Header({ fetchedAt, onRefresh, error }: Props) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-lg font-semibold m-0">GLM Monitor</h1>
        <div className="text-xs opacity-70">Updated {formatRelativeTime(fetchedAt)}</div>
        {error && <div className="text-xs text-danger mt-1">⚠ {error}</div>}
      </div>
      <button
        onClick={onRefresh}
        className="px-3 py-1 rounded text-xs border border-solid border-white/20 hover:bg-white/10 cursor-pointer"
        style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}
      >
        Refresh
      </button>
    </div>
  );
}
