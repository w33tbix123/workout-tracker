import { db } from "./db";

import { confirmAction } from "./confirm.js";

// Saves a backup the way a non-technical person expects on a phone: the
// share sheet ("Save to Files" / iCloud Drive on iPhone, Google Drive or
// Files on Android). Falls back to a download where sharing files isn't
// supported. Returns true once the backup was handed over, false if the
// person cancelled; only a completed backup updates lastBackupAt.
export async function exportWorkoutBackup() {
  const backup = {
    version: 2,
    createdAt: new Date().toISOString(),

    data: {
      splits: await db.splits.toArray(),
      workoutDays: await db.workoutDays.toArray(),
      exercises: await db.exercises.toArray(),
      sessions: await db.sessions.toArray(),
      sets: await db.sets.toArray(),
      appMeta: await db.appMeta.toArray(),
    },
  };

  const json = JSON.stringify(backup, null, 2);

  const date = new Date()
    .toISOString()
    .slice(0, 10);

  const fileName =
    `workout-backup-${date}.json`;

  const file = new File(
    [json],
    fileName,
    {
      type: "application/json",
    }
  );

  const canShareFile =
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({
      files: [file],
    });

  if (canShareFile) {
    const shared = await shareBackupFile(
      file
    );

    if (!shared) {
      return false;
    }
  } else {
    downloadBackupFile(
      file
    );
  }

  await db.appMeta.put({
    key: "lastBackupAt",
    value: new Date().toISOString(),
  });

  return true;
}

async function shareBackupFile(file) {
  try {
    await navigator.share({
      files: [file],
      title: "Workout backup",
    });

    return true;
  } catch (error) {
    if (error?.name === "AbortError") {
      return false;
    }

    // Safari only opens the share sheet straight after a tap, and reading
    // the database first can use that up. One more tap gives it a fresh
    // one.
    if (error?.name === "NotAllowedError") {
      const confirmed = await confirmAction({
        title: "Backup ready",
        message:
          "Tap Save backup, then choose where to keep it (for example iCloud Drive or Google Drive).",
        confirmLabel: "Save backup",
        tone: "primary",
      });

      if (!confirmed) {
        return false;
      }

      try {
        await navigator.share({
          files: [file],
          title: "Workout backup",
        });

        return true;
      } catch (retryError) {
        if (retryError?.name === "AbortError") {
          return false;
        }

        throw retryError;
      }
    }

    throw error;
  }
}

function downloadBackupFile(file) {
  const url = URL.createObjectURL(file);

  const link = document.createElement("a");

  link.href = url;

  link.download = file.name;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export async function importWorkoutBackup(file) {
  const text = await file.text();

  let backup;

  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error(
      "This does not appear to be a valid workout backup."
    );
  }

  if (
    !backup ||
    !backup.data ||
    !Array.isArray(backup.data.splits) ||
    !Array.isArray(backup.data.workoutDays) ||
    !Array.isArray(backup.data.exercises) ||
    !Array.isArray(backup.data.sessions) ||
    !Array.isArray(backup.data.sets)
  ) {
    throw new Error(
      "The selected file is not a valid Workout Tracker backup."
    );
  }

  const appMeta =
    Array.isArray(backup.data.appMeta)
      ? backup.data.appMeta
      : [];

  await db.transaction(
    "rw",
    [
      db.splits,
      db.workoutDays,
      db.exercises,
      db.sessions,
      db.sets,
      db.appMeta,
    ],
    async () => {
      await db.sets.clear();
      await db.sessions.clear();
      await db.exercises.clear();
      await db.workoutDays.clear();
      await db.splits.clear();
      await db.appMeta.clear();

      if (backup.data.splits.length) {
        await db.splits.bulkAdd(
          backup.data.splits
        );
      }

      if (backup.data.workoutDays.length) {
        await db.workoutDays.bulkAdd(
          backup.data.workoutDays
        );
      }

      if (backup.data.exercises.length) {
        await db.exercises.bulkAdd(
          backup.data.exercises
        );
      }

      if (backup.data.sessions.length) {
        await db.sessions.bulkAdd(
          backup.data.sessions
        );
      }

      if (backup.data.sets.length) {
        await db.sets.bulkAdd(
          backup.data.sets
        );
      }

      if (appMeta.length) {
        await db.appMeta.bulkAdd(appMeta);
      } else {
        await db.appMeta.put({
          key: "initialSeedComplete",
          value: true,
        });
      }
    }
  );
}