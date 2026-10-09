import { useState } from "react";

import {
  CaretRight,
  UploadSimple,
} from "@phosphor-icons/react";

import "./App.css";

import {
  PROGRAM_TEMPLATES,
  applyProgramTemplate,
} from "./seed.js";

import { importWorkoutBackup } from "./backup.js";

import { notify } from "./confirm.js";

import { InstallBanner } from "./InstallBanner.jsx";

// First launch on a new phone: pick the program to start with, start
// empty, or bring back a backup. Shown by main.jsx only while
// needsProgramChoice() is true, so phones already set up never see it.
export function ProgramChooser({
  onDone,
}) {
  const [
    busy,
    setBusy,
  ] = useState(false);

  async function choose(
    templateId
  ) {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      await applyProgramTemplate(
        templateId
      );

      onDone();
    } catch (error) {
      console.error(error);

      await notify({
        title:
          "Couldn't set up the program",
        message:
          error.message,
      });

      setBusy(false);
    }
  }

  async function restore(
    event
  ) {
    const file =
      event.target
        .files?.[0];

    event.target.value =
      "";

    if (
      !file ||
      busy
    ) {
      return;
    }

    setBusy(true);

    try {
      await importWorkoutBackup(
        file
      );

      onDone();
    } catch (error) {
      await notify({
        title:
          "Restore failed",
        message:
          error.message,
      });

      setBusy(false);
    }
  }

  const options = [
    ...PROGRAM_TEMPLATES.map(
      (template) => ({
        id: template.id,
        name: template.name,
        description:
          template.description,
      })
    ),

    {
      id: null,
      name: "Start empty",
      description:
        "Build your own program from scratch.",
    },
  ];

  return (
    <div className="app program-chooser">
      <div className="wbx-home-banner">
        <img
          src={`${import.meta.env.BASE_URL}wbx-workout-planner-banner.png`}
          alt="WBX Workout Planner"
        />
      </div>

      <InstallBanner />

      <header className="topbar">
        <div>
          <h1>
            Choose your program
          </h1>

          <p className="page-subtitle">
            You can change exercises, sets and days at any time.
          </p>
        </div>
      </header>

      <div className="split-list">
        {options.map(
          (option) => (
            <div
              className="management-card"
              key={
                option.id ??
                "empty"
              }
            >
              <button
                className="management-card-main"
                disabled={busy}
                onClick={() =>
                  choose(
                    option.id
                  )
                }
              >
                <div>
                  <strong>
                    {option.name}
                  </strong>

                  <p>
                    {
                      option.description
                    }
                  </p>
                </div>

                <CaretRight
                  size={18}
                  weight="bold"
                  aria-hidden
                />
              </button>
            </div>
          )
        )}
      </div>

      <label
        className="program-chooser-restore"
        htmlFor="program-chooser-restore-input"
      >
        <UploadSimple
          size={16}
          aria-hidden
        />
        Restore from a backup
      </label>

      <input
        hidden
        id="program-chooser-restore-input"
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={
          restore
        }
      />
    </div>
  );
}
