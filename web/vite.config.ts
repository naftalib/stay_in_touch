import react from "@vitejs/plugin-react";
import { VitePWA, type ManifestOptions } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vite";

function noCacheShell(): Plugin {
  return {
    name: "no-cache-shell",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url === "/" || url === "/index.html" || url === "/sw.js" || url.startsWith("/manifest")) {
          res.setHeader("Cache-Control", "no-cache");
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    noCacheShell(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "badge-96.png"],
      manifest: {
        name: "Stay In Touch",
        short_name: "Stay In Touch",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        lang: "en",
        // The manifest spec's default dir is auto. The plugin's type only lists ltr and rtl.
        dir: "auto" as ManifestOptions["dir"],
        background_color: "#f7f5f2",
        theme_color: "#f7f5f2",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/heic-to-*.js"],
      },
    }),
  ],
  // One env file at the repo root, shared with later packages.
  envDir: "..",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames(chunk) {
          const name = chunk.name.includes("heic") ? "heic-to" : chunk.name;
          return `assets/${name}-[hash].js`;
        },
      },
    },
  },
});
