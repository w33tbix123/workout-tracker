import { db } from "./db";

const CLEANUP_KEY =
  "testHistoryCleanupV1";

export async function clearTestHistoryOnce() {
  const alreadyCleaned =
    await db.appMeta.get(
      CLEANUP_KEY
    );

  if (alreadyCleaned?.value) {
    console.log(
      "Test workout history has already been cleaned."
    );

    return;
  }

  console.log(
    "Cleaning test workout history..."
  );

  const allSessions =
    await db.sessions.toArray();

  const testSessions =
    allSessions.filter(
      (session) =>
        session.baselineImport !==
        true
    );

  const testSessionIds =
    testSessions.map(
      (session) =>
        session.id
    );

  if (testSessionIds.length) {
    const allSets =
      await db.sets.toArray();

    const testSetIds =
      allSets
        .filter((set) =>
          testSessionIds.includes(
            set.sessionId
          )
        )
        .map(
          (set) =>
            set.id
        );

    await db.transaction(
      "rw",
      db.sessions,
      db.sets,
      db.appMeta,
      async () => {
        if (
          testSetIds.length
        ) {
          await db.sets.bulkDelete(
            testSetIds
          );
        }

        await db.sessions.bulkDelete(
          testSessionIds
        );

        await db.appMeta.put({
          key:
            CLEANUP_KEY,

          value: {
            cleanedAt:
              new Date().toISOString(),

            deletedSessions:
              testSessionIds.length,

            deletedSets:
              testSetIds.length,
          },
        });
      }
    );
  } else {
    await db.appMeta.put({
      key:
        CLEANUP_KEY,

      value: {
        cleanedAt:
          new Date().toISOString(),

        deletedSessions: 0,

        deletedSets: 0,
      },
    });
  }

  console.log(
    `Cleanup complete. Deleted ${testSessionIds.length} test workout(s).`
  );
}