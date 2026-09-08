import { db } from "./db";

const IMPORT_KEY = "currentStatsBaselineV1";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function exerciseOrderKey(exercise) {
  if (exercise.alternativeGroup) {
    return `group:${exercise.alternativeGroup}`;
  }

  return `exercise:${exercise.id}`;
}

async function findSplit() {
  const splits = await db.splits.toArray();

  const split =
    splits.find(
      (item) =>
        !item.archived &&
        normalize(item.name) ===
          normalize(
            "4 Day Upper/Lower Split"
          )
    ) ||
    splits.find(
      (item) =>
        !item.archived &&
        normalize(item.name).includes(
          "4dayupperlower"
        )
    );

  if (!split) {
    throw new Error(
      'Could not find "4 Day Upper/Lower Split".'
    );
  }

  return split;
}

async function findDay(
  splitId,
  aliases
) {
  const days =
    await db.workoutDays
      .where("splitId")
      .equals(splitId)
      .toArray();

  const normalizedAliases =
    aliases.map(normalize);

  const day = days.find(
    (item) =>
      !item.archived &&
      normalizedAliases.includes(
        normalize(item.name)
      )
  );

  if (!day) {
    throw new Error(
      `Could not find workout day: ${aliases[0]}`
    );
  }

  return day;
}

async function getDayExercises(
  workoutDayId
) {
  const exercises =
    await db.exercises
      .where("workoutDayId")
      .equals(workoutDayId)
      .toArray();

  return exercises
    .filter(
      (exercise) =>
        !exercise.archived
    )
    .sort(
      (a, b) =>
        Number(a.order) -
        Number(b.order)
    );
}

function findExercise(
  exercises,
  aliases
) {
  const normalizedAliases =
    aliases.map(normalize);

  let exercise =
    exercises.find(
      (item) =>
        normalizedAliases.includes(
          normalize(item.name)
        )
    );

  if (exercise) {
    return exercise;
  }

  exercise =
    exercises.find((item) => {
      const name =
        normalize(item.name);

      return normalizedAliases.some(
        (alias) =>
          name.includes(alias) ||
          alias.includes(name)
      );
    });

  if (!exercise) {
    console.warn(
      "Could not find exercise:",
      aliases
    );
  }

  return exercise;
}

function makeSet(
  weight,
  reps,
  rir = null
) {
  return {
    weight,
    reps,
    rir,
  };
}

async function createBaselineSession({
  workoutDay,
  exercises,
  date,
  stats,
}) {
  const completedSets = [];

  for (const entry of stats) {
    const exercise =
      findExercise(
        exercises,
        entry.aliases
      );

    if (!exercise) {
      continue;
    }

    entry.sets.forEach(
      (set, index) => {
        if (
          set.weight === null ||
          set.weight === undefined ||
          set.reps === null ||
          set.reps === undefined
        ) {
          return;
        }

        completedSets.push({
          exerciseId:
            exercise.id,

          exerciseName:
            exercise.name,

          setNumber:
            index + 1,

          setType:
            "working",

          weight:
            Number(
              set.weight
            ),

          reps:
            Number(
              set.reps
            ),

          rir:
            set.rir === null ||
            set.rir === undefined
              ? null
              : Number(
                  set.rir
                ),
        });
      }
    );
  }

  const orderKeys = [];

  const seenKeys =
    new Set();

  exercises.forEach(
    (exercise) => {
      const key =
        exerciseOrderKey(
          exercise
        );

      if (
        !seenKeys.has(key)
      ) {
        seenKeys.add(key);

        orderKeys.push(key);
      }
    }
  );

  const sessionId =
    await db.sessions.add({
      workoutDayId:
        workoutDay.id,

      workoutDayName:
        workoutDay.name,

      date,

      startedAt: date,

      skippedExerciseIds:
        [],

      completedSetCount:
        completedSets.length,

      exerciseOrderKeys:
        orderKeys,

      baselineImport:
        true,
  });

  if (
    completedSets.length
  ) {
    await db.sets.bulkAdd(
      completedSets.map(
        (set) => ({
          ...set,
          sessionId,
        })
      )
    );
  }

  return {
    sessionId,
    setCount:
      completedSets.length,
  };
}

export async function importCurrentStatsOnce() {
  const alreadyImported =
    await db.appMeta.get(
      IMPORT_KEY
    );

  if (alreadyImported?.value) {
    console.log(
      "Current stats baseline already imported."
    );

    return;
  }

  console.log(
    "Importing current workout stats..."
  );

  const split =
    await findSplit();

  const upperA =
    await findDay(
      split.id,
      [
        "Upper A",
        "Monday Upper A",
      ]
    );

  const lowerA =
    await findDay(
      split.id,
      [
        "Lower A",
        "Tuesday Lower A",
      ]
    );

  const upperB =
    await findDay(
      split.id,
      [
        "Upper B",
        "Thursday Upper B",
      ]
    );

  const lowerB =
    await findDay(
      split.id,
      [
        "Lower B",
        "Friday Lower B",
      ]
    );

  const upperAExercises =
    await getDayExercises(
      upperA.id
    );

  const lowerAExercises =
    await getDayExercises(
      lowerA.id
    );

  const upperBExercises =
    await getDayExercises(
      upperB.id
    );

  const lowerBExercises =
    await getDayExercises(
      lowerB.id
    );

  /*
    These dates represent the most recent matching
    workout days around the baseline import.

    Upper B  - Thu 3 Sep 2026
    Lower B  - Fri 4 Sep 2026
    Upper A  - Mon 7 Sep 2026
    Lower A  - Tue 8 Sep 2026
  */

  const UPPER_B_DATE =
    "2026-09-03T18:00:00";

  const LOWER_B_DATE =
    "2026-09-04T18:00:00";

  const UPPER_A_DATE =
    "2026-09-07T18:00:00";

  const LOWER_A_DATE =
    "2026-09-08T18:00:00";

  // ============================================================
  // YOUR ACTUAL CURRENT STATS
  // ============================================================

  const upperAStats = [
    {
      aliases: [
        "Wide Grip Lat Pulldown",
      ],

      sets: [
        makeSet(
          70,
          8,
          0
        ),

        makeSet(
          70,
          7,
          1
        ),
      ],
    },

    {
      aliases: [
        "Close Grip Row",
        "Close Grip Cable Row",
      ],

      sets: [
        makeSet(
          70,
          7,
          0
        ),
      ],
    },

    {
      aliases: [
        "Flat Chest Press",
      ],

      sets: [
        makeSet(
          100,
          6,
          null
        ),

        makeSet(
          100,
          5,
          null
        ),
      ],
    },

    {
      aliases: [
        "Incline Smith Press",
      ],

      sets: [
        makeSet(
          67.5,
          7,
          null
        ),

        makeSet(
          67.5,
          6,
          1
        ),
      ],
    },

    {
      aliases: [
        "Wide Grip T-Bar Row",
        "Wide Grip T Bar Row",
      ],

      sets: [
        makeSet(
          45,
          8,
          null
        ),

        makeSet(
          45,
          6,
          1
        ),
      ],
    },

    {
      aliases: [
        "Machine Shoulder Press",
      ],

      sets: [
        makeSet(
          75,
          7,
          0
        ),
      ],
    },

    {
      aliases: [
        "Dumbbell Lateral Raises",
        "Dumbell Lateral Raises",
      ],

      sets: [
        makeSet(
          12,
          6,
          0
        ),

        makeSet(
          10,
          8,
          0
        ),
      ],
    },

    {
      aliases: [
        "Rear Delt Reverse Fly",
      ],

      sets: [
        makeSet(
          7.5,
          9,
          0
        ),
      ],
    },

    {
      aliases: [
        "Single Arm Triceps Pushdown",
      ],

      sets: [
        makeSet(
          15,
          7,
          0
        ),

        makeSet(
          15,
          6,
          0
        ),
      ],
    },

    {
      aliases: [
        "Preacher Curl",
      ],

      sets: [
        makeSet(
          37.5,
          7,
          0
        ),
      ],
    },

    {
      aliases: [
        "Dips",
      ],

      sets: [
        makeSet(
          110,
          9,
          0
        ),
      ],
    },

    {
      aliases: [
        "Hammer Curl",
      ],

      sets: [
        makeSet(
          18,
          7.5,
          0
        ),
      ],
    },
  ];

  const lowerAStats = [
    {
      aliases: [
        "Leg Extension",
      ],

      sets: [
        makeSet(
          75,
          8.5,
          0
        ),

        makeSet(
          75,
          6.5,
          0
        ),
      ],
    },

    {
      aliases: [
        "Hack Squat",
      ],

      sets: [
        makeSet(
          55,
          7,
          1
        ),

        makeSet(
          55,
          5,
          2
        ),
      ],
    },

    {
      aliases: [
        "Barbell RDL",
      ],

      sets: [
        makeSet(
          115,
          6,
          null
        ),
      ],
    },

    {
      aliases: [
        "Lying Hamstring Curl",
      ],

      sets: [
        makeSet(
          45,
          5.5,
          0
        ),
      ],
    },

    {
      aliases: [
        "Calf Raises",
      ],

      sets: [
        makeSet(
          117,
          8,
          0
        ),

        makeSet(
          117,
          7,
          0
        ),
      ],
    },

    {
      aliases: [
        "Adductors",
      ],

      sets: [
        makeSet(
          60,
          7,
          0
        ),
      ],
    },

    {
      aliases: [
        "Weighted Ab Crunches",
      ],

      sets: [
        makeSet(
          40,
          7,
          0
        ),

        makeSet(
          40,
          6,
          0
        ),
      ],
    },
  ];

  const upperBStats = [
    {
      aliases: [
        "Wide Grip Lat Pulldown",
      ],

      sets: [
        makeSet(
          70,
          8,
          null
        ),

        makeSet(
          70,
          6,
          1
        ),
      ],
    },

    {
      aliases: [
        "Close Grip Cable Row",
        "Close Grip Row",
      ],

      sets: [
        makeSet(
          70,
          8,
          0
        ),
      ],
    },

    {
      aliases: [
        "Wide Grip T-Bar Row",
        "Wide Grip T Bar Row",
      ],

      sets: [
        makeSet(
          45,
          7.5,
          null
        ),

        makeSet(
          45,
          5.5,
          null
        ),
      ],
    },

    {
      aliases: [
        "Incline Smith Press",
      ],

      sets: [
        makeSet(
          70,
          5,
          null
        ),

        makeSet(
          70,
          4.5,
          null
        ),
      ],
    },

    {
      aliases: [
        "Flat Chest Press",
      ],

      sets: [
        makeSet(
          95,
          8,
          null
        ),

        makeSet(
          95,
          6,
          1
        ),
      ],
    },

    {
      aliases: [
        "Machine Shoulder Press",
      ],

      sets: [
        makeSet(
          75,
          6,
          0
        ),
      ],
    },

    {
      aliases: [
        "Dumbbell Lateral Raises",
        "Dumbell Lateral Raises",
      ],

      sets: [
        makeSet(
          12,
          6,
          0
        ),
      ],
    },

    {
      aliases: [
        "Rear Delt Reverse Fly",
      ],

      sets: [
        makeSet(
          9,
          8,
          0
        ),
      ],
    },

    {
      aliases: [
        "Single Arm Triceps Pushdown",
      ],

      sets: [
        makeSet(
          15,
          5,
          0
        ),

        makeSet(
          14.5,
          6,
          0
        ),
      ],
    },

    {
      aliases: [
        "Preacher Curl",
      ],

      sets: [
        makeSet(
          35,
          7,
          0
        ),

        makeSet(
          35,
          6,
          0
        ),
      ],
    },

    {
      aliases: [
        "Dips",
      ],

      sets: [
        makeSet(
          110,
          7.5,
          0
        ),
      ],
    },

    {
      aliases: [
        "Hammer Curl",
      ],

      sets: [
        makeSet(
          18,
          8,
          0
        ),
      ],
    },
  ];

  const lowerBStats = [
    {
      aliases: [
        "Barbell RDL",
      ],

      sets: [
        makeSet(
          110,
          7,
          1
        ),

        makeSet(
          110,
          8,
          null
        ),
      ],
    },

    {
      aliases: [
        "Lying Hamstring Curl",
      ],

      sets: [
        makeSet(
          40,
          7,
          0
        ),

        makeSet(
          40,
          6,
          0
        ),
      ],
    },

    {
      aliases: [
        "Leg Extension",
      ],

      sets: [
        makeSet(
          72.5,
          8,
          0
        ),

        makeSet(
          72.5,
          7.5,
          0
        ),
      ],
    },

    {
      aliases: [
        "Hack Squat",
      ],

      sets: [
        makeSet(
          55,
          6,
          1
        ),
      ],
    },

    {
      aliases: [
        "Hip Thrust",
      ],

      sets: [
        makeSet(
          50,
          6,
          null
        ),
      ],
    },

    {
      aliases: [
        "Calf Raises",
      ],

      sets: [
        makeSet(
          117.5,
          7.5,
          0
        ),

        makeSet(
          117.5,
          7.5,
          0
        ),
      ],
    },

    {
      aliases: [
        "Adductors",
      ],

      sets: [
        makeSet(
          55,
          6.5,
          0
        ),
      ],
    },

    {
      aliases: [
        "Weighted Ab Crunches",
      ],

      sets: [
        makeSet(
          40,
          6,
          0
        ),

        makeSet(
          40,
          6,
          0
        ),
      ],
    },
  ];

  // ============================================================
  // REPLACE TEST HISTORY
  // ============================================================

  await db.transaction(
    "rw",
    db.sessions,
    db.sets,
    db.appMeta,
    async () => {
      await db.sets.clear();
      await db.sessions.clear();

      await db.appMeta.delete(
        "activeWorkoutDraft"
      );

      await db.appMeta.delete(
        IMPORT_KEY
      );
    }
  );

  // ============================================================
  // CREATE BASELINE SESSIONS
  // ============================================================

  const upperBResult =
    await createBaselineSession({
      workoutDay:
        upperB,

      exercises:
        upperBExercises,

      date:
        UPPER_B_DATE,

      stats:
        upperBStats,
    });

  const lowerBResult =
    await createBaselineSession({
      workoutDay:
        lowerB,

      exercises:
        lowerBExercises,

      date:
        LOWER_B_DATE,

      stats:
        lowerBStats,
    });

  const upperAResult =
    await createBaselineSession({
      workoutDay:
        upperA,

      exercises:
        upperAExercises,

      date:
        UPPER_A_DATE,

      stats:
        upperAStats,
    });

  const lowerAResult =
    await createBaselineSession({
      workoutDay:
        lowerA,

      exercises:
        lowerAExercises,

      date:
        LOWER_A_DATE,

      stats:
        lowerAStats,
    });

  await db.appMeta.put({
    key:
      IMPORT_KEY,

    value: {
      importedAt:
        new Date().toISOString(),

      sessions: {
        upperA:
          upperAResult.sessionId,

        lowerA:
          lowerAResult.sessionId,

        upperB:
          upperBResult.sessionId,

        lowerB:
          lowerBResult.sessionId,
      },
    },
  });

  console.log(
    "Current workout stats imported successfully.",
    {
      upperA:
        upperAResult,

      lowerA:
        lowerAResult,

      upperB:
        upperBResult,

      lowerB:
        lowerBResult,
    }
  );
}