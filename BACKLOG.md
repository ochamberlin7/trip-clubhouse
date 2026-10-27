# Trip Clubhouse — Backlog

Source of truth for what's done, decided, and next. Update it when a branch merges or a decision changes.
Merge status verified with `git branch -r --merged origin/main` on 2026-10-23 (main @ `8a29ed3`).

## How we work (priority order)
- Never merge to main without Owen's explicit approval after he's seen the preview or accepted the tests. Push the branch, report the preview URL, wait.
- If anything differs from what a prompt or this file assumes (conflicts, extra files touched, a different cause), STOP and report before pushing.
- One branch per task, `feat/...` or `fix/...`, from current main.
- Preview URL: `https://<branch with slashes as dashes>--trip-clubhouse.netlify.app`.
- Non-trivial task → start read-only: find the code, report what exists (6–10 lines), then continue unless something contradicts the plan.
- One shared function/setting per concept, no parallel copies (`pairingShots`, `getTripPhase`, `teamColors.js`, `roundCourseName`). Display code reads shared logic; it never recomputes scoring or trip phase.
- Report each time: files changed, before/after of anything that differs, how to see it on a test trip, anything unexpected.
- Tests pass, no new lint errors (the 6 old ones in `TripDashboard.jsx` are known debt — don't fix unless asked).
- Never delete files, branches or data without asking. Never print secrets. Never apply a migration without Owen's go-ahead.
- Owen tests on Netlify previews, not locally, and often can't test time-dependent behavior on demand → rely on unit tests for logic; give short, specific preview checks.
- Owen is a PM, not a developer: plain language, result first, short reports.

## Core domain rules (decided — don't change without asking)
- **Match play strokes** = shots off the low within each pairing, via `pairingShots` (`src/lib/scoring.js`). Never absolute playing handicap for composites. Allowance 90% (65% on The Dozen).
- **Prince of Wales composite:** per hole number, lowest net across all rounds and players on the team. Gross view is correct. Default view Net vs Gross is undecided (currently Net).
- **The Dozen** (12 holes) is handled; out of scope for new work. Don't touch its hole-count logic.
- **`rounds.status` is unreliable/vestigial.** "Live" is time-based: today, not complete, now ≥ tee_time_1 − 30 min. Completeness defaults to 18 holes; leave as is.
- **Tee times** are display strings ("9:06 AM"). Missing tee_time_1 = unknown, not live all day.
- **Time zone:** `trips.time_zone` (IANA), backfilled for CTI Michigan. Pass it explicitly to `getTripPhase`. Never use the phone's clock for trip "today" (Owen is in Phoenix; trips often aren't).
- **`getTripPhase`** returns `{ phase, dayNumber, totalDays, todaysRounds, liveRound, nextRound, lastCompletedRound, hasRoundsToday }`; phases: no-trip, before-trip, after-trip, no-round-day, before-first-tee, round-live, between-rounds, after-last-round. Facts only — policy lives in `screenForTripPhase` / `defaultRoundForTrip`.

## Done
| Item | Branch | Status |
|---|---|---|
| Prince of Wales Net uses shots off the low | `fix/prince-of-wales-net-strokes` | ✅ Merged |
| Schedule & Courses tab (tee times, muted completed rounds, handicap recap, CH/PH hidden on non-18) | `feat/schedule-courses-tab` | ✅ Merged — open check: past days still locked/dimmed? (day-level lock was removed in that branch) |
| Trip phase foundation | `fix/trip-phase-foundation` | ✅ Merged |
| Default screen routing, zone-aware | `feat/trip-phase-routing` | ✅ Merged |
| Home banner, option E (day dots, "Welcome to…", course names, "No rounds today") | `feat/home-banner` (+ `feat/home-banner-timeline`) | ✅ Merged |
| Default round selection | `feat/default-round-selection` | ✅ Merged |
| Test mode (dev override) | `feat/test-mode-scoring`, `feat/test-mode-profile-toggle` | ✅ Merged |
| Live banner team-name fix (fetch team1_id/team2_id; null → neutral label) | `fix/live-banner-team-ids` | ⏳ **Not merged** (1 commit, 14 behind main). Needs visual check before 9pm, then merge. |
| Team colors (red, blue, green, purple, amber, teal) | `feat/team-colors` | ⏳ **Not merged** (1 commit, 14 behind main). Open check: team-1 red vs scorecard over-par red. |

Routing rule: opens Score only if a round is live, the user is playing it, and it's underway for them (5 min past their tee or a score entered); otherwise Home. Spectators stay on Home with the live round pre-selected.

Default round rules: first round of the day = that round all day until live; 2nd+ round = last completed round until 1 hr before its tee, then the upcoming round; after last round = the round just finished; no-round day = last completed round, else first round of trip; before trip = first round; after trip = last round. User's manual pick always wins.

## Next up (in order unless Owen changes it)
1. **Remove members from a trip** — ✅ merged 2026-10-26 (`feat/roster-remove-replace`). Join test passed on preview. Decided 2026-10-23:
   - **Roster is set once the trip starts** (trip-local date, `isRosterLocked` in `scoring.js`). Before that, the commissioner can remove any player except themselves. Test mode unlocks it for Owen's test trips.
   - **Remove player** (only after tapping the edit pencil; bottom-right of the edit panel) → centered "Are you sure? This cannot be undone." → the player becomes an empty **Player TBD** card (sorted to the top of Players): keeps pairings and tee picks; team set to Unassigned; name, handicap, contact, account link, captain flag and flight wiped.
   - **Replacing** = commissioner fills the empty spot with the normal edit form; on save a pop-up shows the invite link with a Copy button; the existing email → phone → name matching in `JoinTrip.jsx` claims it. An empty spot can't be matched by mistake.
   - The removed person's group membership is dropped (only if they have no other trip in that group), so the trip leaves their list.
   - All writes go through `src/lib/roster.js`. Invite matching lives in `src/lib/inviteMatch.js` (unit-tested).
2. **Daily Leaders (was Daily MVPs)** — ✅ merged 2026-10-26 (`feat/daily-leaders`). Decided 2026-10-26:
   - Renamed to **Daily Leaders**. One page per trip day with a completed tournament round; swipe left/right like Weather (shared `useSwipePager`). Opens on the newest day; stays after the trip so every day can be reviewed.
   - Rows: Most Points · Best Net · Most Birdies (Gross, Net) · Most Pars (Gross, Net) · Worst Round (Gross, Net) · Most Drinks. Ties show every name.
   - Follow-up `fix/daily-leaders-ties-practice` — ✅ merged 2026-10-26: no initials circles; tied winners stack one full name per line with a "Tied" / "N-way tie" note; empty categories say "None". **Practice rounds now count** (header says "Practice" or "incl. practice"); Most Points stays tournament-only. Best Net now comes from `computePlayerStats` net vs par (same off-low strokes as before, so tournament days are unchanged — unit-tested).
   - Math: `src/lib/dailyLeaders.js`, reusing `computePlayerStats` (moved from StatsTab into `src/lib/playerStats.js`, shared with the Stats tab), `analyzeScoring`, `matchPlayPointsByPlayer`. No clock/time-zone logic: days come from round dates.
   - Known gap: a day only appears once a round has 18 holes scored (shared completeness check), so a Dozen-only day won't show. Tied to the deferred 18-hole completeness item.
3. **Landing page when a user has no current trip.** Tentative: past and upcoming trips if any, else "create or join a trip".

## Backlog
- **Stats tab redesign — gross and net side by side** — ✅ merged 2026-10-27 (`fix/daily-leaders-first-names`, with Daily Leaders first names + bolder names). Ranks are competition-style (ties share a rank). Card titles match Daily Leaders exactly (2026-10-27, replaced the brief "style 2" stripe): light navy bar #EEF2F7, 15px bold title in green/red/gold. Stats cards get a 1px #D5DEE8 border so the bar reads against the grey page. Top 3 hides players at 0 (shows "None" if nobody); See all still lists everyone. Also fixed: See all / drink +/- taps were swallowed by the swipe carousel (bug was live on main). Short names via shared `src/lib/playerNames.js`, ranks via `src/lib/statRanks.js`. Decided 2026-10-27: Daily Leaders styling (light blue title bar, green/red/gold titles). Each gross/net stat is one wide tile with a top 3 for Gross and a top 3 for Net; the page-level Gross/Net toggle goes away. Non-gross/net stats (Points Won, Points Defended, Fire, Drinks) keep one top-3 list. Link reads "See all ›" (no count — already live on `fix/daily-leaders-first-names`). "See all" opens one table of every player with Gross and Net columns (value + small rank), tap a column header to sort, **the viewer's own row highlighted**, scrolls for up to ~16 players. Option to add later: a player picker ("Everyone" / a name) showing that player's rank on every tile.
- **Points Defended** — ✅ merged 2026-10-26 (`feat/points-defended`): `pointsDefendedByPlayer` in `scoring.js` (shares `matchPairingOutcomes` with points), Stats tab tile (Scoring tab, next to Points Won) + Daily Leaders row under Most Points. Same branch also redesigns the Daily Leaders card as tiles: full-width Most Points and Points Defended (same big number, no "pts"), Gross | Net split tiles for Best Score (best single 18-hole round that day), Most Birdies, Most Pars, Most Bogeys, Most Doubles or Worse, Worst Round, then full-width Most Drinks (no emoji). Tile titles sit on a light navy bar (#EEF2F7) and are larger, sentence case and colour-coded: green for good stats, red for bogeys / doubles or worse / worst round, gold for drinks. Winners show first names only, comma-separated when tied (last initial added only when two trip players share a first name); empty shows None. Definition (added 2026-10-26): a hole where your team **halves** the other team only because of your net score — you're your side's sole best net and your partner scored worse, so without you the other team would have won the point. Not counted when both partners tie for the side's best (nobody saved it alone) or when your team wins the hole outright (that's already a point). Tournament rounds only, same off-the-low strokes as the scorecard. Build it in `scoring.js` next to `matchHoleOutcomes` / `matchPlayPointsByPlayer` so the Stats tab, Daily Leaders and anything else read one function. Likely homes: a Stats tile and a Daily Leaders row.
- **Badges** (added 2026-10-26; **on hold — Owen will define the badges later. Don't build yet; when he asks about badges, remind him of the open questions below**): achievements players earn (e.g. first birdie, hat-trick of birdies, fire streak, most drinks, points defended). Questions before building: which badges and their exact rules; trip-only or lifetime across trips; where they show (player card, Stats, Daily Leaders, a pop-up/chat shout-out when earned); earned once or count repeats; computed live from scores (no new tables) vs. stored. Rules must come from the shared stat functions, not new copies.
- **Mid-trip substitutes** (future): allow replacing an injured/absent player after the trip starts. Today the roster is locked once the trip starts; a mid-trip sub needs rules for the old player's posted scores, points and purse.
- Leaderboard side by side.
- Offline score caching when the user has no service.
- Build out stats; add historical stats.
- Game types: Stableford; stroke play; no-teams (individual only). One shared format setting, not copies per format × team/individual.
- Decide Prince of Wales default view (Net or Gross).
- Live banner hides after 9pm: find the rule, whose clock it uses, and make it follow the trip time zone. Its round-selection memo differs from `getTripPhase`; unifying them is a separate, deliberate decision.
- Home 18-hole completeness issue (deliberately deferred).

## Housekeeping / deferred
- Delete stale branches once Owen approves the list. 46 remote branches are already merged into main (incl. `swipe-navigation`, which was merged then reverted in `d573cdd`).
- Deferred security items: M3, M4, L1, L2, H3, H2 (email confirmation).
- `sb_secret_` key compatibility for chat-notify and feedback-notify.
- Lint debt in `TripDashboard.jsx`.

## Cancelled
- App-wide swipe navigation (merged as `36bf873`, reverted in `d573cdd`; not in the code).
