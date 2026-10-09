# WBX Workout Planner

Personal workout tracker PWA built around one user's own training (iPhone 13, installed from GitHub Pages). No accounts, backend, sync, social, calorie tracking or exercise videos. Dark UI, coral accent `#ef8278`, slogan "PLAN HARDER. PROGRESS FURTHER." (inside the banner image).

The core loop: open today's workout → see last time prefilled → log sets with live per-set comparison → complete → see workout progression → long-term exercise and monthly Upper/Lower progression. A change belongs here only if it makes that loop faster, clearer or more reliable. Avoid onboarding, dashboards, social features and generic-fitness clutter. It's used between sets: large touch targets, few taps, minimal modals, no accidental data loss.

---

## 1. Ground rules

- **Live production app.** `src/App.jsx` (~8.4k lines) and `src/App.css` (~4k lines) hold almost everything. **Do not rewrite or broadly refactor them.** Draft persistence, alternatives, optional exercises, learned order, scroll restore and the timer all interact. Make small, targeted edits and verify in the browser.
- **Real data lives only on the phone.** The installed PWA's IndexedDB holds months/years of history; the repo holds none. `localhost` and GitHub Pages are different origins, so local testing never touches it (and vice versa) unless a backup is exported/imported.
- **Other people use it too (since Oct 2026).** The user's girlfriend (iPhone) and a friend (Android) run it from the same Pages URL. Each installed app has its own IndexedDB on its own phone, so data is separate by design: no accounts, no server. Every deploy reaches their phones too, so backward-compatible migrations and old-draft compatibility matter even more; they can't recover data themselves beyond Settings → Restore.
- **History is sacred.** Never hard-delete sessions or sets; the only exception is sets the user removes and confirms while editing a past workout (History edit). Splits, days and exercises are soft-archived (`archived: true`) so history survives program changes.
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
| `src/main.jsx` | Registers the SW and asks for persistent storage (`navigator.storage.persist()`). **On localhost** it seeds the WBX program (`seedWorkoutData`) and runs the three dev helpers below; **in production** a brand-new install (`needsProgramChoice()`) renders `<ProgramChooser>` first, otherwise `<App/>` (+ `<DialogHost/>`) |
| `src/db.js` | Dexie `WorkoutTrackerDB`, schema versions 3–5 (current `version(5)`) |
| `src/seed.js` | `PROGRAM_TEMPLATES`: "WBX Upper/Lower" (the original 4-day split; the user and the friend) and "Lower/Upper 2x a week" (the girlfriend: Lower Body Day 1/2 and Upper Body Day 1/2, day 2 repeating day 1, built with `templateExercise()`; days are named "Lower Body"/"Upper Body" so the monthly Upper/Lower comparison picks them up; no RIR target; rep targets exactly as she gave them), `applyProgramTemplate(id | null)` (one transaction, then `initialSeedComplete`), `needsProgramChoice()` (true only with no `initialSeedComplete` and no splits; marks existing installs done), `seedWorkoutData()` (localhost only) |
| `src/ProgramChooser.jsx` | First-launch screen on a new phone: one card per template, "Start empty", and "Restore from a backup" |
| `src/installPrompt.js`, `src/InstallBanner.jsx` | Android install card: `installPrompt.js` (imported first in main.jsx) catches `beforeinstallprompt`, cancels Chrome's mini-infobar and keeps the event; `useInstallPrompt()` exposes `canInstall` / `promptInstall()`. `InstallBanner` shows on Home and the chooser: the Android card while Chrome offers an install, or on iPhone/iPad browsers (`isIosBrowser`: iOS UA or touch "MacIntel", and not `navigator.standalone` / display-mode standalone) a 3-step "Share → Add to Home Screen → always open from the icon" hint, since the Home Screen app keeps its data apart from Safari. Never shown in the installed app. "Not now" / "Got it" hides it 7 days via `localStorage` (`wbxInstallBannerDismissedAt`) |
| `src/confirm.js`, `src/DialogHost.jsx` | In-app confirmation/notice sheet (see §9) |
| `src/backup.js` | `exportWorkoutBackup` / `importWorkoutBackup` (backup `version: 2`, all 6 tables incl. `appMeta`, import clears + bulkAdds in one transaction). Export uses the share sheet (`navigator.share` with a File: iCloud Drive / Google Drive) and retries once through a "Backup ready" confirm after `NotAllowedError` (Safari loses the tap during the DB reads); `AbortError` = cancelled, returns false; no share support → download. Success writes `appMeta.lastBackupAt` and returns true |
| `src/importCurrentStats.js` | Dev helper: imports the user's baseline stats as sessions (`currentStatsBaselineV1`) |
| `src/clearTestHistory.js` | Dev helper: deletes test sessions once (`testHistoryCleanupV1`) |
| `src/fixBaselineDates.js` | Dev helper: corrects baseline session dates once (`baselineDateCorrectionV1`) |
| `src/App.jsx` | The whole app: helpers, the `App` component, `ExerciseWorkoutCard`, `WorkoutSetRows` |
| `src/App.css` | All app styling; its `:root` defines the real palette |
| `src/index.css` | Minimal base reset (see §10) |
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

**Exercise record:** `workoutDayId, name, order, alternativeGroup (string|null), targetSets, warmupSets, minReps, maxReps, targetRIR (free text, e.g. "Failure", "1-2"), optional, archived`. Template exercises may also carry `startWeight` / `startReps`: `createExerciseSets` uses them to prefill an exercise that has never been performed (no previous sets); after that last time's sets take over. `minReps === maxReps` displays as a single number (`formatRepRange`), and an empty `targetRIR` shows no RIR label. Alternatives are separate records sharing an `alternativeGroup` string (seeded ones like `"upper-a-biceps"`, new ones `alternative-<ts>-<rand>`), ordered `order`, `order+0.01`, …

**Session record:** `workoutDayId, date (= completedAt ISO), startedAt, completedAt, durationSeconds, skippedExerciseIds, completedSetCount, exerciseOrderKeys`. Imported baselines may carry `baselineImport`.

**Set record:** `sessionId, exerciseId, setNumber (1..n, sequential since 8fc2b7f), setType ("working"), weight, reps, rir` as numbers. Optional `note` (string, trimmed, max 200 chars via `getSetNote` / `SET_NOTE_MAX_LENGTH`): only written when non-empty at finish; History edit may write `""`. Readers treat a missing or empty note as none. Only completed sets are saved; weight may be 0 (bodyweight), reps are always > 0. Older data may have gaps in `setNumber`; readers sort by `setNumber` and use array position, so gaps are harmless.

**`appMeta` keys:** `initialSeedComplete`, `activeWorkoutDraft`, `lastBackupAt` (ISO, last completed backup), `backupReminderSnoozedUntil` (ISO, Home reminder "Later"), plus the one-time helper keys above.

**`activeWorkoutDraft.value`:** `splitId, workoutDayId, splitName, workoutDayName, startedAt, workoutSets, selectedAlternatives, includedOptional, exerciseCompletionOrder`. Built only by `makeCurrentDraft`.
- `workoutSets`: `{ [exerciseId]: [{ weight, reps, rir, completed, note? }] }`. `note` is optional (absent in drafts from older builds). Values are a mix of strings (typed) and numbers (prefilled).
- `selectedAlternatives`: `{ [alternativeGroup]: exerciseId }`.
- `includedOptional`: plain optional exercises keyed by exercise id; optional alternative groups keyed by `"group:<alternativeGroup>"` (since 096a8e0). `true` = included, `false` = skipped, absent = undecided.
- Drafts from builds before f540eca also contain `activeExerciseIds`; it's ignored.

## 5. App.jsx architecture

Line numbers are approximate; grep for the names.

### Top-level helpers (lines ~30–700)
- Input: `normalizeDecimalInput` (comma→dot, keeps only digits and one dot; no `-`), `parseDecimal`, `getRIRValue` (blank → 0).
- Strength: `calculateE1RM(w, r, rir) = w × (1 + (r + rir)/30)` (0 if w≤0 or r≤0), `getTotalVolume`.
- Progression: `getProgressStatus` (±0.05 % threshold), `PROGRESSION_REP_MIN/MAX = 5/8`, `getBestSet` (highest e1RM set, ties by reps + RIR → `{weight, reps, score, effectiveReps}`; accepts 0 kg), `resolveExerciseProgress(current, previous)`, `formatProgressPercentage`, `compareSet(current, previous)` (live per-set badge, diffs rounded to 2 dp).
- Lookups: `findLatestPerformances(exerciseIds, sessionsNewestFirst)` → `Map(exerciseId → {session, sets})` via one indexed `sets.where("exerciseId").equals(id)` per exercise (not `anyOf`, which was much slower inside a live query). Used by `previousExerciseData` and `buildWorkoutSummary`. `normalizeExerciseName` (trim + lower-case) for name matching.
- Order: `getExerciseOrderKey` → `group:<alternativeGroup>` or `exercise:<id>`.
- Formatting: `formatDate` (en-ZA long), `formatShortDate`, `formatTime`, `formatDuration` (`mm:ss` / `h:mm:ss`). The date formatters use `Intl.DateTimeFormat` instances created once; `toLocaleDateString` with options per call was the main cost of rendering History.
- `HISTORY_PAGE_SIZE = 40`, `EMPTY_EXERCISE_FORM` (new exercises default 5–8 reps in the form; seeded ones are 6–8).

### State in `App` (~590+)
- Navigation: `activeTab` (`home|history|progress|settings|summary`), `selectedSplitId`, `selectedDayId`, `selectedHistorySessionId`, `workoutProgressOpen`, `historyProgressReturn {sessionId, scrollY}`.
- Workout: `activeWorkout`, `workoutStartedAt`, `pausedWorkout`, `workoutSets`, `selectedAlternatives`, `includedOptional`, `exerciseCompletionOrder`, `nowTick` (1 s timer tick; re-renders the whole App every second during a workout, so keep per-render work cheap), `finishingWorkout` + `finishingWorkoutRef` (Complete guard).
- Filters/forms: `historySearch/Month/Year`, `historyVisibleCount` (History paging; reset when a filter changes), `selectedProgressExercise`, `progressSearch`, split/day/exercise form state (`exerciseForm` includes `alternatives` + parallel `alternativeIds`), `summaryData`.
- `makeCurrentDraft` is a `useCallback` declared just before the autosave effect (it must be defined before that effect's dependency list).

### Live queries (re-run on any DB change)
- `splits`, `selectedSplit`, `workoutDays`, `selectedDay`, `exercises` (non-archived, by `order`).
- `previousExerciseData`: for each exercise, its latest performance among the day's sessions (`findLatestPerformances`) → `{lastPerformedSession, lastPerformedSets, skippedLastWorkout}` plus `latestDaySession`. Tagged with `loadedFor: previousDataKey` (`"<dayId>:<exercise ids>"`); `previousExerciseDataReady` is true only when it matches the current day and exercise list.
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
`renderBottomNav` (from `NAV_TABS`), `renderPausedWorkoutBanner` (Home only, when nothing is selected and no workout is active), `renderSplitForm`, `renderDayForm`, `renderExerciseForm` (shared by the day screen and the active workout), `renderManagementCard` (split/day cards), `renderPlanCardActions` (edit/remove icon buttons on the day screen), `renderOptionalSkippedCard` (optional exercise not yet included). Components at the bottom of the file: `BackButton`, `ProgressDirectionIcon`, `ExerciseWorkoutCard` (name, targets, "Skipped last time", Progress/Edit icon buttons, "Last time" block, Done tag) and `WorkoutSetRows` (kg/reps/RIR inputs with aria-labels, done toggle, remove, the `compareSet` line under every row including completed ones, Add set). Under each row a `.set-meta` line holds the comparison and a "Note" button; a written note shows in full (`.set-note-display`) and opens a text field on tap, and stays editable after the set is ticked (`openNoteIndex` local state; `updateSet` skips decimal normalising for the `note` field). `SetNote` renders a saved note under its set in "Last time", History detail and the exercise Progress screen's Sessions list. `compareSet` returns plain text; the direction arrow is rendered as an icon from its `type`.

## 6. Workout lifecycle

**Start (`startWorkout` ~3311).** Returns early unless `previousExerciseDataReady`; the Start button is disabled until then. If a paused draft exists, confirms discarding it. Builds `workoutSets` for every exercise via `createExerciseSets` (prefill weight/reps/RIR from `lastPerformedSets[index]`, uncompleted, at least `targetSets` rows). Each alternative group defaults to its most recently performed member, else `group[0]`. Writes the draft immediately, then sets `activeWorkout`.

**Editing sets.** `updateSet` normalises input; `toggleSetComplete` requires a weight (0 = bodyweight) and reps > 0; `addSet` appends an empty row; `removeSet` confirms if the row has data. `updateExerciseCompletionStatus` appends an exercise's order key to `exerciseCompletionOrder` when all its sets are complete (removes it otherwise). This becomes the learned order.

**Alternatives and optional.** `selectAlternativeDuringWorkout(group, id)` sets `selectedAlternatives[group]`; only the selected member is saved (sets ticked on a non-selected member are dropped by design). `getSelectedAlternative` falls back to the group's first live member if the stored selection was removed. Plain optional exercises show an Include card until `includeOptionalExercise(id)`; `skipOptionalExercise` hides them again. Optional alternative groups behave the same via `isOptionalGroupSkipped(group, selectedExercise)` and the `group:<name>` key. An undecided group that already has completed sets counts as included (protects drafts from older builds).

**Add/edit mid-workout.** `renderExerciseForm` is reused. `saveExercise` (~2661) writes the template (sets, warm-ups, reps, RIR, optional) to the edited exercise **and all its alternatives**. Alternatives are matched by `alternativeIds`: kept IDs are updated in place (renames keep history), removed ones are archived, new names are added after the group's highest `order`. Then `syncNewExercisesIntoWorkout(resizeExerciseId)` creates rows for brand-new exercises and resizes rows **only** for the edited exercise's group, and only if its working-set count changed. Shrinking pops trailing incomplete rows and stops at a completed one.

**Protecting the workout in progress.** `getWorkoutInProgress()` returns the running workout (from state) or the paused draft. Deleting a split or day it belongs to is blocked (`warnWorkoutInProgress`), and so is archiving any exercise/alternative with completed sets in it, whether via Remove on the day screen or by removing alternatives in Edit (`findExercisesWithLoggedSets` + `warnLoggedSets`). Archived exercises are hidden from the workout and skipped on finish, so this is what keeps logged sets from being lost.

**Pause/resume.** An autosave effect writes the draft 150 ms after any workout state change, and immediately on `visibilitychange` (hidden) or `pagehide`, since iOS can suspend a backgrounded PWA at once. It skips while a finish is in progress. Back (`leaveActiveWorkout`) saves and goes Home; Home shows the Resume/Discard banner. A reload always lands on Home (no auto-resume). `resumeWorkout` restores all state from `pausedWorkout` and refuses a removed (missing or archived) day; `discardWorkout` (Home banner, or "Discard workout" under Complete during a workout) confirms, deletes the draft and calls `resetWorkoutState` (the single in-memory reset, also used by finish).

**Finish (`finishWorkout` ~4104 → `saveFinishedWorkout` ~4337).**
- Walks `orderedExercises`. Collects completed sets (`setNumber` 1..n); skipped = unincluded optionals/groups plus exercises with zero completed sets.
- Confirms, then sets `finishingWorkoutRef` (blocks re-entry and pending autosaves). The button shows "Saving…".
- One Dexie transaction: `sessions.add` + `sets.bulkAdd` + delete the draft. On failure it alerts, writes nothing and keeps the workout open.
- Then `buildWorkoutSummary` (failure → go to History instead), resets state and shows the summary. The ref is cleared by an effect once `activeWorkout` is false.

**Summary.** Subtitle "Completed <date>, finished HH:MM", overall %, improved/same/regressed counts, duration, completed sets, volume, exercises/skipped, per-exercise statuses. "View in History" and the History back button go to History.

## 7. Progress, history and navigation details

- **History list:** month/year filters and search, each session's overall progression (or "Baseline workout · N new baselines"). Renders 40 workouts at a time with a "Show older workouts (N more)" button; the count resets when a filter changes and survives opening a History detail. **History detail:** per-exercise status, sets and "Compared with last performed <date>". Skipped exercises are listed as "Skipped". Set notes show under their set.
- **History edit:** "Edit" on History detail (`historyEdit` state, `startHistoryEdit` / `saveHistoryEdit`, `HistoryEditSetRows`) fixes a finished workout's sets: change kg/reps/RIR and the note, remove a set, add a set (also on a Skipped exercise). Edits go to a copy and are written in one transaction on Save: existing sets are updated in place (same id), new ones added, removed ones deleted, every exercise renumbered `setNumber` 1..n, and the session's `completedSetCount` and `skippedExerciseIds` updated (an exercise left with no sets becomes skipped; one given sets is no longer skipped). A row with blank kg and reps counts as removed; any other row needs a weight (0 ok) and reps > 0. The bottom nav and Progress buttons are hidden while editing; Back/Cancel ask before discarding changes. Live queries recalculate History %, Progress, Monthly and "Last time" automatically. The session date can't be edited and whole workouts can't be deleted (user's choice).
- **History → Progress → Back:** `openHistoryExerciseProgress` saves `{sessionId, scrollY}`; `closeHistoryExerciseProgress` reselects the session and restores scroll after two `requestAnimationFrame`s. It works, but headless browsers throttle rAF, so automated tests see the scroll restore late.
- **Workout → Progress → back ("Workout")** toggles `workoutProgressOpen`. The workout's scroll position is not restored.
- **Progress landing:** exercise search, Month-to-Month Upper/Lower cards with bar charts (green/red), "Not enough monthly data yet" when there's nothing to compare. Below them, a **Month by month** table (`buildMonthlyRows`) lists every month newest first with Upper and Lower % side by side ("Baseline" when the previous calendar month has no data, "No workouts" for a gap), a 3 / 6 / 12 / All range switch (`monthRange` state, default 3) and a Combined row that compounds the comparable months in range ((1+a)(1+b)-1).
- **Exercise progress screen:** Best weight, RIR-adjusted 1RM, Sessions, Strength change, Personal Bests (best weight / best reps / best e1RM with dates), e1RM line chart, per-session history.
- **Backups:** Settings → "Back up your workouts" (`handleExportBackup`, shows "Last backup today / N days ago" via `formatDaysAgo`) and "Restore from a backup". The Home reminder (`renderBackupReminder`, `backupStatus` live query) shows on plain Home when there is at least one workout, no paused workout, and the last backup is `BACKUP_REMINDER_DAYS` (14) old or missing; "Later" snoozes it `BACKUP_SNOOZE_DAYS` (3).
- **First launch:** see `src/ProgramChooser.jsx`. Testing it needs the production code path on a fresh origin: `npx vite preview --port 4180` and open `http://wbx.localhost:4180/workout-tracker/` (a `*.localhost` host isn't matched by the localhost check). Raw IndexedDB writes from a test aren't seen by live queries until a reload.
- Screens don't otherwise reset scroll on navigation.

## 8. Progression rules (ask before changing)

**Decimal input.** Workout inputs are `type="text" inputMode="decimal"` through `normalizeDecimalInput()`. Never switch to `type="number"`; that brings back an iPhone bug where `7,5` became `75`. Half reps (`7.5`) are intentional. Blank RIR = 0.

**Strength model.** `e1RM = weight × (1 + (reps + RIR) / 30)`, a practical heuristic. More RIR at the same weight and reps is an improvement. `70×8 @0 → 70×8 @1` is improved; `70×8 @0 → 70×9 @1` shows `↑ +1 rep · +1 RIR`.

**Weight-up rule (all layers).** If weight went up and current reps are within 5–8, it's always `improved`. The reported % is the load increase %, which is proportional, so +2.5 kg on 12 kg means far more than on 100 kg. Weight up with reps below 5 falls back to e1RM. Weight down or reps-only changes use e1RM.

**Bodyweight (0 kg).** e1RM is 0 for bodyweight, so 0 kg vs 0 kg is judged by reps + RIR (`effectiveReps`; % change of reps + RIR) in every layer, and live mixed results compare reps + RIR. Switching between 0 kg and loaded isn't comparable: History/summary/monthly treat it as a new baseline, and a mixed live result shows neutral `↔`. Any code that copies best-set fields must carry `effectiveReps`.

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
- 0 kg sets are judged by reps + RIR (above).
- Warm-up sets stay a reminder label only: no warm-up rows during a workout, nothing saved (`setType` is always `"working"`).

## 9. UI conventions

The UI was refined in a polish pass (impeccable + taste-skill review, Playwright before/after screenshots). Keep new work in the same system:

- Mobile first, max content width ~460px, iOS safe areas, large touch targets (icon buttons are 40×40), fixed bottom nav (Home / History / Progress / Settings; the active tab shows a filled icon on a soft coral pill).
- **Icons:** Phosphor (`@phosphor-icons/react`) only. Never Unicode glyphs or emoji as icons. Icon-only buttons need an `aria-label`. Direction of progress uses the shared `ProgressDirectionIcon`.
- **Back buttons:** the shared `BackButton` component. Fixed, **top-left**, pill-shaped, safe-area aware, never top-right. The label names the destination (CaretLeft icon + "Workouts", "Workout", "History", the split name).
- **No eyebrows:** no small uppercase/tracked labels above headings, no decorative dots, no section numbers. Context goes in a `.page-subtitle` under the h1 (e.g. "Monday, 12 exercises"); metric captions use `.metric-label` in sentence case.
- **Colour:** coral only for primary actions and current selection (`.primary-button`, `.small-add-button`, selected segment, active tab). Green = better, red = worse/destructive, yellow = skipped, blue = baseline, neutral grey = same. History cards carry their result colour (status tile, soft wash, coloured counts). No purple. Chart colours come from `CHART_COLORS` in App.jsx (mirrors the CSS tokens); tooltips use `CHART_TOOLTIP_PROPS`.
- **Shape:** tokens in `:root`: `--radius-card` (cards), `--radius-inner` (panels inside cards), `--radius-control` (inputs, icon buttons), `--radius-button` (full-width buttons), pills for tags/chips.
- **Type:** 11px minimum; meta 12-13px; card titles 16px; page h1 28px. All numbers (`set inputs, tables, stats, timer`) use `font-variant-numeric: tabular-nums`. Inputs are 16px so iOS doesn't zoom on focus.
- **Layout:** everything is left-aligned (the old Vite `#root { text-align: center }` is gone).
- **Motion** (tokens `--ease-out`, `--dur-fast/--dur/--dur-slow`):
  - Ticking a set is the one authored moment: the ring fills green with a short pop, and a "Done" tag plus a green card state appear when all of an exercise's sets are ticked.
  - Screens fade up 8px on arrival (each screen root is keyed, so this runs only on navigation). Bottom sheets slide up. Presses scale to 0.97.
  - `prefers-reduced-motion` swaps movement for fades and drops the pop.
  - Don't put `transform` animations on `.app` itself or on fixed children, because they break `position: fixed`. Overlapping dropdowns need their own `z-index` (see `.progress-selector`).
- **Confirmations and notices:** never `window.confirm` / `window.alert` (embedded browsers block them silently and they look foreign in the installed app). Use `await confirmAction({ title, message, confirmLabel, cancelLabel, tone })` and `await notify({ title, message })` from `src/confirm.js`; `<DialogHost />` (src/DialogHost.jsx, mounted next to `<App />` in main.jsx) renders them as a bottom sheet. Cancel is focused first; Escape or tapping the backdrop cancels. Confirm labels name the action ("Delete split", "Discard workout", "Remove set"); `tone: "danger"` (default) makes it red, `"primary"` coral. Every destructive or data-replacing action confirms: delete split/day, remove exercise, remove an alternative in the editor, lower the set count mid-workout when typed sets would be trimmed, remove a set with values, discard a workout (running or paused), start a workout over a paused one, complete a workout, restore a backup, remove logged sets when saving a History edit, discard unsaved History edits.
- No separate Pause button or modal: Back saves the draft. WBX banner only on Home.

## 10. CSS notes

- `src/index.css` is a minimal base reset (dark-only `color-scheme`, zero margins). All styling and tokens live in `src/App.css`, which is organised by screen with a header comment describing the shape, type and colour rules. Don't reintroduce a `prefers-color-scheme` split; the app is dark-only.
- The stylesheet was rewritten from ~4,000 lines (with triplicated blocks and dead classes) to ~1,600. Before adding a rule, check for an existing token or shared class (`.card`, `.tag`, `.icon-button`, `.text-button`, `.primary-button`, `.status-text`, `.section-title`, `.metric-label`).

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
- Wait for set rows before reading a card (`card.locator('input').first().waitFor()`); reading immediately after Start can see an empty card.

**Performance testing.** Real data grows by roughly 200 workouts a year, so check heavy changes at scale:
- Insert synthetic history straight into IndexedDB (e.g. 5 years: 1,040 sessions, ~22k sets) with a `synthetic: true` flag on every record, and delete those records afterwards.
- Measure the **production** build (`npx vite preview --outDir <dir> --port <n>`). Dev-mode React (`jsxDEV`) roughly doubles render cost and is misleading.
- A different port is a different origin, so it gets its own database. Before each run, unregister the service worker and clear `caches`, or you may be timing a stale bundle.
- Throttle the CPU 4× through CDP (`Emulation.setCPUThrottlingRate`) to approximate a phone.
- Wall-clock numbers include Playwright's own polling under throttling. Use the CDP profiler (`Profiler.start/stop`) to see real app time.
- Baseline at 5 years of data, 4× throttle, production build: History opens in ~1.9 s, Progress ~1.6 s, opening a day until Start is ready ~4.5 s, finishing to summary ~7.9 s. Ticking a set is ~120 ms of real app work.

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
| 2f0d882 | Full CLAUDE.md; `.playwright-mcp/` git-ignored |
| 77d46f6 | Never archive what the workout in progress needs (split/day/exercise/alternative guards); `deleteDay` in a transaction; removed selected alternative falls back; no resuming an archived day |
| 49ff381 | 0 kg sets judged by reps + RIR; `-` stripped from input; completing needs reps > 0; live diffs rounded |
| f540eca | Draft saved immediately on background (`visibilitychange`/`pagehide`); `makeCurrentDraft` useCallback as the single builder; `resetWorkoutState`; dead `activeExerciseIds` removed |
| b87aae3 | Sticky workout header clears the back button; summary subtitle shows finish time; "1 working set" |
| 0d7b494 | Progress name matching ignores case and spaces (`normalizeExerciseName`) |
| 29128b3 | Performance: cached date formatters, History paging (40), `findLatestPerformances` for prefill and summary |
| a55d6c1 | UI polish (Phosphor icons, no eyebrows, tokens, motion, App.css rewrite), coloured History, Month by month table, Discard from the workout screen, in-app confirmation sheet |
| 43d4a35 | Edit the sets of a finished workout from History detail |
| c1ab770 | Notes on individual sets (workout, "Last time", History, Progress sessions, History edit) |
| 7141ee6 | Sharing with other people: first-launch program chooser + templates, one-tap share-sheet backup, last-backup date, Home backup reminder, persistent storage request |
| 141879e | Install card on Home and the first-launch chooser: Android install button, iPhone Add to Home Screen steps |
| (uncommitted) | Girlfriend's program as the "Lower/Upper 2x a week" template with starting weights; single rep targets show as one number; no RIR label when there is no target |

Everything above is deployed to GitHub Pages (live bundle `index-BeIVlNyq.js` as of 141879e). Pushing doesn't deploy: compare `dist/assets/index-*.js` with the live page to know what's actually live.

## 13. Known limitations and tech debt

- **Scaling:** `historySessions` and `monthlyBodyProgress` still scan the whole sessions/sets tables whenever they change (i.e. after each finished workout). At 5 years of data this is the bulk of the ~7.9 s (4× throttled) finish-to-summary time; fine for now, the next thing to optimise if it grows.
- **Progress chart:** plots e1RM, so a bodyweight-only exercise charts as 0 (the Strength change number uses reps + RIR correctly).
- **Overall %:** session and monthly averages mix load-% (weight-up rule), e1RM-% and reps+RIR-% results.
- **Header height:** the sticky active-workout header is ~40 px taller when stuck, to clear the fixed back button.
- **Duplication** (refactor only if asked, carefully): `buildWorkoutSummary` re-implements the `historySessions` comparison; group/optional/plain branching is repeated in start, finish, the active render and the preview render.
- **Lint:** since f540eca oxlint no longer reports the `react(purity)` warnings it used to flag in `App` (Date.now/Math.random inside handlers, false positives). The only remaining warning is `set-state-in-effect` on the draft-loading effect.

## 14. Working on this repo

- Match the existing style: very vertical formatting (one argument or operand per line), `function` declarations, section banners (`// ====` + title), comments explaining *why*.
- Git on Windows warns "LF will be replaced by CRLF". This is harmless.
- When splitting one App.jsx diff into several commits, use `git apply --cached --recount` on hunks from a **3-line-context** diff. One-line context (`-U1`) mis-placed hunks into look-alike JSX elsewhere. Check `git diff` is empty after staging everything, and that each intermediate stage has no undefined names (`npx oxlint -A all -D no-undef <file>`; ignore browser globals).

## 15. Regression checklist

Run through before significant commits:

- **Home and program:** Home loads · banner only on Home · split/day/exercise CRUD (soft archive).
- **Exercises in a workout:** optional include/skip · optional alternative group include/skip · alternative select (multiple) · edit alternatives (remove / rename / add) keeps the right history · add exercise mid-workout · edit exercise mid-workout (resizes only that exercise; completed sets kept; extra sets elsewhere kept).
- **Starting and logging:** Start disabled until loaded · previous values prefill · half reps · `7,5` stays 7.5 · `-` can't be typed · blank RIR = 0 · 0 reps can't be completed · set complete/add/remove · live badge incl. combined rep/RIR text, rounded diffs, the weight-up rule and 0 kg reps + RIR.
- **Pause and finish:** active workout survives navigation and reload · draft saved immediately when the app is backgrounded · Resume/Discard · deleting the split/day/logged exercise of a paused workout is blocked · Workout → Progress → back to the workout · Complete saves only checked sets, once, with sequential set numbers · skips stay skipped · summary.
- **History and Progress:** History filters, progression, paging and detail statuses · Progress from History opens the right exercise and Back restores scroll · exercise graph, Strength change and personal bests · Progress names match regardless of case · Upper/Lower monthly graphs · Set notes: add during a workout, survive pause/resume, saved only on that set, shown in History, the exercise Progress Sessions list and next time's "Last time", editable in History edit · History edit: change/remove/add sets, invalid rows blocked, removing every set marks Skipped, Back/Cancel ask before discarding, set ids kept and `setNumber` 1..n.
- **Install card:** dispatch a fake `beforeinstallprompt` (an Event with `prompt` and `userChoice`) → card on Home and the chooser; Install calls `prompt()` and hides it; Not now hides it across reloads. iPhone hint: a context with an iPhone user agent and `navigator.standalone` stubbed false shows it; stubbed true hides it.
- **Sharing and backups:** new origin shows the chooser; WBX template creates the 43 seeded exercises; Start empty; Restore from the chooser; existing installs never see it · backup via share sheet, cancel records nothing, NotAllowedError retry, download fallback · last-backup text · Home reminder after 14 days, Later snoozes, hidden with a paused workout or no workouts.
- **Display and platform:** positive green / negative red · headings visible in light and dark mode · backup export/restore · `npm run build` · Pages base paths.
