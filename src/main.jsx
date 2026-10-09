import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  registerSW,
} from "virtual:pwa-register";

import "./index.css";

// Registers the Android install listener before anything renders.
import "./installPrompt.js";

import App from "./App.jsx";

import { DialogHost } from "./DialogHost.jsx";

import { ProgramChooser } from "./ProgramChooser.jsx";

import {
  needsProgramChoice,
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

// Workouts live only on this phone, so ask the browser not to clear the
// app's storage when the phone runs low on space. Silent; a refusal
// changes nothing.
navigator.storage
  ?.persist?.()
  .catch(() => {});

async function startApp() {
  const isLocalhost =
    window.location.hostname ===
      "localhost" ||
    window.location.hostname ===
      "127.0.0.1";

  const root = createRoot(
    document.getElementById(
      "root"
    )
  );

  function renderApp() {
    root.render(
      <StrictMode>
        <App />

        <DialogHost />
      </StrictMode>
    );
  }

  if (isLocalhost) {
    // Local development starts with the WBX program and the baseline
    // history, so there's realistic data to test against.
    await seedWorkoutData();

    await importCurrentStatsOnce();

    await clearTestHistoryOnce();

    await fixBaselineDatesOnce();
  } else if (
    await needsProgramChoice()
  ) {
    // A brand-new phone picks its program first.
    root.render(
      <StrictMode>
        <ProgramChooser
          onDone={renderApp}
        />

        <DialogHost />
      </StrictMode>
    );

    return;
  }

  renderApp();
}

startApp();
