import { db } from "./db";

// ============================================================
// PROGRAM TEMPLATES
// ============================================================

// Programs a new person can start with on first launch (ProgramChooser).
// Each one becomes a normal split; after that it is edited in the app
// like any other, and the template is never read again.
export const PROGRAM_TEMPLATES = [
  {
    id: "wbx-upper-lower",
    name: "WBX Upper/Lower",
    description:
      "4 days: Upper A, Lower A, Upper B, Lower B",
    split: {
      name: "4 Day Upper/Lower Split",
      days: [
        {
          name: "Upper A",
          dayOfWeek: "Monday",
          exercises: [
            {
              name: "Wide Grip Lat Pulldown",
              order: 1,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure / 0-1"
            },
            {
              name: "Close Grip Row",
              order: 2,
              optional: true,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Flat Chest Press",
              order: 3,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Incline Smith Press",
              order: 4,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Wide Grip T-Bar Row",
              order: 5,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Machine Shoulder Press",
              order: 6,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Dumbbell Lateral Raises",
              order: 7,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Rear Delt Reverse Fly",
              order: 8,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Single Arm Triceps Pushdown",
              order: 9,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Preacher Curl",
              order: 10,
              optional: false,
              alternativeGroup: "upper-a-biceps",
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Incline Curl",
              order: 11,
              optional: false,
              alternativeGroup: "upper-a-biceps",
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "JM Press",
              order: 12,
              optional: false,
              alternativeGroup: "upper-a-triceps",
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Dips",
              order: 13,
              optional: false,
              alternativeGroup: "upper-a-triceps",
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Hammer Curl",
              order: 14,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            }
          ],
        },
        {
          name: "Lower A",
          dayOfWeek: "Tuesday",
          exercises: [
            {
              name: "Leg Extension",
              order: 1,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Hack Squat",
              order: 2,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Barbell RDL",
              order: 3,
              optional: false,
              targetSets: 1,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Lying Hamstring Curl",
              order: 4,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Calf Raises",
              order: 5,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Adductors",
              order: 6,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Weighted Ab Crunches",
              order: 7,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            }
          ],
        },
        {
          name: "Upper B",
          dayOfWeek: "Thursday",
          exercises: [
            {
              name: "Wide Grip Lat Pulldown",
              order: 1,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "0-1"
            },
            {
              name: "Close Grip Cable Row",
              order: 2,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Wide Grip T-Bar Row",
              order: 3,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Incline Smith Press",
              order: 4,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Flat Chest Press",
              order: 5,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Machine Shoulder Press",
              order: 6,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Dumbbell Lateral Raises",
              order: 7,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Rear Delt Reverse Fly",
              order: 8,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Single Arm Triceps Pushdown",
              order: 9,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Preacher Curl",
              order: 10,
              optional: false,
              alternativeGroup: "upper-b-biceps",
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Incline Curl",
              order: 11,
              optional: false,
              alternativeGroup: "upper-b-biceps",
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "JM Press",
              order: 12,
              optional: false,
              alternativeGroup: "upper-b-triceps",
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Dips",
              order: 13,
              optional: false,
              alternativeGroup: "upper-b-triceps",
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Hammer Curl",
              order: 14,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            }
          ],
        },
        {
          name: "Lower B",
          dayOfWeek: "Friday",
          exercises: [
            {
              name: "Barbell RDL",
              order: 1,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Lying Hamstring Curl",
              order: 2,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Leg Extension",
              order: 3,
              optional: false,
              targetSets: 2,
              warmupSets: 1,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Hack Squat",
              order: 4,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Hip Thrust",
              order: 5,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "1-2"
            },
            {
              name: "Calf Raises",
              order: 6,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Adductors",
              order: 7,
              optional: false,
              targetSets: 1,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            },
            {
              name: "Weighted Ab Crunches",
              order: 8,
              optional: false,
              targetSets: 2,
              warmupSets: 0,
              minReps: 6,
              maxReps: 8,
              targetRIR: "Failure"
            }
          ],
        },
      ],
    },
  },
];

// Creates the template's split, days and exercises in one transaction
// and marks first-run setup as done. A null templateId starts empty.
export async function applyProgramTemplate(
  templateId
) {
  const template =
    PROGRAM_TEMPLATES.find(
      (item) =>
        item.id === templateId
    ) || null;

  await db.transaction(
    "rw",
    db.splits,
    db.workoutDays,
    db.exercises,
    db.appMeta,
    async () => {
      if (template) {
        const splitId =
          await db.splits.add({
            name: template.split.name,
          });

        for (const day of template.split.days) {
          const workoutDayId =
            await db.workoutDays.add({
              splitId,
              name: day.name,
              dayOfWeek: day.dayOfWeek,
            });

          await db.exercises.bulkAdd(
            day.exercises.map(
              (exercise) => ({
                ...exercise,
                workoutDayId,
              })
            )
          );
        }
      }

      await db.appMeta.put({
        key: "initialSeedComplete",
        value: true,
      });
    }
  );
}

// True only on a brand-new install: setup has never run and there is
// no program. Devices that already have splits (every phone set up
// before the chooser existed) are marked done and never see it.
export async function needsProgramChoice() {
  const seedStatus =
    await db.appMeta.get(
      "initialSeedComplete"
    );

  if (seedStatus) {
    return false;
  }

  const existingSplits =
    await db.splits.count();

  if (existingSplits > 0) {
    await db.appMeta.put({
      key: "initialSeedComplete",
      value: true,
    });

    return false;
  }

  return true;
}

// Local development only: starts with the WBX program so the dev helpers
// in main.jsx find the days they import into.
export async function seedWorkoutData() {
  if (
    await needsProgramChoice()
  ) {
    await applyProgramTemplate(
      "wbx-upper-lower"
    );
  }
}
