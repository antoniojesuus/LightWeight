import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "LightWeight — Seguimiento de entrenos",
        short_name: "LightWeight",
        description: "App local de seguimiento de entrenamientos en el gimnasio.",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        lang: "es",
        icons: [
          { src: "/icons/obsidian-mark.svg", sizes: "any", type: "image/svg+xml" },
          { src: "/icons/obsidian-mark-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/obsidian-mark-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/obsidian-mark-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
          handler: "NetworkFirst",
          options: { cacheName: "lightweight-api", networkTimeoutSeconds: 5 }
        }]
      }
    })
  ],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" }
  },
  build: { outDir: "dist", emptyOutDir: true }
});
