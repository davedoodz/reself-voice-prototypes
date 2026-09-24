import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        voice: resolve(import.meta.dirname, 'voice.html'),
        voiceDynamic: resolve(import.meta.dirname, 'voice-dynamic.html'),
        voiceGuided: resolve(import.meta.dirname, 'voice-guided.html'),
        welcome: resolve(import.meta.dirname, 'welcome.html'),
        logoMotion: resolve(import.meta.dirname, 'logo-motion.html'),
      },
    },
  },
});
