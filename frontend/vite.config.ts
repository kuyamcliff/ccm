import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // Uploads are served by the API, so they proxy alongside it.
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/uploads": { target: "http://localhost:4000", changeOrigin: true },
    },
  },

  build: {
    target: "es2020",
    // Hidden source maps make production stack traces readable for us without
    // linking the original source from the shipped bundle.
    sourcemap: "hidden",
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // React and the router change far less often than the app code, so
        // keeping them separate lets repeat visitors reuse the cached copy
        // across deploys.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Matched on the resolved path rather than the bare package name:
          // the app imports "react-dom/client" and "react/jsx-runtime", which a
          // name-keyed mapping does not catch, leaving the chunk empty.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
          if (/[\\/]node_modules[\\/]react-router/.test(id)) return "router";
        },
      },
    },
  },
});
