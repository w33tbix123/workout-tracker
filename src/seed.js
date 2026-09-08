import { db } from "./db";

export async function seedWorkoutData() {
  const existingSplits = await db.splits.count();

  if (existingSplits > 0) {
    return;
  }

  const splitId = await db.splits.add({
    name: "4 Day Upper/Lower Split"
  });

  const upperAId = await db.workoutDays.add({
    splitId,
    name: "Upper A",
    dayOfWeek: "Monday"
  });

  const lowerAId = await db.workoutDays.add({
    splitId,
    name: "Lower A",
    dayOfWeek: "Tuesday"
  });

  const upperBId = await db.workoutDays.add({
    splitId,
    name: "Upper B",
    dayOfWeek: "Thursday"
  });

  const lowerBId = await db.workoutDays.add({
    splitId,
    name: "Lower B",
    dayOfWeek: "Friday"
  });

  await db.exercises.bulkAdd([
    // UPPER A
    {
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
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
      workoutDayId: upperAId,
      name: "Hammer Curl",
      order: 14,
      optional: false,
      targetSets: 1,
      warmupSets: 0,
      minReps: 6,
      maxReps: 8,
      targetRIR: "Failure"
    },

    // LOWER A
    {
      workoutDayId: lowerAId,
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
      workoutDayId: lowerAId,
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
      workoutDayId: lowerAId,
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
      workoutDayId: lowerAId,
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
      workoutDayId: lowerAId,
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
      workoutDayId: lowerAId,
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
      workoutDayId: lowerAId,
      name: "Weighted Ab Crunches",
      order: 7,
      optional: false,
      targetSets: 2,
      warmupSets: 0,
      minReps: 6,
      maxReps: 8,
      targetRIR: "Failure"
    },

    // UPPER B
    {
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
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
      workoutDayId: upperBId,
      name: "Hammer Curl",
      order: 14,
      optional: false,
      targetSets: 1,
      warmupSets: 0,
      minReps: 6,
      maxReps: 8,
      targetRIR: "Failure"
    },

    // LOWER B
    {
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
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
      workoutDayId: lowerBId,
      name: "Weighted Ab Crunches",
      order: 8,
      optional: false,
      targetSets: 2,
      warmupSets: 0,
      minReps: 6,
      maxReps: 8,
      targetRIR: "Failure"
    }
  ]);
}