import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH && env.VITE_BASE_PATH !== '/'
    ? env.VITE_BASE_PATH.endsWith('/')
      ? env.VITE_BASE_PATH
      : `${env.VITE_BASE_PATH}/`
    : '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    optimizeDeps: {
      include: ['react-grid-layout', 'react-draggable', 'react-resizable'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
    },
    preview: {
      port: 3000,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
