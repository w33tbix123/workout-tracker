# WBX Workout Planner

Personal workout tracker PWA for one user's own training (iPhone 13, installed from GitHub Pages). No accounts, backend, sync, social, or generic-fitness features. Dark UI, coral accent `#ef8278`.

The core loop: open today's workout → see last time prefilled → log sets with live per-set comparison → complete → see workout progression → long-term exercise and monthly Upper/Lower progression. Changes should make that loop faster, clearer or more reliable.

## This is a live production app

- `src/App.jsx` (~8k lines) and `src/App.css` (~4k lines) hold most of the app. **Do not rewrite or broadly refactor them.** Active workout state, Dexie live queries, draft persistence, alternatives, optional exercises, learned order, scroll restoration and the timer all interact. Make small, targeted edits.
- The user's real history lives only in the installed PWA's IndexedDB. `localhost` and GitHub Pages are different origins, so local testing never touches it. The repo contains no real data.
- Dexie migrations must stay backward compatible with existing production databases. Extra object fields (e.g. `skippedExerciseIds`, `durationSeconds`, `exerciseOrderKeys`) need no schema bump.
- Never hard-delete sessions or sets. Splits, days and exercises are soft-archived (`archived: true`) so history survives program changes.

## Stack and commands

React 19, Vite 8, Dexie 4 (`dexie-react-hooks`), Recharts, `vite-plugin-pwa` (autoUpdate). Vite `base` is `/workout-tracker/`.

```bash
npm run dev       # local dev server
npm run lint      # oxlint
npm run build     # production build
npm run deploy    # build + publish dist to gh-pages
```

Only push or deploy when asked. After a deploy, check Pages in a fresh/incognito tab; the installed PWA may hold a stale service worker until closed and reopened.

## Files

- `src/db.js` — `WorkoutTrackerDB`, currently `db.version(5)`. Tables: `splits`, `workoutDays`, `exercises`, `sessions`, `sets`, `appMeta`. Split → Workout Day → Exercise; Workout Day → Session → Set.
- `src/backup.js` — export/restore (backup `version: 2`), includes `appMeta` so paused drafts survive.
- `src/seed.js` — seeds the 4-day Upper/Lower split on first run (`appMeta.initialSeedComplete`).
- `src/importCurrentStats.js`, `clearTestHistory.js`, `fixBaselineDates.js` — dev helpers. They run from `main.jsx` **only on localhost** and must never run in production.

## Rules that must not change without asking

**Decimal input.** Workout inputs are `type="text" inputMode="decimal"` routed through `normalizeDecimalInput()`. Do not switch to `type="number"`; that brings back an iPhone bug where `7,5` became `75`. Half reps (`7.5`) are intentional. Blank RIR means 0 (`getRIRValue()`).

**Progression maths.** Three layers must agree: live set comparison (`compareSet`), per-session history progression, and monthly Upper/Lower progression on the Progress landing page.

- `calculateE1RM`: `weight × (1 + (reps + RIR) / 30)`. More RIR at the same weight and reps is an improvement.
- If weight goes up and reps stay within 5–8, it is always `improved`, and the reported % is the load increase % (`resolveExerciseProgress`, mirrored in `compareSet`). Otherwise fall back to e1RM.
- An exercise is judged by its best set (`getBestSet`) and compared against the last earlier session where it was actually performed.
- Session and monthly % are the average of per-exercise relative changes, never raw tonnage.
- Statuses: `improved`, `same`, `regressed`, `new` (first ever, shown as a baseline), `skipped` (excluded from totals). Insufficient data shows as baseline/not enough data, never `0%`.
- Upper/Lower is inferred from workout-day names containing "upper"/"lower".

**Workout behaviour.**

- Optional exercises are included or skipped during the workout. A skip is not a regression; the last real performance is still shown with "Skipped last workout".
- Alternative groups (`alternativeGroup`) can hold any number of exercises. Only the selected one counts as performed. `getExerciseOrderKey()` returns `group:<alternativeGroup>` so alternatives share an order slot.
- Exercise order is learned: completion order is saved as `exerciseOrderKeys` on the session and used next time; configured `order` is the fallback.
- The active workout is continuously saved to `appMeta.activeWorkoutDraft`. Back saves and returns Home, where a Resume/Discard banner shows. There is no pause button or modal; don't add one.
- Editing an exercise mid-workout resizes set rows live. Lowering the set count trims only trailing incomplete rows; completed sets are never removed.
- Completing saves only checked sets, records skips, duration and order, deletes the draft and shows the summary screen.
- New exercises default to a 5–8 rep range.

## UI conventions

- Mobile first, max content width ~460px, large touch targets, iOS safe areas.
- Back buttons: fixed, top-left, pill-shaped, safe-area aware. Never top-right.
- WBX banner and "PLAN HARDER. PROGRESS FURTHER." appear on Home only.
- Green = better, red = worse, grey = same.
- Bottom nav: Home / History / Progress / Settings. Navigation is blocked while a workout is active to protect state.
- History → Progress → back restores the History scroll position.

## Regression checklist

Run through before significant commits:

Home loads · banner only on Home · split/day/exercise CRUD · optional include/skip · alternative select (multiple) · add and edit exercise mid-workout (completed sets kept) · previous values prefill · half reps · `7,5` stays 7.5 · blank RIR = 0 · set complete/add/remove · live set comparison incl. combined rep/RIR text · active workout survives navigation and reload · Resume/Discard · Complete saves only checked sets · skips stay skipped · History filters, progression and detail statuses · Progress from History opens the right exercise and Back restores scroll · exercise graph and personal bests · Upper/Lower monthly graphs · weight-up-in-range = improved in all three layers · backup export/restore · `npm run build` · Pages base paths.
