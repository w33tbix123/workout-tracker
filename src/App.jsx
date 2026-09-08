import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { db } from "./db";

import {
  exportWorkoutBackup,
  importWorkoutBackup,
} from "./backup";

import "./App.css";

// ============================================================
// HELPERS
// ============================================================

function calculateE1RM(weight, reps) {
  if (!weight || !reps) {
    return 0;
  }

  return Number(weight) * (1 + Number(reps) / 30);
}

function formatDate(dateString) {
  if (!dateString) {
    return "";
  }

  return new Date(
    dateString
  ).toLocaleDateString(
    "en-ZA",
    {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatShortDate(dateString) {
  if (!dateString) {
    return "";
  }

  return new Date(dateString).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
}

function formatTime(dateString) {
  if (!dateString) {
    return "";
  }

  return new Date(dateString).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compareSet(current, previous) {
  if (
    !previous ||
    current.weight === "" ||
    current.reps === ""
  ) {
    return null;
  }

  const currentWeight = Number(current.weight);
  const currentReps = Number(current.reps);

  const previousWeight = Number(previous.weight);
  const previousReps = Number(previous.reps);

  if (
    currentWeight > previousWeight &&
    currentReps >= previousReps
  ) {
    return {
      type: "improved",
      text: `↑ +${currentWeight - previousWeight}kg`,
    };
  }

  if (
    currentWeight === previousWeight &&
    currentReps > previousReps
  ) {
    const difference =
      currentReps - previousReps;

    return {
      type: "improved",
      text: `↑ +${difference} rep${
        difference === 1 ? "" : "s"
      }`,
    };
  }

  if (
    currentWeight < previousWeight &&
    currentReps <= previousReps
  ) {
    return {
      type: "regressed",
      text: `↓ ${currentWeight - previousWeight}kg`,
    };
  }

  if (
    currentWeight === previousWeight &&
    currentReps < previousReps
  ) {
    const difference =
      currentReps - previousReps;

    return {
      type: "regressed",
      text: `↓ ${difference} rep${
        Math.abs(difference) === 1 ? "" : "s"
      }`,
    };
  }

  if (
    currentWeight === previousWeight &&
    currentReps === previousReps
  ) {
    return {
      type: "same",
      text: "= Same",
    };
  }

  return {
    type: "mixed",
    text: "↔ Mixed",
  };
}

function getExerciseOrderKey(exercise) {
  if (!exercise) {
    return null;
  }

  if (exercise.alternativeGroup) {
    return `group:${exercise.alternativeGroup}`;
  }

  return `exercise:${exercise.id}`;
}

const EMPTY_EXERCISE_FORM = {
  name: "",
  targetSets: 2,
  warmupSets: 0,
  minReps: 6,
  maxReps: 8,
  targetRIR: "Failure",
  optional: false,
  hasAlternative: false,
  alternativeName: "",
};

// ============================================================
// APP
// ============================================================

function App() {
  const [activeTab, setActiveTab] =
    useState("home");

  const [
    selectedSplitId,
    setSelectedSplitId,
  ] = useState(null);

  const [
    selectedDayId,
    setSelectedDayId,
  ] = useState(null);

  const [
    activeWorkout,
    setActiveWorkout,
  ] = useState(false);

  const [
    workoutStartedAt,
    setWorkoutStartedAt,
  ] = useState(null);

  const [
    pausedWorkout,
    setPausedWorkout,
  ] = useState(null);

  const [
    workoutSets,
    setWorkoutSets,
  ] = useState({});

  const [
    activeExerciseIds,
    setActiveExerciseIds,
  ] = useState([]);

  const [
    selectedAlternatives,
    setSelectedAlternatives,
  ] = useState({});

  const [
    includedOptional,
    setIncludedOptional,
  ] = useState({});

  const [
    exerciseCompletionOrder,
    setExerciseCompletionOrder,
  ] = useState([]);

  const [
    workoutProgressOpen,
    setWorkoutProgressOpen,
  ] = useState(false);

  const [
    selectedHistorySessionId,
    setSelectedHistorySessionId,
  ] = useState(null);

  const [
    historySearch,
    setHistorySearch,
  ] = useState("");

  const [
    historyMonth,
    setHistoryMonth,
  ] = useState("all");

  const [
    historyYear,
    setHistoryYear,
  ] = useState("all");

  const [
    selectedProgressExercise,
    setSelectedProgressExercise,
  ] = useState("");

  const [
    progressSearch,
    setProgressSearch,
  ] = useState("");

  const [
    showSplitForm,
    setShowSplitForm,
  ] = useState(false);

  const [
    editingSplitId,
    setEditingSplitId,
  ] = useState(null);

  const [
    splitName,
    setSplitName,
  ] = useState("");

  const [
    showDayForm,
    setShowDayForm,
  ] = useState(false);

  const [
    editingDayId,
    setEditingDayId,
  ] = useState(null);

  const [
    dayName,
    setDayName,
  ] = useState("");

  const [
    dayOfWeek,
    setDayOfWeek,
  ] = useState("");

  const [
    showExerciseForm,
    setShowExerciseForm,
  ] = useState(false);

  const [
    editingExerciseId,
    setEditingExerciseId,
  ] = useState(null);

  const [
    exerciseForm,
    setExerciseForm,
  ] = useState({
    ...EMPTY_EXERCISE_FORM,
  });

  // ============================================================
  // LOAD DRAFT
  // ============================================================

  useEffect(() => {
    async function loadDraft() {
      try {
        const savedDraft =
          await db.appMeta.get(
            "activeWorkoutDraft"
          );

        if (savedDraft?.value) {
          setPausedWorkout(
            savedDraft.value
          );
        }
      } catch (error) {
        console.error(
          "Could not load workout draft:",
          error
        );
      }
    }

    loadDraft();
  }, []);

  // ============================================================
  // SPLITS
  // ============================================================

  const splits = useLiveQuery(
    async () => {
      const all =
        await db.splits.toArray();

      return all.filter(
        (split) => !split.archived
      );
    },
    []
  );

  const selectedSplit =
    useLiveQuery(
      async () => {
        if (!selectedSplitId) {
          return null;
        }

        return db.splits.get(
          selectedSplitId
        );
      },
      [selectedSplitId]
    );

  // ============================================================
  // DAYS
  // ============================================================

  const workoutDays =
    useLiveQuery(
      async () => {
        if (!selectedSplitId) {
          return [];
        }

        const days =
          await db.workoutDays
            .where("splitId")
            .equals(
              selectedSplitId
            )
            .toArray();

        return days.filter(
          (day) =>
            !day.archived
        );
      },
      [selectedSplitId]
    );

  const selectedDay =
    useLiveQuery(
      async () => {
        if (!selectedDayId) {
          return null;
        }

        return db.workoutDays.get(
          selectedDayId
        );
      },
      [selectedDayId]
    );

  // ============================================================
  // EXERCISES
  // ============================================================

  const exercises =
    useLiveQuery(
      async () => {
        if (!selectedDayId) {
          return [];
        }

        const result =
          await db.exercises
            .where(
              "workoutDayId"
            )
            .equals(
              selectedDayId
            )
            .toArray();

        return result
          .filter(
            (exercise) =>
              !exercise.archived
          )
          .sort(
            (a, b) =>
              Number(a.order) -
              Number(b.order)
          );
      },
      [selectedDayId]
    );

  const alternativeGroups = {};

  (exercises || []).forEach(
    (exercise) => {
      if (
        !exercise.alternativeGroup
      ) {
        return;
      }

      const group =
        exercise.alternativeGroup;

      if (
        !alternativeGroups[group]
      ) {
        alternativeGroups[group] =
          [];
      }

      alternativeGroups[
        group
      ].push(exercise);
    }
  );

  function getSelectedAlternative(
    groupName
  ) {
    return (
      selectedAlternatives[
        groupName
      ] ??
      alternativeGroups[
        groupName
      ]?.[0]?.id ??
      null
    );
  }

  // ============================================================
  // PREVIOUS PERFORMANCE
  // ============================================================

  const previousExerciseData =
    useLiveQuery(
      async () => {
        if (
          !selectedDayId ||
          !exercises?.length
        ) {
          return {
            latestDaySession:
              null,
            exerciseData: {},
          };
        }

        const sessions =
          await db.sessions
            .where(
              "workoutDayId"
            )
            .equals(
              selectedDayId
            )
            .toArray();

        sessions.sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );

        const latestDaySession =
          sessions[0] || null;

        const exerciseData = {};

        for (
          const exercise of exercises
        ) {
          let found = null;

          for (
            const session of sessions
          ) {
            const sets =
              await db.sets
                .where(
                  "sessionId"
                )
                .equals(
                  session.id
                )
                .filter(
                  (set) =>
                    set.exerciseId ===
                    exercise.id
                )
                .toArray();

            if (sets.length) {
              sets.sort(
                (a, b) =>
                  a.setNumber -
                  b.setNumber
              );

              found = {
                session,
                sets,
              };

              break;
            }
          }

          const skippedLastWorkout =
            !!latestDaySession
              ?.skippedExerciseIds
              ?.includes(
                exercise.id
              );

          exerciseData[
            exercise.id
          ] = {
            lastPerformedSession:
              found?.session ||
              null,

            lastPerformedSets:
              found?.sets ||
              [],

            skippedLastWorkout,
          };
        }

        return {
          latestDaySession,
          exerciseData,
        };
      },
      [
        selectedDayId,
        exercises?.length,
      ]
    );

  // ============================================================
  // ORDER FROM LAST SESSION
  // ============================================================

  const orderedExercises =
    useMemo(() => {
      const source = [
        ...(exercises || []),
      ];

      const savedOrder =
        previousExerciseData
          ?.latestDaySession
          ?.exerciseOrderKeys ||
        [];

      if (!savedOrder.length) {
        return source;
      }

      const rankMap =
        new Map();

      savedOrder.forEach(
        (key, index) => {
          rankMap.set(
            key,
            index
          );
        }
      );

      return source.sort(
        (a, b) => {
          const keyA =
            getExerciseOrderKey(a);

          const keyB =
            getExerciseOrderKey(b);

          const rankA =
            rankMap.has(keyA)
              ? rankMap.get(keyA)
              : 9999;

          const rankB =
            rankMap.has(keyB)
              ? rankMap.get(keyB)
              : 9999;

          if (
            rankA !== rankB
          ) {
            return rankA -
              rankB;
          }

          return (
            Number(a.order) -
            Number(b.order)
          );
        }
      );
    }, [
      exercises,
      previousExerciseData,
    ]);

  function getCurrentUniqueOrderKeys() {
    const seen =
      new Set();

    const keys = [];

    (
      orderedExercises || []
    ).forEach(
      (exercise) => {
        const key =
          getExerciseOrderKey(
            exercise
          );

        if (
          !key ||
          seen.has(key)
        ) {
          return;
        }

        seen.add(key);
        keys.push(key);
      }
    );

    return keys;
  }

  // ============================================================
  // AUTO SAVE ACTIVE WORKOUT
  // ============================================================

  useEffect(() => {
    if (
      !activeWorkout ||
      !selectedDayId ||
      !workoutStartedAt
    ) {
      return;
    }

    const timer =
      setTimeout(
        async () => {
          const draft = {
            splitId:
              selectedSplitId,

            workoutDayId:
              selectedDayId,

            splitName:
              selectedSplit?.name ||
              "",

            workoutDayName:
              selectedDay?.name ||
              "",

            startedAt:
              workoutStartedAt,

            workoutSets,

            activeExerciseIds,

            selectedAlternatives,

            includedOptional,

            exerciseCompletionOrder,
          };

          try {
            await db.appMeta.put({
              key:
                "activeWorkoutDraft",

              value: draft,
            });

            setPausedWorkout(
              draft
            );
          } catch (error) {
            console.error(
              "Could not save workout draft:",
              error
            );
          }
        },
        150
      );

    return () =>
      clearTimeout(timer);
  }, [
    activeWorkout,
    selectedSplitId,
    selectedDayId,
    selectedSplit?.name,
    selectedDay?.name,
    workoutStartedAt,
    workoutSets,
    activeExerciseIds,
    selectedAlternatives,
    includedOptional,
    exerciseCompletionOrder,
  ]);

  // ============================================================
  // HISTORY
  // ============================================================

  const historySessions =
    useLiveQuery(
      async () => {
        const sessions =
          await db.sessions.toArray();

        const days =
          await db.workoutDays.toArray();

        const dayMap = {};

        days.forEach((day) => {
          dayMap[day.id] =
            day;
        });

        return sessions
          .sort(
            (a, b) =>
              new Date(b.date) -
              new Date(a.date)
          )
          .map((session) => ({
            ...session,

            workoutDay:
              dayMap[
                session.workoutDayId
              ],
          }));
      },
      []
    );

  const historyYears = [
    ...new Set(
      (
        historySessions || []
      ).map((session) =>
        new Date(
          session.date
        ).getFullYear()
      )
    ),
  ].sort(
    (a, b) => b - a
  );

  const filteredHistorySessions =
    (
      historySessions || []
    ).filter((session) => {
      const date =
        new Date(
          session.date
        );

      const matchesSearch =
        session.workoutDay
          ?.name
          ?.toLowerCase()
          .includes(
            historySearch.toLowerCase()
          ) ?? false;

      const matchesMonth =
        historyMonth ===
          "all" ||
        date.getMonth() ===
          Number(
            historyMonth
          );

      const matchesYear =
        historyYear ===
          "all" ||
        date.getFullYear() ===
          Number(
            historyYear
          );

      return (
        matchesSearch &&
        matchesMonth &&
        matchesYear
      );
    });

  const selectedHistorySession =
    useLiveQuery(
      async () => {
        if (
          !selectedHistorySessionId
        ) {
          return null;
        }

        const session =
          await db.sessions.get(
            selectedHistorySessionId
          );

        if (!session) {
          return null;
        }

        const workoutDay =
          await db.workoutDays.get(
            session.workoutDayId
          );

        const allExercises =
          await db.exercises
            .where(
              "workoutDayId"
            )
            .equals(
              session.workoutDayId
            )
            .toArray();

        const sets =
          await db.sets
            .where(
              "sessionId"
            )
            .equals(
              session.id
            )
            .toArray();

        const groupedSets = {};

        sets.forEach((set) => {
          if (
            !groupedSets[
              set.exerciseId
            ]
          ) {
            groupedSets[
              set.exerciseId
            ] = [];
          }

          groupedSets[
            set.exerciseId
          ].push(set);
        });

        Object.values(
          groupedSets
        ).forEach(
          (items) => {
            items.sort(
              (a, b) =>
                a.setNumber -
                b.setNumber
            );
          }
        );

        return {
          session,
          workoutDay,
          allExercises,
          sets: groupedSets,
        };
      },
      [
        selectedHistorySessionId,
      ]
    );

  // ============================================================
  // PROGRESS
  // ============================================================

  const allExerciseNames =
    useLiveQuery(
      async () => {
        const all =
          await db.exercises.toArray();

        return [
          ...new Set(
            all.map(
              (exercise) =>
                exercise.name
            )
          ),
        ].sort(
          (a, b) =>
            a.localeCompare(b)
        );
      },
      []
    );

  const filteredProgressExercises =
    (
      allExerciseNames || []
    ).filter((name) =>
      name
        .toLowerCase()
        .includes(
          progressSearch
            .trim()
            .toLowerCase()
        )
    );

  const progressData =
    useLiveQuery(
      async () => {
        if (
          !selectedProgressExercise
        ) {
          return null;
        }

        const allExercises =
          await db.exercises.toArray();

        const matchingExercises =
          allExercises.filter(
            (exercise) =>
              exercise.name ===
              selectedProgressExercise
          );

        const exerciseIds =
          matchingExercises.map(
            (exercise) =>
              exercise.id
          );

        const allSets =
          await db.sets.toArray();

        const matchingSets =
          allSets.filter((set) =>
            exerciseIds.includes(
              set.exerciseId
            )
          );

        if (
          !matchingSets.length
        ) {
          return {
            sessions: [],
            bestWeight: 0,
            bestE1RM: 0,
            change: 0,
          };
        }

        const sessions =
          await db.sessions.toArray();

        const sessionMap = {};

        sessions.forEach(
          (session) => {
            sessionMap[
              session.id
            ] = session;
          }
        );

        const grouped = {};

        matchingSets.forEach(
          (set) => {
            const session =
              sessionMap[
                set.sessionId
              ];

            if (!session) {
              return;
            }

            if (
              !grouped[
                session.id
              ]
            ) {
              grouped[
                session.id
              ] = {
                sessionId:
                  session.id,

                date:
                  session.date,

                sets: [],
              };
            }

            grouped[
              session.id
            ].sets.push(set);
          }
        );

        const sessionData =
          Object.values(grouped)
            .map((session) => {
              const sets = [
                ...session.sets,
              ]
                .sort(
                  (a, b) =>
                    a.setNumber -
                    b.setNumber
                )
                .map((set) => ({
                  ...set,

                  e1rm:
                    calculateE1RM(
                      set.weight,
                      set.reps
                    ),
                }));

              const bestSet =
                sets.reduce(
                  (
                    best,
                    current
                  ) =>
                    current.e1rm >
                    best.e1rm
                      ? current
                      : best
                );

              return {
                ...session,
                sets,

                bestWeight:
                  Math.max(
                    ...sets.map(
                      (set) =>
                        Number(
                          set.weight
                        )
                    )
                  ),

                bestE1RM:
                  bestSet.e1rm,
              };
            })
            .sort(
              (a, b) =>
                new Date(a.date) -
                new Date(b.date)
            );

        const bestWeight =
          Math.max(
            ...sessionData.map(
              (session) =>
                session.bestWeight
            )
          );

        const bestE1RM =
          Math.max(
            ...sessionData.map(
              (session) =>
                session.bestE1RM
            )
          );

        const first =
          sessionData[0]
            ?.bestE1RM || 0;

        const latest =
          sessionData[
            sessionData.length - 1
          ]?.bestE1RM || 0;

        const change =
          first > 0
            ? ((latest -
                first) /
                first) *
              100
            : 0;

        return {
          sessions:
            sessionData,

          bestWeight,
          bestE1RM,
          change,
        };
      },
      [
        selectedProgressExercise,
      ]
    );

  // ============================================================
  // MANAGEMENT
  // ============================================================

  function openNewSplit() {
    setEditingSplitId(null);
    setSplitName("");
    setShowSplitForm(true);
  }

  function openEditSplit(split) {
    setEditingSplitId(
      split.id
    );

    setSplitName(
      split.name
    );

    setShowSplitForm(true);
  }

  async function saveSplit() {
    const name =
      splitName.trim();

    if (!name) {
      alert(
        "Enter a split name."
      );
      return;
    }

    if (editingSplitId) {
      await db.splits.update(
        editingSplitId,
        { name }
      );
    } else {
      await db.splits.add({
        name,
        archived: false,
      });
    }

    setShowSplitForm(false);
    setEditingSplitId(null);
    setSplitName("");
  }

  async function deleteSplit(split) {
    const confirmed =
      window.confirm(
        `Remove "${split.name}"?\n\nPrevious workout history will stay saved.`
      );

    if (!confirmed) {
      return;
    }

    const days =
      await db.workoutDays
        .where("splitId")
        .equals(split.id)
        .toArray();

    await db.transaction(
      "rw",
      db.splits,
      db.workoutDays,
      db.exercises,
      async () => {
        await db.splits.update(
          split.id,
          {
            archived: true,
          }
        );

        for (const day of days) {
          await db.workoutDays.update(
            day.id,
            {
              archived: true,
            }
          );

          const dayExercises =
            await db.exercises
              .where(
                "workoutDayId"
              )
              .equals(day.id)
              .toArray();

          for (
            const exercise of dayExercises
          ) {
            await db.exercises.update(
              exercise.id,
              {
                archived: true,
              }
            );
          }
        }
      }
    );

    setSelectedSplitId(null);
    setSelectedDayId(null);
  }

  function openNewDay() {
    setEditingDayId(null);
    setDayName("");
    setDayOfWeek("");
    setShowDayForm(true);
  }

  function openEditDay(day) {
    setEditingDayId(
      day.id
    );

    setDayName(
      day.name
    );

    setDayOfWeek(
      day.dayOfWeek || ""
    );

    setShowDayForm(true);
  }

  async function saveDay() {
    const name =
      dayName.trim();

    if (!name) {
      alert(
        "Enter a workout day name."
      );
      return;
    }

    if (editingDayId) {
      await db.workoutDays.update(
        editingDayId,
        {
          name,

          dayOfWeek:
            dayOfWeek.trim(),
        }
      );
    } else {
      await db.workoutDays.add({
        splitId:
          selectedSplitId,

        name,

        dayOfWeek:
          dayOfWeek.trim(),

        archived: false,
      });
    }

    setShowDayForm(false);
    setEditingDayId(null);
    setDayName("");
    setDayOfWeek("");
  }

  async function deleteDay(day) {
    const confirmed =
      window.confirm(
        `Remove "${day.name}"?\n\nPrevious workouts will remain in History.`
      );

    if (!confirmed) {
      return;
    }

    await db.workoutDays.update(
      day.id,
      {
        archived: true,
      }
    );

    const dayExercises =
      await db.exercises
        .where(
          "workoutDayId"
        )
        .equals(day.id)
        .toArray();

    for (
      const exercise of dayExercises
    ) {
      await db.exercises.update(
        exercise.id,
        {
          archived: true,
        }
      );
    }

    setSelectedDayId(null);
  }

  function openNewExercise() {
    setEditingExerciseId(null);

    setExerciseForm({
      ...EMPTY_EXERCISE_FORM,
    });

    setShowExerciseForm(true);
  }

  async function openEditExercise(exercise) {
    let hasAlternative =
      false;

    let alternativeName =
      "";

    if (
      exercise.alternativeGroup
    ) {
      const partners =
        await db.exercises
          .where(
            "workoutDayId"
          )
          .equals(
            exercise.workoutDayId
          )
          .filter(
            (item) =>
              !item.archived &&
              item.alternativeGroup ===
                exercise.alternativeGroup &&
              item.id !==
                exercise.id
          )
          .toArray();

      if (partners.length) {
        hasAlternative =
          true;

        alternativeName =
          partners[0].name;
      }
    }

    setEditingExerciseId(
      exercise.id
    );

    setExerciseForm({
      name:
        exercise.name || "",

      targetSets:
        exercise.targetSets ??
        2,

      warmupSets:
        exercise.warmupSets ??
        0,

      minReps:
        exercise.minReps ??
        6,

      maxReps:
        exercise.maxReps ??
        8,

      targetRIR:
        exercise.targetRIR ??
        "Failure",

      optional:
        !!exercise.optional,

      hasAlternative,

      alternativeName,
    });

    setShowExerciseForm(true);
  }

  async function saveExercise() {
    const name =
      exerciseForm.name.trim();

    if (!name) {
      alert(
        "Enter an exercise name."
      );
      return;
    }

    if (
      exerciseForm.hasAlternative &&
      !exerciseForm.alternativeName.trim()
    ) {
      alert(
        "Enter an alternative exercise."
      );
      return;
    }

    const template = {
      targetSets:
        Number(
          exerciseForm.targetSets
        ),

      warmupSets:
        Number(
          exerciseForm.warmupSets
        ),

      minReps:
        Number(
          exerciseForm.minReps
        ),

      maxReps:
        Number(
          exerciseForm.maxReps
        ),

      targetRIR:
        exerciseForm.targetRIR.trim(),

      optional:
        !!exerciseForm.optional,

      archived: false,
    };

    if (!editingExerciseId) {
      const existing =
        await db.exercises
          .where(
            "workoutDayId"
          )
          .equals(
            selectedDayId
          )
          .toArray();

      const orders =
        existing.map(
          (exercise) =>
            Number(
              exercise.order
            ) || 0
        );

      const nextOrder =
        orders.length
          ? Math.max(
              ...orders
            ) + 1
          : 1;

      if (
        exerciseForm.hasAlternative
      ) {
        const group =
          `alternative-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        await db.exercises.bulkAdd(
          [
            {
              workoutDayId:
                selectedDayId,

              name,

              order:
                nextOrder,

              alternativeGroup:
                group,

              ...template,
            },

            {
              workoutDayId:
                selectedDayId,

              name:
                exerciseForm.alternativeName.trim(),

              order:
                nextOrder +
                0.01,

              alternativeGroup:
                group,

              ...template,
            },
          ]
        );
      } else {
        await db.exercises.add({
          workoutDayId:
            selectedDayId,

          name,

          order:
            nextOrder,

          alternativeGroup:
            null,

          ...template,
        });
      }
    } else {
      const current =
        await db.exercises.get(
          editingExerciseId
        );

      if (!current) {
        return;
      }

      let partners = [];

      if (
        current.alternativeGroup
      ) {
        partners =
          await db.exercises
            .where(
              "workoutDayId"
            )
            .equals(
              current.workoutDayId
            )
            .filter(
              (item) =>
                !item.archived &&
                item.alternativeGroup ===
                  current.alternativeGroup &&
                item.id !==
                  current.id
            )
            .toArray();
      }

      if (
        exerciseForm.hasAlternative
      ) {
        const group =
          current.alternativeGroup ||
          `alternative-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        await db.exercises.update(
          current.id,
          {
            name,

            alternativeGroup:
              group,

            ...template,
          }
        );

        if (partners.length) {
          await db.exercises.update(
            partners[0].id,
            {
              name:
                exerciseForm.alternativeName.trim(),

              alternativeGroup:
                group,

              ...template,
            }
          );
        } else {
          await db.exercises.add({
            workoutDayId:
              current.workoutDayId,

            name:
              exerciseForm.alternativeName.trim(),

            order:
              Number(
                current.order
              ) + 0.01,

            alternativeGroup:
              group,

            ...template,
          });
        }
      } else {
        await db.exercises.update(
          current.id,
          {
            name,

            alternativeGroup:
              null,

            ...template,
          }
        );

        for (
          const partner of partners
        ) {
          await db.exercises.update(
            partner.id,
            {
              archived: true,
            }
          );
        }
      }
    }

    setShowExerciseForm(false);
    setEditingExerciseId(null);

    setExerciseForm({
      ...EMPTY_EXERCISE_FORM,
    });
  }

  async function deleteExercise(exercise) {
    const confirmed =
      window.confirm(
        `Remove "${exercise.name}"?\n\nPrevious workout history will remain.`
      );

    if (!confirmed) {
      return;
    }

    if (
      exercise.alternativeGroup
    ) {
      const group =
        await db.exercises
          .where(
            "workoutDayId"
          )
          .equals(
            exercise.workoutDayId
          )
          .filter(
            (item) =>
              item.alternativeGroup ===
              exercise.alternativeGroup
          )
          .toArray();

      for (
        const item of group
      ) {
        await db.exercises.update(
          item.id,
          {
            archived: true,
          }
        );
      }
    } else {
      await db.exercises.update(
        exercise.id,
        {
          archived: true,
        }
      );
    }
  }

  // ============================================================
  // WORKOUT SETS
  // ============================================================

  function createExerciseSets(exercise) {
    const previous =
      previousExerciseData
        ?.exerciseData?.[
          exercise.id
        ];

    const previousSets =
      previous
        ?.lastPerformedSets ||
      [];

    const result = [];

    const setCount =
      Number(
        exercise.targetSets ||
          1
      );

    for (
      let index = 0;
      index < setCount;
      index++
    ) {
      const previousSet =
        previousSets[
          index
        ];

      result.push({
        weight:
          previousSet
            ?.weight ?? "",

        reps:
          previousSet
            ?.reps ?? "",

        rir:
          previousSet
            ?.rir ?? "",

        completed: false,
      });
    }

    return result;
  }

  async function startWorkout() {
    if (pausedWorkout) {
      const discard =
        window.confirm(
          `${
            pausedWorkout.workoutDayName ||
            "Another workout"
          } is already in progress.\n\nPress OK to discard it and start this workout.\n\nPress Cancel to keep the existing workout.`
        );

      if (!discard) {
        return;
      }

      await db.appMeta.delete(
        "activeWorkoutDraft"
      );

      setPausedWorkout(null);
    }

    const initialSets = {};

    const initialActiveIds =
      [];

    const initialAlternatives =
      {};

    (
      exercises || []
    ).forEach(
      (exercise) => {
        initialSets[
          exercise.id
        ] =
          createExerciseSets(
            exercise
          );
      }
    );

    const handledGroups =
      new Set();

    (
      orderedExercises || []
    ).forEach(
      (exercise) => {
        if (
          exercise.alternativeGroup
        ) {
          if (
            handledGroups.has(
              exercise.alternativeGroup
            )
          ) {
            return;
          }

          handledGroups.add(
            exercise.alternativeGroup
          );

          const group =
            alternativeGroups[
              exercise.alternativeGroup
            ] || [];

          let defaultExercise =
            group[0];

          const performed =
            [...group]
              .map(
                (item) => ({
                  exercise: item,

                  date:
                    previousExerciseData
                      ?.exerciseData?.[
                        item.id
                      ]
                      ?.lastPerformedSession
                      ?.date ||
                    null,
                })
              )
              .filter(
                (item) =>
                  item.date
              )
              .sort(
                (a, b) =>
                  new Date(
                    b.date
                  ) -
                  new Date(
                    a.date
                  )
              );

          if (
            performed.length
          ) {
            defaultExercise =
              performed[0]
                .exercise;
          }

          if (
            defaultExercise
          ) {
            initialAlternatives[
              exercise.alternativeGroup
            ] =
              defaultExercise.id;

            initialActiveIds.push(
              defaultExercise.id
            );
          }

          return;
        }

        if (
          exercise.optional
        ) {
          return;
        }

        initialActiveIds.push(
          exercise.id
        );
      }
    );

    const startedAt =
      new Date().toISOString();

    const draft = {
      splitId:
        selectedSplitId,

      workoutDayId:
        selectedDayId,

      splitName:
        selectedSplit?.name ||
        "",

      workoutDayName:
        selectedDay?.name ||
        "",

      startedAt,

      workoutSets:
        initialSets,

      activeExerciseIds:
        initialActiveIds,

      selectedAlternatives:
        initialAlternatives,

      includedOptional: {},

      exerciseCompletionOrder:
        [],
    };

    await db.appMeta.put({
      key:
        "activeWorkoutDraft",

      value: draft,
    });

    setWorkoutStartedAt(
      startedAt
    );

    setWorkoutSets(
      initialSets
    );

    setActiveExerciseIds(
      initialActiveIds
    );

    setSelectedAlternatives(
      initialAlternatives
    );

    setIncludedOptional(
      {}
    );

    setExerciseCompletionOrder(
      []
    );

    setPausedWorkout(
      draft
    );

    setWorkoutProgressOpen(
      false
    );

    setActiveWorkout(
      true
    );
  }

  function updateExerciseCompletionStatus(
    exerciseId,
    nextSets
  ) {
    const exercise =
      (exercises || []).find(
        (item) =>
          item.id ===
          exerciseId
      );

    if (!exercise) {
      return;
    }

    const key =
      getExerciseOrderKey(
        exercise
      );

    const allComplete =
      nextSets.length > 0 &&
      nextSets.every(
        (set) =>
          set.completed
      );

    setExerciseCompletionOrder(
      (previous) => {
        const without =
          previous.filter(
            (item) =>
              item !== key
          );

        if (
          allComplete
        ) {
          return [
            ...without,
            key,
          ];
        }

        return without;
      }
    );
  }

  function selectAlternativeDuringWorkout(
    groupName,
    exerciseId
  ) {
    const group =
      alternativeGroups[
        groupName
      ] || [];

    const groupIds =
      group.map(
        (exercise) =>
          exercise.id
      );

    setSelectedAlternatives(
      (previous) => ({
        ...previous,

        [groupName]:
          exerciseId,
      })
    );

    setActiveExerciseIds(
      (previous) => [
        ...previous.filter(
          (id) =>
            !groupIds.includes(
              id
            )
        ),

        exerciseId,
      ]
    );
  }

  function includeOptionalExercise(exerciseId) {
    setIncludedOptional(
      (previous) => ({
        ...previous,

        [exerciseId]:
          true,
      })
    );

    setActiveExerciseIds(
      (previous) =>
        previous.includes(
          exerciseId
        )
          ? previous
          : [
              ...previous,
              exerciseId,
            ]
    );
  }

  function skipOptionalExercise(exerciseId) {
    setIncludedOptional(
      (previous) => ({
        ...previous,

        [exerciseId]:
          false,
      })
    );

    setActiveExerciseIds(
      (previous) =>
        previous.filter(
          (id) =>
            id !==
            exerciseId
        )
    );
  }

  function updateSet(
    exerciseId,
    setIndex,
    field,
    value
  ) {
    setWorkoutSets(
      (previous) => ({
        ...previous,

        [exerciseId]:
          (
            previous[
              exerciseId
            ] || []
          ).map(
            (set, index) =>
              index ===
              setIndex
                ? {
                    ...set,
                    [field]:
                      value,
                  }
                : set
          ),
      })
    );
  }

  function toggleSetComplete(
    exerciseId,
    setIndex
  ) {
    const currentSets =
      workoutSets[
        exerciseId
      ] || [];

    const currentSet =
      currentSets[
        setIndex
      ];

    if (!currentSet) {
      return;
    }

    if (
      !currentSet.completed &&
      (
        currentSet.weight ===
          "" ||
        currentSet.reps ===
          ""
      )
    ) {
      alert(
        "Enter weight and reps before completing the set."
      );

      return;
    }

    const nextSets =
      currentSets.map(
        (set, index) =>
          index ===
          setIndex
            ? {
                ...set,

                completed:
                  !set.completed,
              }
            : set
      );

    setWorkoutSets(
      (previous) => ({
        ...previous,

        [exerciseId]:
          nextSets,
      })
    );

    updateExerciseCompletionStatus(
      exerciseId,
      nextSets
    );
  }

  function addSet(exerciseId) {
    const currentSets =
      workoutSets[
        exerciseId
      ] || [];

    const nextSets = [
      ...currentSets,

      {
        weight: "",
        reps: "",
        rir: "",
        completed: false,
      },
    ];

    setWorkoutSets(
      (previous) => ({
        ...previous,

        [exerciseId]:
          nextSets,
      })
    );

    updateExerciseCompletionStatus(
      exerciseId,
      nextSets
    );
  }

  function removeSet(
    exerciseId,
    setIndex
  ) {
    const currentSets =
      workoutSets[
        exerciseId
      ] || [];

    const set =
      currentSets[
        setIndex
      ];

    if (!set) {
      return;
    }

    const hasData =
      set.weight !== "" ||
      set.reps !== "" ||
      set.rir !== "" ||
      set.completed;

    if (hasData) {
      const confirmed =
        window.confirm(
          `Remove Set ${
            setIndex + 1
          }?\n\nThe values entered for this set will be removed from the current workout.`
        );

      if (!confirmed) {
        return;
      }
    }

    const nextSets =
      currentSets.filter(
        (_, index) =>
          index !==
          setIndex
      );

    setWorkoutSets(
      (previous) => ({
        ...previous,

        [exerciseId]:
          nextSets,
      })
    );

    updateExerciseCompletionStatus(
      exerciseId,
      nextSets
    );
  }

  // ============================================================
  // PAUSE VIA BACK BUTTON
  // ============================================================

  function makeCurrentDraft() {
    return {
      splitId:
        selectedSplitId,

      workoutDayId:
        selectedDayId,

      splitName:
        selectedSplit?.name ||
        "",

      workoutDayName:
        selectedDay?.name ||
        "",

      startedAt:
        workoutStartedAt,

      workoutSets,

      activeExerciseIds,

      selectedAlternatives,

      includedOptional,

      exerciseCompletionOrder,
    };
  }

  async function leaveActiveWorkout() {
    const draft =
      makeCurrentDraft();

    await db.appMeta.put({
      key:
        "activeWorkoutDraft",

      value: draft,
    });

    setPausedWorkout(
      draft
    );

    setActiveWorkout(
      false
    );

    setWorkoutProgressOpen(
      false
    );

    setSelectedProgressExercise(
      ""
    );

    setProgressSearch(
      ""
    );

    setSelectedSplitId(
      null
    );

    setSelectedDayId(
      null
    );

    setActiveTab(
      "home"
    );
  }

  async function resumeWorkout() {
    if (!pausedWorkout) {
      return;
    }

    const draft =
      pausedWorkout;

    const day =
      await db.workoutDays.get(
        draft.workoutDayId
      );

    if (!day) {
      alert(
        "This workout day no longer exists."
      );

      return;
    }

    const split =
      await db.splits.get(
        draft.splitId ||
          day.splitId
      );

    setSelectedSplitId(
      split?.id ||
        day.splitId
    );

    setSelectedDayId(
      day.id
    );

    setWorkoutStartedAt(
      draft.startedAt ||
        new Date().toISOString()
    );

    setWorkoutSets(
      draft.workoutSets ||
        {}
    );

    setActiveExerciseIds(
      draft.activeExerciseIds ||
        []
    );

    setSelectedAlternatives(
      draft.selectedAlternatives ||
        {}
    );

    setIncludedOptional(
      draft.includedOptional ||
        {}
    );

    setExerciseCompletionOrder(
      draft.exerciseCompletionOrder ||
        []
    );

    setWorkoutProgressOpen(
      false
    );

    setActiveWorkout(
      true
    );
  }

  async function discardPausedWorkout() {
    if (!pausedWorkout) {
      return;
    }

    const confirmed =
      window.confirm(
        `Discard ${
          pausedWorkout.workoutDayName ||
          "this workout"
        }?\n\nAll unfinished workout entries will be lost.`
      );

    if (!confirmed) {
      return;
    }

    await db.appMeta.delete(
      "activeWorkoutDraft"
    );

    setPausedWorkout(null);
    setWorkoutStartedAt(null);
    setWorkoutSets({});
    setActiveExerciseIds([]);
    setSelectedAlternatives({});
    setIncludedOptional({});
    setExerciseCompletionOrder([]);
  }

  // ============================================================
  // FINISH WORKOUT
  // ============================================================

  async function finishWorkout() {
    const completedSets =
      [];

    const skippedExerciseIds =
      [];

    const handledGroups =
      new Set();

    (
      orderedExercises || []
    ).forEach(
      (exercise) => {
        if (
          exercise.alternativeGroup
        ) {
          if (
            handledGroups.has(
              exercise.alternativeGroup
            )
          ) {
            return;
          }

          handledGroups.add(
            exercise.alternativeGroup
          );

          const selectedId =
            getSelectedAlternative(
              exercise.alternativeGroup
            );

          if (!selectedId) {
            return;
          }

          const sets =
            workoutSets[
              selectedId
            ] || [];

          const completed =
            sets.filter(
              (set) =>
                set.completed
            );

          if (
            !completed.length
          ) {
            skippedExerciseIds.push(
              selectedId
            );
          }

          completed.forEach(
            (set) => {
              const originalIndex =
                sets.indexOf(
                  set
                );

              completedSets.push({
                exerciseId:
                  selectedId,

                setNumber:
                  originalIndex +
                  1,

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
                  set.rir ===
                  ""
                    ? null
                    : Number(
                        set.rir
                      ),
              });
            }
          );

          return;
        }

        if (
          exercise.optional &&
          !includedOptional[
            exercise.id
          ]
        ) {
          skippedExerciseIds.push(
            exercise.id
          );

          return;
        }

        const sets =
          workoutSets[
            exercise.id
          ] || [];

        const completed =
          sets.filter(
            (set) =>
              set.completed
          );

        if (
          !completed.length
        ) {
          skippedExerciseIds.push(
            exercise.id
          );
        }

        completed.forEach(
          (set) => {
            const originalIndex =
              sets.indexOf(
                set
              );

            completedSets.push({
              exerciseId:
                exercise.id,

              setNumber:
                originalIndex +
                1,

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
                set.rir ===
                ""
                  ? null
                  : Number(
                      set.rir
                    ),
            });
          }
        );
      }
    );

    const confirmed =
      window.confirm(
        `Complete this workout?\n\nCompleted sets: ${completedSets.length}\nSkipped exercises: ${skippedExerciseIds.length}\n\nOnly checked sets will be saved as performed.`
      );

    if (!confirmed) {
      return;
    }

    const currentOrderKeys =
      getCurrentUniqueOrderKeys();

    const finalExerciseOrder =
      [
        ...exerciseCompletionOrder,

        ...currentOrderKeys.filter(
          (key) =>
            !exerciseCompletionOrder.includes(
              key
            )
        ),
      ];

    const sessionId =
      await db.sessions.add({
        workoutDayId:
          selectedDayId,

        date:
          new Date().toISOString(),

        startedAt:
          workoutStartedAt,

        skippedExerciseIds,

        completedSetCount:
          completedSets.length,

        exerciseOrderKeys:
          finalExerciseOrder,
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

    await db.appMeta.delete(
      "activeWorkoutDraft"
    );

    setPausedWorkout(null);
    setActiveWorkout(false);
    setWorkoutStartedAt(null);
    setWorkoutProgressOpen(false);
    setWorkoutSets({});
    setActiveExerciseIds([]);
    setSelectedAlternatives({});
    setIncludedOptional({});
    setExerciseCompletionOrder([]);
    setSelectedDayId(null);
    setSelectedSplitId(null);
    setActiveTab("history");

    alert(
      "Workout completed and saved."
    );
  }

  // ============================================================
  // PROGRESS FROM WORKOUT
  // ============================================================

  function openWorkoutExerciseProgress(
    exerciseName
  ) {
    setSelectedProgressExercise(
      exerciseName
    );

    setProgressSearch(
      exerciseName
    );

    setWorkoutProgressOpen(
      true
    );
  }

  function closeWorkoutExerciseProgress() {
    setWorkoutProgressOpen(
      false
    );
  }

  // ============================================================
  // BACKUP
  // ============================================================

  async function handleImportBackup(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const confirmed =
      window.confirm(
        "Restoring this backup will replace your current workout database. Continue?"
      );

    if (!confirmed) {
      event.target.value =
        "";
      return;
    }

    try {
      await importWorkoutBackup(
        file
      );

      alert(
        "Backup restored successfully."
      );

      window.location.reload();
    } catch (error) {
      alert(
        error.message
      );
    }

    event.target.value =
      "";
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  function switchTab(tab) {
    if (activeWorkout) {
      return;
    }

    setActiveTab(tab);
    setSelectedSplitId(null);
    setSelectedDayId(null);
    setSelectedHistorySessionId(null);
  }

  function renderBottomNav() {
    return (
      <nav className="bottom-nav">
        <button
          className={
            activeTab === "home"
              ? "active"
              : ""
          }
          onClick={() =>
            switchTab("home")
          }
        >
          Home
        </button>

        <button
          className={
            activeTab === "history"
              ? "active"
              : ""
          }
          onClick={() =>
            switchTab("history")
          }
        >
          History
        </button>

        <button
          className={
            activeTab === "progress"
              ? "active"
              : ""
          }
          onClick={() =>
            switchTab(
              "progress"
            )
          }
        >
          Progress
        </button>

        <button
          className={
            activeTab === "settings"
              ? "active"
              : ""
          }
          onClick={() =>
            switchTab(
              "settings"
            )
          }
        >
          Settings
        </button>
      </nav>
    );
  }

  // ============================================================
  // RESUME BANNER — HOME ONLY
  // ============================================================

  function renderPausedWorkoutBanner() {
    if (
      !pausedWorkout ||
      activeWorkout ||
      activeTab !== "home" ||
      selectedSplitId ||
      selectedDayId
    ) {
      return null;
    }

    return (
      <div className="paused-workout-banner">
        <div className="paused-workout-banner-copy">
          <span>
            WORKOUT IN PROGRESS
          </span>

          <strong>
            {pausedWorkout.workoutDayName ||
              "Workout"}
          </strong>

          <p>
            Started{" "}
            {formatTime(
              pausedWorkout.startedAt
            )}
          </p>
        </div>

        <div className="paused-workout-banner-actions">
          <button
            className="resume-workout-button"
            onClick={
              resumeWorkout
            }
          >
            Resume
          </button>

          <button
            className="discard-workout-button"
            onClick={
              discardPausedWorkout
            }
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // FORMS
  // ============================================================

  function renderSplitForm() {
    if (!showSplitForm) {
      return null;
    }

    return (
      <div className="form-overlay">
        <div className="form-sheet">
          <h2>
            {editingSplitId
              ? "Edit Split"
              : "New Split"}
          </h2>

          <label>
            Split name
          </label>

          <input
            className="form-input"
            value={splitName}
            placeholder="e.g. Push Pull Legs"
            onChange={(event) =>
              setSplitName(
                event.target.value
              )
            }
          />

          <div className="form-actions">
            <button
              className="secondary-form-button"
              onClick={() => {
                setShowSplitForm(false);
                setEditingSplitId(null);
              }}
            >
              Cancel
            </button>

            <button
              className="primary-form-button"
              onClick={
                saveSplit
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderDayForm() {
    if (!showDayForm) {
      return null;
    }

    return (
      <div className="form-overlay">
        <div className="form-sheet">
          <h2>
            {editingDayId
              ? "Edit Workout Day"
              : "New Workout Day"}
          </h2>

          <label>
            Workout name
          </label>

          <input
            className="form-input"
            value={dayName}
            placeholder="e.g. Push A"
            onChange={(event) =>
              setDayName(
                event.target.value
              )
            }
          />

          <label>
            Day of week
          </label>

          <select
            className="form-input"
            value={dayOfWeek}
            onChange={(event) =>
              setDayOfWeek(
                event.target.value
              )
            }
          >
            <option value="">
              No fixed day
            </option>

            <option>Monday</option>
            <option>Tuesday</option>
            <option>Wednesday</option>
            <option>Thursday</option>
            <option>Friday</option>
            <option>Saturday</option>
            <option>Sunday</option>
          </select>

          <div className="form-actions">
            <button
              className="secondary-form-button"
              onClick={() => {
                setShowDayForm(false);
                setEditingDayId(null);
              }}
            >
              Cancel
            </button>

            <button
              className="primary-form-button"
              onClick={
                saveDay
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderExerciseForm() {
    if (
      !showExerciseForm
    ) {
      return null;
    }

    function change(
      field,
      value
    ) {
      setExerciseForm(
        (previous) => ({
          ...previous,
          [field]: value,
        })
      );
    }

    return (
      <div className="form-overlay">
        <div className="form-sheet exercise-form-sheet">
          <h2>
            {editingExerciseId
              ? "Edit Exercise"
              : "Add Exercise"}
          </h2>

          <label>
            Exercise name
          </label>

          <input
            className="form-input"
            value={
              exerciseForm.name
            }
            onChange={(event) =>
              change(
                "name",
                event.target.value
              )
            }
          />

          <div className="form-grid">
            <div>
              <label>
                Working sets
              </label>

              <input
                className="form-input"
                type="number"
                min="1"
                value={
                  exerciseForm.targetSets
                }
                onChange={(event) =>
                  change(
                    "targetSets",
                    event.target.value
                  )
                }
              />
            </div>

            <div>
              <label>
                Warmup sets
              </label>

              <input
                className="form-input"
                type="number"
                min="0"
                value={
                  exerciseForm.warmupSets
                }
                onChange={(event) =>
                  change(
                    "warmupSets",
                    event.target.value
                  )
                }
              />
            </div>

            <div>
              <label>
                Min reps
              </label>

              <input
                className="form-input"
                type="number"
                min="1"
                value={
                  exerciseForm.minReps
                }
                onChange={(event) =>
                  change(
                    "minReps",
                    event.target.value
                  )
                }
              />
            </div>

            <div>
              <label>
                Max reps
              </label>

              <input
                className="form-input"
                type="number"
                min="1"
                value={
                  exerciseForm.maxReps
                }
                onChange={(event) =>
                  change(
                    "maxReps",
                    event.target.value
                  )
                }
              />
            </div>
          </div>

          <label>
            Target RIR
          </label>

          <input
            className="form-input"
            value={
              exerciseForm.targetRIR
            }
            onChange={(event) =>
              change(
                "targetRIR",
                event.target.value
              )
            }
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={
                exerciseForm.optional
              }
              onChange={(event) =>
                change(
                  "optional",
                  event.target.checked
                )
              }
            />

            <span>
              Optional exercise
            </span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={
                exerciseForm.hasAlternative
              }
              onChange={(event) =>
                change(
                  "hasAlternative",
                  event.target.checked
                )
              }
            />

            <span>
              Has alternative exercise
            </span>
          </label>

          {exerciseForm.hasAlternative && (
            <>
              <label>
                Alternative exercise
              </label>

              <input
                className="form-input"
                value={
                  exerciseForm.alternativeName
                }
                onChange={(event) =>
                  change(
                    "alternativeName",
                    event.target.value
                  )
                }
              />
            </>
          )}

          <div className="form-actions">
            <button
              className="secondary-form-button"
              onClick={() => {
                setShowExerciseForm(false);
                setEditingExerciseId(null);
              }}
            >
              Cancel
            </button>

            <button
              className="primary-form-button"
              onClick={
                saveExercise
              }
            >
              Save Exercise
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ACTIVE WORKOUT
  // ============================================================

  if (
    activeWorkout &&
    !workoutProgressOpen
  ) {
    const renderedGroups =
      new Set();

    return (
      <div className="app active-workout-app app-with-fixed-back">
        <button
          className="back-button"
          onClick={
            leaveActiveWorkout
          }
        >
          ← Workouts
        </button>

        <header className="topbar active-workout-header">
          <div>
            <p className="eyebrow">
              ACTIVE WORKOUT
            </p>

            <h1>
              {selectedDay?.name}
            </h1>

            <p className="active-workout-started">
              Started{" "}
              {formatTime(
                workoutStartedAt
              )}
            </p>
          </div>
        </header>

        <section className="exercise-list">
          {(orderedExercises || []).map(
            (exercise) => {
              if (
                exercise.alternativeGroup
              ) {
                if (
                  renderedGroups.has(
                    exercise.alternativeGroup
                  )
                ) {
                  return null;
                }

                renderedGroups.add(
                  exercise.alternativeGroup
                );

                const group =
                  alternativeGroups[
                    exercise.alternativeGroup
                  ] || [];

                const selectedId =
                  getSelectedAlternative(
                    exercise.alternativeGroup
                  );

                const selectedExercise =
                  group.find(
                    (item) =>
                      item.id ===
                      selectedId
                  );

                if (
                  !selectedExercise
                ) {
                  return null;
                }

                const previousInfo =
                  previousExerciseData
                    ?.exerciseData?.[
                      selectedExercise.id
                    ];

                return (
                  <div
                    className="exercise-card"
                    key={
                      exercise.alternativeGroup
                    }
                  >
                    <span className="alternative-label">
                      ALTERNATIVE
                    </span>

                    <div className="workout-alternative-picker">
                      {group.map(
                        (option) => (
                          <button
                            key={
                              option.id
                            }
                            className={`workout-alternative-option ${
                              selectedId ===
                              option.id
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              selectAlternativeDuringWorkout(
                                exercise.alternativeGroup,
                                option.id
                              )
                            }
                          >
                            {
                              option.name
                            }
                          </button>
                        )
                      )}
                    </div>

                    <ExerciseWorkoutCard
                      exercise={
                        selectedExercise
                      }
                      sets={
                        workoutSets[
                          selectedExercise.id
                        ] || []
                      }
                      previousInfo={
                        previousInfo
                      }
                      updateSet={
                        updateSet
                      }
                      toggleSetComplete={
                        toggleSetComplete
                      }
                      addSet={
                        addSet
                      }
                      removeSet={
                        removeSet
                      }
                      openProgress={
                        openWorkoutExerciseProgress
                      }
                    />
                  </div>
                );
              }

              if (
                exercise.optional
              ) {
                const included =
                  !!includedOptional[
                    exercise.id
                  ];

                const previousInfo =
                  previousExerciseData
                    ?.exerciseData?.[
                      exercise.id
                    ];

                if (!included) {
                  return (
                    <div
                      className="exercise-card optional-during-workout-card"
                      key={
                        exercise.id
                      }
                    >
                      <span className="optional-badge">
                        Optional
                      </span>

                      <h3>
                        {
                          exercise.name
                        }
                      </h3>

                      {previousInfo?.skippedLastWorkout && (
                        <div className="skipped-last-workout">
                          Skipped last workout
                        </div>
                      )}

                      {previousInfo?.lastPerformedSession && (
                        <div className="last-performed-summary">
                          Last performed{" "}
                          {formatDate(
                            previousInfo
                              .lastPerformedSession
                              .date
                          )}
                        </div>
                      )}

                      <p className="exercise-target">
                        {
                          exercise.targetSets
                        }{" "}
                        working sets ·{" "}
                        {
                          exercise.minReps
                        }
                        -
                        {
                          exercise.maxReps
                        }{" "}
                        reps
                      </p>

                      <button
                        className="include-workout-exercise-button"
                        onClick={() =>
                          includeOptionalExercise(
                            exercise.id
                          )
                        }
                      >
                        Include Exercise
                      </button>

                      <button
                        className="exercise-progress-button optional-progress-button"
                        onClick={() =>
                          openWorkoutExerciseProgress(
                            exercise.name
                          )
                        }
                      >
                        Progress
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    className="exercise-card"
                    key={
                      exercise.id
                    }
                  >
                    <div className="optional-active-top">
                      <span className="optional-badge">
                        Optional
                      </span>

                      <button
                        className="skip-workout-exercise-button"
                        onClick={() =>
                          skipOptionalExercise(
                            exercise.id
                          )
                        }
                      >
                        Skip
                      </button>
                    </div>

                    <ExerciseWorkoutCard
                      exercise={
                        exercise
                      }
                      sets={
                        workoutSets[
                          exercise.id
                        ] || []
                      }
                      previousInfo={
                        previousInfo
                      }
                      updateSet={
                        updateSet
                      }
                      toggleSetComplete={
                        toggleSetComplete
                      }
                      addSet={
                        addSet
                      }
                      removeSet={
                        removeSet
                      }
                      openProgress={
                        openWorkoutExerciseProgress
                      }
                    />
                  </div>
                );
              }

              const previousInfo =
                previousExerciseData
                  ?.exerciseData?.[
                    exercise.id
                  ];

              return (
                <div
                  className="exercise-card"
                  key={
                    exercise.id
                  }
                >
                  <ExerciseWorkoutCard
                    exercise={
                      exercise
                    }
                    sets={
                      workoutSets[
                        exercise.id
                      ] || []
                    }
                    previousInfo={
                      previousInfo
                    }
                    updateSet={
                      updateSet
                    }
                    toggleSetComplete={
                      toggleSetComplete
                    }
                    addSet={
                      addSet
                    }
                    removeSet={
                      removeSet
                    }
                    openProgress={
                      openWorkoutExerciseProgress
                    }
                  />
                </div>
              );
            }
          )}
        </section>

        <button
          className="finish-workout-button"
          onClick={
            finishWorkout
          }
        >
          Complete Workout
        </button>
      </div>
    );
  }

  // ============================================================
  // HISTORY DETAIL
  // ============================================================

  if (
    selectedHistorySessionId
  ) {
    const skippedIds =
      selectedHistorySession
        ?.session
        ?.skippedExerciseIds ||
      [];

    const performedExerciseIds =
      Object.keys(
        selectedHistorySession
          ?.sets ||
          {}
      ).map(Number);

    const relevantExercises =
      (
        selectedHistorySession
          ?.allExercises ||
        []
      )
        .filter(
          (exercise) =>
            performedExerciseIds.includes(
              exercise.id
            ) ||
            skippedIds.includes(
              exercise.id
            )
        )
        .sort(
          (a, b) =>
            Number(a.order) -
            Number(b.order)
        );

    return (
      <div className="app app-with-fixed-back">
        <button
          className="back-button"
          onClick={() =>
            setSelectedHistorySessionId(
              null
            )
          }
        >
          ← History
        </button>

        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT HISTORY
            </p>

            <h1>
              {selectedHistorySession
                ?.workoutDay
                ?.name ||
                "Workout"}
            </h1>

            <p className="history-date">
              {selectedHistorySession
                ? formatDate(
                    selectedHistorySession
                      .session
                      .date
                  )
                : ""}
            </p>
          </div>
        </header>

        <section className="exercise-list">
          {relevantExercises.map(
            (exercise) => {
              const sets =
                selectedHistorySession
                  .sets[
                    exercise.id
                  ] || [];

              const skipped =
                skippedIds.includes(
                  exercise.id
                );

              return (
                <div
                  className="exercise-card"
                  key={
                    exercise.id
                  }
                >
                  <h3>
                    {
                      exercise.name
                    }
                  </h3>

                  {skipped &&
                    sets.length ===
                      0 && (
                      <div className="history-skipped-label">
                        Skipped
                      </div>
                    )}

                  {sets.length >
                    0 && (
                    <div className="history-set-list">
                      {sets.map(
                        (set) => (
                          <div
                            className="history-set-row"
                            key={
                              set.id
                            }
                          >
                            <span>
                              Set{" "}
                              {
                                set.setNumber
                              }
                            </span>

                            <strong>
                              {
                                set.weight
                              }{" "}
                              kg ×{" "}
                              {
                                set.reps
                              }
                            </strong>

                            <span>
                              {set.rir ===
                              null
                                ? "—"
                                : `${set.rir} RIR`}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </section>

        {renderBottomNav()}
      </div>
    );
  }

  // ============================================================
  // WORKOUT PREVIEW
  // ============================================================

  if (
    selectedDayId &&
    !workoutProgressOpen
  ) {
    const renderedGroups =
      new Set();

    return (
      <div className="app workout-preview-app app-with-fixed-back">
        <button
          className="back-button"
          onClick={() =>
            setSelectedDayId(
              null
            )
          }
        >
          ←{" "}
          {selectedSplit?.name ||
            "Split"}
        </button>

        <header className="topbar">
          <div>
            <p className="eyebrow">
              {selectedDay?.dayOfWeek ||
                "WORKOUT"}
            </p>

            <h1>
              {selectedDay?.name}
            </h1>
          </div>
        </header>

        <div className="manage-header">
          <h3>
            Exercises
          </h3>

          <button
            className="small-add-button"
            onClick={
              openNewExercise
            }
          >
            + Add Exercise
          </button>
        </div>

        <section className="exercise-list">
          {(orderedExercises || []).map(
            (exercise) => {
              if (
                exercise.alternativeGroup
              ) {
                if (
                  renderedGroups.has(
                    exercise.alternativeGroup
                  )
                ) {
                  return null;
                }

                renderedGroups.add(
                  exercise.alternativeGroup
                );

                const group =
                  alternativeGroups[
                    exercise.alternativeGroup
                  ] || [];

                return (
                  <div
                    className="exercise-card"
                    key={
                      exercise.alternativeGroup
                    }
                  >
                    <span className="alternative-label">
                      ALTERNATIVE
                    </span>

                    <h3>
                      {group
                        .map(
                          (option) =>
                            option.name
                        )
                        .join(" / ")}
                    </h3>

                    <p className="exercise-target">
                      Choose during workout
                    </p>

                    <div className="manage-actions">
                      <button
                        onClick={() =>
                          openEditExercise(
                            group[0]
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        className="danger-text"
                        onClick={() =>
                          deleteExercise(
                            group[0]
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  className="exercise-card"
                  key={
                    exercise.id
                  }
                >
                  {exercise.optional && (
                    <span className="optional-badge">
                      Optional
                    </span>
                  )}

                  <h3>
                    {
                      exercise.name
                    }
                  </h3>

                  <p className="exercise-target">
                    {
                      exercise.targetSets
                    }{" "}
                    working sets ·{" "}
                    {
                      exercise.minReps
                    }
                    -
                    {
                      exercise.maxReps
                    }{" "}
                    reps
                  </p>

                  <div className="exercise-details">
                    {Number(
                      exercise.warmupSets
                    ) > 0 && (
                      <span>
                        {
                          exercise.warmupSets
                        }{" "}
                        warmup set
                        {Number(
                          exercise.warmupSets
                        ) === 1
                          ? ""
                          : "s"}
                      </span>
                    )}

                    <span>
                      RIR:{" "}
                      {
                        exercise.targetRIR
                      }
                    </span>
                  </div>

                  <div className="manage-actions">
                    <button
                      onClick={() =>
                        openEditExercise(
                          exercise
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      className="danger-text"
                      onClick={() =>
                        deleteExercise(
                          exercise
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            }
          )}
        </section>

        {!!exercises?.length && (
          <div className="fixed-start-workout-area">
            <button
              className="start-workout-button fixed-start-workout-button"
              onClick={
                startWorkout
              }
            >
              Start{" "}
              {selectedDay?.name}
            </button>
          </div>
        )}

        {renderBottomNav()}
        {renderExerciseForm()}
      </div>
    );
  }

  // ============================================================
  // SPLIT DETAIL
  // ============================================================

  if (
    activeTab === "home" &&
    selectedSplitId
  ) {
    return (
      <div className="app app-with-fixed-back">
        <button
          className="back-button"
          onClick={() =>
            setSelectedSplitId(
              null
            )
          }
        >
          ← Workouts
        </button>

        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT SPLIT
            </p>

            <h1>
              {selectedSplit?.name}
            </h1>
          </div>
        </header>

        <div className="manage-header">
          <h3>
            Workout Days
          </h3>

          <button
            className="small-add-button"
            onClick={
              openNewDay
            }
          >
            + Add Day
          </button>
        </div>

        <div className="session-list">
          {workoutDays?.map(
            (day) => (
              <div
                className="management-card"
                key={
                  day.id
                }
              >
                <button
                  className="management-card-main"
                  onClick={() =>
                    setSelectedDayId(
                      day.id
                    )
                  }
                >
                  <div>
                    <strong>
                      {
                        day.name
                      }
                    </strong>

                    <p>
                      {day.dayOfWeek ||
                        "Flexible"}
                    </p>
                  </div>

                  <span>
                    ›
                  </span>
                </button>

                <div className="management-card-actions">
                  <button
                    onClick={() =>
                      openEditDay(
                        day
                      )
                    }
                  >
                    Edit
                  </button>

                  <button
                    className="danger-text"
                    onClick={() =>
                      deleteDay(
                        day
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {renderBottomNav()}
        {renderDayForm()}
      </div>
    );
  }

  // ============================================================
  // HISTORY
  // ============================================================

  if (
    activeTab === "history"
  ) {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT TRACKER
            </p>

            <h1>
              History
            </h1>
          </div>
        </header>

        <section className="history-filters">
          <input
            className="history-search"
            placeholder="Search workouts..."
            value={
              historySearch
            }
            onChange={(event) =>
              setHistorySearch(
                event.target.value
              )
            }
          />

          <div className="history-filter-row">
            <select
              value={
                historyMonth
              }
              onChange={(event) =>
                setHistoryMonth(
                  event.target.value
                )
              }
            >
              <option value="all">
                All months
              </option>

              {months.map(
                (
                  month,
                  index
                ) => (
                  <option
                    key={
                      month
                    }
                    value={
                      index
                    }
                  >
                    {month}
                  </option>
                )
              )}
            </select>

            <select
              value={
                historyYear
              }
              onChange={(event) =>
                setHistoryYear(
                  event.target.value
                )
              }
            >
              <option value="all">
                All years
              </option>

              {historyYears.map(
                (year) => (
                  <option
                    key={
                      year
                    }
                    value={
                      year
                    }
                  >
                    {year}
                  </option>
                )
              )}
            </select>
          </div>
        </section>

        <p className="history-count">
          {
            filteredHistorySessions.length
          }{" "}
          {filteredHistorySessions.length ===
          1
            ? "workout"
            : "workouts"}
        </p>

        <div className="session-list">
          {filteredHistorySessions.map(
            (session) => (
              <button
                className="session-card workout-day-button"
                key={
                  session.id
                }
                onClick={() =>
                  setSelectedHistorySessionId(
                    session.id
                  )
                }
              >
                <div>
                  <strong>
                    {session
                      .workoutDay
                      ?.name ||
                      "Archived Workout"}
                  </strong>

                  <p>
                    {formatDate(
                      session.date
                    )}
                  </p>
                </div>

                <span>
                  ›
                </span>
              </button>
            )
          )}
        </div>

        {filteredHistorySessions.length ===
          0 && (
          <div className="empty-history">
            <strong>
              No workouts found
            </strong>

            <p>
              Try changing your search or filters.
            </p>
          </div>
        )}

        {renderBottomNav()}
      </div>
    );
  }

  // ============================================================
  // PROGRESS
  // ============================================================

  if (
    activeTab ===
      "progress" ||
    workoutProgressOpen
  ) {
    const chartData =
      progressData?.sessions.map(
        (session) => ({
          date:
            formatShortDate(
              session.date
            ),

          e1rm:
            Number(
              session.bestE1RM.toFixed(
                1
              )
            ),
        })
      ) || [];

    return (
      <div
        className={`app ${
          workoutProgressOpen
            ? "app-with-fixed-back"
            : ""
        }`}
      >
        {workoutProgressOpen && (
          <button
            className="back-button workout-progress-back"
            onClick={
              closeWorkoutExerciseProgress
            }
          >
            ← Workout
          </button>
        )}

        <header className="topbar">
          <div>
            <p className="eyebrow">
              {workoutProgressOpen
                ? "EXERCISE PROGRESS"
                : "WORKOUT TRACKER"}
            </p>

            <h1>
              Progress
            </h1>
          </div>
        </header>

        <section className="progress-selector">
          <label>
            Exercise
          </label>

          <input
            className="progress-search"
            placeholder="Search exercises..."
            value={
              progressSearch
            }
            onChange={(event) => {
              setProgressSearch(
                event.target.value
              );

              if (
                event.target.value !==
                selectedProgressExercise
              ) {
                setSelectedProgressExercise(
                  ""
                );
              }
            }}
          />

          {progressSearch.trim() !==
            "" &&
            !selectedProgressExercise && (
              <div className="exercise-search-results">
                {filteredProgressExercises.map(
                  (name) => (
                    <button
                      className="exercise-search-result"
                      key={
                        name
                      }
                      onClick={() => {
                        setSelectedProgressExercise(
                          name
                        );

                        setProgressSearch(
                          name
                        );
                      }}
                    >
                      <span>
                        {
                          name
                        }
                      </span>

                      <span>
                        ›
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
        </section>

        {!selectedProgressExercise && (
          <div className="empty-history">
            <strong>
              Search for an exercise
            </strong>

            <p>
              Select an exercise to view your long-term progress.
            </p>
          </div>
        )}

        {selectedProgressExercise &&
          progressData?.sessions.length ===
            0 && (
            <div className="empty-history">
              <strong>
                No progress data yet
              </strong>

              <p>
                Complete this exercise in a workout first.
              </p>
            </div>
          )}

        {selectedProgressExercise &&
          progressData?.sessions.length >
            0 && (
            <>
              <section className="progress-stats">
                <div className="stat-card">
                  <span>
                    Best weight
                  </span>

                  <strong>
                    {
                      progressData.bestWeight
                    }
                    kg
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Estimated 1RM
                  </span>

                  <strong>
                    {progressData.bestE1RM.toFixed(
                      1
                    )}
                    kg
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Sessions
                  </span>

                  <strong>
                    {
                      progressData
                        .sessions
                        .length
                    }
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Strength change
                  </span>

                  <strong
                    className={
                      progressData.change >
                      0
                        ? "positive-stat"
                        : progressData.change <
                          0
                        ? "negative-stat"
                        : ""
                    }
                  >
                    {progressData.change >
                    0
                      ? "+"
                      : ""}
                    {progressData.change.toFixed(
                      1
                    )}
                    %
                  </strong>
                </div>
              </section>

              <section className="progress-chart-card">
                <h2>
                  {
                    selectedProgressExercise
                  }
                </h2>

                <div className="chart-container">
                  <ResponsiveContainer
                    width="100%"
                    height={240}
                  >
                    <LineChart
                      data={
                        chartData
                      }
                    >
                      <XAxis
                        dataKey="date"
                      />

                      <YAxis />

                      <Tooltip />

                      <Line
                        type="monotone"
                        dataKey="e1rm"
                        stroke="currentColor"
                        strokeWidth={
                          3
                        }
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="section">
                <div className="section-header">
                  <h3>
                    Exercise History
                  </h3>
                </div>

                <div className="progress-history-list">
                  {[...progressData.sessions]
                    .reverse()
                    .map(
                      (session) => (
                        <div
                          className="progress-session-card"
                          key={
                            session.sessionId
                          }
                        >
                          <div className="progress-session-top">
                            <strong>
                              {formatDate(
                                session.date
                              )}
                            </strong>

                            <span>
                              e1RM{" "}
                              {session.bestE1RM.toFixed(
                                1
                              )}
                              kg
                            </span>
                          </div>

                          <div className="progress-session-sets">
                            {session.sets.map(
                              (set) => (
                                <div
                                  className="progress-set-row"
                                  key={
                                    set.id
                                  }
                                >
                                  <span>
                                    Set{" "}
                                    {
                                      set.setNumber
                                    }
                                  </span>

                                  <strong>
                                    {
                                      set.weight
                                    }
                                    kg ×{" "}
                                    {
                                      set.reps
                                    }
                                  </strong>

                                  <span>
                                    {set.rir ===
                                    null
                                      ? ""
                                      : `${set.rir} RIR`}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )
                    )}
                </div>
              </section>
            </>
          )}

        {!workoutProgressOpen &&
          renderBottomNav()}
      </div>
    );
  }

  // ============================================================
  // SETTINGS
  // ============================================================

  if (
    activeTab ===
    "settings"
  ) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT TRACKER
            </p>

            <h1>
              Settings
            </h1>
          </div>
        </header>

        <section className="card hero-card">
          <p className="card-label">
            STORAGE
          </p>

          <h2>
            Local Database
          </h2>

          <p className="muted">
            Your completed workout history and paused workout are stored locally on this device.
          </p>
        </section>

        <section className="settings-section">
          <div className="settings-card">
            <div className="settings-item">
              <div>
                <strong>
                  Export Backup
                </strong>

                <p>
                  Save your workout history and paused workout.
                </p>
              </div>

              <button
                className="settings-action-button"
                onClick={
                  exportWorkoutBackup
                }
              >
                Export
              </button>
            </div>

            <div className="settings-divider" />

            <div className="settings-item">
              <div>
                <strong>
                  Restore Backup
                </strong>

                <p>
                  Restore a previous database backup.
                </p>
              </div>

              <label
                className="settings-action-button"
                htmlFor="backup-file-input"
              >
                Restore
              </label>

              <input
                hidden
                id="backup-file-input"
                type="file"
                accept=".json,application/json"
                onChange={
                  handleImportBackup
                }
              />
            </div>
          </div>
        </section>

        {renderBottomNav()}
      </div>
    );
  }

  // ============================================================
  // HOME
  // ============================================================

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            WORKOUT TRACKER
          </p>

          <h1>
            Workouts
          </h1>
        </div>
      </header>

      {renderPausedWorkoutBanner()}

      <div className="manage-header">
        <div>
          <h3>
            Your Splits
          </h3>

          <p>
            Build and manage your programs.
          </p>
        </div>

        <button
          className="small-add-button"
          onClick={
            openNewSplit
          }
        >
          + New Split
        </button>
      </div>

      <div className="split-list">
        {splits?.map(
          (split) => (
            <div
              className="management-card"
              key={
                split.id
              }
            >
              <button
                className="management-card-main"
                onClick={() =>
                  setSelectedSplitId(
                    split.id
                  )
                }
              >
                <div>
                  <strong>
                    {
                      split.name
                    }
                  </strong>

                  <p>
                    Tap to view workout days
                  </p>
                </div>

                <span>
                  ›
                </span>
              </button>

              <div className="management-card-actions">
                <button
                  onClick={() =>
                    openEditSplit(
                      split
                    )
                  }
                >
                  Rename
                </button>

                <button
                  className="danger-text"
                  onClick={() =>
                    deleteSplit(
                      split
                    )
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {!splits?.length && (
        <div className="empty-history">
          <strong>
            No workout splits
          </strong>

          <p>
            Create your first workout split to get started.
          </p>
        </div>
      )}

      {renderBottomNav()}
      {renderSplitForm()}
    </div>
  );
}

// ============================================================
// ACTIVE EXERCISE CARD
// ============================================================

function ExerciseWorkoutCard({
  exercise,
  sets,
  previousInfo,
  updateSet,
  toggleSetComplete,
  addSet,
  removeSet,
  openProgress,
}) {
  const previousSets =
    previousInfo
      ?.lastPerformedSets ||
    [];

  const lastSession =
    previousInfo
      ?.lastPerformedSession;

  const skippedLastWorkout =
    !!previousInfo
      ?.skippedLastWorkout;

  const allComplete =
    sets.length > 0 &&
    sets.every(
      (set) =>
        set.completed
    );

  return (
    <>
      <div className="exercise-top">
        <div>
          <h3>
            {
              exercise.name
            }
          </h3>

          <p className="exercise-target">
            {
              exercise.minReps
            }
            -
            {
              exercise.maxReps
            }{" "}
            reps · RIR{" "}
            {
              exercise.targetRIR
            }
          </p>
        </div>

        <div className="exercise-header-actions">
          <button
            className="exercise-progress-button"
            onClick={() =>
              openProgress(
                exercise.name
              )
            }
          >
            Progress
          </button>

          {allComplete && (
            <span className="completed-badge">
              ✓ Done
            </span>
          )}
        </div>
      </div>

      {skippedLastWorkout && (
        <div className="skipped-last-workout">
          Skipped last workout
        </div>
      )}

      {lastSession &&
        previousSets.length >
          0 && (
          <div className="previous-block">
            <div className="previous-session-heading">
              <p className="previous-title">
                Last performed
              </p>

              <span>
                {formatDate(
                  lastSession.date
                )}
              </span>
            </div>

            {previousSets.map(
              (set) => (
                <div
                  className="previous-row"
                  key={
                    set.id
                  }
                >
                  <span>
                    Set{" "}
                    {
                      set.setNumber
                    }
                  </span>

                  <strong>
                    {
                      set.weight
                    }{" "}
                    kg ×{" "}
                    {
                      set.reps
                    }
                  </strong>

                  <span>
                    {set.rir ===
                    null
                      ? ""
                      : `${set.rir} RIR`}
                  </span>
                </div>
              )
            )}
          </div>
        )}

      <WorkoutSetRows
        exercise={
          exercise
        }
        sets={
          sets
        }
        previousSets={
          previousSets
        }
        updateSet={
          updateSet
        }
        toggleSetComplete={
          toggleSetComplete
        }
        addSet={
          addSet
        }
        removeSet={
          removeSet
        }
      />
    </>
  );
}

// ============================================================
// SET ROWS
// ============================================================

function WorkoutSetRows({
  exercise,
  sets,
  previousSets,
  updateSet,
  toggleSetComplete,
  addSet,
  removeSet,
}) {
  return (
    <>
      <div className="set-header set-header-six">
        <span>
          Set
        </span>

        <span>
          kg
        </span>

        <span>
          Reps
        </span>

        <span>
          RIR
        </span>

        <span>
          Done
        </span>

        <span />
      </div>

      {sets.map(
        (set, index) => {
          const comparison =
            compareSet(
              set,
              previousSets[
                index
              ]
            );

          return (
            <div
              key={
                index
              }
            >
              <div className="set-row set-row-six">
                <span className="set-number">
                  {index + 1}
                </span>

                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={
                    set.weight
                  }
                  disabled={
                    set.completed
                  }
                  onChange={(event) =>
                    updateSet(
                      exercise.id,
                      index,
                      "weight",
                      event.target.value
                    )
                  }
                />

                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={
                    set.reps
                  }
                  disabled={
                    set.completed
                  }
                  onChange={(event) =>
                    updateSet(
                      exercise.id,
                      index,
                      "reps",
                      event.target.value
                    )
                  }
                />

                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={
                    set.rir
                  }
                  disabled={
                    set.completed
                  }
                  onChange={(event) =>
                    updateSet(
                      exercise.id,
                      index,
                      "rir",
                      event.target.value
                    )
                  }
                />

                <button
                  className={`complete-set-button ${
                    set.completed
                      ? "completed"
                      : ""
                  }`}
                  onClick={() =>
                    toggleSetComplete(
                      exercise.id,
                      index
                    )
                  }
                >
                  {set.completed
                    ? "✓"
                    : "○"}
                </button>

                <button
                  className="remove-set-button"
                  onClick={() =>
                    removeSet(
                      exercise.id,
                      index
                    )
                  }
                >
                  ×
                </button>
              </div>

              {comparison &&
                !set.completed && (
                  <div
                    className={`comparison ${comparison.type}`}
                  >
                    {
                      comparison.text
                    }
                  </div>
                )}

              {set.completed && (
                <div className="set-complete-text">
                  ✓ Set completed
                </div>
              )}
            </div>
          );
        }
      )}

      <button
        className="add-set-button"
        onClick={() =>
          addSet(
            exercise.id
          )
        }
      >
        Add Set
      </button>
    </>
  );
}

export default App;