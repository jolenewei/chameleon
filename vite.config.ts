import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: 'public',
  resolve: {
    alias: {
        '@common': resolve(__dirname, 'src/common'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        // HTML entry points for React apps
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        // Non-HTML entry points (fixed file names for manifest)
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts')
      },
      output: {
        // emit a single js file per entry
        manualChunks: undefined,

        entryFileNames: (chunk) => {
          if (chunk.name?.startsWith('background/')) return 'background/service-worker.js';
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
      }
    }
  }
});
