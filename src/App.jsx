import { useState } from "react";
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

function compareSet(current, previous) {
  if (!previous || current.weight === "" || current.reps === "") {
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
    return {
      type: "improved",
      text: `↑ +${currentReps - previousReps} rep${
        currentReps - previousReps === 1 ? "" : "s"
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
    return {
      type: "regressed",
      text: `↓ ${currentReps - previousReps} rep${
        previousReps - currentReps === 1 ? "" : "s"
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

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
}

function calculateE1RM(weight, reps) {
  if (!weight || !reps) return 0;

  return weight * (1 + reps / 30);
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedDayId, setSelectedDayId] = useState(null);
  const [activeWorkout, setActiveWorkout] = useState(false);
  const [workoutSets, setWorkoutSets] = useState({});
  const [selectedHistorySessionId, setSelectedHistorySessionId] =
    useState(null);

  const [historySearch, setHistorySearch] = useState("");
  const [historyMonth, setHistoryMonth] = useState("all");
  const [historyYear, setHistoryYear] = useState("all");

  const [selectedProgressExercise, setSelectedProgressExercise] =
    useState("");

  const [progressSearch, setProgressSearch] = useState("");

  const split = useLiveQuery(
    () => db.splits.toCollection().first(),
    []
  );

  const workoutDays = useLiveQuery(async () => {
    if (!split) return [];

    return db.workoutDays
      .where("splitId")
      .equals(split.id)
      .toArray();
  }, [split?.id]);

  const selectedDay = useLiveQuery(async () => {
    if (!selectedDayId) return null;

    return db.workoutDays.get(selectedDayId);
  }, [selectedDayId]);

  const exercises = useLiveQuery(async () => {
    if (!selectedDayId) return [];

    const result = await db.exercises
      .where("workoutDayId")
      .equals(selectedDayId)
      .toArray();

    return result.sort((a, b) => a.order - b.order);
  }, [selectedDayId]);

  const allExerciseNames = useLiveQuery(async () => {
    const allExercises = await db.exercises.toArray();

    const names = [
      ...new Set(
        allExercises.map((exercise) => exercise.name)
      ),
    ];

    return names.sort((a, b) => a.localeCompare(b));
  }, []);

  const filteredProgressExercises = (
    allExerciseNames || []
  ).filter((name) =>
    name
      .toLowerCase()
      .includes(progressSearch.trim().toLowerCase())
  );

  const progressData = useLiveQuery(async () => {
    if (!selectedProgressExercise) return null;

    const allExercises = await db.exercises.toArray();

    const matchingExercises = allExercises.filter(
      (exercise) =>
        exercise.name === selectedProgressExercise
    );

    if (matchingExercises.length === 0) {
      return null;
    }

    const matchingIds = matchingExercises.map(
      (exercise) => exercise.id
    );

    const allSets = await db.sets.toArray();

    const matchingSets = allSets.filter((set) =>
      matchingIds.includes(set.exerciseId)
    );

    if (matchingSets.length === 0) {
      return {
        sessions: [],
        bestWeight: 0,
        bestE1RM: 0,
        firstE1RM: 0,
        latestE1RM: 0,
        change: 0,
      };
    }

    const sessions = await db.sessions.toArray();

    const sessionMap = {};

    sessions.forEach((session) => {
      sessionMap[session.id] = session;
    });

    const groupedBySession = {};

    matchingSets.forEach((set) => {
      const session = sessionMap[set.sessionId];

      if (!session) return;

      if (!groupedBySession[session.id]) {
        groupedBySession[session.id] = {
          sessionId: session.id,
          date: session.date,
          sets: [],
        };
      }

      groupedBySession[session.id].sets.push(set);
    });

    const sessionData = Object.values(groupedBySession)
      .map((session) => {
        const sortedSets = [...session.sets].sort(
          (a, b) => a.setNumber - b.setNumber
        );

        const setData = sortedSets.map((set) => ({
          ...set,
          e1rm: calculateE1RM(set.weight, set.reps),
        }));

        const bestSet = setData.reduce((best, current) =>
          current.e1rm > best.e1rm ? current : best
        );

        return {
          ...session,
          sets: setData,
          bestWeight: Math.max(
            ...setData.map((set) => set.weight)
          ),
          bestE1RM: bestSet.e1rm,
          bestSet,
        };
      })
      .sort(
        (a, b) =>
          new Date(a.date) - new Date(b.date)
      );

    const bestWeight = Math.max(
      ...sessionData.map(
        (session) => session.bestWeight
      )
    );

    const bestE1RM = Math.max(
      ...sessionData.map(
        (session) => session.bestE1RM
      )
    );

    const firstE1RM =
      sessionData[0]?.bestE1RM || 0;

    const latestE1RM =
      sessionData[
        sessionData.length - 1
      ]?.bestE1RM || 0;

    const change =
      firstE1RM > 0
        ? ((latestE1RM - firstE1RM) / firstE1RM) * 100
        : 0;

    return {
      sessions: sessionData,
      bestWeight,
      bestE1RM,
      firstE1RM,
      latestE1RM,
      change,
    };
  }, [selectedProgressExercise]);

  const previousWorkoutData = useLiveQuery(async () => {
    if (!selectedDayId || !exercises?.length) {
      return null;
    }

    const sessions = await db.sessions
      .where("workoutDayId")
      .equals(selectedDayId)
      .toArray();

    if (sessions.length === 0) {
      return null;
    }

    const previousSession = sessions.sort(
      (a, b) =>
        new Date(b.date) - new Date(a.date)
    )[0];

    const previousSets = await db.sets
      .where("sessionId")
      .equals(previousSession.id)
      .toArray();

    const groupedSets = {};

    previousSets.forEach((set) => {
      if (!groupedSets[set.exerciseId]) {
        groupedSets[set.exerciseId] = [];
      }

      groupedSets[set.exerciseId].push(set);
    });

    Object.values(groupedSets).forEach((sets) => {
      sets.sort(
        (a, b) => a.setNumber - b.setNumber
      );
    });

    return {
      session: previousSession,
      sets: groupedSets,
    };
  }, [selectedDayId, exercises?.length]);

  const historySessions = useLiveQuery(async () => {
    const sessions = await db.sessions.toArray();

    const days = await db.workoutDays.toArray();

    const dayMap = {};

    days.forEach((day) => {
      dayMap[day.id] = day;
    });

    return sessions
      .sort(
        (a, b) =>
          new Date(b.date) - new Date(a.date)
      )
      .map((session) => ({
        ...session,
        workoutDay:
          dayMap[session.workoutDayId],
      }));
  }, []);

  const historyYears = [
    ...new Set(
      (historySessions || []).map(
        (session) =>
          new Date(session.date).getFullYear()
      )
    ),
  ].sort((a, b) => b - a);

  const filteredHistorySessions = (
    historySessions || []
  ).filter((session) => {
    const date = new Date(session.date);

    const matchesSearch =
      session.workoutDay?.name
        ?.toLowerCase()
        .includes(historySearch.toLowerCase()) ?? false;

    const matchesMonth =
      historyMonth === "all" ||
      date.getMonth() === Number(historyMonth);

    const matchesYear =
      historyYear === "all" ||
      date.getFullYear() === Number(historyYear);

    return (
      matchesSearch &&
      matchesMonth &&
      matchesYear
    );
  });

  const selectedHistorySession = useLiveQuery(async () => {
    if (!selectedHistorySessionId) {
      return null;
    }

    const session = await db.sessions.get(
      selectedHistorySessionId
    );

    if (!session) return null;

    const workoutDay = await db.workoutDays.get(
      session.workoutDayId
    );

    const allExercises = await db.exercises
      .where("workoutDayId")
      .equals(session.workoutDayId)
      .toArray();

    const sets = await db.sets
      .where("sessionId")
      .equals(session.id)
      .toArray();

    const groupedSets = {};

    sets.forEach((set) => {
      if (!groupedSets[set.exerciseId]) {
        groupedSets[set.exerciseId] = [];
      }

      groupedSets[set.exerciseId].push(set);
    });

    Object.values(groupedSets).forEach(
      (exerciseSets) => {
        exerciseSets.sort(
          (a, b) =>
            a.setNumber - b.setNumber
        );
      }
    );

    return {
      session,
      workoutDay,

      exercises: allExercises
        .filter(
          (exercise) =>
            groupedSets[exercise.id]
        )
        .sort(
          (a, b) =>
            a.order - b.order
        ),

      sets: groupedSets,
    };
  }, [selectedHistorySessionId]);

  function startWorkout() {
    const initialSets = {};

    exercises.forEach((exercise) => {
      const previousSets =
        previousWorkoutData?.sets?.[
          exercise.id
        ] || [];

      initialSets[exercise.id] = [];

      for (
        let i = 0;
        i < exercise.targetSets;
        i++
      ) {
        const previousSet = previousSets[i];

        initialSets[exercise.id].push({
          weight: previousSet?.weight ?? "",
          reps: "",
          rir: "",
        });
      }
    });

    setWorkoutSets(initialSets);
    setActiveWorkout(true);
  }

  function updateSet(
    exerciseId,
    setIndex,
    field,
    value
  ) {
    setWorkoutSets((previous) => ({
      ...previous,

      [exerciseId]:
        previous[exerciseId].map(
          (set, index) =>
            index === setIndex
              ? {
                  ...set,
                  [field]: value,
                }
              : set
        ),
    }));
  }

  function addSet(exerciseId) {
    setWorkoutSets((previous) => ({
      ...previous,

      [exerciseId]: [
        ...previous[exerciseId],

        {
          weight: "",
          reps: "",
          rir: "",
        },
      ],
    }));
  }

  async function finishWorkout() {
    const sessionId = await db.sessions.add({
      workoutDayId: selectedDayId,
      date: new Date().toISOString(),
    });

    const setsToSave = [];

    exercises.forEach((exercise) => {
      const exerciseSets =
        workoutSets[exercise.id] || [];

      exerciseSets.forEach((set, index) => {
        if (
          set.weight === "" ||
          set.reps === ""
        ) {
          return;
        }

        setsToSave.push({
          sessionId,
          exerciseId: exercise.id,
          setNumber: index + 1,
          setType: "working",
          weight: Number(set.weight),
          reps: Number(set.reps),
          rir:
            set.rir === ""
              ? null
              : Number(set.rir),
        });
      });
    });

    if (setsToSave.length > 0) {
      await db.sets.bulkAdd(setsToSave);
    }

    alert("Workout saved locally.");

    setActiveWorkout(false);
    setSelectedDayId(null);
    setWorkoutSets({});
    setActiveTab("history");
  }

  async function handleImportBackup(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const confirmed = window.confirm(
      "Restoring this backup will replace all workout data currently stored on this device. Continue?"
    );

    if (!confirmed) {
      event.target.value = "";
      return;
    }

    try {
      await importWorkoutBackup(file);

      alert(
        "Backup restored successfully. The app will now reload."
      );

      window.location.reload();
    } catch (error) {
      alert(error.message);
    }

    event.target.value = "";
  }

  function switchTab(tab) {
    setActiveTab(tab);
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
            switchTab("progress")
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
            switchTab("settings")
          }
        >
          Settings
        </button>
      </nav>
    );
  }

  if (activeWorkout) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              ACTIVE WORKOUT
            </p>

            <h1>
              {selectedDay?.name}
            </h1>
          </div>
        </header>

        <section className="exercise-list">
          {exercises?.map((exercise) => {
            const previousSets =
              previousWorkoutData?.sets?.[
                exercise.id
              ] || [];

            return (
              <div
                className="exercise-card"
                key={exercise.id}
              >
                <div className="exercise-top">
                  <div>
                    <h3>
                      {exercise.name}
                    </h3>

                    <p className="exercise-target">
                      {exercise.minReps}-
                      {exercise.maxReps} reps · RIR{" "}
                      {exercise.targetRIR}
                    </p>
                  </div>

                  {exercise.optional && (
                    <span className="optional-badge">
                      Optional
                    </span>
                  )}
                </div>

                {previousSets.length > 0 && (
                  <div className="previous-block">
                    <p className="previous-title">
                      Previous session
                    </p>

                    {previousSets.map((set) => (
                      <div
                        className="previous-row"
                        key={set.id}
                      >
                        <span>
                          Set {set.setNumber}
                        </span>

                        <strong>
                          {set.weight} kg × {set.reps}
                        </strong>

                        <span>
                          {set.rir === null
                            ? ""
                            : `@ ${set.rir} RIR`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="set-header">
                  <span>Set</span>
                  <span>kg</span>
                  <span>Reps</span>
                  <span>RIR</span>
                </div>

                {(workoutSets[exercise.id] || []).map(
                  (set, index) => {
                    const previousSet =
                      previousSets[index];

                    const comparison =
                      compareSet(
                        set,
                        previousSet
                      );

                    return (
                      <div key={index}>
                        <div className="set-row">
                          <span className="set-number">
                            {index + 1}
                          </span>

                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            placeholder="0"
                            value={set.weight}
                            onChange={(e) =>
                              updateSet(
                                exercise.id,
                                index,
                                "weight",
                                e.target.value
                              )
                            }
                          />

                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            placeholder="0"
                            value={set.reps}
                            onChange={(e) =>
                              updateSet(
                                exercise.id,
                                index,
                                "reps",
                                e.target.value
                              )
                            }
                          />

                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            placeholder="-"
                            value={set.rir}
                            onChange={(e) =>
                              updateSet(
                                exercise.id,
                                index,
                                "rir",
                                e.target.value
                              )
                            }
                          />
                        </div>

                        {comparison && (
                          <div
                            className={`comparison ${comparison.type}`}
                          >
                            {comparison.text}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}

                <button
                  className="add-set-button"
                  onClick={() =>
                    addSet(exercise.id)
                  }
                >
                  + Add Set
                </button>
              </div>
            );
          })}
        </section>

        <button
          className="finish-workout-button"
          onClick={finishWorkout}
        >
          Finish Workout
        </button>
      </div>
    );
  }

  if (selectedHistorySessionId) {
    return (
      <div className="app">
        <button
          className="back-button"
          onClick={() =>
            setSelectedHistorySessionId(null)
          }
        >
          ← Back
        </button>

        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT HISTORY
            </p>

            <h1>
              {
                selectedHistorySession
                  ?.workoutDay?.name
              }
            </h1>

            <p className="history-date">
              {selectedHistorySession
                ? formatDate(
                    selectedHistorySession.session
                      .date
                  )
                : ""}
            </p>
          </div>
        </header>

        <section className="exercise-list">
          {selectedHistorySession?.exercises.map(
            (exercise) => {
              const sets =
                selectedHistorySession.sets[
                  exercise.id
                ] || [];

              return (
                <div
                  className="exercise-card"
                  key={exercise.id}
                >
                  <h3>{exercise.name}</h3>

                  <div className="history-set-list">
                    {sets.map((set) => (
                      <div
                        className="history-set-row"
                        key={set.id}
                      >
                        <span>
                          Set {set.setNumber}
                        </span>

                        <strong>
                          {set.weight} kg × {set.reps}
                        </strong>

                        <span>
                          {set.rir === null
                            ? "—"
                            : `${set.rir} RIR`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
          )}
        </section>

        {renderBottomNav()}
      </div>
    );
  }

  if (selectedDayId) {
    return (
      <div className="app">
        <button
          className="back-button"
          onClick={() =>
            setSelectedDayId(null)
          }
        >
          ← Back
        </button>

        <header className="topbar">
          <div>
            <p className="eyebrow">
              {selectedDay?.dayOfWeek}
            </p>

            <h1>
              {selectedDay?.name}
            </h1>
          </div>
        </header>

        <section className="section">
          <div className="exercise-list">
            {exercises?.map((exercise) => (
              <div
                className="exercise-card"
                key={exercise.id}
              >
                <div className="exercise-top">
                  <div>
                    <h3>
                      {exercise.name}
                    </h3>

                    <p className="exercise-target">
                      {exercise.targetSets} working{" "}
                      {exercise.targetSets === 1
                        ? "set"
                        : "sets"}{" "}
                      · {exercise.minReps}-
                      {exercise.maxReps} reps
                    </p>
                  </div>

                  {exercise.optional && (
                    <span className="optional-badge">
                      Optional
                    </span>
                  )}
                </div>

                <div className="exercise-details">
                  {exercise.warmupSets > 0 && (
                    <span>
                      {exercise.warmupSets} warmup{" "}
                      {exercise.warmupSets === 1
                        ? "set"
                        : "sets"}
                    </span>
                  )}

                  <span>
                    RIR: {exercise.targetRIR}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <button
          className="start-workout-button"
          onClick={startWorkout}
        >
          Start {selectedDay?.name}
        </button>

        {renderBottomNav()}
      </div>
    );
  }

  if (activeTab === "history") {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT TRACKER
            </p>

            <h1>History</h1>
          </div>
        </header>

        <section className="history-filters">
          <input
            className="history-search"
            type="text"
            placeholder="Search workouts..."
            value={historySearch}
            onChange={(e) =>
              setHistorySearch(e.target.value)
            }
          />

          <div className="history-filter-row">
            <select
              value={historyMonth}
              onChange={(e) =>
                setHistoryMonth(e.target.value)
              }
            >
              <option value="all">
                All months
              </option>
              <option value="0">
                January
              </option>
              <option value="1">
                February
              </option>
              <option value="2">
                March
              </option>
              <option value="3">
                April
              </option>
              <option value="4">
                May
              </option>
              <option value="5">
                June
              </option>
              <option value="6">
                July
              </option>
              <option value="7">
                August
              </option>
              <option value="8">
                September
              </option>
              <option value="9">
                October
              </option>
              <option value="10">
                November
              </option>
              <option value="11">
                December
              </option>
            </select>

            <select
              value={historyYear}
              onChange={(e) =>
                setHistoryYear(e.target.value)
              }
            >
              <option value="all">
                All years
              </option>

              {historyYears.map((year) => (
                <option
                  key={year}
                  value={year}
                >
                  {year}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="section">
          <p className="history-count">
            {filteredHistorySessions.length}{" "}
            {filteredHistorySessions.length === 1
              ? "workout"
              : "workouts"}
          </p>

          <div className="session-list">
            {filteredHistorySessions.length === 0 && (
              <div className="empty-history">
                <strong>No workouts found</strong>

                <p>
                  Try changing your search or filters.
                </p>
              </div>
            )}

            {filteredHistorySessions.map(
              (session) => (
                <button
                  className="session-card workout-day-button"
                  key={session.id}
                  onClick={() =>
                    setSelectedHistorySessionId(
                      session.id
                    )
                  }
                >
                  <div>
                    <strong>
                      {session.workoutDay?.name}
                    </strong>

                    <p>
                      {formatDate(session.date)}
                    </p>
                  </div>

                  <span>›</span>
                </button>
              )
            )}
          </div>
        </section>

        {renderBottomNav()}
      </div>
    );
  }

  if (activeTab === "progress") {
    const chartData =
      progressData?.sessions.map((session) => ({
        date: formatShortDate(session.date),
        e1rm: Number(
          session.bestE1RM.toFixed(1)
        ),
      })) || [];

    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT TRACKER
            </p>

            <h1>Progress</h1>
          </div>
        </header>

        <section className="progress-selector">
          <label>Exercise</label>

          <input
            className="progress-search"
            type="text"
            placeholder="Search exercises..."
            value={progressSearch}
            onChange={(e) => {
              setProgressSearch(e.target.value);

              if (
                selectedProgressExercise &&
                e.target.value !==
                  selectedProgressExercise
              ) {
                setSelectedProgressExercise("");
              }
            }}
          />

          {progressSearch.trim() !== "" &&
            !selectedProgressExercise && (
              <div className="exercise-search-results">
                {filteredProgressExercises.length ===
                  0 && (
                  <div className="exercise-search-empty">
                    No exercises found
                  </div>
                )}

                {filteredProgressExercises.map(
                  (name) => (
                    <button
                      key={name}
                      className="exercise-search-result"
                      onClick={() => {
                        setSelectedProgressExercise(name);
                        setProgressSearch(name);
                      }}
                    >
                      <span>{name}</span>
                      <span>›</span>
                    </button>
                  )
                )}
              </div>
            )}

          {selectedProgressExercise && (
            <button
              className="selected-exercise-pill"
              onClick={() => {
                setSelectedProgressExercise("");
                setProgressSearch("");
              }}
            >
              <span>
                {selectedProgressExercise}
              </span>

              <span>×</span>
            </button>
          )}
        </section>

        {!selectedProgressExercise && (
          <div className="empty-history">
            <strong>
              Search for an exercise
            </strong>

            <p>
              Type part of an exercise name above,
              then select it.
            </p>
          </div>
        )}

        {selectedProgressExercise &&
          progressData?.sessions.length === 0 && (
            <div className="empty-history">
              <strong>No data yet</strong>

              <p>
                Complete this exercise in a workout
                to start tracking it.
              </p>
            </div>
          )}

        {selectedProgressExercise &&
          progressData?.sessions.length > 0 && (
            <>
              <section className="progress-stats">
                <div className="stat-card">
                  <span>Best weight</span>

                  <strong>
                    {progressData.bestWeight}kg
                  </strong>
                </div>

                <div className="stat-card">
                  <span>Estimated 1RM</span>

                  <strong>
                    {progressData.bestE1RM.toFixed(1)}
                    kg
                  </strong>
                </div>

                <div className="stat-card">
                  <span>Sessions</span>

                  <strong>
                    {progressData.sessions.length}
                  </strong>
                </div>

                <div className="stat-card">
                  <span>Strength change</span>

                  <strong
                    className={
                      progressData.change > 0
                        ? "positive-stat"
                        : progressData.change < 0
                        ? "negative-stat"
                        : ""
                    }
                  >
                    {progressData.change > 0
                      ? "+"
                      : ""}
                    {progressData.change.toFixed(1)}
                    %
                  </strong>
                </div>
              </section>

              <section className="progress-chart-card">
                <div className="progress-chart-header">
                  <div>
                    <p className="card-label">
                      STRENGTH TREND
                    </p>

                    <h2>
                      {selectedProgressExercise}
                    </h2>
                  </div>
                </div>

                <div className="chart-container">
                  <ResponsiveContainer
                    width="100%"
                    height={240}
                  >
                    <LineChart data={chartData}>
                      <XAxis
                        dataKey="date"
                        tick={{
                          fill: "#858a95",
                          fontSize: 11,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <YAxis
                        tick={{
                          fill: "#858a95",
                          fontSize: 11,
                        }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />

                      <Tooltip
                        contentStyle={{
                          background: "#15171d",
                          border:
                            "1px solid #2b2e37",
                          borderRadius: "12px",
                        }}
                        labelStyle={{
                          color: "#ffffff",
                        }}
                        formatter={(value) => [
                          `${value} kg`,
                          "Estimated 1RM",
                        ]}
                      />

                      <Line
                        type="monotone"
                        dataKey="e1rm"
                        stroke="currentColor"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="section">
                <div className="section-header">
                  <h3>Exercise History</h3>
                </div>

                <div className="progress-history-list">
                  {[...progressData.sessions]
                    .reverse()
                    .map((session) => (
                      <div
                        className="progress-session-card"
                        key={session.sessionId}
                      >
                        <div className="progress-session-top">
                          <strong>
                            {formatDate(session.date)}
                          </strong>

                          <span>
                            e1RM{" "}
                            {session.bestE1RM.toFixed(1)}
                            kg
                          </span>
                        </div>

                        <div className="progress-session-sets">
                          {session.sets.map((set) => (
                            <div
                              key={set.id}
                              className="progress-set-row"
                            >
                              <span>
                                Set {set.setNumber}
                              </span>

                              <strong>
                                {set.weight}kg × {set.reps}
                              </strong>

                              <span>
                                {set.rir === null
                                  ? ""
                                  : `${set.rir} RIR`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            </>
          )}

        {renderBottomNav()}
      </div>
    );
  }

  if (activeTab === "settings") {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              WORKOUT TRACKER
            </p>

            <h1>Settings</h1>
          </div>
        </header>

        <section className="card hero-card">
          <p className="card-label">
            STORAGE
          </p>

          <h2>Local Database</h2>

          <p className="muted">
            Your workout history is stored locally
            on this device using IndexedDB.
          </p>
        </section>

        <section className="settings-section">
          <p className="card-label">
            BACKUP & RESTORE
          </p>

          <div className="settings-card">
            <div className="settings-item">
              <div>
                <strong>Export Backup</strong>

                <p>
                  Save a copy of your splits,
                  exercises, workouts and sets.
                </p>
              </div>

              <button
                className="settings-action-button"
                onClick={exportWorkoutBackup}
              >
                Export
              </button>
            </div>

            <div className="settings-divider" />

            <div className="settings-item">
              <div>
                <strong>Restore Backup</strong>

                <p>
                  Restore your workout data from a
                  previous backup file.
                </p>
              </div>

              <label
                className="settings-action-button"
                htmlFor="backup-file-input"
              >
                Restore
              </label>

              <input
                id="backup-file-input"
                type="file"
                accept=".json,application/json"
                onChange={handleImportBackup}
                hidden
              />
            </div>
          </div>
        </section>

        <section className="backup-warning">
          <strong>
            Keep backups somewhere safe
          </strong>

          <p>
            Your workouts are stored only on this
            device. Export a backup occasionally
            so you don't lose your history if the
            app's local storage is removed.
          </p>
        </section>

        {renderBottomNav()}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            WORKOUT TRACKER
          </p>

          <h1>
            {split?.name || "Loading..."}
          </h1>
        </div>
      </header>

      <section className="section">
        <p className="card-label">
          YOUR PROGRAM
        </p>

        <div className="session-list">
          {workoutDays?.map((day) => (
            <button
              className="session-card workout-day-button"
              key={day.id}
              onClick={() =>
                setSelectedDayId(day.id)
              }
            >
              <div>
                <strong>{day.name}</strong>
                <p>{day.dayOfWeek}</p>
              </div>

              <span>›</span>
            </button>
          ))}
        </div>
      </section>

      {renderBottomNav()}
    </div>
  );
}

export default App;