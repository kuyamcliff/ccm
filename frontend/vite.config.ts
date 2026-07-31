import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The API and the site share an origin in every environment: the dev server
 * proxies to the local backend, and in production the host rewrites /api to the
 * API service. That keeps the session cookie same-origin, so nothing here ever
 * needs CORS or a bearer token in localStorage.
 */
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },

  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      // Uploaded photos are served by the API from disk.
      "/uploads": { target: API_TARGET, changeOrigin: true },
    },
  },

  build: {
    target: "es2022",
    sourcemap: "hidden",
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        /* The staff console is a different application wearing the same
           bundle. Splitting it out means a diner never downloads the twenty
           admin screens they will never open. */
        manualChunks(id) {
          if (id.includes("/src/features/desk/")) return "desk";
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (/node_modules\/react-router/.test(id)) return "router";
          if (/node_modules\/jsqr/.test(id)) return "scanner";
        },
      },
    },
  },
});
