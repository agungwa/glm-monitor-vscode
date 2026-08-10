import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// VSCode acquires a global `acquireVsCodeApi` only inside webviews.
declare global {
  function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
  };
}
