# Trip Clubhouse — project guide for Claude Code

A mobile-first PWA for golf trips: scheduling, pairings/tee times, live better-ball
match-play scoring, leaderboards, stats, trash-talk chat, and per-trip handicaps.
Owner/dev: Owen Chamberlin (o.chamberlin@gmail.com).

Read BACKLOG.md at the start of each session; update it when a branch merges or a decision changes.

## Stack
- **Frontend:** React 18 + Vite (JavaScript, **not** TypeScript). Plain CSS in `src/index.css` (design tokens as CSS vars) plus inline style objects in components.
- **Backend:** Supabase (Postgres + RLS + Realtime + Auth). Client in `src/lib/supabase.js`.
- **Serverless:** Netlify Functions in `netlify/functions/*.cjs` (golf-course API proxy, scorecard OCR scan, push/email notify). They use server-side secrets (`GOLF_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — not the `VITE_` ones.
- **Hosting:** Netlify. Site **`trip-clubhouse`** (id `55e25b5c-c796-452e-af09-4f63fcd0b477`, `thetripclubhouse.com`), connected to GitHub `ochamberlin7/trip-clubhouse`. Pushing any branch builds a branch-deploy preview at `https://<branch-with-slashes-as-dashes>--<site>.netlify.app`.

## Commands
- `npm run dev` — Vite dev server (http://localhost:5173). `npm run dev:proxy` runs `netlify dev` (needed to exercise the Netlify functions / golf proxy locally).
- `npm run build` — production build (must pass before merging).
- `npm run lint` — ESLint over the repo. **The repo is NOT lint-clean** (see Gotchas). Rule: *add no NEW lint errors*; pre-existing ones are acceptable.
- `npm test` / `node --test 'src/**/*.test.js'` — Node's built-in test runner. Tests are pure-logic unit tests (mostly `src/lib/scoring.test.js`). No DOM/component tests.

## Environment (`.env.local`, gitignored)
Frontend reads these `VITE_` vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, and optional `VITE_GOLF_API_KEY` (dev-only fallback for calling the golf API directly on plain `npm run dev`; in prod the `golf-course-proxy` function uses server-side `GOLF_API_KEY`). Recreate the file with `netlify link` (pick `trip-clubhouse`) then `netlify env:list --plain > .env.local` (this CLI, v26, has no `env:pull`). `supabase.js` tolerates missing env (logs a warning, uses placeholders).

## Architecture — key files
- **`src/lib/scoring.js` — the shared-logic hub. Reuse it; do NOT duplicate scoring/phase logic.** Every surface routes through here so numbers can't drift. Contains:
  - WHS handicaps: `rawCourseHandicapForTee`, `courseHandicapForTee`, `effectiveAllowance`, `shotsGivenFromCourseHandicaps`, `pairingShots` (per-pairing shots-off-the-low = the scorecard dots), `resolvePlayerTee`.
  - Match play: `matchHoleOutcomes`, `liveMatchTally` (points), `liveStandardMatchTally` / `standardMatchTally`, `matchPlayPointsByPlayer`, `princeOfWalesComposites`, `analyzeScoring`.
  - Completeness/liveness: `isRoundComplete` (18-hole default, see below), `roundHoleCount`, `isPracticeRound`, `isRoundLiveAt` (single live-window predicate; tee−30; missing tee = not live unless scored), `getLiveRounds`, `roundHasAnyScore`.
  - **Trip phase & routing (recent work):** `getTripPhase({trip, rounds, now, timeZone, completeness})` → `{ phase, dayNumber, totalDays, todaysRounds, liveRound, nextRound, lastCompletedRound, hasRoundsToday }`. `phase` ∈ `no-trip | before-trip | after-trip | no-round-day | before-first-tee | round-live | between-rounds | after-last-round`. `zonedTodayAndMinutes(now, tz)` derives trip-local today/now. `screenForTripPhase(phase, {playingLiveUnderway})` → which tab opens (`scores`/`dashboard`/`no-trip`). `defaultRoundForTrip(phaseResult, rounds, todayIso, nowMinutes)` → which round a round-based screen defaults to. `homeBannerModel` / `roundCourseName` / `bannerGridColumns` → Home day-strip banner.
- **`src/pages/dashboard/TripDashboard.jsx`** — the app shell: tabs (Home/Score/Leaderboard/Stats/Tee Times/Menu), data fetch (`fetchAll`), and `computeActiveScoring` (builds phase inputs, decides the live round + default round + which screen auto-opens). Leaderboard subcomponents (Points/Standard/Prince-of-Wales) live here too.
- **`src/components/ScoringTab.jsx`** — the scorecard + per-hole entry modal + pairing assignment. Round pills select the round (`activeRoundId`, seeded from `initialRoundId`=default; manual pick wins for the session). Score writes are pairing-scoped (RLS, below).
- **`src/components/MenuDrawer.jsx`** — large: the menu drawer + its secondary pages, including **Schedule & Courses** (`CoursesPage`, `GolfRoundEntry`, `HandicapCalculator`) and Players/Teams.
- **`src/components/LiveScoreBanner.jsx`** — floating live match banner (its own round-selection memo; independent of the phase router).
- **`src/components/CountdownWidget.jsx`** — the **Home banner** (pre-trip countdown / post-trip thanks / in-trip day-strip with connected dots). Driven by `getTripPhase` + `homeBannerModel`.
- **`src/components/StatsTab.jsx`, `TeeTimesWidget.jsx`, `ChatWidget.jsx`, `lib/teamColors.js`, `lib/courseApi.js`, `lib/purse.js`.**
- **`supabase/migrations/*.sql`** — numbered SQL. Applied **by hand in the Supabase SQL editor**, NOT via a migrate tool. Latest: `20260676_profile_photos.sql` (applied).

## Domain concepts you'll hit often
- **Per-pairing scoring:** sides are slots 1&2 (team1_id) vs 3&4 (team2_id) on a `pairing`. Shots = shots-off-the-low within the pairing. Pairing team ids come from the `pairings` row (`team1_id`/`team2_id`), not array order.
- **Score-write scope (RLS):** `can_write_score(round_id, trip_player_id)` only lets a user write for a pairing they're in (migration `20260672`) — commissioners included. There is **no commissioner bypass**.
- **Test mode (dev override):** `trips.test_mode` (migration `20260674`, applied). When ON and the signed-in email is `o.chamberlin@gmail.com`, that account can score ANY pairing and edit even past trips (read-only bypass). Toggle is on the **Profile page** (dev-only row). Nobody else benefits; real trips (`test_mode=false`) unaffected. Email is hardcoded in `can_write_score` and `TripDashboard.jsx` (`DEV_USER_EMAIL`).
- **Time zone:** `trips.time_zone` (IANA, migration `20260673`, applied). `getTripPhase` reads it so out-of-zone viewers (Owen in Phoenix, trips in Michigan/Eastern) see the trip's day. Callers pass `trip.time_zone`.
- **The Dozen:** a real 12-hole round. Completion/stroke logic must use the round's own hole count, never a hard-coded 18 for display math. (`isRoundComplete` keeps an 18 *default* for back-compat; pass the real count where it matters.)
- **Team colors:** `src/lib/teamColors.js` — index-keyed palette (single source): red / blue / green / purple / amber / teal, injected as CSS vars (merged 2026-10-27).

## Working conventions (how Owen wants changes made)
- **Proceed directly — don't ask permission before making changes.** Only ask when a decision is genuinely the user's (product/security trade-offs). Pick sensible defaults and report them.
- **Adapt specs to the real codebase.** Specs sometimes assume structure that doesn't exist (e.g. a "Leaderboard round view" that isn't there) — bend the feature to the app; flag the mismatch; don't re-architect working systems.
- **Branch per feature**, named `feat/...` or `fix/...` off `main`. Push so the Netlify preview builds. **Do not merge until explicitly told.** Owen verifies on the preview, then says "merge it."
- **Gates before merge:** `npm test` and `npm run build` pass; no *new* lint errors. When merging, first `git merge main` into the branch to surface conflicts; if conflicts appear, STOP and report before touching `main`.
- **Migrations are never auto-applied.** Write the `.sql` file; Owen runs it in the Supabase SQL editor. Don't run anything destructive against prod.
- **Secrets:** never print `.env.local` contents or secret values.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Current state (as of 2026-10-23, `main` @ `0df8024`)
Recently merged to `main`: trip-phase foundation (`getTripPhase`), phase-driven **routing** (`screenForTripPhase`, zone-aware default screen), **Schedule & Courses** tab (tee times, completed-round shading, post-round handicap recap), **Home day-strip banner** (dots at the bottom, connected by a line), **test mode**, and **default round selection** (`defaultRoundForTrip`).

Since then (2026-10-23 → 10-27) everything below is merged; see BACKLOG.md for the full list: member removal (Player TBD), Daily Leaders, Points Defended, Stats redesign, Trip Clubhouse Home (`/home`, opens on a trip 14 days before → 7 after), badges / Trophy Room (`/trophies`), shared `teamStandings`, live-banner team fix, team colors.

2026-10-29: **game types** merged — `trips.format` now also `stableford` / `stroke_play` (team or individual; `tripGameType` in scoring.js), the redesigned trip wizard, and shared leaderboard tabs (`LeaderboardPills`). Details in BACKLOG.md.

## Gotchas
- **`src/components/MenuDrawer.jsx` has 20 PRE-EXISTING lint errors** (as of `main` @ `043071f`). Same rule: count only new ones.
- **`src/pages/dashboard/TripDashboard.jsx` has 6 PRE-EXISTING lint errors** (`groupByDate`, two `WeatherWidget` setState-in-effect, dead `TabMenu`/unused `trip`, `devReset`). They are NOT yours — count only *new* ones. `node_modules`-wide `npm run lint` fails on these + others by design.
- **Disk/corruption history:** this folder is a **fresh re-clone** (the earlier working copy corrupted when the disk hit 100% full). A backup of the broken copy sits at `~/Desktop/trip-clubhouse-fresh.corrupt-20261021` — safe to delete once you're confident (only unrecoverable thing in it was `.env.local`, already recreated). The repo lives under `~/Desktop` (watch disk space; if reads start timing out, the disk is likely full again — stop and tell Owen, don't delete).
- Tests are logic-only; there's no component/browser test harness. Verify UI changes on the Netlify preview.
- `netlify-cli` here is v26.1.0 (dev dep): it has `env:list`/`env:import`, **not** `env:pull`.
