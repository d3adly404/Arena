import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@shared': path.resolve(here, '../shared'),
    },
  },
  server: {
    host: true,
    port: 5174,
    strictPort: false,
    fs: { allow: [path.resolve(here, '..')] },
    // The FieldLink API runs on the same address in development, so the interface can
    // always talk to it with a relative URL — phones on the local network included.
    proxy: {
      '/api': { target: 'http://127.0.0.1:5173', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:5173', changeOrigin: true },
    },
  },
  build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true, sourcemap: false },
});
