import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Two build targets share one config:
 *
 * - default mode: demo site with two HTML entries
 *     index.html        -> full demo overview
 *     editor-only.html  -> standalone dual-pane editor window
 * - `--mode lib`: library bundle for npm consumers (vue stays external)
 */
export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5273,
      open: false
    },
    build: isLib
      ? {
          target: 'es2022',
          cssCodeSplit: false,
          lib: {
            entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
            name: 'VueMdForge',
            fileName: 'vue-md-forge',
            formats: ['es', 'umd']
          },
          rollupOptions: {
            external: ['vue'],
            output: {
              globals: { vue: 'Vue' },
              assetFileNames: 'vue-md-forge.[ext]',
              exports: 'named'
            }
          }
        }
      : {
          target: 'es2022',
          outDir: 'dist-demo',
          rollupOptions: {
            input: {
              preview: fileURLToPath(new URL('./preview.html', import.meta.url)),
              editorOnly: fileURLToPath(new URL('./editor-only.html', import.meta.url))
            }
          }
        }
  };
});
