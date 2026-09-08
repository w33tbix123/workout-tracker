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
      ],

      manifest: {
        name: "Workout Tracker",
        short_name: "Workout",

        description:
          "Personal workout tracking and strength progression app.",

        theme_color: "#0b0c10",
        background_color: "#0b0c10",

        display: "standalone",

        start_url: "/workout-tracker/",
        scope: "/workout-tracker/",

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