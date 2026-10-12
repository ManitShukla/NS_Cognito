import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'child_process';

const getGitCommit = (): string => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return '21f804e';
  }
};

const getBuildNumber = (): string => {
  try {
    return execSync('git rev-list --count HEAD').toString().trim();
  } catch {
    return '8';
  }
};

const buildInfo = {
  version: '1.0.1',
  commit: getGitCommit(),
  buildNumber: getBuildNumber(),
  timestamp: new Date().toISOString(),
  environment: process.env.VERCEL ? 'VERCEL_EDGE' : (process.env.NODE_ENV || 'local'),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './client'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3000}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
