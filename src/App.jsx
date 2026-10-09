import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  ArrowDown,
  ArrowUp,
  ArrowsLeftRight,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  Check,
  ClockCounterClockwise,
  DownloadSimple,
  Equals,
  Flag,
  GearSix,
  House,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Play,
  Plus,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";

import { db } from "./db";

import {
  exportWorkoutBackup,
  importWorkoutBackup,
} from "./backup";

import {
  confirmAction,
  notify,
} from "./confirm.js";

import "./App.css";

// ============================================================
// HELPERS
// ============================================================

function normalizeDecimalInput(value) {
  if (value === null || value === undefined) {
    return "";
  }

  // Weight, reps and RIR are never negative, so "-" is dropped too.
  let normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "");

  const parts = normalized.split(".");

  if (parts.length > 2) {
    normalized =
      parts.shift() +
      "." +
      parts.join("");
  }

  return normalized;
}

// Per-set notes ("more weight, poor form") are free text, saved trimmed
// on the set record and only when there is something to save.
const SET_NOTE_MAX_LENGTH = 200;

function getSetNote(value) {
  return String(
    value ?? ""
  )
    .trim()
    .slice(
      0,
      SET_NOTE_MAX_LENGTH
    );
}

function parseDecimal(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized = String(value)
    .replace(",", ".")
    .trim();

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
}

// Blank RIR always means 0 RIR.
function getRIRValue(value) {
  const parsed = parseDecimal(value);

  return parsed === null
    ? 0
    : parsed;
}

function calculateE1RM(
  weight,
  reps,
  rir = 0
) {
  const w = parseDecimal(weight);
  const r = parseDecimal(reps);

  if (
    w === null ||
    r === null ||
    w <= 0 ||
    r <= 0
  ) {
    return 0;
  }

  const rirValue = Math.max(
    0,
    getRIRValue(rir)
  );

  const effectiveReps =
    r + rirValue;

  return (
    w *
    (1 + effectiveReps / 30)
  );
}

// Formatters are created once: toLocaleDateString with options builds a
// new Intl.DateTimeFormat on every call, which is slow when History
// renders hundreds of dates. Output is identical.
const LONG_DATE_FORMAT =
  new Intl.DateTimeFormat(
    "en-ZA",
    {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );

const SHORT_DATE_FORMAT =
  new Intl.DateTimeFormat(
    "en-ZA",
    {
      day: "numeric",
      month: "short",
    }
  );

const TIME_FORMAT =
  new Intl.DateTimeFormat(
    "en-ZA",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );

function formatDate(dateString) {
  if (!dateString) {
    return "";
  }

  return LONG_DATE_FORMAT.format(
    new Date(dateString)
  );
}

function formatShortDate(dateString) {
  if (!dateString) {
    return "";
  }

  return SHORT_DATE_FORMAT.format(
    new Date(dateString)
  );
}

function formatTime(dateString) {
  if (!dateString) {
    return "";
  }

  return TIME_FORMAT.format(
    new Date(dateString)
  );
}

function formatDuration(seconds) {
  const totalSeconds =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) /
      60
  );

  const secs =
    totalSeconds % 60;

  const pad = (value) =>
    String(value).padStart(
      2,
      "0"
    );

  if (hours > 0) {
    return `${hours}:${pad(
      minutes
    )}:${pad(secs)}`;
  }

  return `${pad(
    minutes
  )}:${pad(secs)}`;
}

// ============================================================
// HISTORY PERFORMANCE HELPERS
// ============================================================

function getTotalVolume(sets = []) {
  return sets.reduce(
    (total, set) => {
      const weight =
        parseDecimal(
          set.weight
        );

      const reps =
        parseDecimal(
          set.reps
        );

      if (
        weight === null ||
        reps === null
      ) {
        return total;
      }

      return (
        total +
        weight * reps
      );
    },
    0
  );
}

function getProgressStatus(percentageChange) {
  const SAME_THRESHOLD = 0.05;

  if (percentageChange > SAME_THRESHOLD) {
    return "improved";
  }

  if (percentageChange < -SAME_THRESHOLD) {
    return "regressed";
  }

  return "same";
}

// The user trains in a fixed rep range. Any time the weight goes UP while
// the reps stay within the working range, that is always counted as
// progression, regardless of what the RIR-adjusted e1RM estimate says.
const PROGRESSION_REP_MIN = 5;
const PROGRESSION_REP_MAX = 8;

// Returns the single best set of a list by RIR-adjusted e1RM,
// carrying the raw weight/reps so progression can be judged by load.
// 0 kg (bodyweight) sets count too: their e1RM is 0, so they are ranked
// by reps + RIR (`effectiveReps`) and only win when nothing is loaded.
function getBestSet(sets = []) {
  let best = null;

  for (const set of sets) {
    const weight = parseDecimal(set.weight);
    const reps = parseDecimal(set.reps);

    if (
      weight === null ||
      reps === null ||
      weight < 0 ||
      reps <= 0
    ) {
      continue;
    }

    const rir = getRIRValue(set.rir);

    const score = calculateE1RM(
      weight,
      reps,
      rir
    );

    const effectiveReps =
      reps + rir;

    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        effectiveReps >
          best.effectiveReps)
    ) {
      best = {
        weight,
        reps,
        score,
        effectiveReps,
      };
    }
  }

  return best;
}

// Decide how an exercise progressed from one performance to the next.
// `current` and `previous` are best-set objects
// { weight, reps, score, effectiveReps }.
// Rule: weight up + reps within working range => always "improved".
// Bodyweight (0 kg) vs bodyweight is judged by reps + RIR; switching
// between bodyweight and loaded is a new baseline (not comparable).
function resolveExerciseProgress(
  current,
  previous
) {
  if (!previous) {
    return {
      status: "new",
      percentageChange: null,
      source: "new",
    };
  }

  const currentBodyweight =
    current.weight === 0;

  const previousBodyweight =
    previous.weight === 0;

  if (
    currentBodyweight !==
    previousBodyweight
  ) {
    return {
      status: "new",
      percentageChange: null,
      source: "new",
    };
  }

  if (currentBodyweight) {
    const previousReps =
      previous.effectiveReps ??
      previous.reps;

    const currentReps =
      current.effectiveReps ??
      current.reps;

    const repsPct =
      previousReps > 0
        ? ((currentReps -
            previousReps) /
            previousReps) *
          100
        : 0;

    return {
      status:
        getProgressStatus(repsPct),
      percentageChange: repsPct,
      source: "reps",
    };
  }

  const weightUp =
    current.weight > previous.weight;

  const inRange =
    current.reps >=
      PROGRESSION_REP_MIN &&
    current.reps <=
      PROGRESSION_REP_MAX;

  if (
    weightUp &&
    inRange
  ) {
    const weightPct =
      previous.weight > 0
        ? ((current.weight -
            previous.weight) /
            previous.weight) *
          100
        : 0;

    return {
      status: "improved",
      percentageChange: weightPct,
      source: "weight",
    };
  }

  const pct =
    previous.score > 0
      ? ((current.score -
          previous.score) /
          previous.score) *
        100
      : 0;

  return {
    status:
      getProgressStatus(pct),
    percentageChange: pct,
    source: "e1rm",
  };
}

// The most recent performance of each exercise: for every id, the sets
// from the newest of `sessions` that contains it (sorted by setNumber).
// `sessions` must already be sorted newest first. Indexed queries on
// sets.exerciseId instead of one query per session, which mattered once
// a day had hundreds of sessions.
async function findLatestPerformances(
  exerciseIds,
  sessions
) {
  const latest = new Map();

  if (!exerciseIds.length) {
    return latest;
  }

  const rankBySession =
    new Map(
      sessions.map(
        (session, index) => [
          session.id,
          index,
        ]
      )
    );

  // One equals() per exercise (native getAll) rather than anyOf(), which
  // walks a cursor and was several times slower inside a live query.
  const sets = (
    await Promise.all(
      exerciseIds.map(
        (exerciseId) =>
          db.sets
            .where("exerciseId")
            .equals(exerciseId)
            .toArray()
      )
    )
  ).flat();

  // Pass 1: the newest session (lowest rank) per exercise.
  const bestRank =
    new Map();

  sets.forEach(
    (set) => {
      const rank =
        rankBySession.get(
          set.sessionId
        );

      if (
        rank === undefined
      ) {
        return;
      }

      const current =
        bestRank.get(
          set.exerciseId
        );

      if (
        current === undefined ||
        rank < current
      ) {
        bestRank.set(
          set.exerciseId,
          rank
        );
      }
    }
  );

  // Pass 2: collect that session's sets.
  sets.forEach(
    (set) => {
      const rank =
        bestRank.get(
          set.exerciseId
        );

      if (
        rank === undefined ||
        rankBySession.get(
          set.sessionId
        ) !== rank
      ) {
        return;
      }

      if (
        !latest.has(
          set.exerciseId
        )
      ) {
        latest.set(
          set.exerciseId,
          {
            session:
              sessions[rank],
            sets: [],
          }
        );
      }

      latest
        .get(set.exerciseId)
        .sets.push(set);
    }
  );

  latest.forEach(
    (entry) => {
      entry.sets.sort(
        (a, b) =>
          a.setNumber -
          b.setNumber
      );
    }
  );

  return latest;
}

const MONTH_RANGES = [
  {
    value: 3,
    label: "3 mo",
  },
  {
    value: 6,
    label: "6 mo",
  },
  {
    value: 12,
    label: "12 mo",
  },
  {
    value: "all",
    label: "All",
  },
];

// Rows for the "Month by month" table: one per month that has upper or
// lower data, newest first, limited to `range` months. `total` combines
// the comparable monthly changes in the range by compounding them
// (+10% then +10% is +21%), per body part.
function buildMonthlyRows(
  monthlyBodyProgress,
  range
) {
  const rowsByKey =
    new Map();

  ["upper", "lower"].forEach(
    (bodyType) => {
      (
        monthlyBodyProgress?.[
          bodyType
        ]?.months || []
      ).forEach(
        (month) => {
          const row =
            rowsByKey.get(
              month.monthKey
            ) || {
              monthKey:
                month.monthKey,
              monthLabel:
                month.monthLabel,
              upper: null,
              lower: null,
            };

          row[bodyType] =
            month;

          rowsByKey.set(
            month.monthKey,
            row
          );
        }
      );
    }
  );

  const allRows = [
    ...rowsByKey.values(),
  ].sort((a, b) =>
    b.monthKey.localeCompare(
      a.monthKey
    )
  );

  const rows =
    range === "all"
      ? allRows
      : allRows.slice(
          0,
          range
        );

  function compound(bodyType) {
    const changes = rows
      .map(
        (row) =>
          row[bodyType]
            ?.percentage
      )
      .filter((value) =>
        Number.isFinite(value)
      );

    if (!changes.length) {
      return null;
    }

    return (
      (changes.reduce(
        (product, value) =>
          product *
          (1 + value / 100),
        1
      ) -
        1) *
      100
    );
  }

  return {
    rows,
    hasMore:
      allRows.length >
      rows.length,
    total: {
      upper:
        compound("upper"),
      lower:
        compound("lower"),
    },
  };
}

// Progress and Monthly treat same-named exercises on different days as
// one exercise; names match regardless of case and surrounding spaces.
function normalizeExerciseName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

function formatProgressPercentage(value) {
  const safeValue = Number.isFinite(Number(value))
    ? Number(value)
    : 0;

  const rounded = Math.abs(safeValue) < 0.05
    ? 0
    : safeValue;

  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

// ============================================================
// PROGRESSION COMPARISON
// ============================================================

function compareSet(current, previous) {
  if (!previous) {
    return null;
  }

  const currentWeight =
    parseDecimal(current.weight);

  const currentReps =
    parseDecimal(current.reps);

  const previousWeight =
    parseDecimal(previous.weight);

  const previousReps =
    parseDecimal(previous.reps);

  if (
    currentWeight === null ||
    currentReps === null ||
    previousWeight === null ||
    previousReps === null
  ) {
    return null;
  }

  const currentRIR =
    getRIRValue(current.rir);

  const previousRIR =
    getRIRValue(previous.rir);

  // Rounded to 2 decimals so float noise never shows (e.g. +0.1999999kg).
  const roundDiff = (value) =>
    Math.round(value * 100) / 100;

  const weightDiff = roundDiff(
    currentWeight -
      previousWeight
  );

  const repsDiff = roundDiff(
    currentReps -
      previousReps
  );

  const rirDiff = roundDiff(
    currentRIR -
      previousRIR
  );

  if (
    weightDiff === 0 &&
    repsDiff === 0 &&
    rirDiff === 0
  ) {
    return {
      type: "same",
      text: "Same",
    };
  }

  const changes = [];

  if (weightDiff > 0) {
    changes.push(
      `+${weightDiff}kg`
    );
  } else if (weightDiff < 0) {
    changes.push(
      `${weightDiff}kg`
    );
  }

  if (repsDiff > 0) {
    changes.push(
      `+${repsDiff} rep${
        repsDiff === 1
          ? ""
          : "s"
      }`
    );
  } else if (repsDiff < 0) {
    changes.push(
      `${repsDiff} rep${
        Math.abs(repsDiff) === 1
          ? ""
          : "s"
      }`
    );
  }

  if (rirDiff > 0) {
    changes.push(
      `+${rirDiff} RIR`
    );
  } else if (rirDiff < 0) {
    changes.push(
      `${rirDiff} RIR`
    );
  }

  const hasPositiveChange =
    weightDiff > 0 ||
    repsDiff > 0 ||
    rirDiff > 0;

  const hasNegativeChange =
    weightDiff < 0 ||
    repsDiff < 0 ||
    rirDiff < 0;

  if (
    hasPositiveChange &&
    !hasNegativeChange
  ) {
    return {
      type: "improved",
      text: changes.join(" · "),
    };
  }

  if (
    hasNegativeChange &&
    !hasPositiveChange
  ) {
    return {
      type: "regressed",
      text: changes.join(" · "),
    };
  }

  // Switching between bodyweight and loaded isn't comparable (History
  // treats it as a new baseline), so a mixed result stays neutral.
  if (
    (currentWeight === 0) !==
    (previousWeight === 0)
  ) {
    return {
      type: "mixed",
      text: changes.join(" · "),
    };
  }

  // Mixed result (e.g. weight up but reps or RIR down). If the load went
  // up and the reps are still within the working rep range, count it as
  // progression — same rule as resolveExerciseProgress in History.
  if (weightDiff > 0) {
    if (
      currentReps >=
        PROGRESSION_REP_MIN &&
      currentReps <=
        PROGRESSION_REP_MAX
    ) {
      return {
        type: "improved",
        text: changes.join(" · "),
      };
    }
  }

  // Bodyweight (0 kg) vs bodyweight: e1RM is 0 for both, so judge by
  // reps + RIR, matching resolveExerciseProgress.
  const bothBodyweight =
    currentWeight === 0 &&
    previousWeight === 0;

  const currentScore =
    bothBodyweight
      ? currentReps +
        currentRIR
      : calculateE1RM(
          currentWeight,
          currentReps,
          currentRIR
        );

  const previousScore =
    bothBodyweight
      ? previousReps +
        previousRIR
      : calculateE1RM(
          previousWeight,
          previousReps,
          previousRIR
        );

  const scoreDifference =
    currentScore -
    previousScore;

  if (
    Math.abs(scoreDifference) <
    0.05
  ) {
    return {
      type: "mixed",
      text: changes.join(" · "),
    };
  }

  if (scoreDifference > 0) {
    return {
      type: "improved",
      text: changes.join(" · "),
    };
  }

  return {
    type: "regressed",
    text: changes.join(" · "),
  };
}

function getExerciseOrderKey(
  exercise
) {
  if (!exercise) {
    return null;
  }

  if (
    exercise.alternativeGroup
  ) {
    return `group:${exercise.alternativeGroup}`;
  }

  return `exercise:${exercise.id}`;
}

const HISTORY_PAGE_SIZE = 40;

const NAV_TABS = [
  {
    tab: "home",
    label: "Home",
    Icon: House,
  },
  {
    tab: "history",
    label: "History",
    Icon: ClockCounterClockwise,
  },
  {
    tab: "progress",
    label: "Progress",
    Icon: ChartLineUp,
  },
  {
    tab: "settings",
    label: "Settings",
    Icon: GearSix,
  },
];

// Chart colours mirror the --green / --red / --muted / --accent tokens in
// App.css (SVG fill attributes can't read CSS variables reliably).
const CHART_COLORS = {
  improved: "#7bd79a",
  regressed: "#ef747b",
  same: "#8e9099",
  accent: "#ef8278",
  axis: "#8e9099",
};

const CHART_TOOLTIP_PROPS = {
  cursor: {
    stroke: "rgba(255, 255, 255, 0.12)",
    fill: "rgba(255, 255, 255, 0.04)",
  },
  contentStyle: {
    background: "#20212c",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
    padding: "8px 10px",
    fontSize: 12,
  },
  labelStyle: {
    color: "#8e9099",
    marginBottom: 2,
  },
  itemStyle: {
    color: "#f6f6f8",
    padding: 0,
  },
};

const EMPTY_EXERCISE_FORM = {
  name: "",
  targetSets: 2,
  warmupSets: 0,
  minReps: 5,
  maxReps: 8,
  targetRIR: "Failure",
  optional: false,
  hasAlternative: false,
  alternatives: [""],
  // Database id of each alternative row (null for new ones), kept in
  // step with `alternatives` so renames update the right record.
  alternativeIds: [null],
};

// ============================================================
// APP
// ============================================================

function App() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("home");

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
    historyProgressReturn,
    setHistoryProgressReturn,
  ] = useState(null);

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

  // History renders a page at a time; years of workouts as one list made
  // the tab take seconds to open. Kept across History detail visits.
  const [
    historyVisibleCount,
    setHistoryVisibleCount,
  ] = useState(HISTORY_PAGE_SIZE);

  // Editing the sets of a finished workout in History detail:
  // { sessionId, original, sets: { [exerciseId]: [{ id, weight, reps, rir }] } }.
  // Nothing is written until Save; original is the snapshot used to
  // detect unsaved changes.
  const [
    historyEdit,
    setHistoryEdit,
  ] = useState(null);

  const [
    savingHistoryEdit,
    setSavingHistoryEdit,
  ] = useState(false);

  const [
    selectedProgressExercise,
    setSelectedProgressExercise,
  ] = useState("");

  const [
    progressSearch,
    setProgressSearch,
  ] = useState("");

  // How many months the "Month by month" table shows: 3, 6, 12 or "all".
  const [
    monthRange,
    setMonthRange,
  ] = useState(3);

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

  const [
    summaryData,
    setSummaryData,
  ] = useState(null);

  const [
    nowTick,
    setNowTick,
  ] = useState(null);

  // Guards Complete Workout against a second tap while it is saving.
  // The ref blocks immediately; the state disables the button.
  const finishingWorkoutRef =
    useRef(false);

  const [
    finishingWorkout,
    setFinishingWorkout,
  ] = useState(false);

  useEffect(() => {
    if (!activeWorkout) {
      finishingWorkoutRef.current =
        false;
    }
  }, [activeWorkout]);

  // ============================================================
  // LOAD PAUSED WORKOUT
  // ============================================================

  useEffect(() => {
    async function loadDraft() {
      try {
        const savedDraft =
          await db.appMeta.get(
            "activeWorkoutDraft"
          );

        if (
          savedDraft?.value
        ) {
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
  // LIVE WORKOUT TIMER
  // ============================================================

  useEffect(() => {
    if (!activeWorkout || !workoutStartedAt) {
      setNowTick(null);
      return;
    }

    const id = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    setNowTick(Date.now());

    return () => {
      clearInterval(id);
    };
  }, [activeWorkout, workoutStartedAt]);

  // ============================================================
  // SPLITS
  // ============================================================

  const splits =
    useLiveQuery(
      async () => {
        const all =
          await db.splits.toArray();

        return all.filter(
          (split) =>
            !split.archived
        );
      },
      []
    );

  const selectedSplit =
    useLiveQuery(
      async () => {
        if (
          !selectedSplitId
        ) {
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
        if (
          !selectedSplitId
        ) {
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
        if (
          !selectedDayId
        ) {
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
        if (
          !selectedDayId
        ) {
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
        !alternativeGroups[
          group
        ]
      ) {
        alternativeGroups[
          group
        ] = [];
      }

      alternativeGroups[
        group
      ].push(exercise);
    }
  );

  // Falls back to the group's first member when nothing is selected or
  // the selected alternative has since been removed from the group.
  function getSelectedAlternative(
    groupName
  ) {
    const group =
      alternativeGroups[
        groupName
      ] || [];

    const selectedId =
      selectedAlternatives[
        groupName
      ];

    if (
      group.some(
        (item) =>
          item.id ===
          selectedId
      )
    ) {
      return selectedId;
    }

    return (
      group[0]?.id ??
      null
    );
  }

  // An optional alternative group works like any optional exercise: it
  // stays skipped until included. Inclusion is stored per group under
  // its order key ("group:<name>"). Until the user includes or skips it,
  // a group that already has completed sets (e.g. in a workout paused
  // before this rule existed) counts as included.
  function isOptionalGroupSkipped(
    groupName,
    selectedExercise
  ) {
    if (
      !selectedExercise?.optional
    ) {
      return false;
    }

    const decision =
      includedOptional[
        `group:${groupName}`
      ];

    if (
      decision !==
      undefined
    ) {
      return !decision;
    }

    return !(
      workoutSets[
        selectedExercise.id
      ] || []
    ).some(
      (set) =>
        set.completed
    );
  }

  // ============================================================
  // PREVIOUS PERFORMANCE
  // ============================================================

  // Identifies which day + exercise list the previous-performance data
  // was built for. Re-runs the query whenever the list changes (not just
  // its length) and lets Start wait until the data matches.
  const previousDataKey = `${selectedDayId}:${(
    exercises || []
  )
    .map(
      (exercise) =>
        exercise.id
    )
    .join(",")}`;

  const previousExerciseData =
    useLiveQuery(
      async () => {
        if (
          !selectedDayId ||
          !exercises?.length
        ) {
          return {
            loadedFor:
              previousDataKey,
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
          sessions[0] ||
          null;

        const exerciseData = {};

        const latestPerformances =
          await findLatestPerformances(
            exercises.map(
              (exercise) =>
                exercise.id
            ),
            sessions
          );

        for (
          const exercise of exercises
        ) {
          const found =
            latestPerformances.get(
              exercise.id
            ) || null;

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
          loadedFor:
            previousDataKey,
          latestDaySession,
          exerciseData,
        };
      },
      [
        previousDataKey,
      ]
    );

  const previousExerciseDataReady =
    previousExerciseData?.loadedFor ===
    previousDataKey;

  // ============================================================
  // LEARN EXERCISE ORDER
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

      if (
        !savedOrder.length
      ) {
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
            getExerciseOrderKey(
              a
            );

          const keyB =
            getExerciseOrderKey(
              b
            );

          const rankA =
            rankMap.has(
              keyA
            )
              ? rankMap.get(
                  keyA
                )
              : 9999;

          const rankB =
            rankMap.has(
              keyB
            )
              ? rankMap.get(
                  keyB
                )
              : 9999;

          if (
            rankA !== rankB
          ) {
            return (
              rankA -
              rankB
            );
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
      orderedExercises ||
      []
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

  // The single place the paused-workout draft is built. `overrides`
  // lets startWorkout supply values that aren't in state yet.
  const makeCurrentDraft =
    useCallback(
      (overrides = {}) => ({
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

        selectedAlternatives,

        includedOptional,

        exerciseCompletionOrder,

        ...overrides,
      }),
      [
        selectedSplitId,
        selectedDayId,
        selectedSplit?.name,
        selectedDay?.name,
        workoutStartedAt,
        workoutSets,
        selectedAlternatives,
        includedOptional,
        exerciseCompletionOrder,
      ]
    );

  useEffect(() => {
    if (
      !activeWorkout ||
      !selectedDayId ||
      !workoutStartedAt
    ) {
      return;
    }

    async function saveDraft() {
      // Completing the workout deletes the draft; a save that was
      // still pending must not write it back.
      if (
        finishingWorkoutRef.current
      ) {
        return;
      }

      const draft =
        makeCurrentDraft();

      try {
        await db.appMeta.put(
          {
            key:
              "activeWorkoutDraft",

            value:
              draft,
          }
        );

        setPausedWorkout(
          draft
        );
      } catch (error) {
        console.error(
          "Could not save workout draft:",
          error
        );
      }
    }

    const timer =
      setTimeout(
        saveDraft,
        150
      );

    // iOS can suspend or kill a backgrounded PWA immediately, so save
    // right away instead of waiting for the debounce.
    function saveNowIfHidden() {
      if (
        document.visibilityState ===
        "hidden"
      ) {
        clearTimeout(timer);

        saveDraft();
      }
    }

    function saveNow() {
      clearTimeout(timer);

      saveDraft();
    }

    document.addEventListener(
      "visibilitychange",
      saveNowIfHidden
    );

    window.addEventListener(
      "pagehide",
      saveNow
    );

    return () => {
      clearTimeout(timer);

      document.removeEventListener(
        "visibilitychange",
        saveNowIfHidden
      );

      window.removeEventListener(
        "pagehide",
        saveNow
      );
    };
  }, [
    activeWorkout,
    selectedDayId,
    workoutStartedAt,
    makeCurrentDraft,
  ]);

  // ============================================================
  // HISTORY
  // ============================================================

  const historySessions =
    useLiveQuery(
      async () => {
        const [
          sessions,
          days,
          allExercises,
          allSets,
        ] = await Promise.all([
          db.sessions.toArray(),
          db.workoutDays.toArray(),
          db.exercises.toArray(),
          db.sets.toArray(),
        ]);

        const dayMap = {};
        const exerciseMap = {};
        const setsBySession = {};

        days.forEach((day) => {
          dayMap[day.id] = day;
        });

        allExercises.forEach((exercise) => {
          exerciseMap[exercise.id] = exercise;
        });

        allSets.forEach((set) => {
          if (!setsBySession[set.sessionId]) {
            setsBySession[set.sessionId] = {};
          }

          if (!setsBySession[set.sessionId][set.exerciseId]) {
            setsBySession[set.sessionId][set.exerciseId] = [];
          }

          setsBySession[set.sessionId][set.exerciseId].push(set);
        });

        Object.values(setsBySession).forEach((sessionGroups) => {
          Object.values(sessionGroups).forEach((sets) => {
            sets.sort((a, b) => a.setNumber - b.setNumber);
          });
        });

        const lastPerformanceByExercise = new Map();

        const chronologicalSessions = [...sessions].sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        );

        const enriched = chronologicalSessions.map((session) => {
          const groupedSets =
            setsBySession[session.id] || {};

          const exerciseComparisons = [];

          Object.entries(groupedSets).forEach(
            ([exerciseIdString, currentSets]) => {
              const exerciseId = Number(exerciseIdString);
              const exercise = exerciseMap[exerciseId];

              const currentBest =
                getBestSet(currentSets);

              if (!currentBest) {
                return;
              }

              const previous =
                lastPerformanceByExercise.get(exerciseId);

              if (!previous) {
                exerciseComparisons.push({
                  exerciseId,
                  exerciseName:
                    exercise?.name || "Exercise",
                  status: "new",
                  percentageChange: null,
                  currentScore:
                    currentBest.score,
                  previousScore: null,
                  previousSessionId: null,
                  previousDate: null,
                });
              } else {
                const result =
                  resolveExerciseProgress(
                    currentBest,
                    previous
                  );

                exerciseComparisons.push({
                  exerciseId,
                  exerciseName:
                    exercise?.name || "Exercise",
                  status: result.status,
                  percentageChange:
                    result.percentageChange,
                  currentScore:
                    currentBest.score,
                  previousScore:
                    previous.score,
                  previousSessionId:
                    previous.sessionId,
                  previousDate:
                    previous.date,
                });
              }

              lastPerformanceByExercise.set(exerciseId, {
                weight: currentBest.weight,
                reps: currentBest.reps,
                score: currentBest.score,
                effectiveReps: currentBest.effectiveReps,
                sessionId: session.id,
                date: session.date,
              });
            }
          );

          const comparable = exerciseComparisons.filter(
            (comparison) =>
              comparison.status !== "new" &&
              Number.isFinite(comparison.percentageChange)
          );

          const improved = comparable.filter(
            (comparison) =>
              comparison.status === "improved"
          ).length;

          const same = comparable.filter(
            (comparison) =>
              comparison.status === "same"
          ).length;

          const regressed = comparable.filter(
            (comparison) =>
              comparison.status === "regressed"
          ).length;

          const newCount = exerciseComparisons.filter(
            (comparison) =>
              comparison.status === "new"
          ).length;

          const overallPercentage = comparable.length
            ? comparable.reduce(
                (total, comparison) =>
                  total + comparison.percentageChange,
                0
              ) / comparable.length
            : null;

          return {
            ...session,
            workoutDay:
              dayMap[session.workoutDayId],
            progressSummary: {
              overallPercentage,
              improved,
              same,
              regressed,
              newCount,
              comparableCount: comparable.length,
              exerciseComparisons,
            },
          };
        });

        return enriched.sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );
      },
      []
    );

  const historyYears = [
    ...new Set(
      (
        historySessions ||
        []
      ).map((session) =>
        new Date(
          session.date
        ).getFullYear()
      )
    ),
  ].sort(
    (a, b) =>
      b - a
  );

  const filteredHistorySessions =
    (
      historySessions ||
      []
    ).filter(
      (session) => {
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
      }
    );

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

        sets.forEach(
          (set) => {
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
          }
        );

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
          sets:
            groupedSets,
        };
      },
      [
        selectedHistorySessionId,
      ]
    );

  const selectedHistorySummary =
    (historySessions || []).find(
      (session) =>
        session.id === selectedHistorySessionId
    )?.progressSummary || null;

  // ============================================================
  // PROGRESS
  // ============================================================

  const allExerciseNames =
    useLiveQuery(
      async () => {
        const all =
          await db.exercises.toArray();

        // One entry per normalised name, preferring a current
        // (non-archived) exercise's spelling.
        const byName =
          new Map();

        all.forEach(
          (exercise) => {
            const key =
              normalizeExerciseName(
                exercise.name
              );

            if (!key) {
              return;
            }

            const existing =
              byName.get(key);

            if (
              !existing ||
              (existing.archived &&
                !exercise.archived)
            ) {
              byName.set(
                key,
                exercise
              );
            }
          }
        );

        return [
          ...byName.values(),
        ]
          .map(
            (exercise) =>
              exercise.name.trim()
          )
          .sort(
          (a, b) =>
            a.localeCompare(
              b
            )
        );
      },
      []
    );

  const filteredProgressExercises =
    (
      allExerciseNames ||
      []
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
              normalizeExerciseName(
                exercise.name
              ) ===
              normalizeExerciseName(
                selectedProgressExercise
              )
          );

        const exerciseIds =
          matchingExercises.map(
            (exercise) =>
              exercise.id
          );

        const allSets =
          await db.sets.toArray();

        const matchingSets =
          allSets.filter(
            (set) =>
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

            if (
              !session
            ) {
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
            ].sets.push(
              set
            );
          }
        );

        const sessionData =
          Object.values(
            grouped
          )
            .map(
              (session) => {
                const sets = [
                  ...session.sets,
                ]
                  .sort(
                    (a, b) =>
                      a.setNumber -
                      b.setNumber
                  )
                  .map(
                    (set) => ({
                      ...set,

                      e1rm:
                        calculateE1RM(
                          set.weight,
                          set.reps,
                          getRIRValue(
                            set.rir
                          )
                        ),
                    })
                  );

                const validSets =
                  sets.filter(
                    (set) =>
                      set.e1rm >
                      0
                  );

                const bestSet =
                  validSets.length
                    ? validSets.reduce(
                        (
                          best,
                          current
                        ) =>
                          current.e1rm >
                          best.e1rm
                            ? current
                            : best
                      )
                    : null;

                return {
                  ...session,
                  sets,

                  bestWeight:
                    Math.max(
                      0,
                      ...sets.map(
                        (set) =>
                          parseDecimal(
                            set.weight
                          ) ||
                          0
                      )
                    ),

                  bestE1RM:
                    bestSet?.e1rm ||
                    0,
                };
              }
            )
            .sort(
              (a, b) =>
                new Date(
                  a.date
                ) -
                new Date(
                  b.date
                )
            );

        let bestWeightRecord =
          null;

        let bestRepsRecord =
          null;

        let bestE1RMRecord =
          null;

        sessionData.forEach(
          (session) => {
            session.sets.forEach(
              (set) => {
                const weight =
                  parseDecimal(
                    set.weight
                  );

                const reps =
                  parseDecimal(
                    set.reps
                  );

                if (
                  weight !==
                    null &&
                  weight >
                    (bestWeightRecord
                      ?.value || 0)
                ) {
                  bestWeightRecord = {
                    value: weight,
                    date:
                      session.date,
                  };
                }

                if (
                  reps !==
                    null &&
                  reps >
                    (bestRepsRecord
                      ?.value || 0)
                ) {
                  bestRepsRecord = {
                    value: reps,
                    date:
                      session.date,
                  };
                }

                if (
                  set.e1rm >
                    (bestE1RMRecord
                      ?.value || 0)
                ) {
                  bestE1RMRecord = {
                    value:
                      set.e1rm,
                    date:
                      session.date,
                  };
                }
              }
            );
          }
        );

        const bestWeight =
          bestWeightRecord
            ?.value || 0;

        const bestE1RM =
          bestE1RMRecord
            ?.value || 0;

        // Same rule as History / Monthly: weight up with reps in the
        // working range counts as progression by the load increase.
        const firstBest =
          getBestSet(
            sessionData[0]
              ?.sets || []
          );

        const latestBest =
          getBestSet(
            sessionData[
              sessionData.length -
                1
            ]?.sets || []
          );

        const change =
          firstBest &&
          latestBest
            ? resolveExerciseProgress(
                latestBest,
                firstBest
              ).percentageChange ?? 0
            : 0;

        return {
          sessions:
            sessionData,

          bestWeight,

          bestE1RM,

          bestWeightRecord,

          bestRepsRecord,

          bestE1RMRecord,

          change,
        };
      },
      [
        selectedProgressExercise,
      ]
    );

  // ============================================================
  // MONTHLY UPPER / LOWER BODY PROGRESSION
  // ============================================================

  const monthlyBodyProgress =
    useLiveQuery(
      async () => {
        const [
          sessions,
          days,
          allExercises,
          allSets,
        ] = await Promise.all([
          db.sessions.toArray(),
          db.workoutDays.toArray(),
          db.exercises.toArray(),
          db.sets.toArray(),
        ]);

        const dayMap = {};
        const exerciseMap = {};
        const setsBySession = {};

        days.forEach((day) => {
          dayMap[day.id] = day;
        });

        allExercises.forEach((exercise) => {
          exerciseMap[exercise.id] = exercise;
        });

        allSets.forEach((set) => {
          if (!setsBySession[set.sessionId]) {
            setsBySession[set.sessionId] = {};
          }

          if (!setsBySession[set.sessionId][set.exerciseId]) {
            setsBySession[set.sessionId][set.exerciseId] = [];
          }

          setsBySession[set.sessionId][set.exerciseId].push(set);
        });

        function getBodyType(workoutDayName = "") {
          const name = workoutDayName.toLowerCase();

          if (name.includes("upper")) {
            return "upper";
          }

          if (name.includes("lower")) {
            return "lower";
          }

          return null;
        }

        function getMonthKey(dateString) {
          const date = new Date(dateString);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          return `${year}-${month}`;
        }

        function getPreviousMonthKey(monthKey) {
          const [year, month] = monthKey.split("-").map(Number);
          const previous = new Date(year, month - 2, 1);
          return `${previous.getFullYear()}-${String(
            previous.getMonth() + 1
          ).padStart(2, "0")}`;
        }

        function formatMonthKey(monthKey) {
          const [year, month] = monthKey.split("-").map(Number);
          return new Date(year, month - 1, 1).toLocaleDateString(
            "en-ZA",
            {
              month: "short",
              year: "numeric",
            }
          );
        }

        const monthlyPerformances = {
          upper: {},
          lower: {},
        };

        [...sessions]
          .sort(
            (a, b) =>
              new Date(a.date) -
              new Date(b.date)
          )
          .forEach((session) => {
            const day = dayMap[session.workoutDayId];
            const bodyType = getBodyType(day?.name || "");

            if (!bodyType) {
              return;
            }

            const monthKey = getMonthKey(session.date);

            if (!monthlyPerformances[bodyType][monthKey]) {
              monthlyPerformances[bodyType][monthKey] = {};
            }

            const groupedSets = setsBySession[session.id] || {};

            Object.entries(groupedSets).forEach(
              ([exerciseIdString, sets]) => {
                const exerciseId = Number(exerciseIdString);
                const exercise = exerciseMap[exerciseId];

                if (!exercise?.name) {
                  return;
                }

                const best = getBestSet(sets);

                if (!best) {
                  return;
                }

                // Match the same exercise across Upper A / Upper B or
                // Lower A / Lower B by exercise name, just like the
                // individual Progress tab does.
                const exerciseKey =
                  normalizeExerciseName(
                    exercise.name
                  );

                monthlyPerformances[bodyType][monthKey][exerciseKey] = {
                  weight: best.weight,
                  reps: best.reps,
                  score: best.score,
                  effectiveReps: best.effectiveReps,
                  date: session.date,
                  exerciseName: exercise.name,
                };
              }
            );
          });

        function buildBodyProgress(bodyType) {
          const byMonth = monthlyPerformances[bodyType];
          const monthKeys = Object.keys(byMonth).sort();

          const months = monthKeys.map((monthKey) => {
            const previousMonthKey = getPreviousMonthKey(monthKey);
            const currentExercises = byMonth[monthKey] || {};
            const previousExercises = byMonth[previousMonthKey] || {};

            const changes = Object.entries(currentExercises)
              .map(([exerciseKey, current]) => {
                const previous = previousExercises[exerciseKey];

                if (!previous) {
                  return null;
                }

                const result = resolveExerciseProgress(
                  {
                    weight: current.weight,
                    reps: current.reps,
                    score: current.score,
                    effectiveReps: current.effectiveReps,
                  },
                  {
                    weight: previous.weight,
                    reps: previous.reps,
                    score: previous.score,
                    effectiveReps: previous.effectiveReps,
                  }
                );

                if (
                  result.status === "new" ||
                  !Number.isFinite(result.percentageChange)
                ) {
                  return null;
                }

                return {
                  exerciseKey,
                  exerciseName: current.exerciseName,
                  percentageChange: result.percentageChange,
                };
              })
              .filter(Boolean);

            const percentage = changes.length
              ? changes.reduce(
                  (total, item) =>
                    total + item.percentageChange,
                  0
                ) / changes.length
              : null;

            return {
              monthKey,
              monthLabel: formatMonthKey(monthKey),
              previousMonthKey,
              percentage,
              comparableExercises: changes.length,
            };
          });

          const comparableMonths = months.filter(
            (month) => Number.isFinite(month.percentage)
          );

          return {
            months,
            chartData: comparableMonths.map((month) => ({
              month: month.monthLabel,
              percentage: Number(month.percentage.toFixed(2)),
            })),
            latest:
              comparableMonths.length > 0
                ? comparableMonths[comparableMonths.length - 1]
                : null,
          };
        }

        return {
          upper: buildBodyProgress("upper"),
          lower: buildBodyProgress("lower"),
        };
      },
      []
    );

  // ============================================================
  // SPLIT MANAGEMENT
  // ============================================================

  // The workout in progress (running or paused), used to stop archiving
  // anything it still needs. Archived exercises are hidden from the
  // workout and skipped on finish, so their logged sets would be lost.
  function getWorkoutInProgress() {
    if (activeWorkout) {
      return {
        splitId:
          selectedSplitId,

        workoutDayId:
          selectedDayId,

        workoutSets,
      };
    }

    return pausedWorkout || null;
  }

  function findExercisesWithLoggedSets(
    exercisesToArchive
  ) {
    const inProgress =
      getWorkoutInProgress();

    if (!inProgress) {
      return [];
    }

    return exercisesToArchive.filter(
      (exercise) =>
        (
          inProgress.workoutSets?.[
            exercise.id
          ] || []
        ).some(
          (set) =>
            set.completed
        )
    );
  }

  function warnWorkoutInProgress() {
    notify({
      title:
        "Workout in progress",
      message:
        "This is part of the workout in progress. Finish or discard that workout first.",
    });
  }

  function warnLoggedSets(
    exercisesWithSets
  ) {
    notify({
      title:
        "Can't remove yet",
      message: `${exercisesWithSets
        .map(
          (exercise) =>
            exercise.name
        )
        .join(", ")} has completed sets in the workout in progress. Untick those sets or finish the workout before removing it.`,
    });
  }

  function openNewSplit() {
    setEditingSplitId(
      null
    );

    setSplitName("");

    setShowSplitForm(
      true
    );
  }

  function openEditSplit(
    split
  ) {
    setEditingSplitId(
      split.id
    );

    setSplitName(
      split.name
    );

    setShowSplitForm(
      true
    );
  }

  async function saveSplit() {
    const name =
      splitName.trim();

    if (!name) {
      notify({
        title:
          "Enter a split name.",
      });

      return;
    }

    if (
      editingSplitId
    ) {
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

    setShowSplitForm(
      false
    );

    setEditingSplitId(
      null
    );

    setSplitName("");
  }

  async function deleteSplit(
    split
  ) {
    if (
      getWorkoutInProgress()
        ?.splitId ===
      split.id
    ) {
      warnWorkoutInProgress();

      return;
    }

    const confirmed =
      await confirmAction({
        title: `Delete "${split.name}"?`,
        message:
          "Its workout days and exercises are removed from your program. Past workouts stay in History.",
        confirmLabel:
          "Delete split",
      });

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

        for (
          const day of days
        ) {
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
                archived:
                  true,
              }
            );
          }
        }
      }
    );

    setSelectedSplitId(
      null
    );

    setSelectedDayId(
      null
    );
  }

  // ============================================================
  // DAY MANAGEMENT
  // ============================================================

  function openNewDay() {
    setEditingDayId(
      null
    );

    setDayName("");
    setDayOfWeek("");

    setShowDayForm(
      true
    );
  }

  function openEditDay(
    day
  ) {
    setEditingDayId(
      day.id
    );

    setDayName(
      day.name
    );

    setDayOfWeek(
      day.dayOfWeek ||
        ""
    );

    setShowDayForm(
      true
    );
  }

  async function saveDay() {
    const name =
      dayName.trim();

    if (!name) {
      notify({
        title:
          "Enter a workout day name.",
      });

      return;
    }

    if (
      editingDayId
    ) {
      await db.workoutDays.update(
        editingDayId,
        {
          name,

          dayOfWeek:
            dayOfWeek.trim(),
        }
      );
    } else {
      await db.workoutDays.add(
        {
          splitId:
            selectedSplitId,

          name,

          dayOfWeek:
            dayOfWeek.trim(),

          archived: false,
        }
      );
    }

    setShowDayForm(
      false
    );

    setEditingDayId(
      null
    );

    setDayName("");
    setDayOfWeek("");
  }

  async function deleteDay(
    day
  ) {
    if (
      getWorkoutInProgress()
        ?.workoutDayId ===
      day.id
    ) {
      warnWorkoutInProgress();

      return;
    }

    const confirmed =
      await confirmAction({
        title: `Delete "${day.name}"?`,
        message:
          "Its exercises are removed from your program. Past workouts stay in History.",
        confirmLabel:
          "Delete day",
      });

    if (!confirmed) {
      return;
    }

    await db.transaction(
      "rw",
      db.workoutDays,
      db.exercises,
      async () => {
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
    );

    setSelectedDayId(
      null
    );
  }

  // ============================================================
  // EXERCISE MANAGEMENT
  // ============================================================

  function openNewExercise() {
    setEditingExerciseId(
      null
    );

    setExerciseForm({
      ...EMPTY_EXERCISE_FORM,
    });

    setShowExerciseForm(
      true
    );
  }

  async function openEditExercise(
    exercise
  ) {
    let hasAlternative =
      false;

    let alternatives = [""];

    let alternativeIds = [null];

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

      partners.sort(
        (a, b) =>
          Number(a.order) -
          Number(b.order)
      );

      if (
        partners.length
      ) {
        hasAlternative =
          true;

        alternatives =
          partners.map(
            (partner) =>
              partner.name
          );

        alternativeIds =
          partners.map(
            (partner) =>
              partner.id
          );
      }
    }

    setEditingExerciseId(
      exercise.id
    );

    setExerciseForm({
      name:
        exercise.name ||
        "",

      targetSets:
        exercise.targetSets ??
        2,

      warmupSets:
        exercise.warmupSets ??
        0,

      minReps:
        exercise.minReps ??
        5,

      maxReps:
        exercise.maxReps ??
        8,

      targetRIR:
        exercise.targetRIR ??
        "Failure",

      optional:
        !!exercise.optional,

      hasAlternative,

      alternatives,

      alternativeIds,
    });

    setShowExerciseForm(
      true
    );
  }

  async function saveExercise() {
    const name =
      exerciseForm.name.trim();

    if (!name) {
      notify({
        title:
          "Enter an exercise name.",
      });

      return;
    }

    const alternativeEntries =
      (
        exerciseForm.alternatives ||
        []
      )
        .map(
          (value, index) => ({
            name: String(
              value
            ).trim(),

            id:
              exerciseForm
                .alternativeIds?.[
                index
              ] ?? null,
          })
        )
        .filter(
          (entry) =>
            entry.name
        );

    const alternativeNames =
      alternativeEntries.map(
        (entry) =>
          entry.name
      );

    if (
      exerciseForm.hasAlternative &&
      !alternativeNames.length
    ) {
      notify({
        title:
          "Enter at least one alternative exercise.",
      });

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

    // Set rows in an active workout are only resized when the working
    // set count actually changed, so renaming or changing the RIR target
    // never removes sets the user added.
    let resizeExerciseId = null;

    if (
      !editingExerciseId
    ) {
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

        const records = [
          name,
          ...alternativeNames,
        ].map(
          (
            exerciseName,
            index
          ) => ({
            workoutDayId:
              selectedDayId,

            name:
              exerciseName,

            order:
              nextOrder +
              index * 0.01,

            alternativeGroup:
              group,

            ...template,
          })
        );

        await db.exercises.bulkAdd(
          records
        );
      } else {
        await db.exercises.add(
          {
            workoutDayId:
              selectedDayId,

            name,

            order:
              nextOrder,

            alternativeGroup:
              null,

            ...template,
          }
        );
      }
    } else {
      const current =
        await db.exercises.get(
          editingExerciseId
        );

      if (!current) {
        return;
      }

      if (
        Number(
          current.targetSets
        ) !==
        template.targetSets
      ) {
        resizeExerciseId =
          current.id;
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

        partners.sort(
          (a, b) =>
            Number(a.order) -
            Number(b.order)
        );
      }

      // Alternatives about to be archived must not hold completed sets
      // from the workout in progress.
      const idsInForm =
        new Set(
          alternativeEntries
            .map(
              (entry) =>
                entry.id
            )
            .filter(
              (id) =>
                id !== null
            )
        );

      const partnersToArchive =
        exerciseForm.hasAlternative
          ? partners.filter(
              (partner) =>
                !idsInForm.has(
                  partner.id
                )
            )
          : partners;

      const withLoggedSets =
        findExercisesWithLoggedSets(
          partnersToArchive
        );

      if (
        withLoggedSets.length
      ) {
        warnLoggedSets(
          withLoggedSets
        );

        return;
      }

      if (
        partnersToArchive.length &&
        !(await confirmAction({
          title: `Remove ${partnersToArchive
            .map(
              (partner) =>
                partner.name
            )
            .join(" and ")}?`,
          message:
            "It's removed as an alternative for this exercise. Its past sets stay in History and Progress.",
          confirmLabel:
            "Remove and save",
        }))
      ) {
        return;
      }

      // Lowering the set count mid-workout trims trailing unticked rows;
      // ask first if any of them already have values typed in.
      if (
        activeWorkout &&
        resizeExerciseId
      ) {
        const rows =
          workoutSets[
            current.id
          ] || [];

        let droppedWithValues = 0;

        for (
          let index =
            rows.length - 1;
          index >=
            Math.max(
              1,
              template.targetSets
            );
          index--
        ) {
          if (
            rows[index]
              .completed
          ) {
            break;
          }

          if (
            rows[index].weight !==
              "" ||
            rows[index].reps !==
              ""
          ) {
            droppedWithValues++;
          }
        }

        if (
          droppedWithValues &&
          !(await confirmAction({
            title: `Remove ${droppedWithValues} set${
              droppedWithValues === 1
                ? ""
                : "s"
            } from this workout?`,
            message:
              "Lowering the set count removes the last unticked sets, including values you've entered.",
            confirmLabel:
              "Remove and save",
          }))
        ) {
          return;
        }
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

        // Partners are matched by database id, never by position, so
        // removing or reordering an alternative can't rename another
        // record (and move its history to a different name). Existing
        // partners keep their order; new ones go after the group.
        const partnerIds =
          new Set(
            partners.map(
              (partner) =>
                partner.id
            )
          );

        const keptIds =
          new Set();

        let nextOrder =
          Math.max(
            Number(
              current.order
            ) || 0,
            ...partners.map(
              (partner) =>
                Number(
                  partner.order
                ) || 0
            )
          );

        for (
          const entry of alternativeEntries
        ) {
          if (
            entry.id !==
              null &&
            partnerIds.has(
              entry.id
            ) &&
            !keptIds.has(
              entry.id
            )
          ) {
            keptIds.add(
              entry.id
            );

            await db.exercises.update(
              entry.id,
              {
                name:
                  entry.name,

                alternativeGroup:
                  group,

                ...template,
              }
            );
          } else {
            nextOrder += 0.01;

            await db.exercises.add(
              {
                workoutDayId:
                  current.workoutDayId,

                name:
                  entry.name,

                order:
                  nextOrder,

                alternativeGroup:
                  group,

                ...template,
              }
            );
          }
        }

        // Archive any old partners that were removed from the group.
        for (
          const partner of partners
        ) {
          if (
            !keptIds.has(
              partner.id
            )
          ) {
            await db.exercises.update(
              partner.id,
              {
                archived:
                  true,
              }
            );
          }
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
              archived:
                true,
            }
          );
        }
      }
    }

    // When an exercise is added or edited while a workout is running,
    // make sure any brand-new exercises get their working-set rows so
    // they show up immediately in the active workout. Only the edited
    // exercise (and its alternatives) has its set rows resized.
    if (activeWorkout) {
      await syncNewExercisesIntoWorkout(
        resizeExerciseId
      );
    }

    setShowExerciseForm(
      false
    );

    setEditingExerciseId(
      null
    );

    setExerciseForm({
      ...EMPTY_EXERCISE_FORM,
    });
  }

  async function syncNewExercisesIntoWorkout(
    resizeExerciseId = null
  ) {
    const dayExercises =
      await db.exercises
        .where("workoutDayId")
        .equals(selectedDayId)
        .toArray();

    const active =
      dayExercises.filter(
        (exercise) =>
          !exercise.archived
      );

    // Saving an exercise writes the same set count to its alternative
    // partners, so they are resized together. Every other exercise keeps
    // its rows untouched, including extra sets added with "+ Add Set".
    const edited =
      active.find(
        (exercise) =>
          exercise.id ===
          resizeExerciseId
      );

    const resizeIds = new Set(
      active
        .filter(
          (exercise) =>
            edited &&
            (exercise.id ===
              edited.id ||
              (edited.alternativeGroup &&
                exercise.alternativeGroup ===
                  edited.alternativeGroup))
        )
        .map(
          (exercise) =>
            exercise.id
        )
    );

    function makeEmptySet() {
      return {
        weight: "",
        reps: "",
        rir: "",
        completed: false,
      };
    }

    setWorkoutSets(
      (previous) => {
        const next = {
          ...previous,
        };

        active.forEach(
          (exercise) => {
            const existing =
              next[exercise.id];

            if (!existing) {
              next[exercise.id] =
                createExerciseSets(
                  exercise
                );

              return;
            }

            if (
              !resizeIds.has(
                exercise.id
              )
            ) {
              return;
            }

            const target = Math.max(
              1,
              Number(
                exercise.targetSets ||
                  1
              )
            );

            if (
              existing.length <
              target
            ) {
              const additions =
                Array.from(
                  {
                    length:
                      target -
                      existing.length,
                  },
                  makeEmptySet
                );

              next[exercise.id] = [
                ...existing,
                ...additions,
              ];

              return;
            }

            if (
              existing.length >
              target
            ) {
              const result = [
                ...existing,
              ];

              while (
                result.length >
                target
              ) {
                const last =
                  result[
                    result.length -
                      1
                  ];

                // Never delete a completed set.
                if (
                  last?.completed
                ) {
                  break;
                }

                result.pop();
              }

              next[exercise.id] =
                result;
            }
          }
        );

        return next;
      }
    );
  }

  async function deleteExercise(
    exercise
  ) {
    const toArchive =
      exercise.alternativeGroup
        ? await db.exercises
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
            .toArray()
        : [exercise];

    const withLoggedSets =
      findExercisesWithLoggedSets(
        toArchive
      );

    if (
      withLoggedSets.length
    ) {
      warnLoggedSets(
        withLoggedSets
      );

      return;
    }

    const confirmed =
      await confirmAction({
        title: `Remove "${
          toArchive.length > 1
            ? toArchive
                .map(
                  (item) =>
                    item.name
                )
                .join(" / ")
            : exercise.name
        }"?`,
        message:
          "It's removed from this workout day. Its past sets stay in History and Progress.",
        confirmLabel:
          "Remove exercise",
      });

    if (!confirmed) {
      return;
    }

    for (
      const item of toArchive
    ) {
      await db.exercises.update(
        item.id,
        {
          archived: true,
        }
      );
    }
  }

  // ============================================================
  // WORKOUT SET CREATION
  // ============================================================

  function createExerciseSets(
    exercise
  ) {
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
            ?.rir === null ||
          previousSet
            ?.rir === undefined
            ? ""
            : previousSet.rir,

        completed: false,
      });
    }

    return result;
  }

  // ============================================================
  // START WORKOUT
  // ============================================================

  async function startWorkout() {
    // Prefill, learned order and the default alternative all come from
    // the previous-performance data, so don't start without it.
    if (
      !previousExerciseDataReady
    ) {
      return;
    }

    if (
      pausedWorkout
    ) {
      const discard =
        await confirmAction({
          title: `${
            pausedWorkout.workoutDayName ||
            "Another workout"
          } is still in progress`,
          message:
            "Starting this workout discards the paused one and its unfinished sets.",
          confirmLabel:
            "Discard and start",
          cancelLabel:
            "Keep paused",
        });

      if (!discard) {
        return;
      }

      await db.appMeta.delete(
        "activeWorkoutDraft"
      );

      setPausedWorkout(
        null
      );
    }

    const initialSets = {};

    const initialAlternatives = {};

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

    // Each alternative group starts on its most recently performed
    // member (else the first one).
    const handledGroups =
      new Set();

    (
      orderedExercises ||
      []
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
                  exercise:
                    item,

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
          }
        }
      }
    );

    const startedAt =
      new Date().toISOString();

    const draft =
      makeCurrentDraft({
        startedAt,

        workoutSets:
          initialSets,

        selectedAlternatives:
          initialAlternatives,

        includedOptional: {},

        exerciseCompletionOrder:
          [],
      });

    await db.appMeta.put({
      key:
        "activeWorkoutDraft",

      value:
        draft,
    });

    setWorkoutStartedAt(
      startedAt
    );

    setWorkoutSets(
      initialSets
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

  // ============================================================
  // COMPLETION ORDER
  // ============================================================

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

  // ============================================================
  // OPTIONAL / ALTERNATIVE EXERCISES
  // ============================================================

  function selectAlternativeDuringWorkout(
    groupName,
    exerciseId
  ) {
    setSelectedAlternatives(
      (previous) => ({
        ...previous,

        [groupName]:
          exerciseId,
      })
    );
  }

  // `optionalKey` is the exercise id, or "group:<name>" for an optional
  // alternative group.
  function includeOptionalExercise(
    optionalKey
  ) {
    setIncludedOptional(
      (previous) => ({
        ...previous,

        [optionalKey]:
          true,
      })
    );
  }

  function skipOptionalExercise(
    optionalKey
  ) {
    setIncludedOptional(
      (previous) => ({
        ...previous,

        [optionalKey]:
          false,
      })
    );
  }

  // ============================================================
  // SET EDITING
  // ============================================================

  function updateSet(
    exerciseId,
    setIndex,
    field,
    value
  ) {
    // The note is free text; kg, reps and RIR are decimals.
    const safeValue =
      field === "note"
        ? value
        : normalizeDecimalInput(
            value
          );

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
                      safeValue,
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

    const weight =
      parseDecimal(
        currentSet.weight
      );

    const reps =
      parseDecimal(
        currentSet.reps
      );

    // 0 kg is allowed (bodyweight); a set needs at least some reps.
    if (
      !currentSet.completed &&
      (
        weight === null ||
        reps === null ||
        weight < 0 ||
        reps <= 0
      )
    ) {
      notify({
        title:
          "Enter weight (0 for bodyweight) and reps before completing the set.",
      });

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

  function addSet(
    exerciseId
  ) {
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

  async function removeSet(
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
      !!getSetNote(
        set.note
      ) ||
      set.completed;

    if (
      hasData
    ) {
      const confirmed =
        await confirmAction({
          title: `Remove set ${
            setIndex + 1
          }?`,
          message:
            "The values entered for this set are removed from this workout.",
          confirmLabel:
            "Remove set",
        });

      if (
        !confirmed
      ) {
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
  // PAUSE / RESUME
  // ============================================================

  async function leaveActiveWorkout() {
    const draft =
      makeCurrentDraft();

    await db.appMeta.put({
      key:
        "activeWorkoutDraft",

      value:
        draft,
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
    if (
      !pausedWorkout
    ) {
      return;
    }

    const draft =
      pausedWorkout;

    const day =
      await db.workoutDays.get(
        draft.workoutDayId
      );

    // An archived day's exercises are hidden, so resuming would show an
    // empty workout and finishing would save nothing.
    if (
      !day ||
      day.archived
    ) {
      notify({
        title:
          "Can't resume",
        message:
          "This workout day has been removed, so the workout can't be resumed. You can discard it from Home.",
      });

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

  // Discards the paused workout (Home banner) or the running one (the
  // button under Complete workout). Nothing is saved to History.
  async function discardWorkout() {
    if (
      !activeWorkout &&
      !pausedWorkout
    ) {
      return;
    }

    const workoutName =
      (activeWorkout
        ? selectedDay?.name
        : pausedWorkout
            ?.workoutDayName) ||
      "this workout";

    const confirmed =
      await confirmAction({
        title: `Discard ${workoutName}?`,
        message:
          "Every set you've entered in this workout is deleted and nothing is saved to History. This can't be undone.",
        confirmLabel:
          "Discard workout",
        cancelLabel:
          "Keep workout",
      });

    if (
      !confirmed
    ) {
      return;
    }

    // While a workout is running, a pending autosave must not write
    // the draft back after it is deleted. The effect on activeWorkout
    // clears the ref once the workout screen has closed.
    if (activeWorkout) {
      finishingWorkoutRef.current =
        true;
    }

    await db.appMeta.delete(
      "activeWorkoutDraft"
    );

    resetWorkoutState();
  }

  // Clears every piece of in-memory workout state (after discard or
  // finish). Doesn't touch the database.
  function resetWorkoutState() {
    setPausedWorkout(
      null
    );

    setActiveWorkout(
      false
    );

    setWorkoutStartedAt(
      null
    );

    setWorkoutProgressOpen(
      false
    );

    setWorkoutSets({});

    setSelectedAlternatives(
      {}
    );

    setIncludedOptional(
      {}
    );

    setExerciseCompletionOrder(
      []
    );
  }

  // ============================================================
  // FINISH WORKOUT
  // ============================================================

  async function finishWorkout() {
    if (
      finishingWorkoutRef.current
    ) {
      return;
    }

    const completedSets = [];

    const skippedExerciseIds = [];

    const handledGroups =
      new Set();

    (
      orderedExercises ||
      []
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

          if (
            !selectedId
          ) {
            return;
          }

          const selectedExercise =
            (
              alternativeGroups[
                exercise.alternativeGroup
              ] || []
            ).find(
              (item) =>
                item.id ===
                selectedId
            );

          if (
            isOptionalGroupSkipped(
              exercise.alternativeGroup,
              selectedExercise
            )
          ) {
            skippedExerciseIds.push(
              selectedId
            );

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

          // Saved sets are numbered 1..n in order, so next time's
          // prefill and live comparison line up set-for-set even when
          // an earlier row was left unchecked.
          completed.forEach(
            (set, index) => {
              completedSets.push(
                {
                  exerciseId:
                    selectedId,

                  setNumber:
                    index + 1,

                  setType:
                    "working",

                  weight:
                    parseDecimal(
                      set.weight
                    ),

                  reps:
                    parseDecimal(
                      set.reps
                    ),

                  rir:
                    getRIRValue(
                      set.rir
                    ),

                  ...(getSetNote(
                    set.note
                  )
                    ? {
                        note: getSetNote(
                          set.note
                        ),
                      }
                    : {}),
                }
              );
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
          (set, index) => {
            completedSets.push(
              {
                exerciseId:
                  exercise.id,

                setNumber:
                  index + 1,

                setType:
                  "working",

                weight:
                  parseDecimal(
                    set.weight
                  ),

                reps:
                  parseDecimal(
                    set.reps
                  ),

                rir:
                  getRIRValue(
                    set.rir
                  ),

                ...(getSetNote(
                  set.note
                )
                  ? {
                      note: getSetNote(
                        set.note
                      ),
                    }
                  : {}),
              }
            );
          }
        );
      }
    );

    const confirmed =
      await confirmAction({
        title:
          "Complete this workout?",
        message: `${completedSets.length} completed set${
          completedSets.length === 1
            ? ""
            : "s"
        } will be saved and ${skippedExerciseIds.length} exercise${
          skippedExerciseIds.length === 1
            ? " is"
            : "s are"
        } marked as skipped.\nOnly ticked sets are saved.`,
        confirmLabel:
          "Complete workout",
        tone: "primary",
      });

    if (
      !confirmed
    ) {
      return;
    }

    finishingWorkoutRef.current =
      true;

    setFinishingWorkout(
      true
    );

    let saved = false;

    try {
      saved =
        await saveFinishedWorkout(
          completedSets,
          skippedExerciseIds
        );
    } finally {
      // After a successful save the ref stays set until the workout
      // screen has closed (see the effect on activeWorkout), so no
      // pending autosave can recreate the deleted draft.
      if (!saved) {
        finishingWorkoutRef.current =
          false;
      }

      setFinishingWorkout(
        false
      );
    }
  }

  async function saveFinishedWorkout(
    completedSets,
    skippedExerciseIds
  ) {
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

    const completedAt =
      new Date().toISOString();

    const startedMs =
      workoutStartedAt
        ? new Date(
            workoutStartedAt
          ).getTime()
        : Date.now();

    const durationSeconds = Math.max(
      0,
      Math.round(
        (Date.now() -
          startedMs) /
          1000
      )
    );

    // Session, sets and draft removal succeed or fail together: either
    // the workout is saved once and the draft is gone, or nothing is
    // written and the draft is still there to try again.
    let sessionId;

    try {
      sessionId =
        await db.transaction(
          "rw",
          db.sessions,
          db.sets,
          db.appMeta,
          async () => {
            const newSessionId =
              await db.sessions.add(
                {
                  workoutDayId:
                    selectedDayId,

                  date: completedAt,

                  startedAt:
                    workoutStartedAt,

                  completedAt,

                  durationSeconds,

                  skippedExerciseIds,

                  completedSetCount:
                    completedSets.length,

                  exerciseOrderKeys:
                    finalExerciseOrder,
                }
              );

            if (
              completedSets.length
            ) {
              await db.sets.bulkAdd(
                completedSets.map(
                  (set) => ({
                    ...set,
                    sessionId:
                      newSessionId,
                  })
                )
              );
            }

            await db.appMeta.delete(
              "activeWorkoutDraft"
            );

            return newSessionId;
          }
        );
    } catch (error) {
      console.error(error);

      await notify({
        title:
          "Workout not saved",
        message: `Nothing was lost; your workout is still open.\n${error.message}`,
      });

      return false;
    }

    // The workout is already saved at this point, so a summary failure
    // must not leave the workout open (finishing again would duplicate it).
    let summary = null;

    try {
      summary =
        await buildWorkoutSummary(
          sessionId,
          completedSets,
          skippedExerciseIds,
          durationSeconds,
          completedAt
        );
    } catch (error) {
      console.error(error);
    }

    resetWorkoutState();

    setSelectedDayId(
      null
    );

    setSelectedSplitId(
      null
    );

    setSummaryData(
      summary
    );

    setActiveTab(
      summary
        ? "summary"
        : "history"
    );

    return true;
  }

  // ============================================================
  // WORKOUT SUMMARY
  // ============================================================

  async function buildWorkoutSummary(
    sessionId,
    completedSets,
    skippedExerciseIds,
    durationSeconds,
    completedAt
  ) {
    const previousSessions =
      await db.sessions
        .where("workoutDayId")
        .equals(selectedDayId)
        .toArray();

    const earlierSessions =
      previousSessions
        .filter(
          (session) =>
            session.id !==
            sessionId
        )
        .sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );

    const exerciseNames = {};

    const allExercises =
      await db.exercises
        .where("workoutDayId")
        .equals(selectedDayId)
        .toArray();

    allExercises.forEach(
      (exercise) => {
        exerciseNames[
          exercise.id
        ] =
          exercise.name;
      }
    );

    const setsByExercise = {};

    completedSets.forEach(
      (set) => {
        if (
          !setsByExercise[
            set.exerciseId
          ]
        ) {
          setsByExercise[
            set.exerciseId
          ] = [];
        }

        setsByExercise[
          set.exerciseId
        ].push(set);
      }
    );

    const exerciseIds =
      Object.keys(
        setsByExercise
      ).map(Number);

    const lastPerformance =
      new Map();

    const latestPerformances =
      await findLatestPerformances(
        exerciseIds,
        earlierSessions
      );

    latestPerformances.forEach(
      ({ session, sets }, id) => {
        const best =
          getBestSet(sets);

        if (best) {
          lastPerformance.set(
            id,
            {
              weight:
                best.weight,
              reps: best.reps,
              score:
                best.score,
              effectiveReps:
                best.effectiveReps,
              sessionId:
                session.id,
              date:
                session.date,
            }
          );
        }
      }
    );

    const exerciseComparisons =
      [];

    exerciseIds.forEach(
      (exerciseId) => {
        const currentBest =
          getBestSet(
            setsByExercise[
              exerciseId
            ]
          );

        if (!currentBest) {
          return;
        }

        const previous =
          lastPerformance.get(
            exerciseId
          );

        if (!previous) {
          exerciseComparisons.push(
            {
              exerciseId,
              exerciseName:
                exerciseNames[
                  exerciseId
                ] ||
                "Exercise",
              status: "new",
              percentageChange: null,
            }
          );

          return;
        }

        const result =
          resolveExerciseProgress(
            currentBest,
            previous
          );

        exerciseComparisons.push(
          {
            exerciseId,
            exerciseName:
              exerciseNames[
                exerciseId
              ] ||
              "Exercise",
            status: result.status,
            percentageChange:
              result.percentageChange,
            previousDate:
              previous.date,
          }
        );
      }
    );

    const comparable =
      exerciseComparisons.filter(
        (comparison) =>
          comparison.status !==
            "new" &&
          Number.isFinite(
            comparison.percentageChange
          )
      );

    const improved =
      comparable.filter(
        (comparison) =>
          comparison.status ===
          "improved"
      ).length;

    const same =
      comparable.filter(
        (comparison) =>
          comparison.status ===
          "same"
      ).length;

    const regressed =
      comparable.filter(
        (comparison) =>
          comparison.status ===
          "regressed"
      ).length;

    const newCount =
      exerciseComparisons.filter(
        (comparison) =>
          comparison.status ===
          "new"
      ).length;

    const overallPercentage =
      comparable.length
        ? comparable.reduce(
            (total, comparison) =>
              total +
              comparison.percentageChange,
            0
          ) / comparable.length
        : null;

    const volumeByExercise = {};

    completedSets.forEach(
      (set) => {
        volumeByExercise[
          set.exerciseId
        ] =
          getTotalVolume(
            setsByExercise[
              set.exerciseId
            ]
          );
      }
    );

    return {
      sessionId,
      workoutDayName:
        selectedDay?.name ||
        "",
      completedAt,
      durationSeconds,
      completedSetCount:
        completedSets.length,
      skippedExerciseIds,
      totalVolume: Object.values(
        volumeByExercise
      ).reduce(
        (total, value) =>
          total + value,
        0
      ),
      exerciseCount:
        exerciseComparisons
          .length,
      overallPercentage,
      improved,
      same,
      regressed,
      newCount,
      exerciseComparisons,
    };
  }

  function closeSummary() {
    setSummaryData(null);

    setActiveTab("history");
  }

  // ============================================================
  // PROGRESS FROM ACTIVE WORKOUT
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

  function openHistoryExerciseProgress(
    exerciseName
  ) {
    setHistoryProgressReturn({
      sessionId:
        selectedHistorySessionId,
      scrollY:
        window.scrollY,
    });

    setSelectedHistorySessionId(
      null
    );

    setSelectedSplitId(
      null
    );

    setSelectedDayId(
      null
    );

    setWorkoutProgressOpen(
      false
    );

    setSelectedProgressExercise(
      exerciseName
    );

    setProgressSearch(
      exerciseName
    );

    setActiveTab(
      "progress"
    );
  }

  function closeHistoryExerciseProgress() {
    const returnState =
      historyProgressReturn;

    if (!returnState?.sessionId) {
      setActiveTab(
        "history"
      );

      setHistoryProgressReturn(
        null
      );

      return;
    }

    setActiveTab(
      "history"
    );

    setSelectedProgressExercise(
      ""
    );

    setProgressSearch(
      ""
    );

    setSelectedHistorySessionId(
      returnState.sessionId
    );

    setHistoryProgressReturn(
      null
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top:
            returnState.scrollY || 0,
          behavior:
            "auto",
        });
      });
    });
  }

  // ============================================================
  // HISTORY EDITING
  // ============================================================

  // Fixes typos in a finished workout. Edits go to a copy and are
  // written in one transaction on Save; every live query (History %,
  // Progress, Monthly, "Last time") recalculates from the saved sets.
  function startHistoryEdit() {
    if (
      !selectedHistorySession
    ) {
      return;
    }

    const sets = {};

    Object.entries(
      selectedHistorySession.sets
    ).forEach(
      ([
        exerciseId,
        items,
      ]) => {
        sets[exerciseId] =
          items.map(
            (set) => ({
              id: set.id,

              weight: String(
                set.weight ??
                  ""
              ),

              reps: String(
                set.reps ??
                  ""
              ),

              rir: String(
                getRIRValue(
                  set.rir
                )
              ),

              note:
                set.note ||
                "",
            })
          );
      }
    );

    // Skipped exercises get an empty list so a forgotten set can be
    // added to them.
    (
      selectedHistorySession
        .session
        .skippedExerciseIds ||
      []
    ).forEach(
      (exerciseId) => {
        if (
          !sets[exerciseId]
        ) {
          sets[exerciseId] =
            [];
        }
      }
    );

    setHistoryEdit({
      sessionId:
        selectedHistorySessionId,

      original:
        JSON.stringify(
          sets
        ),

      sets,
    });
  }

  function isHistoryEditDirty() {
    return (
      !!historyEdit &&
      JSON.stringify(
        historyEdit.sets
      ) !==
        historyEdit.original
    );
  }

  function updateHistoryEditRows(
    exerciseId,
    updateRows
  ) {
    setHistoryEdit(
      (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          sets: {
            ...current.sets,

            [exerciseId]:
              updateRows(
                current.sets[
                  exerciseId
                ] || []
              ),
          },
        };
      }
    );
  }

  function updateHistoryEditSet(
    exerciseId,
    index,
    field,
    value
  ) {
    updateHistoryEditRows(
      exerciseId,
      (rows) =>
        rows.map(
          (row, rowIndex) =>
            rowIndex === index
              ? {
                  ...row,

                  [field]:
                    field === "note"
                      ? value
                      : normalizeDecimalInput(
                          value
                        ),
                }
              : row
        )
    );
  }

  // A forgotten set is usually a repeat of the one before it, so the
  // new row copies the last row's values.
  function addHistoryEditSet(
    exerciseId
  ) {
    updateHistoryEditRows(
      exerciseId,
      (rows) => {
        const lastRow =
          rows[
            rows.length - 1
          ];

        return [
          ...rows,

          {
            id: null,

            weight:
              lastRow?.weight ??
              "",

            reps:
              lastRow?.reps ??
              "",

            rir:
              lastRow?.rir ??
              "",

            // The note belongs to the set it was written for.
            note: "",
          },
        ];
      }
    );
  }

  function removeHistoryEditSet(
    exerciseId,
    index
  ) {
    updateHistoryEditRows(
      exerciseId,
      (rows) =>
        rows.filter(
          (_, rowIndex) =>
            rowIndex !== index
        )
    );
  }

  async function cancelHistoryEdit() {
    if (
      isHistoryEditDirty()
    ) {
      const confirmed =
        await confirmAction({
          title:
            "Discard changes?",
          message:
            "Your edits to this workout won't be saved.",
          confirmLabel:
            "Discard changes",
          cancelLabel:
            "Keep editing",
        });

      if (!confirmed) {
        return false;
      }
    }

    setHistoryEdit(
      null
    );

    return true;
  }

  async function saveHistoryEdit() {
    if (
      !historyEdit ||
      savingHistoryEdit ||
      !selectedHistorySession
    ) {
      return;
    }

    if (
      !isHistoryEditDirty()
    ) {
      setHistoryEdit(
        null
      );

      return;
    }

    const session =
      selectedHistorySession.session;

    const exerciseNames =
      new Map(
        selectedHistorySession.allExercises.map(
          (exercise) => [
            exercise.id,
            exercise.name,
          ]
        )
      );

    const updates = [];

    const additions = [];

    const keptIds =
      new Set();

    const setCounts =
      new Map();

    for (const [
      key,
      rows,
    ] of Object.entries(
      historyEdit.sets
    )) {
      const exerciseId =
        Number(key);

      let setNumber = 0;

      for (
        let index = 0;
        index < rows.length;
        index += 1
      ) {
        const row =
          rows[index];

        // A row with no weight and no reps is treated as removed.
        if (
          row.weight === "" &&
          row.reps === ""
        ) {
          continue;
        }

        const weight =
          parseDecimal(
            row.weight
          );

        const reps =
          parseDecimal(
            row.reps
          );

        if (
          weight === null ||
          reps === null ||
          reps <= 0
        ) {
          await notify({
            title:
              "Check this set",
            message: `${
              exerciseNames.get(
                exerciseId
              ) || "Exercise"
            }, set ${
              index + 1
            }, needs a weight (0 for bodyweight) and reps above 0.`,
          });

          return;
        }

        setNumber += 1;

        // Same shape as the sets saved by finishing a workout,
        // numbered 1..n so prefill and comparisons line up.
        const values = {
          setNumber,
          weight,
          reps,
          rir: getRIRValue(
            row.rir
          ),
          note: getSetNote(
            row.note
          ),
        };

        if (row.id) {
          keptIds.add(
            row.id
          );

          updates.push({
            id: row.id,
            values,
          });
        } else {
          additions.push({
            sessionId:
              session.id,
            exerciseId,
            setType:
              "working",
            ...values,
          });
        }
      }

      setCounts.set(
        exerciseId,
        setNumber
      );
    }

    const removedIds =
      Object.values(
        selectedHistorySession.sets
      )
        .flat()
        .map(
          (set) => set.id
        )
        .filter(
          (id) =>
            !keptIds.has(id)
        );

    if (
      removedIds.length
    ) {
      const confirmed =
        await confirmAction({
          title: `Remove ${
            removedIds.length
          } logged ${
            removedIds.length === 1
              ? "set"
              : "sets"
          }?`,
          message:
            "They'll be deleted from this workout and its progression recalculated.",
          confirmLabel:
            "Save changes",
        });

      if (!confirmed) {
        return;
      }
    }

    // An exercise left with no sets counts as skipped; one that now
    // has sets no longer does.
    const skippedExerciseIds = [
      ...new Set([
        ...(
          session.skippedExerciseIds ||
          []
        ).filter(
          (exerciseId) =>
            !(
              setCounts.get(
                exerciseId
              ) > 0
            )
        ),

        ...[...setCounts]
          .filter(
            ([, count]) =>
              count === 0
          )
          .map(
            ([exerciseId]) =>
              exerciseId
          ),
      ]),
    ];

    const completedSetCount =
      [...setCounts.values()].reduce(
        (total, count) =>
          total + count,
        0
      );

    setSavingHistoryEdit(
      true
    );

    try {
      await db.transaction(
        "rw",
        db.sessions,
        db.sets,
        async () => {
          for (const {
            id,
            values,
          } of updates) {
            await db.sets.update(
              id,
              values
            );
          }

          if (
            additions.length
          ) {
            await db.sets.bulkAdd(
              additions
            );
          }

          if (
            removedIds.length
          ) {
            await db.sets.bulkDelete(
              removedIds
            );
          }

          await db.sessions.update(
            session.id,
            {
              skippedExerciseIds,
              completedSetCount,
            }
          );
        }
      );
    } catch (error) {
      console.error(error);

      await notify({
        title:
          "Changes not saved",
        message: `Nothing was changed.\n${error.message}`,
      });

      return;
    } finally {
      setSavingHistoryEdit(
        false
      );
    }

    setHistoryEdit(
      null
    );
  }

  // ============================================================
  // BACKUP
  // ============================================================

  async function handleImportBackup(
    event
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    const confirmed =
      await confirmAction({
        title:
          "Restore this backup?",
        message:
          "Everything on this device (history, program and any paused workout) will be replaced by the backup. This can't be undone.",
        confirmLabel:
          "Replace and restore",
      });

    if (!confirmed) {
      event.target.value =
        "";

      return;
    }

    try {
      await importWorkoutBackup(
        file
      );

      await notify({
        title:
          "Backup restored",
        message:
          "The app will reload with the restored data.",
      });

      window.location.reload();
    } catch (error) {
      await notify({
        title:
          "Restore failed",
        message:
          error.message,
      });
    }

    event.target.value =
      "";
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  function switchTab(tab) {
    if (
      activeWorkout
    ) {
      return;
    }

    setActiveTab(tab);

    setSelectedSplitId(
      null
    );

    setSelectedDayId(
      null
    );

    setSelectedHistorySessionId(
      null
    );

    setHistoryEdit(
      null
    );
  }

  function renderBottomNav() {
    return (
      <nav className="bottom-nav">
        {NAV_TABS.map(
          ({
            tab,
            label,
            Icon,
          }) => {
            const isActive =
              activeTab ===
              tab;

            return (
              <button
                key={tab}
                className={
                  isActive
                    ? "active"
                    : ""
                }
                aria-current={
                  isActive
                    ? "page"
                    : undefined
                }
                onClick={() =>
                  switchTab(
                    tab
                  )
                }
              >
                <Icon
                  size={23}
                  weight={
                    isActive
                      ? "fill"
                      : "regular"
                  }
                  aria-hidden
                />

                {label}
              </button>
            );
          }
        )}
      </nav>
    );
  }

  // ============================================================
  // RESUME BANNER
  // ============================================================

  function renderPausedWorkoutBanner() {
    if (
      !pausedWorkout ||
      activeWorkout ||
      activeTab !==
        "home" ||
      selectedSplitId ||
      selectedDayId
    ) {
      return null;
    }

    return (
      <div className="paused-workout-banner">
        <div className="paused-workout-banner-copy">
          <strong>
            {pausedWorkout.workoutDayName ||
              "Workout"}{" "}
            in progress
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
            <Play
              size={15}
              weight="fill"
              aria-hidden
            />
            Resume
          </button>

          <button
            className="discard-workout-button"
            onClick={
              discardWorkout
            }
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // SPLIT / DAY CARD
  // ============================================================

  function renderManagementCard({
    key,
    title,
    subtitle,
    onOpen,
    editLabel,
    onEdit,
    onDelete,
  }) {
    return (
      <div
        className="management-card"
        key={key}
      >
        <button
          className="management-card-main"
          onClick={onOpen}
        >
          <div>
            <strong>
              {title}
            </strong>

            {subtitle && (
              <p>
                {subtitle}
              </p>
            )}
          </div>

          <CaretRight
            size={18}
            weight="bold"
            aria-hidden
          />
        </button>

        <div className="management-card-actions">
          <button
            onClick={onEdit}
          >
            <PencilSimple
              size={15}
              aria-hidden
            />
            {editLabel}
          </button>

          <button
            className="danger"
            onClick={onDelete}
          >
            <Trash
              size={15}
              aria-hidden
            />
            Delete
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // PLAN CARD ACTIONS (WORKOUT DAY SCREEN)
  // ============================================================

  function renderPlanCardActions(
    exercise,
    name
  ) {
    return (
      <div className="exercise-header-actions">
        <button
          className="icon-button"
          aria-label={`Edit ${name}`}
          onClick={() =>
            openEditExercise(
              exercise
            )
          }
        >
          <PencilSimple
            size={18}
            aria-hidden
          />
        </button>

        <button
          className="icon-button danger"
          aria-label={`Remove ${name}`}
          onClick={() =>
            deleteExercise(
              exercise
            )
          }
        >
          <Trash
            size={18}
            aria-hidden
          />
        </button>
      </div>
    );
  }

  // ============================================================
  // OPTIONAL EXERCISE (NOT YET INCLUDED)
  // ============================================================

  // One compact row: name, when it was last done, and Include. Used for
  // plain optional exercises and optional alternative groups.
  function renderOptionalSkippedCard({
    key,
    title,
    previousInfo,
    onInclude,
    progressName,
  }) {
    const lastDate =
      previousInfo
        ?.lastPerformedSession
        ?.date;

    return (
      <div
        className="exercise-card optional-card"
        key={key}
      >
        <div className="exercise-top">
          <div>
            <h3>
              {title}
            </h3>

            <p className="exercise-target optional-meta">
              <span className="tag">
                Optional
              </span>

              <span>
                {lastDate
                  ? `Last done ${formatShortDate(
                      lastDate
                    )}`
                  : "Not done yet"}
              </span>

              {previousInfo?.skippedLastWorkout && (
                <span className="skipped-note">
                  Skipped last time
                </span>
              )}
            </p>
          </div>

          <div className="exercise-header-actions">
            {progressName && (
              <button
                className="icon-button"
                aria-label={`Progress for ${progressName}`}
                onClick={() =>
                  openWorkoutExerciseProgress(
                    progressName
                  )
                }
              >
                <ChartLineUp
                  size={19}
                  aria-hidden
                />
              </button>
            )}

            <button
              className="include-button"
              onClick={onInclude}
            >
              <Plus
                size={15}
                weight="bold"
                aria-hidden
              />
              Include
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // SPLIT FORM
  // ============================================================

  function renderSplitForm() {
    if (
      !showSplitForm
    ) {
      return null;
    }

    return (
      <div className="form-overlay">
        <div role="dialog" aria-modal="true" className="form-sheet">
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
            value={
              splitName
            }
            placeholder="e.g. Push Pull Legs"
            onChange={(
              event
            ) =>
              setSplitName(
                event.target
                  .value
              )
            }
          />

          <div className="form-actions">
            <button
              className="secondary-form-button"
              onClick={() => {
                setShowSplitForm(
                  false
                );

                setEditingSplitId(
                  null
                );
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

  // ============================================================
  // DAY FORM
  // ============================================================

  function renderDayForm() {
    if (
      !showDayForm
    ) {
      return null;
    }

    return (
      <div className="form-overlay">
        <div role="dialog" aria-modal="true" className="form-sheet">
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
            value={
              dayName
            }
            placeholder="e.g. Push A"
            onChange={(
              event
            ) =>
              setDayName(
                event.target
                  .value
              )
            }
          />

          <label>
            Day of week
          </label>

          <select
            className="form-input"
            value={
              dayOfWeek
            }
            onChange={(
              event
            ) =>
              setDayOfWeek(
                event.target
                  .value
              )
            }
          >
            <option value="">
              No fixed day
            </option>

            <option>
              Monday
            </option>

            <option>
              Tuesday
            </option>

            <option>
              Wednesday
            </option>

            <option>
              Thursday
            </option>

            <option>
              Friday
            </option>

            <option>
              Saturday
            </option>

            <option>
              Sunday
            </option>
          </select>

          <div className="form-actions">
            <button
              className="secondary-form-button"
              onClick={() => {
                setShowDayForm(
                  false
                );

                setEditingDayId(
                  null
                );
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

  // ============================================================
  // EXERCISE FORM
  // ============================================================

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

          [field]:
            value,
        })
      );
    }

    return (
      <div className="form-overlay">
        <div role="dialog" aria-modal="true" className="form-sheet exercise-form-sheet">
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
            onChange={(
              event
            ) =>
              change(
                "name",
                event.target
                  .value
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
                onChange={(
                  event
                ) =>
                  change(
                    "targetSets",
                    event.target
                      .value
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
                onChange={(
                  event
                ) =>
                  change(
                    "warmupSets",
                    event.target
                      .value
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
                onChange={(
                  event
                ) =>
                  change(
                    "minReps",
                    event.target
                      .value
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
                onChange={(
                  event
                ) =>
                  change(
                    "maxReps",
                    event.target
                      .value
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
            onChange={(
              event
            ) =>
              change(
                "targetRIR",
                event.target
                  .value
              )
            }
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={
                exerciseForm.optional
              }
              onChange={(
                event
              ) =>
                change(
                  "optional",
                  event.target
                    .checked
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
              onChange={(
                event
              ) =>
                change(
                  "hasAlternative",
                  event.target
                    .checked
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
                Alternative exercises
              </label>

              {(exerciseForm.alternatives ||
                [""]).map(
                (
                  alternative,
                  index
                ) => (
                  <div
                    className="alternative-input-row"
                    key={index}
                  >
                    <input
                      className="form-input"
                      value={alternative}
                      placeholder="Alternative exercise"
                      onChange={(
                        event
                      ) => {
                        const next =
                          [
                            ...(exerciseForm.alternatives ||
                              []),
                          ];

                        next[index] =
                          event.target
                            .value;

                        change(
                          "alternatives",
                          next
                        );
                      }}
                    />

                    {(exerciseForm
                      .alternatives ||
                      [])
                      .length >
                      1 && (
                      <button
                        className="remove-alternative-button"
                        onClick={() => {
                          const keep = (
                            _,
                            itemIndex
                          ) =>
                            itemIndex !==
                            index;

                          const names =
                            exerciseForm.alternatives ||
                            [];

                          const ids =
                            names.map(
                              (
                                _,
                                itemIndex
                              ) =>
                                exerciseForm
                                  .alternativeIds?.[
                                  itemIndex
                                ] ?? null
                            );

                          setExerciseForm(
                            (previous) => ({
                              ...previous,

                              alternatives:
                                names.filter(
                                  keep
                                ),

                              alternativeIds:
                                ids.filter(
                                  keep
                                ),
                            })
                          );
                        }}
                        aria-label={`Remove ${alternative || "alternative"}`}
                      >
                        <X
                          size={16}
                          weight="bold"
                          aria-hidden
                        />
                      </button>
                    )}
                  </div>
                )
              )}

              <button
                className="add-alternative-button"
                onClick={() => {
                  const names =
                    exerciseForm.alternatives ||
                    [];

                  setExerciseForm(
                    (previous) => ({
                      ...previous,

                      alternatives: [
                        ...names,
                        "",
                      ],

                      alternativeIds: [
                        ...names.map(
                          (
                            _,
                            itemIndex
                          ) =>
                            exerciseForm
                              .alternativeIds?.[
                              itemIndex
                            ] ?? null
                        ),
                        null,
                      ],
                    })
                  );
                }}
              >
                <Plus
                  size={15}
                  weight="bold"
                  aria-hidden
                />
                Add another alternative
              </button>
            </>
          )}

          <div className="form-actions">
            <button
              className="secondary-form-button"
              onClick={() => {
                setShowExerciseForm(
                  false
                );

                setEditingExerciseId(
                  null
                );
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
  // WORKOUT SUMMARY
  // ============================================================

  if (
    activeTab === "summary" &&
    summaryData
  ) {
    const summaryStatus =
      summaryData.overallPercentage ===
        null ||
      summaryData.overallPercentage ===
        undefined
        ? "same"
        : getProgressStatus(
            summaryData.overallPercentage
          );

    return (
      <div
        className="app summary-app app-with-fixed-back"
        key="summary"
      >
        <BackButton
          label="History"
          onClick={closeSummary}
        />

        <header className="topbar summary-header">
          <div>
            <h1>
              {
                summaryData.workoutDayName
              }
            </h1>

            {/* Duration has its own stat below; a bare "· 04:21" here
                read like a clock time. */}
            <p className="page-subtitle">
              Completed{" "}
              {formatDate(
                summaryData.completedAt
              )}
              , finished{" "}
              {formatTime(
                summaryData.completedAt
              )}
            </p>
          </div>
        </header>

        <section className="summary-overall-card">
          <p className="metric-label">
            Overall progression
          </p>

          {summaryData.overallPercentage ===
          null ? (
            <h2 className="summary-overall-value baseline">
              New baseline
            </h2>
          ) : (
            <h2
              className={`summary-overall-value ${summaryStatus}`}
            >
              <ProgressDirectionIcon
                status={
                  summaryStatus
                }
                size={22}
              />
              {formatProgressPercentage(
                summaryData.overallPercentage
              )}
            </h2>
          )}

          <p className="summary-counts">
            {summaryData.improved}{" "}
            improved,{" "}
            {summaryData.same}{" "}
            same,{" "}
            {summaryData.regressed}{" "}
            regressed
          </p>

          <dl className="summary-stats">
            <div>
              <dt>
                Duration
              </dt>

              <dd>
                {formatDuration(
                  summaryData.durationSeconds
                )}
              </dd>
            </div>

            <div>
              <dt>
                Sets
              </dt>

              <dd>
                {
                  summaryData.completedSetCount
                }
              </dd>
            </div>

            <div>
              <dt>
                Volume
              </dt>

              <dd>
                {Math.round(
                  summaryData.totalVolume
                )}{" "}
                <small>
                  kg
                </small>
              </dd>
            </div>

            <div>
              <dt>
                Exercises
              </dt>

              <dd>
                {summaryData.exerciseCount}
                {summaryData
                  .skippedExerciseIds
                  .length > 0 && (
                  <small>
                    {" "}
                    (
                    {
                      summaryData
                        .skippedExerciseIds
                        .length
                    }{" "}
                    skipped)
                  </small>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {summaryData.exerciseComparisons.length >
          0 && (
          <section className="summary-exercise-section">
            <h3 className="section-title">
              Exercises
            </h3>

            <div className="row-list">
              {summaryData.exerciseComparisons.map(
                (comparison) => (
                  <div
                    className="summary-exercise-row"
                    key={
                      comparison.exerciseId
                    }
                  >
                    <span className="summary-exercise-name">
                      {
                        comparison.exerciseName
                      }
                    </span>

                    {comparison.status ===
                    "new" ? (
                      <span className="status-text new">
                        New baseline
                      </span>
                    ) : (
                      <span
                        className={`status-text ${comparison.status}`}
                      >
                        <ProgressDirectionIcon
                          status={
                            comparison.status
                          }
                        />
                        {comparison.percentageChange !==
                        null
                          ? formatProgressPercentage(
                              comparison.percentageChange
                            )
                          : "Same"}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </section>
        )}

        <button
          className="primary-button summary-done-button"
          onClick={closeSummary}
        >
          View in History
        </button>
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
      <div
        className="app active-workout-app app-with-fixed-back"
        key="workout"
      >
        <BackButton
          label="Workouts"
          onClick={
            leaveActiveWorkout
          }
        />

        <header className="topbar active-workout-header">
          <div>
            <h1>
              {selectedDay?.name}
            </h1>

            <p className="page-subtitle">
              Started{" "}
              {formatTime(
                workoutStartedAt
              )}
            </p>
          </div>

          <span
            className="workout-live-timer"
            aria-label="Elapsed time"
          >
            {formatDuration(
              nowTick &&
                workoutStartedAt
                ? (nowTick -
                    new Date(
                      workoutStartedAt
                    ).getTime()) /
                    1000
                : 0
            )}
          </span>
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

                const optionalGroupKey = `group:${exercise.alternativeGroup}`;

                if (
                  isOptionalGroupSkipped(
                    exercise.alternativeGroup,
                    selectedExercise
                  )
                ) {
                  return renderOptionalSkippedCard({
                    key: exercise.alternativeGroup,
                    title: group
                      .map(
                        (item) =>
                          item.name
                      )
                      .join(" / "),
                    previousInfo,
                    onInclude: () =>
                      includeOptionalExercise(
                        optionalGroupKey
                      ),
                  });
                }

                return (
                  <div
                    className="exercise-card"
                    key={
                      exercise.alternativeGroup
                    }
                  >
                    {selectedExercise.optional && (
                      <div className="optional-active-top">
                        <span className="tag">
                          Optional
                        </span>

                        <button
                          className="text-button"
                          onClick={() =>
                            skipOptionalExercise(
                              optionalGroupKey
                            )
                          }
                        >
                          Skip
                        </button>
                      </div>
                    )}

                    <div
                      className="workout-alternative-picker"
                      role="group"
                      aria-label="Choose exercise"
                    >
                      {group.map(
                        (
                          option
                        ) => (
                          <button
                            key={
                              option.id
                            }
                            aria-pressed={
                              selectedId ===
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
                      onEdit={
                        openEditExercise
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

                if (
                  !included
                ) {
                  return renderOptionalSkippedCard({
                    key: exercise.id,
                    title: exercise.name,
                    previousInfo,
                    onInclude: () =>
                      includeOptionalExercise(
                        exercise.id
                      ),
                    progressName:
                      exercise.name,
                  });
                }

                return (
                  <div
                    className="exercise-card"
                    key={
                      exercise.id
                    }
                  >
                    <div className="optional-active-top">
                      <span className="tag">
                        Optional
                      </span>

                      <button
                        className="text-button"
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
                      onEdit={
                        openEditExercise
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
                    onEdit={
                      openEditExercise
                    }
                  />
                </div>
              );
            }
          )}
        </section>

        <button
          className="add-workout-exercise-button"
          onClick={openNewExercise}
        >
          <Plus
            size={16}
            weight="bold"
            aria-hidden
          />
          Add exercise
        </button>

        <button
          className="primary-button finish-workout-button"
          onClick={
            finishWorkout
          }
          disabled={
            finishingWorkout
          }
        >
          <Check
            size={18}
            weight="bold"
            aria-hidden
          />
          {finishingWorkout
            ? "Saving…"
            : "Complete workout"}
        </button>

        <button
          className="discard-active-workout-button"
          onClick={
            discardWorkout
          }
          disabled={
            finishingWorkout
          }
        >
          <Trash
            size={15}
            aria-hidden
          />
          Discard workout
        </button>

        {renderExerciseForm()}
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

    const comparisonMap = new Map(
      (
        selectedHistorySummary
          ?.exerciseComparisons ||
        []
      ).map((comparison) => [
        comparison.exerciseId,
        comparison,
      ])
    );

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

    const summaryOverall =
      selectedHistorySummary
        ?.overallPercentage;

    const summaryOverallStatus =
      summaryOverall === null ||
      summaryOverall === undefined
        ? "baseline"
        : getProgressStatus(
            summaryOverall
          );

    // Only an edit started on this session counts, so a stale edit can
    // never show on another workout.
    const editing =
      !!selectedHistorySession &&
      historyEdit?.sessionId ===
        selectedHistorySessionId;

    return (
      <div
        className={`app app-with-fixed-back ${
          editing
            ? "history-editing-app"
            : ""
        }`}
        key="history-detail"
      >
        <BackButton
          label="History"
          onClick={async () => {
            if (
              editing &&
              !(await cancelHistoryEdit())
            ) {
              return;
            }

            setSelectedHistorySessionId(
              null
            );
          }}
        />

        <header className="topbar">
          <div>
            <h1>
              {selectedHistorySession
                ?.workoutDay
                ?.name ||
                "Workout"}
            </h1>

            <p className="page-subtitle">
              {editing
                ? "Editing sets"
                : selectedHistorySession
                  ? formatDate(
                      selectedHistorySession
                        .session
                        .date
                    )
                  : ""}
            </p>
          </div>

          {selectedHistorySession &&
            !editing && (
              <button
                className="topbar-edit-button"
                onClick={
                  startHistoryEdit
                }
              >
                <PencilSimple
                  size={15}
                  aria-hidden
                />
                Edit
              </button>
            )}
        </header>

        {selectedHistorySummary && (
          <section
            className={`history-progress-summary-card status-${summaryOverallStatus}`}
          >
            {selectedHistorySummary.comparableCount > 0 ? (
              <>
                <div className="history-progress-summary-top">
                  <span className="metric-label">
                    Overall progression
                  </span>

                  <strong
                    className={`status-text ${summaryOverallStatus}`}
                  >
                    <ProgressDirectionIcon
                      status={
                        summaryOverallStatus
                      }
                      size={18}
                    />
                    {formatProgressPercentage(
                      summaryOverall
                    )}
                  </strong>
                </div>

                <p className="summary-counts">
                  <ProgressCounts
                    summary={
                      selectedHistorySummary
                    }
                  />
                </p>
              </>
            ) : (
              <>
                <div className="history-progress-summary-top">
                  <span className="metric-label">
                    Overall progression
                  </span>

                  <strong className="status-text baseline">
                    Baseline
                  </strong>
                </div>

                <p className="history-baseline-copy">
                  This is the first recorded performance for these exercises, so there is no earlier workout to compare against yet.
                </p>
              </>
            )}
          </section>
        )}

        <section className="exercise-list">
          {relevantExercises.map(
            (exercise) => {
              const sets =
                selectedHistorySession
                  .sets[exercise.id] ||
                [];

              const skipped =
                skippedIds.includes(
                  exercise.id
                );

              const comparison =
                comparisonMap.get(
                  exercise.id
                );

              const status = skipped
                ? "skipped"
                : comparison?.status ||
                  (sets.length > 0
                    ? "new"
                    : "skipped");

              return (
                <div
                  className="exercise-card history-exercise-progress-card"
                  key={exercise.id}
                >
                  <div className="history-exercise-progress-top">
                    <div>
                      <h3>
                        {exercise.name}
                      </h3>

                      {(status === "improved" ||
                        status === "same" ||
                        status === "regressed") && (
                        <div
                          className={`status-text ${status}`}
                        >
                          <ProgressDirectionIcon
                            status={status}
                          />
                          {status === "same"
                            ? "Same"
                            : formatProgressPercentage(
                                comparison.percentageChange
                              )}
                        </div>
                      )}

                      {status === "new" && (
                        <div className="status-text new">
                          New baseline
                        </div>
                      )}

                      {status === "skipped" && (
                        <div className="status-text skipped">
                          Skipped
                        </div>
                      )}
                    </div>

                    {!editing && (
                      <button
                        className="icon-button"
                        aria-label={`Progress for ${exercise.name}`}
                        onClick={() =>
                          openHistoryExerciseProgress(
                            exercise.name
                          )
                        }
                      >
                        <ChartLineUp
                          size={19}
                          aria-hidden
                        />
                      </button>
                    )}
                  </div>

                  {editing && (
                    <HistoryEditSetRows
                      exercise={
                        exercise
                      }
                      rows={
                        historyEdit
                          .sets[
                          exercise.id
                        ] || []
                      }
                      updateSet={
                        updateHistoryEditSet
                      }
                      addSet={
                        addHistoryEditSet
                      }
                      removeSet={
                        removeHistoryEditSet
                      }
                    />
                  )}

                  {!editing &&
                    sets.length > 0 && (
                    <div className="history-set-list">
                      {sets.map(
                        (set) => (
                          <div
                            className="history-set-item"
                            key={set.id}
                          >
                            <div className="history-set-row">
                              <span>
                                Set {set.setNumber}
                              </span>

                              <strong>
                                {set.weight} kg
                                {" × "}
                                {set.reps}
                              </strong>

                              <span>
                                {getRIRValue(
                                  set.rir
                                )}{" "}
                                RIR
                              </span>
                            </div>

                            <SetNote
                              note={
                                set.note
                              }
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {!editing &&
                    comparison?.previousDate && (
                    <p className="history-compared-against">
                      Compared with last performed {formatDate(
                        comparison.previousDate
                      )}
                    </p>
                  )}
                </div>
              );
            }
          )}
        </section>

        {editing ? (
          <div className="history-edit-actions">
            <div className="form-actions">
              <button
                className="secondary-form-button"
                onClick={
                  cancelHistoryEdit
                }
              >
                Cancel
              </button>

              <button
                className="primary-form-button"
                disabled={
                  savingHistoryEdit
                }
                onClick={
                  saveHistoryEdit
                }
              >
                {savingHistoryEdit
                  ? "Saving…"
                  : "Save changes"}
              </button>
            </div>
          </div>
        ) : (
          renderBottomNav()
        )}
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
      <div
        className="app workout-preview-app app-with-fixed-back"
        key="day"
      >
        <BackButton
          label={
            selectedSplit?.name ||
            "Split"
          }
          onClick={() =>
            setSelectedDayId(
              null
            )
          }
        />

        <header className="topbar">
          <div>
            <h1>
              {selectedDay?.name}
            </h1>

            <p className="page-subtitle">
              {selectedDay?.dayOfWeek ||
                "Flexible day"}
              {exercises?.length
                ? `, ${getCurrentUniqueOrderKeys().length} exercises`
                : ""}
            </p>
          </div>
        </header>

        <div className="manage-header">
          <h3 className="section-title">
            Exercises
          </h3>

          <button
            className="small-add-button"
            onClick={
              openNewExercise
            }
          >
            <Plus
              size={15}
              weight="bold"
              aria-hidden
            />
            Add
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

                const groupName =
                  group
                    .map(
                      (
                        option
                      ) =>
                        option.name
                    )
                    .join(
                      " / "
                    );

                return (
                  <div
                    className="exercise-card plan-card"
                    key={
                      exercise.alternativeGroup
                    }
                  >
                    <div className="exercise-top">
                      <div>
                        <h3>
                          {groupName}
                        </h3>

                        <p className="exercise-target">
                          Choose one during the workout
                        </p>

                        <div className="exercise-details">
                          <span className="tag">
                            <ArrowsLeftRight
                              size={12}
                              weight="bold"
                              aria-hidden
                            />
                            {group.length}{" "}
                            alternatives
                          </span>

                          {group[0]
                            ?.optional && (
                            <span className="tag">
                              Optional
                            </span>
                          )}
                        </div>
                      </div>

                      {renderPlanCardActions(
                        group[0],
                        groupName
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  className="exercise-card plan-card"
                  key={
                    exercise.id
                  }
                >
                  <div className="exercise-top">
                    <div>
                      <h3>
                        {
                          exercise.name
                        }
                      </h3>

                      <p className="exercise-target">
                        {
                          exercise.targetSets
                        }{" "}
                        {Number(
                          exercise.targetSets
                        ) === 1
                          ? "set"
                          : "sets"}
                        {" of "}
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
                        {exercise.optional && (
                          <span className="tag">
                            Optional
                          </span>
                        )}

                        <span className="tag">
                          RIR{" "}
                          {
                            exercise.targetRIR
                          }
                        </span>

                        {Number(
                          exercise.warmupSets
                        ) > 0 && (
                          <span className="tag">
                            {
                              exercise.warmupSets
                            }{" "}
                            warm-up
                          </span>
                        )}
                      </div>
                    </div>

                    {renderPlanCardActions(
                      exercise,
                      exercise.name
                    )}
                  </div>
                </div>
              );
            }
          )}
        </section>

        {!!exercises?.length && (
          <div className="fixed-start-workout-area">
            <button
              className="primary-button start-workout-button fixed-start-workout-button"
              onClick={
                startWorkout
              }
              disabled={
                !previousExerciseDataReady
              }
            >
              <Play
                size={16}
                weight="fill"
                aria-hidden
              />
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
    activeTab ===
      "home" &&
    selectedSplitId &&
    !workoutProgressOpen
  ) {
    return (
      <div
        className="app app-with-fixed-back"
        key="split"
      >
        <BackButton
          label="Workouts"
          onClick={() =>
            setSelectedSplitId(
              null
            )
          }
        />

        <header className="topbar">
          <div>
            <h1>
              {selectedSplit?.name}
            </h1>
          </div>
        </header>

        <div className="manage-header">
          <h3 className="section-title">
            Workout days
          </h3>

          <button
            className="small-add-button"
            onClick={
              openNewDay
            }
          >
            <Plus
              size={15}
              weight="bold"
              aria-hidden
            />
            Add day
          </button>
        </div>

        <div className="session-list">
          {workoutDays?.map(
            (day) =>
              renderManagementCard({
                key: day.id,
                title: day.name,
                subtitle:
                  day.dayOfWeek ||
                  "Flexible day",
                onOpen: () =>
                  setSelectedDayId(
                    day.id
                  ),
                editLabel: "Edit",
                onEdit: () =>
                  openEditDay(
                    day
                  ),
                onDelete: () =>
                  deleteDay(
                    day
                  ),
              })
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
    activeTab ===
    "history"
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
      <div
        className="app"
        key="history"
      >
        <header className="topbar">
          <div>
            <h1>
              History
            </h1>
          </div>
        </header>

        <section className="history-filters">
          <div className="search-field">
            <MagnifyingGlass
              size={17}
              aria-hidden
            />

            <input
              className="history-search"
              type="search"
              aria-label="Search workouts"
              placeholder="Search workouts"
            value={historySearch}
            onChange={(event) => {
              setHistorySearch(
                event.target.value
              );

              setHistoryVisibleCount(
                HISTORY_PAGE_SIZE
              );
            }}
            />
          </div>

          <div className="history-filter-row">
            <select
              aria-label="Month"
              value={historyMonth}
              onChange={(event) => {
                setHistoryMonth(
                  event.target.value
                );

                setHistoryVisibleCount(
                  HISTORY_PAGE_SIZE
                );
              }}
            >
              <option value="all">
                All months
              </option>

              {months.map((month, index) => (
                <option
                  key={month}
                  value={index}
                >
                  {month}
                </option>
              ))}
            </select>

            <select
              aria-label="Year"
              value={historyYear}
              onChange={(event) => {
                setHistoryYear(
                  event.target.value
                );

                setHistoryVisibleCount(
                  HISTORY_PAGE_SIZE
                );
              }}
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

        <p className="history-count">
          {filteredHistorySessions.length}{" "}
          {filteredHistorySessions.length === 1
            ? "workout"
            : "workouts"}
        </p>

        <div className="session-list">
          {filteredHistorySessions
            .slice(0, historyVisibleCount)
            .map((session) => {
            const summary =
              session.progressSummary;

            const hasComparison =
              summary?.comparableCount > 0;

            const overallStatus =
              hasComparison
                ? getProgressStatus(
                    summary.overallPercentage
                  )
                : "baseline";

            return (
              <button
                className={`session-card history-workout-summary-card status-${overallStatus}`}
                key={session.id}
                onClick={() =>
                  setSelectedHistorySessionId(
                    session.id
                  )
                }
              >
                <div className="history-workout-card-heading">
                  <StatusTile
                    status={
                      overallStatus
                    }
                  />

                  <div className="history-workout-card-title">
                    <strong>
                      {session.workoutDay?.name ||
                        "Archived Workout"}
                    </strong>

                    <p>
                      {formatDate(session.date)}
                    </p>
                  </div>

                  <CaretRight
                    className="history-card-chevron"
                    size={18}
                    weight="bold"
                    aria-hidden
                  />
                </div>

                <div className="history-card-progress">
                  {hasComparison ? (
                    <>
                      <strong
                        className={`status-text ${overallStatus}`}
                      >
                        {formatProgressPercentage(
                          summary.overallPercentage
                        )}
                      </strong>

                      <ProgressCounts
                        summary={
                          summary
                        }
                      />
                    </>
                  ) : (
                    <>
                      <strong className="status-text baseline">
                        Baseline
                      </strong>

                      {summary?.newCount > 0 && (
                        <span className="history-card-counts">
                          {summary.newCount} new exercise
                          {summary.newCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {filteredHistorySessions.length >
          historyVisibleCount && (
          <button
            className="history-show-more-button"
            onClick={() =>
              setHistoryVisibleCount(
                (count) =>
                  count +
                  HISTORY_PAGE_SIZE
              )
            }
          >
            Show older workouts
            <span className="muted">
              {filteredHistorySessions.length -
                historyVisibleCount}{" "}
              more
            </span>
          </button>
        )}

        {filteredHistorySessions.length === 0 && (
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

    const monthlyRows =
      buildMonthlyRows(
        monthlyBodyProgress,
        monthRange
      );

    // One body part's result for a month: its change, "Baseline" when
    // there was no previous month to compare with, or no workouts.
    function renderMonthChange(
      month
    ) {
      if (!month) {
        return (
          <span className="muted">
            No workouts
          </span>
        );
      }

      if (
        !Number.isFinite(
          month.percentage
        )
      ) {
        return (
          <span className="status-text baseline">
            Baseline
          </span>
        );
      }

      const status =
        getProgressStatus(
          month.percentage
        );

      return (
        <span
          className={`status-text ${status}`}
        >
          <ProgressDirectionIcon
            status={status}
            size={12}
          />
          {formatProgressPercentage(
            month.percentage
          )}
        </span>
      );
    }

    return (
      <div
        className={`app ${
          workoutProgressOpen ||
          historyProgressReturn
            ? "app-with-fixed-back"
            : ""
        }`}
        key="progress"
      >
        {workoutProgressOpen && (
          <BackButton
            label="Workout"
            onClick={
              closeWorkoutExerciseProgress
            }
          />
        )}

        {historyProgressReturn && (
          <BackButton
            label="History"
            onClick={
              closeHistoryExerciseProgress
            }
          />
        )}

        <header className="topbar">
          <div>
            <h1>
              Progress
            </h1>
          </div>
        </header>

        <section className="progress-selector">
          <div className="search-field">
            <MagnifyingGlass
              size={17}
              aria-hidden
            />

          <input
            className="progress-search"
            type="search"
            aria-label="Search exercises"
            placeholder="Search exercises"
            value={
              progressSearch
            }
            onChange={(
              event
            ) => {
              setProgressSearch(
                event.target
                  .value
              );

              if (
                event.target
                  .value !==
                selectedProgressExercise
              ) {
                setSelectedProgressExercise(
                  ""
                );
              }
            }}
          />
          </div>

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
                        {name}
                      </span>

                      <CaretRight
                        size={16}
                        weight="bold"
                        aria-hidden
                      />
                    </button>
                  )
                )}

                {filteredProgressExercises.length ===
                  0 && (
                  <p className="exercise-search-empty">
                    No exercise matches "
                    {progressSearch.trim()}"
                  </p>
                )}
              </div>
            )}
        </section>

        {!selectedProgressExercise && (
          <>
            <section className="overall-body-progress-section">
              <div className="overall-body-progress-heading">
                <h2 className="section-title">
                  Month to month
                </h2>

                <p>
                  RIR-adjusted performance compared with the
                  previous calendar month.
                </p>
              </div>

              {["upper", "lower"].map((bodyType) => {
                const bodyData = monthlyBodyProgress?.[bodyType];
                const latest = bodyData?.latest;
                const bodyLabel =
                  bodyType === "upper"
                    ? "Upper body"
                    : "Lower body";

                const latestStatus = latest
                  ? getProgressStatus(latest.percentage)
                  : "baseline";

                return (
                  <div
                    className={`body-progress-card ${latestStatus}`}
                    key={bodyType}
                  >
                    <div className="body-progress-card-top">
                      <div>
                        <span className="metric-label">
                          {bodyLabel}
                        </span>

                        {latest ? (
                          <>
                            <strong
                              className={`body-progress-percentage ${latestStatus}`}
                            >
                              {formatProgressPercentage(latest.percentage)}
                            </strong>

                            <p>
                              {latest.monthLabel} vs previous month
                            </p>
                          </>
                        ) : (
                          <>
                            <strong className="body-progress-percentage baseline">
                              Baseline
                            </strong>

                            <p>
                              Complete comparable workouts in two consecutive months.
                            </p>
                          </>
                        )}
                      </div>

                      {latest && (
                        <div className={`body-progress-direction ${latestStatus}`}>
                          <ProgressDirectionIcon
                            status={latestStatus}
                            size={20}
                          />
                        </div>
                      )}
                    </div>

                    {latest && (
                      <p className="body-progress-comparable-count">
                        Based on {latest.comparableExercises} exercise
                        {latest.comparableExercises === 1 ? "" : "s"}
                      </p>
                    )}

                    {bodyData?.chartData?.length > 0 ? (
                      <div className="body-progress-chart">
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart
                            data={bodyData.chartData}
                            margin={{
                              top: 18,
                              right: 8,
                              left: -18,
                              bottom: 0,
                            }}
                          >
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                              axisLine={false}
                              tickLine={false}
                            />

                            <YAxis
                              tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => `${value}%`}
                            />

                            <Tooltip
                              {...CHART_TOOLTIP_PROPS}
                              formatter={(value) => [
                                formatProgressPercentage(value),
                                "Progression",
                              ]}
                            />

                            <ReferenceLine
                              y={0}
                              stroke="rgba(255,255,255,.18)"
                            />

                            <Bar
                              dataKey="percentage"
                              radius={[6, 6, 6, 6]}
                              maxBarSize={42}
                            >
                              {bodyData.chartData.map((entry, index) => (
                                <Cell
                                  key={`${bodyType}-${entry.month}-${index}`}
                                  fill={
                                    CHART_COLORS[
                                      getProgressStatus(
                                        entry.percentage
                                      )
                                    ]
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="body-progress-no-chart">
                        <strong>Not enough monthly data yet</strong>
                        <p>
                          The graph will appear once the same exercise has
                          comparable performances in consecutive months.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {monthlyRows.rows.length > 0 && (
              <section className="card monthly-history">
                <div className="monthly-history-top">
                  <h3 className="section-title">
                    Month by month
                  </h3>

                  <div
                    className="segmented"
                    role="group"
                    aria-label="Months shown"
                  >
                    {MONTH_RANGES.map(
                      (option) => (
                        <button
                          key={
                            option.value
                          }
                          aria-pressed={
                            monthRange ===
                            option.value
                          }
                          className={`segmented-option ${
                            monthRange ===
                            option.value
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            setMonthRange(
                              option.value
                            )
                          }
                        >
                          {
                            option.label
                          }
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div
                  className="monthly-table"
                  role="table"
                  aria-label="Monthly progression"
                >
                  <div
                    className="monthly-row monthly-head"
                    role="row"
                  >
                    <span role="columnheader">
                      Month
                    </span>
                    <span role="columnheader">
                      Upper
                    </span>
                    <span role="columnheader">
                      Lower
                    </span>
                  </div>

                  {monthlyRows.rows.map(
                    (row) => (
                      <div
                        className="monthly-row"
                        role="row"
                        key={
                          row.monthKey
                        }
                      >
                        <span role="cell">
                          {
                            row.monthLabel
                          }
                        </span>

                        {["upper", "lower"].map(
                          (bodyType) => (
                            <span
                              role="cell"
                              key={
                                bodyType
                              }
                            >
                              {renderMonthChange(
                                row[
                                  bodyType
                                ]
                              )}
                            </span>
                          )
                        )}
                      </div>
                    )
                  )}

                  {monthlyRows.rows.length >
                    1 && (
                    <div
                      className="monthly-row monthly-total"
                      role="row"
                    >
                      <span role="cell">
                        Combined
                      </span>

                      {["upper", "lower"].map(
                        (bodyType) => {
                          const value =
                            monthlyRows
                              .total[
                              bodyType
                            ];

                          return (
                            <span
                              role="cell"
                              key={
                                bodyType
                              }
                            >
                              {value ===
                              null ? (
                                <span className="muted">
                                  No change yet
                                </span>
                              ) : (
                                <span
                                  className={`status-text ${getProgressStatus(
                                    value
                                  )}`}
                                >
                                  {formatProgressPercentage(
                                    value
                                  )}
                                </span>
                              )}
                            </span>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>

                <p className="monthly-history-note">
                  Each month is compared with the month before it.
                  Combined is the total change across the months shown.
                </p>
              </section>
            )}

            <div className="progress-search-hint">
              <strong>Individual exercise progress</strong>
              <p>
                Search above to open the detailed history and graph for a specific exercise.
              </p>
            </div>
          </>
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
              <section className="card progress-overview">
                <div className="progress-overview-top">
                  <div>
                    <p className="metric-label">
                      Strength change
                    </p>

                    <strong
                      className={`status-text large ${getProgressStatus(
                        progressData.change
                      )}`}
                    >
                      <ProgressDirectionIcon
                        status={getProgressStatus(
                          progressData.change
                        )}
                        size={20}
                      />
                      {formatProgressPercentage(
                        progressData.change
                      )}
                    </strong>
                  </div>

                  <p className="progress-overview-note">
                    Since first session
                  </p>
                </div>

                <dl className="summary-stats">
                  <div>
                    <dt>
                      Best weight
                    </dt>

                    <dd>
                      {
                        progressData.bestWeight
                      }{" "}
                      <small>
                        kg
                      </small>
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Best e1RM
                    </dt>

                    <dd>
                      {progressData.bestE1RM.toFixed(
                        1
                      )}{" "}
                      <small>
                        kg
                      </small>
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Sessions
                    </dt>

                    <dd>
                      {
                        progressData
                          .sessions
                          .length
                      }
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="section">
                <h3 className="section-title">
                  Personal bests
                </h3>

                <div className="progress-bests-list">
                  {[
                    {
                      label: "Best weight",
                      record:
                        progressData
                          .bestWeightRecord,
                      format: (
                        value
                      ) =>
                        `${value} kg`,
                    },
                    {
                      label: "Best reps",
                      record:
                        progressData
                          .bestRepsRecord,
                      format: (
                        value
                      ) =>
                        `${value} reps`,
                    },
                    {
                      label: "Best strength (e1RM)",
                      record:
                        progressData
                          .bestE1RMRecord,
                      format: (
                        value
                      ) =>
                        `${value.toFixed(
                          1
                        )} kg`,
                    },
                  ].map(
                    (
                      item
                    ) => (
                      <div
                        className="progress-best-row"
                        key={
                          item.label
                        }
                      >
                        <div>
                          <span className="progress-best-label">
                            {
                              item.label
                            }
                          </span>

                          {item.record && (
                            <span className="progress-best-date">
                              {formatDate(
                                item
                                  .record
                                  .date
                              )}
                            </span>
                          )}
                        </div>

                        <strong>
                          {item.record
                            ? item.format(
                                item
                                  .record
                                  .value
                              )
                            : "None yet"}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              </section>

              <section className="card progress-chart-card">
                <h3 className="section-title">
                  e1RM per session
                </h3>

                <div className="chart-container">
                  <ResponsiveContainer
                    width="100%"
                    height={
                      220
                    }
                  >
                    <LineChart
                      data={
                        chartData
                      }
                      margin={{
                        top: 10,
                        right: 12,
                        left: -14,
                        bottom: 0,
                      }}
                    >
                      <XAxis
                        dataKey="date"
                        tick={{
                          fontSize: 11,
                          fill: CHART_COLORS.axis,
                        }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />

                      {/* Fit the axis to the data: from 0 the line
                          looked flat even when strength moved. */}
                      <YAxis
                        tick={{
                          fontSize: 11,
                          fill: CHART_COLORS.axis,
                        }}
                        axisLine={false}
                        tickLine={false}
                        domain={[
                          "dataMin - 4",
                          "dataMax + 4",
                        ]}
                        tickCount={4}
                        allowDecimals={
                          false
                        }
                      />

                      <Tooltip
                        {...CHART_TOOLTIP_PROPS}
                        formatter={(value) => [
                          `${value} kg`,
                          "e1RM",
                        ]}
                      />

                      <Line
                        type="monotone"
                        dataKey="e1rm"
                        stroke={
                          CHART_COLORS.accent
                        }
                        strokeWidth={
                          2.5
                        }
                        dot={{
                          r: 3,
                          fill: CHART_COLORS.accent,
                          strokeWidth: 0,
                        }}
                        activeDot={{
                          r: 5,
                          strokeWidth: 0,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="section">
                <h3 className="section-title">
                  Sessions
                </h3>

                <div className="progress-history-list">
                  {[...progressData.sessions]
                    .reverse()
                    .map(
                      (
                        session
                      ) => (
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
                              )}{" "}
                              kg
                            </span>
                          </div>

                          <div className="progress-session-sets">
                            {session.sets.map(
                              (
                                set
                              ) => (
                                <div
                                  className="progress-set-item"
                                  key={
                                    set.id
                                  }
                                >
                                  <div className="progress-set-row">
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
                                      {" "}kg ×{" "}
                                      {
                                        set.reps
                                      }
                                    </strong>

                                    <span>
                                      {getRIRValue(
                                        set.rir
                                      )}{" "}
                                      RIR
                                    </span>
                                  </div>

                                  <SetNote
                                    note={
                                      set.note
                                    }
                                  />
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
          !historyProgressReturn &&
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
      <div
        className="app"
        key="settings"
      >
        <header className="topbar">
          <div>
            <h1>
              Settings
            </h1>
          </div>
        </header>

        <section className="settings-section">
          <h2 className="section-title">
            Backup
          </h2>

          <p className="section-note">
            Your workouts are stored only on this device. Export a backup
            before reinstalling the app or switching phones.
          </p>

          <div className="settings-card">
            <div className="settings-item">
              <DownloadSimple
                className="settings-item-icon"
                size={20}
                aria-hidden
              />

              <div>
                <strong>
                  Export backup
                </strong>

                <p>
                  Saves history and any paused workout to a file.
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

            <div className="settings-item">
              <UploadSimple
                className="settings-item-icon"
                size={20}
                aria-hidden
              />

              <div>
                <strong>
                  Restore backup
                </strong>

                <p>
                  Replaces everything on this device with a backup file.
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
    <div
      className="app"
      key="home"
    >
      <div className="wbx-home-banner">
        <img
          src={`${import.meta.env.BASE_URL}wbx-workout-planner-banner.png`}
          alt="WBX Workout Planner"
        />
      </div>

      {renderPausedWorkoutBanner()}

      <div className="manage-header">
        <h1 className="home-title">
          Your splits
        </h1>

        <button
          className="small-add-button"
          onClick={
            openNewSplit
          }
        >
          <Plus
            size={15}
            weight="bold"
            aria-hidden
          />
          New split
        </button>
      </div>

      <div className="split-list">
        {splits?.map(
          (split) =>
            renderManagementCard({
              key: split.id,
              title: split.name,
              onOpen: () =>
                setSelectedSplitId(
                  split.id
                ),
              editLabel: "Rename",
              onEdit: () =>
                openEditSplit(
                  split
                ),
              onDelete: () =>
                deleteSplit(
                  split
                ),
            })
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
// SHARED UI
// ============================================================

// Fixed, top-left, safe-area aware. The label names the destination.
function BackButton({
  label,
  onClick,
  className = "",
}) {
  return (
    <button
      className={`back-button ${className}`}
      onClick={onClick}
    >
      <CaretLeft
        size={16}
        weight="bold"
        aria-hidden
      />
      {label}
    </button>
  );
}

// Direction of a progression status: improved / regressed / anything else.
function ProgressDirectionIcon({
  status,
  size = 14,
}) {
  if (status === "improved") {
    return (
      <ArrowUp
        size={size}
        weight="bold"
        aria-hidden
      />
    );
  }

  if (status === "regressed") {
    return (
      <ArrowDown
        size={size}
        weight="bold"
        aria-hidden
      />
    );
  }

  return (
    <Equals
      size={size}
      weight="bold"
      aria-hidden
    />
  );
}

// Coloured square showing a workout's overall result in History.
function StatusTile({ status }) {
  return (
    <span
      className={`status-tile ${status}`}
      aria-hidden
    >
      {status === "baseline" ? (
        <Flag
          size={17}
          weight="fill"
        />
      ) : (
        <ProgressDirectionIcon
          status={status}
          size={17}
        />
      )}
    </span>
  );
}

// "1 improved, 0 same, 1 regressed": non-zero improved/regressed counts
// take their status colour.
function ProgressCounts({ summary }) {
  return (
    <span className="history-card-counts">
      <span
        className={
          summary.improved > 0
            ? "count-improved"
            : ""
        }
      >
        {summary.improved} improved
      </span>
      {", "}
      {summary.same} same
      {", "}
      <span
        className={
          summary.regressed > 0
            ? "count-regressed"
            : ""
        }
      >
        {summary.regressed} regressed
      </span>
      {summary.newCount > 0 &&
        `, ${summary.newCount} new`}
    </span>
  );
}

// A saved set's note, under that set in "Last time" and History.
function SetNote({
  note,
}) {
  const text =
    getSetNote(
      note
    );

  if (!text) {
    return null;
  }

  return (
    <p className="set-note">
      <NotePencil
        size={13}
        aria-hidden
      />

      <span>
        {text}
      </span>
    </p>
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
  onEdit,
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
    <div
      className={`exercise-body ${
        allComplete
          ? "is-complete"
          : ""
      }`}
    >
      <div className="exercise-top">
        <div>
          <h3>
            {
              exercise.name
            }

            {allComplete && (
              <span className="completed-badge">
                <Check
                  size={12}
                  weight="bold"
                  aria-hidden
                />
                Done
              </span>
            )}
          </h3>

          <p className="exercise-target">
            {
              exercise.minReps
            }
            -
            {
              exercise.maxReps
            }{" "}
            reps, RIR{" "}
            {
              exercise.targetRIR
            }

            {skippedLastWorkout && (
              <span className="skipped-note">
                {" "}
                Skipped last time
              </span>
            )}
          </p>
        </div>

        <div className="exercise-header-actions">
          <button
            className="icon-button"
            aria-label={`Progress for ${exercise.name}`}
            onClick={() =>
              openProgress(
                exercise.name
              )
            }
          >
            <ChartLineUp
              size={19}
              aria-hidden
            />
          </button>

          {onEdit && (
            <button
              className="icon-button"
              aria-label={`Edit ${exercise.name}`}
              onClick={() =>
                onEdit(exercise)
              }
            >
              <PencilSimple
                size={18}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>

      {lastSession &&
        previousSets.length >
          0 && (
          <div className="previous-block">
            <div className="previous-session-heading">
              <p className="previous-title">
                Last time
              </p>

              <span>
                {formatShortDate(
                  lastSession.date
                )}
              </span>
            </div>

            {previousSets.map(
              (set) => (
                <div
                  className="previous-set-item"
                  key={
                    set.id
                  }
                >
                  <div className="previous-row">
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
                      {getRIRValue(
                        set.rir
                      )}{" "}
                      RIR
                    </span>
                  </div>

                  <SetNote
                    note={
                      set.note
                    }
                  />
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
    </div>
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
  // The set whose empty note field was just opened; a note with text
  // is always shown.
  const [
    openNoteIndex,
    setOpenNoteIndex,
  ] = useState(null);

  return (
    <>
      <div
        className="set-header set-header-six"
        aria-hidden
      >
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

        <span />

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

          const noteText =
            getSetNote(
              set.note
            );

          const editingNote =
            openNoteIndex ===
            index;

          return (
            <div
              key={
                index
              }
              className={`set-entry ${
                set.completed
                  ? "is-completed"
                  : ""
              }`}
            >
              <div className="set-row set-row-six">
                <span className="set-number">
                  {index +
                    1}
                </span>

                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Set ${index + 1} weight in kg`}
                  value={
                    set.weight
                  }
                  disabled={
                    set.completed
                  }
                  onChange={(
                    event
                  ) =>
                    updateSet(
                      exercise.id,
                      index,
                      "weight",
                      event.target
                        .value
                    )
                  }
                />

                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Set ${index + 1} reps`}
                  value={
                    set.reps
                  }
                  disabled={
                    set.completed
                  }
                  onChange={(
                    event
                  ) =>
                    updateSet(
                      exercise.id,
                      index,
                      "reps",
                      event.target
                        .value
                    )
                  }
                />

                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Set ${index + 1} reps in reserve`}
                  value={
                    set.rir
                  }
                  placeholder="0"
                  disabled={
                    set.completed
                  }
                  onChange={(
                    event
                  ) =>
                    updateSet(
                      exercise.id,
                      index,
                      "rir",
                      event.target
                        .value
                    )
                  }
                />

                <button
                  className={`complete-set-button ${
                    set.completed
                      ? "completed"
                      : ""
                  }`}
                  aria-label={`Set ${index + 1} done`}
                  aria-pressed={
                    !!set.completed
                  }
                  onClick={() =>
                    toggleSetComplete(
                      exercise.id,
                      index
                    )
                  }
                >
                  <Check
                    size={18}
                    weight="bold"
                    aria-hidden
                  />
                </button>

                <button
                  className="remove-set-button"
                  aria-label={`Remove set ${index + 1}`}
                  onClick={() =>
                    removeSet(
                      exercise.id,
                      index
                    )
                  }
                >
                  <X
                    size={15}
                    weight="bold"
                    aria-hidden
                  />
                </button>
              </div>

              <div className="set-meta">
                {/* Stays visible after the set is ticked so the result
                    against last time is still readable. */}
                {comparison ? (
                  <div
                    className={`comparison ${comparison.type}`}
                  >
                    {comparison.type !==
                      "mixed" && (
                      <ProgressDirectionIcon
                        status={
                          comparison.type
                        }
                        size={11}
                      />
                    )}

                    {
                      comparison.text
                    }
                  </div>
                ) : (
                  <span />
                )}

                {!noteText &&
                  !editingNote && (
                  <button
                    className="set-note-button"
                    aria-label={`Add a note to set ${index + 1}`}
                    onClick={() =>
                      setOpenNoteIndex(
                        index
                      )
                    }
                  >
                    <NotePencil
                      size={14}
                      aria-hidden
                    />
                    Note
                  </button>
                )}
              </div>

              {/* The note stays editable after the set is ticked: it's
                  usually written once the set is done. A saved note shows
                  in full and opens for editing on tap. */}
              {editingNote ? (
                <input
                  className="set-note-input"
                  type="text"
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={
                    SET_NOTE_MAX_LENGTH
                  }
                  aria-label={`Note for set ${index + 1}`}
                  placeholder="e.g. more weight, form slipped"
                  autoFocus
                  value={
                    set.note || ""
                  }
                  onChange={(
                    event
                  ) =>
                    updateSet(
                      exercise.id,
                      index,
                      "note",
                      event.target
                        .value
                    )
                  }
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() =>
                    setOpenNoteIndex(
                      (current) =>
                        current ===
                        index
                          ? null
                          : current
                    )
                  }
                />
              ) : (
                noteText && (
                  <button
                    className="set-note-display"
                    aria-label={`Edit note for set ${index + 1}: ${noteText}`}
                    onClick={() =>
                      setOpenNoteIndex(
                        index
                      )
                    }
                  >
                    <NotePencil
                      size={13}
                      aria-hidden
                    />

                    <span>
                      {noteText}
                    </span>
                  </button>
                )
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
        <Plus
          size={14}
          weight="bold"
          aria-hidden
        />
        Add set
      </button>
    </>
  );
}

// Set rows for editing a finished workout in History: the workout's
// inputs without the done toggle or the live comparison.
function HistoryEditSetRows({
  exercise,
  rows,
  updateSet,
  addSet,
  removeSet,
}) {
  const fields = [
    {
      field: "weight",
      label: "weight in kg",
    },
    {
      field: "reps",
      label: "reps",
    },
    {
      field: "rir",
      label: "reps in reserve",
    },
  ];

  return (
    <>
      {rows.length > 0 && (
        <div
          className="set-header set-header-six set-header-edit"
          aria-hidden
        >
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

          <span />
        </div>
      )}

      {rows.map(
        (row, index) => (
          <div
            key={
              row.id ??
              `new-${index}`
            }
            className="set-edit-item"
          >
            <div className="set-row set-row-six set-row-edit">
              <span className="set-number">
                {index + 1}
              </span>

              {fields.map(
                ({
                  field,
                  label,
                }) => (
                  <input
                    key={field}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${exercise.name} set ${index + 1} ${label}`}
                    value={
                      row[field]
                    }
                    placeholder={
                      field === "rir"
                        ? "0"
                        : undefined
                    }
                    onChange={(
                      event
                    ) =>
                      updateSet(
                        exercise.id,
                        index,
                        field,
                        event.target
                          .value
                      )
                    }
                  />
                )
              )}

              <button
                className="remove-set-button"
                aria-label={`Remove ${exercise.name} set ${index + 1}`}
                onClick={() =>
                  removeSet(
                    exercise.id,
                    index
                  )
                }
              >
                <X
                  size={15}
                  weight="bold"
                  aria-hidden
                />
              </button>
            </div>

            <input
              className="set-note-input"
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={
                SET_NOTE_MAX_LENGTH
              }
              aria-label={`${exercise.name} set ${index + 1} note`}
              placeholder="Note (optional)"
              value={
                row.note || ""
              }
              onChange={(
                event
              ) =>
                updateSet(
                  exercise.id,
                  index,
                  "note",
                  event.target
                    .value
                )
              }
            />
          </div>
        )
      )}

      <button
        className="add-set-button"
        onClick={() =>
          addSet(
            exercise.id
          )
        }
      >
        <Plus
          size={14}
          weight="bold"
          aria-hidden
        />
        Add set
      </button>
    </>
  );
}

export default App;