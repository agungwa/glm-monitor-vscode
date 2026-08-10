import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Webview React UI is bundled separately and loaded into the VSCode webview.
export default defineConfig({
  root: 'src/webview',
  build: {
    outDir: '../../dist-webview',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/webview/main.tsx',
      output: {
        entryFileNames: 'webview.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  plugins: [react()],
});
