import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    plugins: [
      react(),
      {
        name: 'copy-manifest-and-html',
        writeBundle() {
          // Copy manifest
          const manifestSrc = resolve(__dirname, 'public/manifest.json');
          const manifestDest = resolve(__dirname, 'dist/manifest.json');
          if (existsSync(manifestSrc)) {
            copyFileSync(manifestSrc, manifestDest);
          }

          // Copy popup.html and options.html to dist root
          const popupHtmlSrc = resolve(__dirname, 'dist/src/popup/index.html');
          const popupHtmlDest = resolve(__dirname, 'dist/popup.html');
          if (existsSync(popupHtmlSrc)) {
            copyFileSync(popupHtmlSrc, popupHtmlDest);
          }

          const optionsHtmlSrc = resolve(__dirname, 'dist/src/options/index.html');
          const optionsHtmlDest = resolve(__dirname, 'dist/options.html');
          if (existsSync(optionsHtmlSrc)) {
            copyFileSync(optionsHtmlSrc, optionsHtmlDest);
          }

          // Copy icons
          const iconsDir = resolve(__dirname, 'public/icons');
          const distIconsDir = resolve(__dirname, 'dist/icons');
          if (existsSync(iconsDir)) {
            if (!existsSync(distIconsDir)) mkdirSync(distIconsDir, { recursive: true });
            ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'].forEach(f => {
              if (existsSync(resolve(iconsDir, f))) {
                copyFileSync(resolve(iconsDir, f), resolve(distIconsDir, f));
              }
            });
          }
        },
      },
    ],
    build: {
      outDir: 'dist',
      sourcemap: isDev,
      minify: isDev ? false : 'esbuild',
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/index.html'),
          options: resolve(__dirname, 'src/options/index.html'),
          content: resolve(__dirname, 'src/content/index.ts'),
          'content-whatsapp': resolve(__dirname, 'src/content/whatsapp.ts'),
          'content-messenger': resolve(__dirname, 'src/content/messenger.ts'),
          background: resolve(__dirname, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});
