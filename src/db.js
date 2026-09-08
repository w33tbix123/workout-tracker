import Dexie from "dexie";

export const db = new Dexie("WorkoutTrackerDB");

db.version(3).stores({
  splits: "++id, name",
  workoutDays: "++id, splitId, name, dayOfWeek",
  exercises:
    "++id, workoutDayId, name, order, optional, alternativeGroup",
  sessions: "++id, workoutDayId, date",
  sets:
    "++id, sessionId, exerciseId, setNumber, setType"
});