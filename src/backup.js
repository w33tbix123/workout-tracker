import { db } from "./db";

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

  const blob = new Blob([json], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  const date = new Date()
    .toISOString()
    .slice(0, 10);

  link.href = url;

  link.download =
    `workout-tracker-backup-${date}.json`;

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