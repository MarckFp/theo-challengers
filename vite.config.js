import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit'

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA(
      {
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: '/',
          suppressWarnings: true
        },
        strategies: 'generateSW', //This let vite-pwa plugin to generate the SW and the manifest
        registerType: 'prompt', //autoUpdate or prompt depending on what we want. This auto updates the app if a new version appears
        pwaAssets: {
          disabled: false,
          config: true,
        },
        manifest: {
          name: 'Theo Challengers',
          short_name: 'Theo Challengers',
          description: 'Mini Game to challenge your friends with funny challenges that motivate you to have goals',
          display: 'standalone',
          display_override: ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay', 'browser'],
          theme_color: '#1d232a',
          background_color: '#1d232a',
          start_url: '/',
          scope: '/',
          id: '/',
          lang: 'es',
          dir: 'ltr',
          categories: ['utilities', 'productivity'],
          handle_links: 'preferred',
          orientation: 'natural',
          launch_handler: {
            client_mode: ['auto', 'navigate-existing']
          },
          edge_side_panel: {
            preferred_width: 500
          },
          icons: [
            {
              "src": "/android-chrome-192x192.png",
              "sizes": "192x192",
              "type": "image/png"
            },
            {
              "src": "/android-chrome-512x512.png",
              "sizes": "512x512",
              "type": "image/png"
            }
          ],
        }
      }
    )
  ],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || '0.0.0.0',
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
