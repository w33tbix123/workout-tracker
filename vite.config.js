import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/workout-tracker/",

  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "wbx-workout-planner-banner.png",
      ],

      manifest: {
        name: "WBX Workout Planner",

        short_name: "WBX Planner",

        description:
          "Personal workout planning, tracking and strength progression by WBX.",

        theme_color: "#08080b",

        background_color: "#08080b",

        display: "standalone",

        start_url:
          "/workout-tracker/",

        scope:
          "/workout-tracker/",

        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },

          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },

          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg}",
        ],
      },
    }),
  ],
});