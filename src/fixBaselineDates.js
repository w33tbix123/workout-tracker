import { db } from "./db";

const FIX_KEY = "baselineDateCorrectionV1";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function fixBaselineDatesOnce() {
  const alreadyFixed =
    await db.appMeta.get(FIX_KEY);

  if (alreadyFixed?.value) {
    console.log(
      "Baseline dates have already been corrected."
    );

    return;
  }

  const sessions =
    await db.sessions.toArray();

  const days =
    await db.workoutDays.toArray();

  const dayMap = {};

  days.forEach((day) => {
    dayMap[day.id] = day;
  });

  const correctDates = {
    uppera: "2026-09-07T18:00:00",
    lowera: "2026-09-01T18:00:00",
    upperb: "2026-08-31T18:00:00",
    lowerb: "2026-09-04T18:00:00",
  };

  let updated = 0;

  await db.transaction(
    "rw",
    db.sessions,
    db.appMeta,
    async () => {
      for (const session of sessions) {
        if (
          session.baselineImport !== true
        ) {
          continue;
        }

        const day =
          dayMap[
            session.workoutDayId
          ];

        if (!day) {
          continue;
        }

        const normalizedName =
          normalize(day.name);

        let targetDate = null;

        if (
          normalizedName.includes(
            "uppera"
          )
        ) {
          targetDate =
            correctDates.uppera;
        } else if (
          normalizedName.includes(
            "lowera"
          )
        ) {
          targetDate =
            correctDates.lowera;
        } else if (
          normalizedName.includes(
            "upperb"
          )
        ) {
          targetDate =
            correctDates.upperb;
        } else if (
          normalizedName.includes(
            "lowerb"
          )
        ) {
          targetDate =
            correctDates.lowerb;
        }

        if (!targetDate) {
          continue;
        }

        await db.sessions.update(
          session.id,
          {
            date: targetDate,
            startedAt: targetDate,
          }
        );

        updated++;
      }

      await db.appMeta.put({
        key: FIX_KEY,

        value: {
          fixedAt:
            new Date().toISOString(),

          updatedSessions:
            updated,
        },
      });
    }
  );

  console.log(
    `Baseline date correction complete. Updated ${updated} session(s).`
  );
}