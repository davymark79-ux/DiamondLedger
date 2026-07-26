// The Ledger Cup — in-season-tournament.md (v0.6). "The Ledger Cup" build
// arc, Phase 3 (Group Stage half only — see baseball-sim/CLAUDE.md's
// Phase 3 section for why the Knockout Bracket is a deferred follow-up,
// Phase 3b). Group draw + group-stage scheduling + advancement, and the
// orchestrator that threads Cup weekends into a season's own regular-season
// simulation in TRUE chronological order — the real problem
// engine/calendar.js's Phase 1 header flagged and deliberately left
// unsolved: injuries, fatigue, and hot/cold streaks all need to keep
// evolving continuously across regular-season AND Cup games, not reset by
// a second, independent simulation pass.
//
// Built on engine/season.js's new createSeasonState/simulateGamesIntoState
// split (Phase 3's own prerequisite refactor) — a single season-long state
// object gets games played into it across multiple calls: the regular
// season's own open weeks, and (when a group stage is active this season)
// the 3 H2 blackout weekends reserved for it.

import { createSeasonState, simulateGamesIntoState, buildGroupSchedule, TARGET_GAMES_PER_TEAM } from './season.js';
import { buildCalendarSeasonSchedule } from './calendar.js';
import { QUOTIENT_CENTER } from './tournamentQuotient.js';
import { TIERS, LEAGUE_IDS } from '../models/constants.js';

// 3 round-robin weekends per in-season-tournament.md ("each team plays each
// groupmate 3 times total — 12 group-stage games per team"), front-loaded
// into H2 per season-calendar.md — matches engine/calendar.js's own header
// comment naming {4, 3} as the real blackout counts this phase would pass.
export const GROUP_STAGE_WEEKENDS = 3;
export const GROUP_SIZE = 5;
export const GROUP_STAGE_GAMES_PER_TEAM = GROUP_STAGE_WEEKENDS * (GROUP_SIZE - 1); // 12, one full round-robin cycle per weekend
const GROUP_COUNT = 10; // 3 MLB1 + 2 MLB2 per group x 10 groups = 30 + 20 = 50, matches the real league exactly

function shuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function byQuotientDesc(quotientByTeamId) {
  return (a, b) => (quotientByTeamId.get(b.id) ?? QUOTIENT_CENTER) - (quotientByTeamId.get(a.id) ?? QUOTIENT_CENTER);
}

// MLB1's 3 group slots only need "not all 3 the same league" (>=1 Foundry
// AND >=1 Exchange) — a much looser constraint than MLB2's exact 1-1 split
// below, so a straightforward randomized-assign-then-validate-then-retry is
// the right tool here: small, fixed problem size (30 teams, 10 groups),
// same "no fancy CS optimization needed" style already used elsewhere in
// this codebase (e.g. the anti-tanking elimination detector's replay
// approach). The 3 Quotient pots (top 10 / mid 10 / bottom 10 across BOTH
// leagues) stay fixed across every retry — only which pot member lands in
// which of the 10 groups gets reshuffled — so a retry never disturbs the
// real "Champions League-style" strength balancing the pots exist for.
function buildMlb1GroupSlots(mlb1Teams, quotientByTeamId, rng, maxAttempts = 2000) {
  const sorted = [...mlb1Teams].sort(byQuotientDesc(quotientByTeamId));
  const pots = [sorted.slice(0, 10), sorted.slice(10, 20), sorted.slice(20, 30)];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffledPots = pots.map((pot) => shuffle(pot, rng));
    const slots = Array.from({ length: GROUP_COUNT }, (_, i) => shuffledPots.map((pot) => pot[i]));
    const valid = slots.every((slot) => {
      const leagues = new Set(slot.map((t) => t.leagueId));
      return leagues.size > 1; // rules out an all-Foundry or all-Exchange 3-0 split
    });
    if (valid) return slots;
  }
  throw new Error(`drawCupGroups: could not satisfy the MLB1 league-balance constraint after ${maxAttempts} attempts`);
}

// MLB2's 2 group slots need EXACTLY 1 Foundry + 1 Exchange per group — a
// strict constraint a naive global-Quotient top-10/bottom-10 split can't
// even guarantee is satisfiable (it depends on how many of each league
// land in each half, which Quotient rank alone doesn't control). Built
// correct BY CONSTRUCTION instead, still Quotient-informed: rank each
// league's 10 teams separately, split each into a top-5/bottom-5 pot, then
// pair every top-half Foundry team with a bottom-half Exchange team (and
// every top-half Exchange team with a bottom-half Foundry team) — every
// resulting group gets exactly one of each league, with zero retries and
// zero chance of failure, unlike MLB1's looser retry-based approach above.
function buildMlb2GroupSlots(mlb2Teams, quotientByTeamId, rng) {
  const foundry = [...mlb2Teams].filter((t) => t.leagueId === LEAGUE_IDS.FOUNDRY).sort(byQuotientDesc(quotientByTeamId));
  const exchange = [...mlb2Teams].filter((t) => t.leagueId === LEAGUE_IDS.EXCHANGE).sort(byQuotientDesc(quotientByTeamId));

  // Each pot shuffled exactly ONCE, then zipped by index — shuffling
  // inside the .map callback below would re-shuffle per element instead of
  // once per pot, scrambling the index-based 1:1 pairing into duplicates.
  const topFoundry = shuffle(foundry.slice(0, 5), rng);
  const bottomFoundry = shuffle(foundry.slice(5), rng);
  const topExchange = shuffle(exchange.slice(0, 5), rng);
  const bottomExchange = shuffle(exchange.slice(5), rng);

  const pairA = topFoundry.map((f, i) => [f, bottomExchange[i]]);
  const pairB = topExchange.map((e, i) => [e, bottomFoundry[i]]);

  return shuffle([...pairA, ...pairB], rng);
}

/**
 * Champions-League-style Quotient pot draw into 10 groups of 5 (3 MLB1 + 2
 * MLB2), enforcing in-season-tournament.md's league-balance constraint —
 * see buildMlb1GroupSlots/buildMlb2GroupSlots above for how each tier's own
 * constraint is satisfied. Placeholder draw algorithm (this session's own,
 * same tuning status as every other unspecced pairing algorithm in this
 * codebase) — the doc specs the CONSTRAINTS, not the exact mechanics.
 * @param {object[]} teams - CURRENT (live tier/division-applied) teams, MLB1 + MLB2
 * @param {Map<string, number>} quotientByTeamId
 * @param {() => number} rng
 * @returns {{groups: string[][]}} exactly 10 groups of 5 team ids each
 */
export function drawCupGroups(teams, quotientByTeamId, rng) {
  const mlb1Teams = teams.filter((t) => t.tier === TIERS.MLB1);
  const mlb2Teams = teams.filter((t) => t.tier === TIERS.MLB2);
  if (mlb1Teams.length !== 30 || mlb2Teams.length !== 20) {
    throw new Error(`drawCupGroups: expected 30 MLB1 + 20 MLB2 teams, got ${mlb1Teams.length} + ${mlb2Teams.length}`);
  }

  const mlb1Slots = buildMlb1GroupSlots(mlb1Teams, quotientByTeamId, rng);
  const mlb2Slots = buildMlb2GroupSlots(mlb2Teams, quotientByTeamId, rng);

  const groups = Array.from({ length: GROUP_COUNT }, (_, i) => [...mlb1Slots[i], ...mlb2Slots[i]].map((t) => t.id));
  return { groups };
}

/**
 * Builds the 3 group-stage weekends' worth of games — reuses
 * engine/season.js's own buildGroupSchedule(group, 12, rng) directly per
 * group: a 5-team group's round-robin cycle is exactly 4 games
 * (gamesPerCycle = teams.length - 1), so 12 target games needs exactly 3
 * cycles with ZERO remainder — a confirmed clean fit already noted in the
 * arc's own roadmap. Cycle 1 -> weekend 1, cycle 2 -> weekend 2, cycle 3 ->
 * weekend 3: no new interleaving logic needed, just a slice of the
 * already-cycle-ordered array buildGroupSchedule returns.
 * @param {object[]} teams - CURRENT teams (for resolving group id arrays into team objects)
 * @param {string[][]} groups - from drawCupGroups
 * @param {() => number} rng
 * @returns {{weekends: {gameNumber: number, awayTeamId: string, homeTeamId: string}[][]}} exactly 3 weekends, each combining all 10 groups' games for that weekend
 */
export function buildCupGroupStageWeekends(teams, groups, rng) {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const weekends = Array.from({ length: GROUP_STAGE_WEEKENDS }, () => []);
  // buildGroupSchedule's own "cycle" is a full round-robin over EVERY pair
  // (C(5,2) = 10 games for a 5-team group) — not GROUP_SIZE - 1 (that's
  // games PER TEAM per cycle, the number buildGroupSchedule itself uses
  // internally to decide how many cycles to run, not the array chunk size
  // a single cycle actually occupies). Slicing by the wrong size here
  // silently desynced which games belonged to which weekend.
  const gamesPerWeekendPerGroup = (GROUP_SIZE * (GROUP_SIZE - 1)) / 2; // 10

  for (const groupIds of groups) {
    const groupTeams = groupIds.map((id) => teamsById.get(id));
    const groupGames = buildGroupSchedule(groupTeams, GROUP_STAGE_GAMES_PER_TEAM, rng);
    for (let weekend = 0; weekend < GROUP_STAGE_WEEKENDS; weekend++) {
      weekends[weekend].push(...groupGames.slice(weekend * gamesPerWeekendPerGroup, (weekend + 1) * gamesPerWeekendPerGroup));
    }
  }

  // A flat, per-weekend gameNumber (0-based within that weekend's own
  // batch) — Cup games never join the season's own canonical results log
  // (see simulateGamesIntoState's trackStandings option), so this only
  // needs to be internally consistent within simulateGamesIntoState's own
  // per-game injury sustainedGameNumber bookkeeping, not globally unique
  // against the regular season's own gameNumber sequence.
  return { weekends: weekends.map((weekend) => weekend.map((game, i) => ({ ...game, gameNumber: i }))) };
}

/**
 * Derives real Cup group standings purely from an already-complete flat
 * results array (same post-hoc-fold philosophy as
 * engine/tournamentQuotient.js's own folds) — every team that appears in
 * `cupGroupResults` gets an entry; a team that somehow never played (should
 * not happen given every group plays a full round-robin) simply has no key.
 * @param {{gameNumber: number, awayTeamId: string, homeTeamId: string, awayRuns: number, homeRuns: number}[]} cupGroupResults
 * @returns {Map<string, {wins: number, losses: number, runsFor: number, runsAgainst: number}>}
 */
export function buildCupGroupStandings(cupGroupResults) {
  const standingsById = new Map();
  function entryFor(teamId) {
    if (!standingsById.has(teamId)) standingsById.set(teamId, { wins: 0, losses: 0, runsFor: 0, runsAgainst: 0 });
    return standingsById.get(teamId);
  }
  for (const game of cupGroupResults) {
    const away = entryFor(game.awayTeamId);
    const home = entryFor(game.homeTeamId);
    away.runsFor += game.awayRuns;
    away.runsAgainst += game.homeRuns;
    home.runsFor += game.homeRuns;
    home.runsAgainst += game.awayRuns;
    if (game.awayRuns > game.homeRuns) {
      away.wins++;
      home.losses++;
    } else {
      home.wins++;
      away.losses++;
    }
  }
  return standingsById;
}

function winPct({ wins, losses }) {
  return wins + losses > 0 ? wins / (wins + losses) : 0;
}

// No tiebreaker is specced in in-season-tournament.md — same deterministic
// win% -> run differential -> team-id convention already established by
// engine/promotionRelegation.js/engine/playoffs.js for exactly this reason
// (this engine's rng-seeded determinism shouldn't depend on an unstable
// tiebreak).
function compareStanding(teamIdA, teamIdB, standingsById) {
  const a = standingsById.get(teamIdA);
  const b = standingsById.get(teamIdB);
  return (
    winPct(b) - winPct(a) ||
    (b.runsFor - b.runsAgainst) - (a.runsFor - a.runsAgainst) ||
    teamIdA.localeCompare(teamIdB)
  );
}

/**
 * Top 2 finishers in each of the 10 groups (20 teams) plus the 4 best
 * third-place finishers across all 10 groups (24 total) —
 * in-season-tournament.md's Advancement to Knockout rule. Reseeding those
 * 24 by tournament record for the actual bracket is Phase 3b's job, not
 * this function's — this only decides WHO advances.
 * @param {string[][]} groups - from drawCupGroups
 * @param {Map<string, {wins: number, losses: number, runsFor: number, runsAgainst: number}>} cupGroupStandingsById
 * @returns {{advancingTeamIds: string[]}} exactly 24 team ids
 */
export function computeCupAdvancement(groups, cupGroupStandingsById) {
  const advancingTeamIds = [];
  const thirdPlaceTeamIds = [];

  for (const groupIds of groups) {
    const ranked = [...groupIds].sort((a, b) => compareStanding(a, b, cupGroupStandingsById));
    advancingTeamIds.push(ranked[0], ranked[1]);
    thirdPlaceTeamIds.push(ranked[2]);
  }

  const bestThirds = [...thirdPlaceTeamIds].sort((a, b) => compareStanding(a, b, cupGroupStandingsById)).slice(0, 4);
  advancingTeamIds.push(...bestThirds);

  return { advancingTeamIds };
}

/**
 * The orchestrator: runs a full season's regular-season schedule AND (when
 * `cupGroups` is supplied) its 3 H2 group-stage weekends through the SAME
 * live season state, in true week order — the real fidelity requirement
 * this whole phase exists for. When `cupGroups` is null (no Quotient
 * history yet to draw from, or simply no Cup activity this season), this
 * degrades to running the exact same open-weeks-only path
 * engine/leagueProgression.js's simulateOneSeason runs today, at the same
 * rng seed — byte-identical, same proof technique Phase 1's calendar layer
 * used for its own no-op case.
 * @param {object[]} teams - CURRENT (live tier/division-applied) teams
 * @param {(teamId: string) => object} getTeamRoster
 * @param {(teamId: string) => object|null} getTeamManager
 * @param {() => number} rng
 * @param {{groups: string[][]}|null} cupGroups - from drawCupGroups, or null for no Cup activity this season
 * @param {number} [gamesPerSeason]
 * @returns {{schedule: object[], weekPlan: object, seasonResult: object, cupGroupResults: object[]|null}}
 *   cupGroupResults is the flat array of every Cup group-stage game played this season (null when cupGroups was
 *   null) — NOT included in seasonResult.results, so a caller folding it into Quotient must do so separately, at
 *   K_CONTEXT.CUP_GROUP_STAGE (see engine/tournamentQuotient.js's foldResultsArray).
 */
export function simulateSeasonWithCup(teams, getTeamRoster, getTeamManager, rng, cupGroups, gamesPerSeason = TARGET_GAMES_PER_TEAM) {
  const calendarOptions = cupGroups ? { secondHalfBlackoutWeeks: GROUP_STAGE_WEEKENDS } : {};
  const { schedule, weekPlan } = buildCalendarSeasonSchedule(teams, gamesPerSeason, rng, calendarOptions);
  const seasonState = createSeasonState(teams, getTeamManager);

  const cupWeekends = cupGroups ? buildCupGroupStageWeekends(teams, cupGroups.groups, rng).weekends : null;
  // A separate, LOCAL rotation counter for Cup games — matching
  // engine/playoffs.js's own established precedent (a team's regular
  // rotation cycle shouldn't be skewed by however many Cup games
  // interrupted it).
  const cupRotationIndexById = cupGroups ? new Map(teams.map((t) => [t.id, 0])) : null;
  const cupGroupResults = cupGroups ? [] : null;

  const scheduleByWeek = new Map();
  for (const game of schedule) {
    if (!scheduleByWeek.has(game.week)) scheduleByWeek.set(game.week, []);
    scheduleByWeek.get(game.week).push(game);
  }

  let cupWeekendIndex = 0;
  for (const week of weekPlan.weeks) {
    if (week.kind === 'BLACKOUT') {
      // Only the group stage exists this phase (Phase 3b adds knockout
      // blackout weeks in H1) — every blackout week reached here is one of
      // the 3 H2 group-stage weekends, in the same front-loaded order
      // buildSeasonWeekPlan already produces them in.
      const weekendGames = cupWeekends[cupWeekendIndex];
      cupWeekendIndex++;
      const batch = simulateGamesIntoState(seasonState, teams, getTeamRoster, weekendGames, rng, {
        trackStandings: false,
        trackManagerLifecycle: false,
        trackSeasonStats: false,
        rotationIndexById: cupRotationIndexById,
      });
      cupGroupResults.push(...batch);
    } else if (week.kind === 'OPEN') {
      const weekGames = scheduleByWeek.get(week.index) ?? [];
      simulateGamesIntoState(seasonState, teams, getTeamRoster, weekGames, rng);
    }
    // ALL_STAR weeks: nothing scheduled this phase (the single-game Final lands here in Phase 3b).
  }

  const seasonResult = {
    standingsById: seasonState.standingsById,
    injuryStatusById: seasonState.injuryStatusById,
    consecutiveGamesPlayedById: seasonState.consecutiveGamesPlayedById,
    streakStateById: seasonState.streakStateById,
    managerAssignmentById: seasonState.managerAssignmentById,
    firings: seasonState.firings,
    managerNameById: seasonState.managerNameById,
    seasonBattingStatsById: seasonState.seasonBattingStatsById,
    seasonPitchingStatsById: seasonState.seasonPitchingStatsById,
    results: seasonState.results,
  };

  return { schedule, weekPlan, seasonResult, cupGroupResults };
}
