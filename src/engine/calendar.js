// Week-Indexed Season Calendar — Phase 1 of "The Ledger Cup" build arc
// (baseball-sim/CLAUDE.md, diamond-ledger-design-docs/in-season-tournament.md).
// Gives the engine a real, still-abstract notion of "week" — matching
// season-calendar.md's own "structural sequence, not literal calendar
// dates" framing, NOT a literal date/day-of-week model. Just enough to (a)
// reserve genuine no-regular-season-games gaps in the schedule, additively,
// without touching the 150-game target, and (b) tag which half of the
// season a week falls in.
//
// Deliberately does NOT solve the Cup's hardest remaining problem: how
// knockout-round simulation (which depends on the previous round's
// winners — a real sequencing dependency a single flat `schedule` array
// can't express) threads live per-player state (rotation index, injury
// status, fatigue, streak) across a season with both regular-season AND
// Cup games happening in true order. `engine/season.js`'s `simulateSeason`
// owns those as INTERNAL Maps, not pre-seeded input/output params — so
// calling it multiple times per season (once per open-week block) would
// reset all of that state each time. Real, open design work for the Cup
// Engine phase, not attempted here — this phase is strictly the calendar
// substrate.
//
// Needs zero changes to engine/season.js: `buildSeasonSchedule` already
// produces a flat, ordered array of `{awayTeamId, homeTeamId, gameNumber}`
// objects with no week concept (its own `interleave()` comment: "No real
// calendar/date model here, just a nicer display order"). `simulateSeason`
// does one flat loop reading only `awayTeamId`/`homeTeamId`/`gameNumber` —
// it ignores unknown fields, so the `week` field this module stamps on
// needs no changes there either. All the real complexity lives in
// schedule CONSTRUCTION, already separate from simulation — this calendar
// layer sits on top as pure post-processing.

import { buildSeasonSchedule } from './season.js';

// Placeholder, needs real playtesting. Real MLB plays ~162 games over
// ~27 weeks (~6 games/week average); this project's 150-game season uses
// the same round number.
export const GAMES_PER_WEEK = 6;

// 14 open weeks/half * 6 games/week = 84 games/half capacity, 168 total —
// sized against buildGroupSchedule's own real worst-case overage: a
// 15-team group (MLB1 per league) needs ceil(150/14) = 11 cycles = 154
// games/team; a 10-team group (MLB2 per league) needs ceil(150/9) = 17
// cycles = 153 games/team. 168 comfortably covers the real 154-game worst
// case with slack to spare, so assignCalendarWeeks below never has to
// overflow past its planned open weeks in practice.
export const OPEN_WEEKS_PER_HALF = 14;

/**
 * Distributes `blackoutCount` items as evenly as possible among
 * `openCount` items, returning an `'OPEN'|'BLACKOUT'` sequence of length
 * `openCount + blackoutCount` — a standard even-distribution ("Euclidean
 * rhythm") algorithm, not a guess. Used for the 1st half's blackout weeks,
 * which season-calendar.md specs as "spread throughout the 1st half"
 * (unlike the 2nd half's, which are explicitly front-loaded instead —
 * see buildSeasonWeekPlan).
 */
function spreadEvenly(openCount, blackoutCount) {
  const total = openCount + blackoutCount;
  const sequence = [];
  let placed = 0;
  for (let i = 0; i < total; i++) {
    const shouldBeBlackout = blackoutCount > 0 && Math.floor((i + 1) * blackoutCount / total) > Math.floor(i * blackoutCount / total);
    if (shouldBeBlackout && placed < blackoutCount) {
      sequence.push('BLACKOUT');
      placed++;
    } else {
      sequence.push('OPEN');
    }
  }
  return sequence;
}

/**
 * Builds the full week sequence for one season: H1 open weeks with
 * `firstHalfBlackoutWeeks` spread evenly among them (season-calendar.md:
 * Cup knockout weekends are "spread throughout the 1st half"), one
 * All-Star week, then H2 open weeks with `secondHalfBlackoutWeeks`
 * front-loaded at the very start of H2 (season-calendar.md: Cup
 * group-stage weekends are explicitly "front-loaded early in the 2nd
 * half... not spread evenly or backloaded... playoff-bound clubs get a
 * clean stretch run without a competing tournament obligation right
 * before the games that matter most"). Blackout/ASB weeks are ADDED on
 * top of the fixed OPEN_WEEKS_PER_HALF count, never subtracted from it —
 * this is what keeps the 150-game target completely untouched by however
 * many blackout weeks a given season needs (0 today; the future Cup
 * Engine phase will pass real counts, e.g. {4, 3}, with zero further
 * changes needed here).
 * @param {object} [options]
 * @param {number} [options.firstHalfBlackoutWeeks] - default 0 (no Cup yet)
 * @param {number} [options.secondHalfBlackoutWeeks] - default 0
 * @returns {{
 *   weeks: {index: number, half: 'H1'|'ASB'|'H2', kind: 'OPEN'|'BLACKOUT'|'ALL_STAR'}[],
 *   openWeekIndices: number[],
 *   firstHalfBlackoutWeekIndices: number[],
 *   secondHalfBlackoutWeekIndices: number[],
 *   allStarWeekIndex: number,
 * }}
 */
export function buildSeasonWeekPlan({ firstHalfBlackoutWeeks = 0, secondHalfBlackoutWeeks = 0 } = {}) {
  const weeks = [];
  const openWeekIndices = [];
  const firstHalfBlackoutWeekIndices = [];
  const secondHalfBlackoutWeekIndices = [];

  for (const kind of spreadEvenly(OPEN_WEEKS_PER_HALF, firstHalfBlackoutWeeks)) {
    const index = weeks.length;
    weeks.push({ index, half: 'H1', kind });
    if (kind === 'OPEN') openWeekIndices.push(index);
    else firstHalfBlackoutWeekIndices.push(index);
  }

  const allStarWeekIndex = weeks.length;
  weeks.push({ index: allStarWeekIndex, half: 'ASB', kind: 'ALL_STAR' });

  const h2Kinds = [
    ...Array(secondHalfBlackoutWeeks).fill('BLACKOUT'), // front-loaded, not spread
    ...Array(OPEN_WEEKS_PER_HALF).fill('OPEN'),
  ];
  for (const kind of h2Kinds) {
    const index = weeks.length;
    weeks.push({ index, half: 'H2', kind });
    if (kind === 'OPEN') openWeekIndices.push(index);
    else secondHalfBlackoutWeekIndices.push(index);
  }

  return { weeks, openWeekIndices, firstHalfBlackoutWeekIndices, secondHalfBlackoutWeekIndices, allStarWeekIndex };
}

/**
 * Stamps a `week` field (absolute index into weekPlan.weeks) onto every
 * game in an already-built, already-ordered schedule — pure post-
 * processing, never reorders or drops a game. Buckets games into open
 * weeks purely by their position in the already-ordered `schedule` array
 * (an equal share of the total games per open week), NOT by tracking
 * per-team capacity live.
 *
 * Two REAL bugs were caught and rejected before landing on this approach
 * (documented so they don't get rediscovered): (1) a single league-wide
 * pointer that advanced the moment ANY one team hit a per-week cap — this
 * wasted the other 49 teams' remaining capacity that week almost every
 * time, exhausting all 28 open weeks almost immediately and dumping
 * thousands of overflow games onto the last one; (2) a PER-TEAM pointer
 * that took the max of both teams' current pointers per game — this
 * still blew up, because `buildGroupSchedule`'s cycles are randomly
 * shuffled (not organized into real simultaneous "rounds" the way an
 * actual round-robin schedule-maker would), so an early unlucky pairing
 * that pushed one team's pointer ahead would cascade transitively through
 * every one of its future opponents across a fully-interconnected
 * round-robin group, repeated over 11+ cycles — a real scheduling
 * problem (graph edge-coloring / round assignment) that's out of scope
 * for this phase's "lightweight, not-literal calendar" goal (see file
 * header). Position-based bucketing sidesteps the whole problem: it can
 * never overflow (every game gets *some* open week, by construction), and
 * since `interleave()` already spreads different groups'/teams' games
 * fairly evenly across the array for "nicer display order," a team's own
 * games land at a roughly even pace across the season's open weeks in
 * practice, without needing a hard per-team-per-week guarantee.
 * @param {{gameNumber: number, awayTeamId: string, homeTeamId: string}[]} schedule
 * @param {ReturnType<typeof buildSeasonWeekPlan>} weekPlan
 * @returns {object[]} same shape as schedule, each entry plus `week`
 */
export function assignCalendarWeeks(schedule, weekPlan) {
  const openWeeks = weekPlan.openWeekIndices;
  const gamesPerOpenWeek = Math.max(1, Math.ceil(schedule.length / openWeeks.length));
  return schedule.map((game, i) => ({
    ...game,
    week: openWeeks[Math.min(Math.floor(i / gamesPerOpenWeek), openWeeks.length - 1)],
  }));
}

/**
 * Composes buildSeasonSchedule (season.js, completely UNCHANGED) with the
 * two functions above — the new top-level entry point
 * engine/leagueProgression.js's simulateOneSeason calls instead of
 * buildSeasonSchedule directly.
 * @param {object[]} teams
 * @param {number} targetGamesPerTeam
 * @param {() => number} rng
 * @param {object} [calendarOptions] - see buildSeasonWeekPlan
 * @returns {{schedule: object[], weekPlan: object}}
 */
export function buildCalendarSeasonSchedule(teams, targetGamesPerTeam, rng, calendarOptions = {}) {
  const schedule = buildSeasonSchedule(teams, targetGamesPerTeam, rng);
  const weekPlan = buildSeasonWeekPlan(calendarOptions);
  return { schedule: assignCalendarWeeks(schedule, weekPlan), weekPlan };
}
