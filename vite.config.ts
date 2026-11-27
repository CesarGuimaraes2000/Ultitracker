import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spriteCatalogPlugin } from './vite-plugin-sprites.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), spriteCatalogPlugin()],
  server: {
    cors: {
      origin: 'https://www.owlbear.rodeo',
      methods: ['GET', 'POST', 'OPTIONS'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        background: 'background.html',
      },
    },
  },
});
