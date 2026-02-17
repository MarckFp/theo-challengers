import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Detect if running in GitHub Actions
const isGitHubActions = process.env.WEB_ADAPTER === 'true';

// Lazy-load adapters to avoid loading Cloudflare adapter locally
const selectedAdapter = isGitHubActions
  ? (await import('@sveltejs/adapter-cloudflare')).default()
  : (await import('@sveltejs/adapter-static')).default({
      fallback: "index.html",
    });

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: selectedAdapter,
  },
};

export default config;
