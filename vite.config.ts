import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',   // relative paths so Electron can load from disk
  server: {
    proxy: {
      // Dev-mode stand-in for the Electron main-process fetch: lets the
      // browser read public Apple Music playlist pages without CORS.
      // Deliberately bland path name — ad-blockers eat "apple-proxy"-style urls.
      "/amx": {
        target: "https://music.apple.com",
        changeOrigin: true,
        followRedirects: true,   // Apple 301s to the canonical slug — chase it server-side
        rewrite: (path) => path.replace(/^\/amx/, ""),
      },
    },
  },
});
