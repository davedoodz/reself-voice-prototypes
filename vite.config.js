import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = import.meta.dirname;

/* One HTML page per prototype. */
const PAGES = {
  main: 'index.html',
  voice: 'voice.html',
  voiceDynamic: 'voice-dynamic.html',
  voiceGuided: 'voice-guided.html',
  welcome: 'welcome.html',
  logoMotion: 'logo-motion.html',
  entries: 'entries.html',
  promptCard: 'prompt-card.html',
  guideCards: 'guide-cards.html',
  notification: 'notification.html',
};

/* When an edit can't hot-swap, Vite reloads every open page (path "*").
   This narrows that reload to the pages whose entry script imports the changed
   file, so editing one prototype leaves the others alone. */
function scopedReload() {
  // Entry script URL (e.g. /src/voice.jsx) → the page that loads it.
  const pageByEntry = new Map();
  for (const html of Object.values(PAGES)) {
    const src = readFileSync(resolve(root, html), 'utf8').match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    if (src) pageByEntry.set(src, `/${html}`);
  }

  return {
    name: 'scoped-reload',
    apply: 'serve',
    configureServer(server) {
      const env = server.environments.client;
      const send = env.hot.send.bind(env.hot);
      env.hot.send = (payload, ...rest) => {
        if (payload?.type !== 'full-reload' || payload.path !== '*' || !payload.triggeredBy) {
          return send(payload, ...rest);
        }
        // Walk up the importer graph from the changed file to the page entries.
        const pages = new Set();
        const seen = new Set();
        const stack = [...(env.moduleGraph.getModulesByFile(payload.triggeredBy) ?? [])];
        while (stack.length) {
          const mod = stack.pop();
          if (seen.has(mod)) continue;
          seen.add(mod);
          const page = pageByEntry.get(mod.url);
          if (page) pages.add(page);
          stack.push(...mod.importers);
        }
        // Unknown ownership (config, env, a file no page imports yet): keep Vite's behaviour.
        if (pages.size === 0) return send(payload, ...rest);
        for (const path of pages) send({ ...payload, path }, ...rest);
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), scopedReload()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, html]) => [name, resolve(root, html)])),
    },
  },
});
