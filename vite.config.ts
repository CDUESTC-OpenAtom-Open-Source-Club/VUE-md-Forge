import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Two build targets share one config:
 *
 * - default mode: demo site with three HTML entries
 *     index.html        -> demo landing page (served at /VUE-md-Forge/)
 *     preview.html      -> dual-pane source / rendered preview
 *     editor-only.html  -> standalone dual-pane editor window
 * - `--mode lib`: library bundle for npm consumers (vue stays external)
 */
export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';

  return {
    plugins: [vue()],
    // GitHub Pages base path; override via BASE_PATH env for custom hosts.
    // Vite resolves this against all asset / asset-injected paths so the
    // built HTML works under https://<org>.github.io/VUE-md-Forge/.
    base: process.env.BASE_PATH ?? '/VUE-md-Forge/',
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
              index: fileURLToPath(new URL('./index.html', import.meta.url)),
              preview: fileURLToPath(new URL('./preview.html', import.meta.url)),
              editorOnly: fileURLToPath(new URL('./editor-only.html', import.meta.url))
            }
          }
        }
  };
});
