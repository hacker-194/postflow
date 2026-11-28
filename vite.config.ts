import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  base: '',
  // Content scripts are bundled as standalone IIFE chunks that skip Vite's usual
  // process.env replacement, so React would crash on `process is not defined`.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    react(),
    crx({
      manifest,
      contentScripts: {
        standaloneFiles: [
          'src/content/index.ts',
          'src/content/whatsapp.ts',
          'src/content/messenger.ts',
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        background: 'src/background/index.ts',
        content: 'src/content/index.ts',
        'content-whatsapp': 'src/content/whatsapp.ts',
        'content-messenger': 'src/content/messenger.ts',
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: assetInfo => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) return 'styles/[name].[ext]';
          if (name.endsWith('.png') || name.endsWith('.svg') || name.endsWith('.jpg'))
            return 'icons/[name].[ext]';
          return 'assets/[name].[ext]';
        },
      },
    },
  },
  server: {
    port: 5173,
    hmr: false,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
