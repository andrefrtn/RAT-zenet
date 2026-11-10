import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = env.PORT || '3001';
  return {
    root: 'client',
    envDir: process.cwd(),
    plugins: [react(), tailwind()],
    server: {
      proxy: { '/api': { target: 'http://127.0.0.1:' + port, changeOrigin: false } },
    },
    build: { outDir: '../dist/client', emptyOutDir: true },
  };
});
