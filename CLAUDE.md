# WBX Workout Planner

Personal workout tracker PWA built around one user's own training (iPhone 13, installed from GitHub Pages). No accounts, backend, sync, social, calorie tracking or exercise videos. Dark UI, coral accent `#ef8278`, slogan "PLAN HARDER. PROGRESS FURTHER." (inside the banner image).

The core loop: open today's workout → see last time prefilled → log sets with live per-set comparison → complete → see workout progression → long-term exercise and monthly Upper/Lower progression. A change belongs here only if it makes that loop faster, clearer or more reliable. Avoid onboarding, dashboards, social features and generic-fitness clutter. It's used between sets: large touch targets, few taps, minimal modals, no accidental data loss.

---

## 1. Ground rules

- **Live production app.** `src/App.jsx` (~8.4k lines) and `src/App.css` (~4k lines) hold almost everything. **Do not rewrite or broadly refactor them.** Draft persistence, alternatives, optional exercises, learned order, scroll restore and the timer all interact. Make small, targeted edits and verify in the browser.
- **Real data lives only on the phone.** The installed PWA's IndexedDB holds months/years of history; the repo holds none. `localhost` and GitHub Pages are different origins, so local testing never touches it (and vice versa) unless a backup is exported/imported.
- **History is sacred.** Never hard-delete sessions or sets. Splits, days and exercises are soft-archived (`archived: true`) so history survives program changes.
- **Migrations must be backward compatible** with existing production IndexedDB. Extra object fields need no schema bump (Dexie stores arbitrary properties).
- **Paused drafts from older builds must still resume.** `appMeta.activeWorkoutDraft` written by a previous version can be loaded by a new one; new draft fields must tolerate being absent.
- Only commit, push or deploy when asked. Ask before changing anything in §8.

## 2. Stack, commands, deploy

React 19, Vite 8, Dexie 4 + `dexie-react-hooks`, Recharts 3, `vite-plugin-pwa` (autoUpdate), `gh-pages`. Plain JS/JSX, no TypeScript, no tests. Lint is `oxlint` (config `.oxlintrc.json`). Node 24 / npm 11. Vite `base` is `/workout-tracker/`.

```bash
npm run dev       # local dev server (http://localhost:5173/workout-tracker/)
npm run lint      # oxlint; baseline is ~7 react(purity)/set-state-in-effect warnings, 0 errors
npm run build     # production build into dist/
npm run deploy    # predeploy builds, then gh-pages -d dist
```

- Remote: `https://github.com/w33tbix123/workout-tracker.git`, branch `main`. Pages: `https://w33tbix123.github.io/workout-tracker/`.
- The user commits directly to `main` (no PR flow).
- **Verify a deploy** by comparing the hashed bundle name: `ls dist/assets/index-*.js` vs the `assets/index-*.js` referenced by the live `index.html` (add a `?nocache=` query; Pages takes ~20–60 s to update).
- The installed iPhone PWA can keep a stale service worker after deploy: fully close and reopen (maybe twice), or refresh in Safari. Only reinstall after exporting a backup.

## 3. Files

| File | Purpose |
|---|---|
| `src/main.jsx` | Registers the SW, runs `seedWorkoutData()`, and **on localhost only** runs the three dev helpers below, then renders `<App/>` |
| `src/db.js` | Dexie `WorkoutTrackerDB`, schema versions 3–5 (current `version(5)`) |
| `src/seed.js` | Seeds the 4-day Upper/Lower split once (`appMeta.initialSeedComplete`) |
| `src/backup.js` | `exportWorkoutBackup` / `importWorkoutBackup` (backup `version: 2`, all 6 tables incl. `appMeta`, import clears + bulkAdds in one transaction) |
| `src/importCurrentStats.js` | Dev helper: imports the user's baseline stats as sessions (`currentStatsBaselineV1`) |
| `src/clearTestHistory.js` | Dev helper: deletes test sessions once (`testHistoryCleanupV1`) |
| `src/fixBaselineDates.js` | Dev helper: corrects baseline session dates once (`baselineDateCorrectionV1`) |
| `src/App.jsx` | The whole app: helpers, the `App` component, `ExerciseWorkoutCard`, `WorkoutSetRows` |
| `src/App.css` | All app styling; its `:root` defines the real palette |
| `src/index.css` | Leftover Vite starter CSS (see §10) |
| `vite.config.js` | Base path, PWA manifest (WBX Workout Planner / WBX Planner, `#08080b`, standalone, scope `/workout-tracker/`) |

The dev helpers must stay gated to localhost in `main.jsx` and must never run in production.

## 4. Data model

Dexie `WorkoutTrackerDB`, `db.version(5)`:

```text
splits      ++id, name, archived
workoutDays ++id, splitId, name, dayOfWeek, archived
exercises   ++id, workoutDayId, name, order, optional, alternativeGroup, archived
sessions    ++id, workoutDayId, date
sets        ++id, sessionId, exerciseId, setNumber, setType
appMeta     key
```

Split → Workout Day → Exercise; Workout Day → Session → Set. Exercise records belong to one day, so the "same" exercise on Upper A and Upper B is two records with the same name.

**Exercise record:** `workoutDayId, name, order, alternativeGroup (string|null), targetSets, warmupSets, minReps, maxReps, targetRIR (free text, e.g. "Failure", "1-2"), optional, archived`. Alternatives are separate records sharing an `alternativeGroup` string (seeded ones like `"upper-a-biceps"`, new ones `alternative-<ts>-<rand>`), ordered `order`, `order+0.01`, …

**Session record:** `workoutDayId, date (= completedAt ISO), startedAt, completedAt, durationSeconds, skippedExerciseIds, completedSetCount, exerciseOrderKeys`. Imported baselines may carry `baselineImport`.

**Set record:** `sessionId, exerciseId, setNumber (1..n, sequential since 8fc2b7f), setType ("working"), weight, reps, rir` as numbers. Only completed sets are saved. Older data may have gaps in `setNumber`; readers sort by `setNumber` and use array position, so gaps are harmless.

**`appMeta` keys:** `initialSeedComplete`, `activeWorkoutDraft`, plus the one-time helper keys above.

**`activeWorkoutDraft.value`:** `splitId, workoutDayId, splitName, workoutDayName, startedAt, workoutSets, activeExerciseIds, selectedAlternatives, includedOptional, exerciseCompletionOrder`.
- `workoutSets`: `{ [exerciseId]: [{ weight, reps, rir, completed }] }`. Values are a mix of strings (typed) and numbers (prefilled).
- `selectedAlternatives`: `{ [alternativeGroup]: exerciseId }`.
- `includedOptional`: plain optional exercises keyed by exercise id; optional alternative groups keyed by `"group:<alternativeGroup>"` (since 096a8e0). `true` = included, `false` = skipped, absent = undecided.
- `activeExerciseIds` is written and persisted but never read (dead state; may contain `group:` strings).

## 5. App.jsx architecture

Line numbers are approximate; grep for the names.

### Top-level helpers (lines ~30–580)
- Input: `normalizeDecimalInput` (comma→dot, strips junk, keeps a leading `-`), `parseDecimal`, `getRIRValue` (blank → 0).
- Strength: `calculateE1RM(w, r, rir) = w × (1 + (r + rir)/30)` (0 if w≤0 or r≤0), `getTotalVolume`.
- Progression: `getProgressStatus` (±0.05 % threshold), `PROGRESSION_REP_MIN/MAX = 5/8`, `getBestSet` (highest e1RM set → `{weight, reps, score}`), `resolveExerciseProgress(current, previous)`, `formatProgressPercentage`, `compareSet(current, previous)` (live per-set badge).
- Order: `getExerciseOrderKey` → `group:<alternativeGroup>` or `exercise:<id>`.
- Formatting: `formatDate` (en-ZA long), `formatShortDate`, `formatTime`, `formatDuration` (`mm:ss` / `h:mm:ss`).
- `EMPTY_EXERCISE_FORM` (new exercises default 5–8 reps in the form; seeded ones are 6–8).

### State in `App` (~590+)
- Navigation: `activeTab` (`home|history|progress|settings|summary`), `selectedSplitId`, `selectedDayId`, `selectedHistorySessionId`, `workoutProgressOpen`, `historyProgressReturn {sessionId, scrollY}`.
- Workout: `activeWorkout`, `workoutStartedAt`, `pausedWorkout`, `workoutSets`, `activeExerciseIds`, `selectedAlternatives`, `includedOptional`, `exerciseCompletionOrder`, `nowTick` (1 s timer tick), `finishingWorkout` + `finishingWorkoutRef` (Complete guard).
- Filters/forms: `historySearch/Month/Year`, `selectedProgressExercise`, `progressSearch`, split/day/exercise form state (`exerciseForm` includes `alternatives` + parallel `alternativeIds`), `summaryData`.

### Live queries (re-run on any DB change)
- `splits`, `selectedSplit`, `workoutDays`, `selectedDay`, `exercises` (non-archived, by `order`).
- `previousExerciseData` (~1027): for each exercise, walks the day's sessions newest-first until it finds sets → `{lastPerformedSession, lastPerformedSets, skippedLastWorkout}` plus `latestDaySession`. Tagged with `loadedFor: previousDataKey` (`"<dayId>:<exercise ids>"`); `previousExerciseDataReady` is true only when it matches the current day and exercise list.
- `orderedExercises` (useMemo ~1148): sorts by the latest session's `exerciseOrderKeys`, falling back to `order`.
- `historySessions` (~1356), `selectedHistorySession`, `allExerciseNames` (includes archived, exact-string dedupe), `progressData` (~1731), `monthlyBodyProgress` (~2041). The history/monthly queries do full table scans of sessions, sets, exercises and days.

### Screen selection: an `if` chain, first match wins
1. Summary: `activeTab === "summary" && summaryData`
2. Active workout: `activeWorkout && !workoutProgressOpen`
3. History detail: `selectedHistorySessionId`
4. Workout day preview: `selectedDayId && !workoutProgressOpen`
5. Split detail: `activeTab === "home" && selectedSplitId && !workoutProgressOpen`
6. History list: `activeTab === "history"`
7. Progress: `activeTab === "progress" || workoutProgressOpen`
8. Settings
9. Home (fallthrough)

During a workout `activeTab` stays `"home"` and the split/day stay selected. Any new screen check placed before Progress must exclude `workoutProgressOpen`, or "Progress" from a workout opens the wrong screen (that was bug c0acef2). `switchTab` does nothing while `activeWorkout` is true, and the bottom nav is hidden during a workout.

### Render helpers and components
`renderBottomNav`, `renderPausedWorkoutBanner` (Home only, when nothing is selected and no workout is active), `renderSplitForm`, `renderDayForm`, `renderExerciseForm` (shared by the day screen and the active workout). Components at the bottom of the file: `ExerciseWorkoutCard` (header, Progress/Edit buttons, "Last performed" block, "Skipped last workout") and `WorkoutSetRows` (kg/reps/RIR inputs, done toggle, remove ×, `compareSet` badge for incomplete rows, "Set completed" for completed rows, + Add Set).

## 6. Workout lifecycle

**Start (`startWorkout` ~3311).** Returns early unless `previousExerciseDataReady`; the Start button is disabled until then. If a paused draft exists, confirms discarding it. Builds `workoutSets` for every exercise via `createExerciseSets` (prefill weight/reps/RIR from `lastPerformedSets[index]`, uncompleted, at least `targetSets` rows). Each alternative group defaults to its most recently performed member, else `group[0]`. Writes the draft immediately, then sets `activeWorkout`.

**Editing sets.** `updateSet` normalises input; `toggleSetComplete` requires weight and reps; `addSet` appends an empty row; `removeSet` confirms if the row has data. `updateExerciseCompletionStatus` appends an exercise's order key to `exerciseCompletionOrder` when all its sets are complete (removes it otherwise). This becomes the learned order.

**Alternatives and optional.** `selectAlternativeDuringWorkout(group, id)` sets `selectedAlternatives[group]`; only the selected member is saved. Plain optional exercises show an Include card until `includeOptionalExercise(id)`; `skipOptionalExercise` hides them again. Optional alternative groups behave the same via `isOptionalGroupSkipped(group, selectedExercise)` and the `group:<name>` key. An undecided group that already has completed sets counts as included (protects drafts from older builds).

**Add/edit mid-workout.** `renderExerciseForm` is reused. `saveExercise` (~2661) writes the template (sets, warm-ups, reps, RIR, optional) to the edited exercise **and all its alternatives**. Alternatives are matched by `alternativeIds`: kept IDs are updated in place (renames keep history), removed ones are archived, new names are added after the group's highest `order`. Then `syncNewExercisesIntoWorkout(resizeExerciseId)` creates rows for brand-new exercises and resizes rows **only** for the edited exercise's group, and only if its working-set count changed. Shrinking pops trailing incomplete rows and stops at a completed one.

**Pause/resume.** An autosave effect writes the draft 150 ms after any workout state change (and skips if a finish is in progress). There's no flush on `visibilitychange`. Back (`leaveActiveWorkout`) saves and goes Home; Home shows the Resume/Discard banner. A reload always lands on Home (no auto-resume). `resumeWorkout` restores all state from `pausedWorkout`; `discardPausedWorkout` confirms and deletes the draft.

**Finish (`finishWorkout` ~4104 → `saveFinishedWorkout` ~4337).**
- Walks `orderedExercises` (not `activeExerciseIds`). Collects completed sets (`setNumber` 1..n); skipped = unincluded optionals/groups plus exercises with zero completed sets.
- Confirms, then sets `finishingWorkoutRef` (blocks re-entry and pending autosaves). The button shows "Saving…".
- One Dexie transaction: `sessions.add` + `sets.bulkAdd` + delete the draft. On failure it alerts, writes nothing and keeps the workout open.
- Then `buildWorkoutSummary` (failure → go to History instead), resets state and shows the summary. The ref is cleared by an effect once `activeWorkout` is false.

**Summary.** Overall %, improved/same/regressed counts, duration, completed sets, volume, exercises/skipped, per-exercise statuses. "View in History"/"← History" go to History.

## 7. Progress, history and navigation details

- **History list:** month/year filters and search, each session's overall progression (or "Baseline workout · N new baselines"). **History detail:** per-exercise status, sets and "Compared with last performed <date>". Skipped exercises are listed as "Skipped".
- **History → Progress → Back:** `openHistoryExerciseProgress` saves `{sessionId, scrollY}`; `closeHistoryExerciseProgress` reselects the session and restores scroll after two `requestAnimationFrame`s. It works, but headless browsers throttle rAF, so automated tests see the scroll restore late.
- **Workout → Progress → "← Workout"** toggles `workoutProgressOpen`. The workout's scroll position is not restored.
- **Progress landing:** exercise search, Month-to-Month Upper/Lower cards with bar charts (green/red), "Not enough monthly data yet" when there's nothing to compare.
- **Exercise progress screen:** Best weight, RIR-adjusted 1RM, Sessions, Strength change, Personal Bests (best weight / best reps / best e1RM with dates), e1RM line chart, per-session history.
- Screens don't otherwise reset scroll on navigation.

## 8. Progression rules (ask before changing)

**Decimal input.** Workout inputs are `type="text" inputMode="decimal"` through `normalizeDecimalInput()`. Never switch to `type="number"`; that brings back an iPhone bug where `7,5` became `75`. Half reps (`7.5`) are intentional. Blank RIR = 0.

**Strength model.** `e1RM = weight × (1 + (reps + RIR) / 30)`, a practical heuristic. More RIR at the same weight and reps is an improvement. `70×8 @0 → 70×8 @1` is improved; `70×8 @0 → 70×9 @1` shows `↑ +1 rep · +1 RIR`.

**Weight-up rule (all layers).** If weight went up and current reps are within 5–8, it's always `improved`. The reported % is the load increase %, which is proportional, so +2.5 kg on 12 kg means far more than on 100 kg. Weight up with reps below 5 falls back to e1RM. Weight down or reps-only changes use e1RM.

**Statuses:** `improved` / `same` / `regressed` / `new` (first ever; "New baseline", never an improvement from zero) / `skipped` (excluded from totals). Not enough data shows baseline / "not enough data", never `0%`. The status threshold is ±0.05 %.

**The layers and what each compares:**

| Layer | Where | Unit compared | Matched by | Compared against |
|---|---|---|---|---|
| Live badge | `compareSet` in `WorkoutSetRows` | set vs set at the same position | exercise id | `lastPerformedSets[index]` |
| Session progression | `historySessions`, `buildWorkoutSummary` | best set (`getBestSet`) | **exercise id** (so per workout day) | last earlier session where it was performed |
| Monthly Upper/Lower | `monthlyBodyProgress` | best set of the **last** session in the month | lower-cased trimmed **name**, across days | the immediately previous calendar month only |
| Progress "Strength change" | `progressData.change` | best set, first session vs latest | exact **name**, across days, incl. archived | first session ever |

- **Live badge logic:** all changes positive → ↑; all negative → ↓; mixed → if weight up and reps in 5–8 → ↑ (889938d), otherwise RIR-adjusted e1RM decides (|diff| < 0.05 kg → `↔` "mixed").
- **Session and monthly %** is the mean of per-exercise % changes, never tonnage. It mixes load-% (weight-up rule) and e1RM-% results.
- **Upper/Lower** comes from the workout-day name containing "upper"/"lower".
- The Progress chart plots e1RM per session; only the "Strength change" number uses the weight-up rule.

**Deliberate choices (confirmed by the user 2026-10-07; don't "fix" them):**
- The 5–8 range is global, not each exercise's `minReps`/`maxReps` (seeded exercises are 6–8).
- History and the summary compare per workout day (exercise id); Progress and Monthly merge same-named exercises across days. Both are intended.
- Monthly uses the last workout of each month and compares only with the previous calendar month.
- The live badge applies the weight-up rule exactly like History, whatever the reps/RIR direction.

## 9. UI conventions

- Mobile first, max content width ~460px, iOS safe areas, large touch targets, glassy fixed bottom nav (Home / History / Progress / Settings).
- Back buttons: fixed, **top-left**, pill-shaped, safe-area aware. Never top-right. Labels are the destination ("← Workouts", "← Workout", "← History", "← 4 Day Upper/Lower Split").
- No separate Pause button or modal: Back saves the draft.
- WBX banner only on Home. Green = better, red = worse, grey = same.
- Many headings and cards are centred because of `#root { text-align: center }` from `index.css`; layouts depend on it.

## 10. CSS gotchas

- `main.jsx` imports `index.css` before `App.jsx` imports `App.css`, so **`App.css`'s `:root` wins** for any variable both define (`--bg`, `--text`, `--accent`, `--shadow`).
- `index.css` still provides `--text-h` (h1/h2 colour), `--border` (`#root` side borders), `--heading`/`--sans`/`--mono`, the h1/h2 sizes and the `#root` layout. These used to switch to light values when the phone was in light mode, making headings near-black. Since 36c9540 they're always the dark values with `color-scheme: dark`. Don't reintroduce a `prefers-color-scheme` split; the app is dark-only.
- `App.css` sets `color-scheme: dark` itself too.

## 11. Testing and verification

There's no automated test suite. Verify changes in a real browser against the local dev server:
- Run `npm run dev` (port 5173). Locally, `main.jsx` imports the user's baseline stats, so there's realistic history (sessions dated 31 Aug – 7 Sep 2026 across Upper A/B and Lower A/B).
- Use an iPhone 13 viewport (390×844). Emulate both `prefers-color-scheme: light` and `dark`.
- Playwright works well:
  - `.exercise-card` scopes a workout card; find the exercise by its `h3`.
  - Set inputs are plain `input`s (kg, reps, RIR per row); the done toggle is a `○` button; badges are `.comparison` elements with type classes (`same`, `improved`, `regressed`, `mixed`).
  - Confirm dialogs must be auto-accepted (`page.on('dialog', d => d.accept())`).
  - Read IndexedDB directly with `indexedDB.open('WorkoutTrackerDB')` to check saved sessions, sets and drafts.
- Playwright writes screenshots and logs to `.playwright-mcp/` in the repo (git-ignored).
- Recharts renders a hidden off-screen measuring `<span>` (often containing "0"). It is not a stray render.
- Local test sessions and config edits stay in the local DB; that's fine, and the production DB is unaffected.

## 12. Change log (Oct 2026 work)

| Commit | Change |
|---|---|
| a411dab | Removed stray empty `src/npm run dev`; `lint` script uses `oxlint`; first CLAUDE.md |
| c0acef2 | Progress from an active workout opened the Split screen; split check now excludes `workoutProgressOpen` |
| 7ef41ec | Editing any exercise mid-workout trimmed extra sets on every exercise; now only the edited exercise's group, only when its set count changes |
| 889938d | Live badge applies the weight-up rule regardless of reps/RIR direction |
| c28ba21 | Progress "Strength change" uses `resolveExerciseProgress` (e.g. 95×8 → 100×6 is +5.3%, was −0.3%) |
| 36c9540 | Headings near-invisible in light mode (index.css template colours) |
| d6625b0 | Recorded the user's progression design decisions |
| 2505c81 | Start waits for previous-performance data; query re-runs when the exercise list changes |
| 8fc2b7f | Saved sets numbered 1..n (no gaps), so prefill and live comparison line up |
| 096a8e0 | Optional alternative groups need Include/Skip like optional exercises |
| 6a5b562 | Editing alternatives matches by record id (removing/reordering no longer renames another record and moves its history) |
| 62eecd5 | Complete Workout is one transaction, guarded against double taps and against autosave recreating the draft |

All of the above are deployed to GitHub Pages.

## 13. Known issues not yet fixed

- **Archived mid-workout:** if an exercise or alternative is archived during a workout (e.g. removing a partner in Edit), its completed sets are silently not saved, because finish walks the live `orderedExercises`.
- **Deleting a day:** `deleteDay` archives the day and its exercises without a transaction and doesn't check for a paused/active workout on that day. `resumeWorkout` resumes archived days (it only checks the day exists).
- **Bad values:** negative or zero weight/reps can be completed and saved (`normalizeDecimalInput` keeps a leading `-`; completion only checks non-empty). Weight 0 (bodyweight) is always excluded from progression.
- **Float display:** `compareSet` shows `+${weightDiff}kg` unrounded (can show `0.1999999`).
- **Warm-ups:** `warmupSets` is stored and displayed but never creates rows; `setType` is always `"working"`.
- **Draft flush:** no save on `visibilitychange`/`pagehide`, so the last ≤150 ms of edits can be lost if iOS kills the app instantly.
- **UI nits:** the fixed back button overlaps the "ACTIVE WORKOUT" label when scrolled. The summary subtitle "· 04:21" is the duration but reads like a clock time. "1 working sets" grammar.
- **Name matching:** the Progress tab is case-sensitive and exact; Monthly is lower-cased.
- **Performance:** `historySessions` and `monthlyBodyProgress` scan whole tables on every DB change and may get slow with years of data.
- **Duplication** (refactor only if asked, carefully):
  - The draft object is built in three places (autosave effect, `startWorkout`, `makeCurrentDraft`).
  - `buildWorkoutSummary` re-implements the `historySessions` comparison.
  - The workout-state reset appears in `discardPausedWorkout` and `saveFinishedWorkout`.
  - Group/optional/plain branching is repeated in start, finish, the active render and the preview render.
  - The summary re-implements `getProgressStatus` inline.
- `activeExerciseIds` is dead state.

## 14. Working on this repo

- Match the existing style: very vertical formatting (one argument or operand per line), `function` declarations, section banners (`// ====` + title), comments explaining *why*.
- Git on Windows warns "LF will be replaced by CRLF". This is harmless.
- When splitting one App.jsx diff into several commits, use `git apply --cached --recount` on hunks from a **3-line-context** diff. One-line context (`-U1`) mis-placed hunks into look-alike JSX elsewhere. Check `git diff` is empty after staging everything, and that each intermediate stage has no undefined names (`npx oxlint -A all -D no-undef <file>`; ignore browser globals).

## 15. Regression checklist

Run through before significant commits:

- **Home and program:** Home loads · banner only on Home · split/day/exercise CRUD (soft archive).
- **Exercises in a workout:** optional include/skip · optional alternative group include/skip · alternative select (multiple) · edit alternatives (remove / rename / add) keeps the right history · add exercise mid-workout · edit exercise mid-workout (resizes only that exercise; completed sets kept; extra sets elsewhere kept).
- **Starting and logging:** Start disabled until loaded · previous values prefill · half reps · `7,5` stays 7.5 · blank RIR = 0 · set complete/add/remove · live badge incl. combined rep/RIR text and the weight-up rule.
- **Pause and finish:** active workout survives navigation and reload · Resume/Discard · Workout → Progress → back to the workout · Complete saves only checked sets, once, with sequential set numbers · skips stay skipped · summary.
- **History and Progress:** History filters, progression and detail statuses · Progress from History opens the right exercise and Back restores scroll · exercise graph, Strength change and personal bests · Upper/Lower monthly graphs.
- **Display and platform:** positive green / negative red · headings visible in light and dark mode · backup export/restore · `npm run build` · Pages base paths.
