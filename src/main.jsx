import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  registerSW,
} from "virtual:pwa-register";

import "./index.css";

import App from "./App.jsx";

import {
  seedWorkoutData,
} from "./seed.js";

import {
  importCurrentStatsOnce,
} from "./importCurrentStats.js";

import {
  clearTestHistoryOnce,
} from "./clearTestHistory.js";

import {
  fixBaselineDatesOnce,
} from "./fixBaselineDates.js";

registerSW({
  immediate: true,
});

async function startApp() {
  await seedWorkoutData();

  const isLocalhost =
    window.location.hostname ===
      "localhost" ||
    window.location.hostname ===
      "127.0.0.1";

  if (isLocalhost) {
    await importCurrentStatsOnce();

    await clearTestHistoryOnce();

    await fixBaselineDatesOnce();
  }

  createRoot(
    document.getElementById(
      "root"
    )
  ).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

startApp();