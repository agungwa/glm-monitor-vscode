import { useEffect, useState } from 'react';
import { QuotaCard } from './components/QuotaCard';
import { LocalSpendCard } from './components/LocalSpendCard';
import { UsageRangeCard } from './components/UsageRangeCard';
import { EnergyImpactCard } from './components/EnergyImpactCard';
import { TopSessionsCard } from './components/TopSessionsCard';
import { ModelGroupsCard } from './components/ModelGroupsCard';
import { Header } from './components/Header';
import type { FetchResult } from '../shared/types';

declare global {
  function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(s: unknown): void;
  };
}

export function App() {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [vscode] = useState(() => acquireVsCodeApi());

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'data' && msg.result) setResult(msg.result as FetchResult);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const refresh = () => vscode.postMessage({ type: 'refresh' });

  return (
    <div>
      <Header fetchedAt={result?.fetchedAt} onRefresh={refresh} error={result?.error} />
      <QuotaCard result={result} />
      <UsageRangeCard result={result} />
      <LocalSpendCard result={result} />
      <EnergyImpactCard result={result} />
      <TopSessionsCard result={result} />
      <ModelGroupsCard result={result} />
    </div>
  );
}
