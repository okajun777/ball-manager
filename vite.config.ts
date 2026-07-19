import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 本番 GitHub Pages では Actions が VITE_BASE=/ball-manager/ を渡す
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Ball Manager",
        short_name: "BallMgr",
        description: "ボウリングボールとスコアの管理アプリ",
        theme_color: "#0b6bcb",
        background_color: "#f3f5f8",
        display: "standalone",
        lang: "ja",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2,webmanifest}"],
        globIgnores: ["**/catalog-images/**"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/catalog-images\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "catalog-images-v3",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
        ],
      },
    }),
  ],
  base: process.env.VITE_BASE || "/",
  server: {
    port: 5180,
    host: "127.0.0.1",
    proxy: {
      // ローカル開発で未ミラー時に OBF PDF を取る
      "/obf-proxy": {
        target: "https://www.obf-bowling.net",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/obf-proxy/, ""),
      },
    },
  },
});
