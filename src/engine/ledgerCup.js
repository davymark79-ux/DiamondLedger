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
import { getExpansionTriggerWeekIndex } from './rosterExpansion.js';
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

// Knockout — Phase 3b. 4 rounds of best-of-3 (Play-In, Round of 16,
// Quarterfinal, Semifinal) plus a single-game Final, per
// in-season-tournament.md. Matches engine/calendar.js's own header comment
// naming {4, 3} as the real blackout counts this arc would eventually pass
// — 4 H1 blackout weeks for the 4 best-of-3 rounds, spread per
// buildSeasonWeekPlan's existing spreadEvenly (no changes needed there).
export const KNOCKOUT_GAMES_TO_WIN = 2; // best-of-3
export const FINAL_GAMES_TO_WIN = 1; // single game

// No tiebreaker is specced for reseeding either — reuses the exact same
// win% -> run differential -> team-id convention compareStanding already
// established for group-stage advancement.
export function reseedForKnockout(advancingTeamIds, cupGroupStandingsById) {
  return [...advancingTeamIds].sort((a, b) => compareStanding(a, b, cupGroupStandingsById));
}

/**
 * Builds the STATIC part of the bracket — seeds 1-8's byes and the 8
 * Play-In pairs (9v24, 10v23, ... 16v17, per in-season-tournament.md).
 * Doesn't resolve Round of 16/Quarterfinal/Semifinal/Final, since those
 * depend on winners not yet known — engine/ledgerCup.js's orchestrator
 * resolves those round-by-round as it plays them (see
 * simulateKnockoutRound/consecutivePairs below). Pure, no rng.
 * @param {string[]} seeds - exactly 24 team ids, index 0 = seed 1 (best) ... index 23 = seed 24, from reseedForKnockout
 * @returns {{seeds: string[], byes: {seed: number, teamId: string}[], playInPairs: {seedA: number, teamIdA: string, seedB: number, teamIdB: string}[]}}
 */
export function buildKnockoutBracket(seeds) {
  if (seeds.length !== 24) throw new Error(`buildKnockoutBracket: expected exactly 24 seeds, got ${seeds.length}`);
  const byes = seeds.slice(0, 8).map((teamId, i) => ({ seed: i + 1, teamId }));
  // Which bye seed a Play-In winner joins in Round of 16 isn't specced —
  // resolved as the natural 1:1 mapping: Play-In match k's winner (seed
  // 9+k or its opponent) plays bye seed k+1.
  const playInPairs = Array.from({ length: 8 }, (_, k) => ({
    seedA: 9 + k, teamIdA: seeds[8 + k],
    seedB: 24 - k, teamIdB: seeds[23 - k],
  }));
  return { seeds, byes, playInPairs };
}

// Lower seed NUMBER = higher seed = hosts every game of the series, per
// in-season-tournament.md's venue rule ("all games at the higher seed's
// home park... not split/alternating, unlike a typical MLB postseason
// format") — deliberately NOT engine/playoffs.js's alternating
// HOME_PATTERN_BY_GAMES_TO_WIN, a different, simpler rule this doc
// specifically calls out.
function seriesHomeAway(participantA, participantB) {
  return participantA.seed < participantB.seed
    ? { home: participantA, away: participantB }
    : { home: participantB, away: participantA };
}

/**
 * Plays one best-of-`gamesToWin` Cup series ONE GAME AT A TIME via
 * simulateGamesIntoState against the SHARED live season state — unlike
 * engine/playoffs.js's simulateBestOfSeries (architected for the
 * discardable, after-the-season-ends case, with its own local working
 * copies of injury/fatigue state that are thrown away once the series
 * ends), this threads injuries/fatigue/streaks into the SAME Maps the rest
 * of the season reads and writes, so they carry forward into whatever
 * regular-season week comes next — the same fidelity requirement
 * buildCupGroupStageWeekends' games already satisfy.
 * @param {object} seasonState
 * @param {object[]} teams
 * @param {(teamId: string) => object} getTeamRoster
 * @param {{seed: number, teamId: string}} participantA
 * @param {{seed: number, teamId: string}} participantB
 * @param {number} gamesToWin - KNOCKOUT_GAMES_TO_WIN (2) or FINAL_GAMES_TO_WIN (1)
 * @param {() => number} rng
 * @param {Map<string, number>} cupRotationIndexById
 * @returns {{homeTeamId: string, awayTeamId: string, gamesToWin: number, games: object[], winner: {seed: number, teamId: string}}}
 */
export function simulateCupSeriesIntoState(seasonState, teams, getTeamRoster, participantA, participantB, gamesToWin, rng, cupRotationIndexById, orgStrengthByTeamId = null) {
  const { home, away } = seriesHomeAway(participantA, participantB);
  let winsHome = 0;
  let winsAway = 0;
  const games = [];
  let gameIndex = 0;

  while (winsHome < gamesToWin && winsAway < gamesToWin) {
    const [game] = simulateGamesIntoState(
      seasonState, teams, getTeamRoster,
      [{ gameNumber: gameIndex, awayTeamId: away.teamId, homeTeamId: home.teamId }],
      rng,
      { trackStandings: false, trackManagerLifecycle: false, trackSeasonStats: false, rotationIndexById: cupRotationIndexById, orgStrengthByTeamId }
    );
    games.push(game);
    if (game.awayRuns > game.homeRuns) winsAway++;
    else winsHome++;
    gameIndex++;
  }

  return { homeTeamId: home.teamId, awayTeamId: away.teamId, gamesToWin, games, winner: winsHome >= gamesToWin ? home : away };
}

/**
 * Runs every series in one knockout round against the shared live state.
 * @param {object} seasonState
 * @param {object[]} teams
 * @param {(teamId: string) => object} getTeamRoster
 * @param {[{seed: number, teamId: string}, {seed: number, teamId: string}][]} pairs
 * @param {number} gamesToWin
 * @param {() => number} rng
 * @param {Map<string, number>} cupRotationIndexById
 * @returns {{series: object[], winners: {seed: number, teamId: string}[]}} winners preserve pairs' order — feed directly into the next round's consecutivePairs()
 */
export function simulateKnockoutRound(seasonState, teams, getTeamRoster, pairs, gamesToWin, rng, cupRotationIndexById, orgStrengthByTeamId = null) {
  const series = [];
  const winners = [];
  for (const [a, b] of pairs) {
    const result = simulateCupSeriesIntoState(seasonState, teams, getTeamRoster, a, b, gamesToWin, rng, cupRotationIndexById, orgStrengthByTeamId);
    series.push(result);
    winners.push(result.winner);
  }
  return { series, winners };
}

// QF/SF/Final pairing isn't specced beyond "fixed bracket, no reseeding" —
// resolved with the simplest structure that satisfies that literally: pair
// consecutive winners from the previous round (match1 vs match2, match3 vs
// match4, ...), same convention at every round including Round of 16 (see
// interleaveByesWithPlayInWinners below, which builds R16's own ordered
// input list so THIS same function produces bye-k-vs-PlayInWinner-k).
function consecutivePairs(participants) {
  const pairs = [];
  for (let i = 0; i < participants.length; i += 2) pairs.push([participants[i], participants[i + 1]]);
  return pairs;
}

// Interleaves [bye1, playInWinner1, bye2, playInWinner2, ...] so that
// consecutivePairs() on the result produces exactly (bye_k vs
// playInWinner_k) — the R16 pairing convention buildKnockoutBracket's own
// header already commits to.
function interleaveByesWithPlayInWinners(byes, playInWinners) {
  const participants = [];
  for (let i = 0; i < byes.length; i++) participants.push(byes[i], playInWinners[i]);
  return participants;
}

/**
 * The orchestrator: runs a full season's regular-season schedule AND (when
 * supplied) a Cup group stage (H2) and/or a pending knockout bracket (H1 +
 * the Final at the All-Star week) through the SAME live season state, in
 * true week order — the real fidelity requirement this whole phase exists
 * for. When both `cupGroups` and `cupKnockout` are null, this degrades to
 * running the exact same open-weeks-only path
 * engine/leagueProgression.js's simulateOneSeason runs today, at the same
 * rng seed — byte-identical, same proof technique Phase 1's calendar layer
 * used for its own no-op case.
 * @param {object[]} teams - CURRENT (live tier/division-applied) teams
 * @param {(teamId: string) => object} getTeamRoster
 * @param {(teamId: string) => object|null} getTeamManager
 * @param {() => number} rng
 * @param {{groups: string[][]}|null} cupGroups - from drawCupGroups, or null for no group stage this season
 * @param {{seeds: string[], byes: object[], playInPairs: object[]}|null} cupKnockout - from buildKnockoutBracket, or null for no pending knockout this season
 * @param {number} [gamesPerSeason]
 * @param {(teamId: string) => object|null} [getExpandedTeamRoster] - "50-man
 *   Roster System" arc, Phase 2. Same shape as getTeamRoster, but with the
 *   26-man Active Roster Expansion's +2 bench players already appended (see
 *   engine/rosterExpansion.js's buildExpansionBenchPlayers). Used instead of
 *   getTeamRoster for OPEN regular-season weeks from the expansion trigger
 *   week onward. Defaults to null (no expansion ever activates) — every
 *   existing caller unaffected.
 * @param {number|null} [expansionTriggerWeeksRemaining] - passed straight
 *   through to getExpansionTriggerWeekIndex; null means expansion never
 *   activates even if getExpandedTeamRoster is supplied.
 * @param {Map<string, Set<string>>} [taxiIdsByTeamId] - "50-man Roster
 *   System" arc, Phase 2. Passed through to simulateGamesIntoState's own
 *   option of the same name for every OPEN regular-season week (never for
 *   Cup group-stage/knockout games — Taxi Squad/expansion are regular-
 *   season-only mechanics, see commissioner-vision-and-roster-rules.md).
 *   Defaults to an empty Map (no-op).
 * @returns {{schedule: object[], weekPlan: object, seasonResult: object, cupGroupResults: object[]|null, cupKnockoutResult: object|null}}
 *   cupGroupResults/cupKnockoutResult's games are the flat/nested arrays of every Cup game played this season —
 *   NOT included in seasonResult.results, so a caller folding them into Quotient must do so separately (see
 *   engine/tournamentQuotient.js's foldResultsArray, at K_CONTEXT.CUP_GROUP_STAGE/CUP_KNOCKOUT respectively).
 */
export function simulateSeasonWithCup(
  teams,
  getTeamRoster,
  getTeamManager,
  rng,
  cupGroups,
  cupKnockout = null,
  gamesPerSeason = TARGET_GAMES_PER_TEAM,
  getExpandedTeamRoster = null,
  expansionTriggerWeeksRemaining = null,
  taxiIdsByTeamId = new Map(),
  orgStrengthByTeamId = null
) {
  const calendarOptions = {
    ...(cupKnockout ? { firstHalfBlackoutWeeks: 4 } : {}),
    ...(cupGroups ? { secondHalfBlackoutWeeks: GROUP_STAGE_WEEKENDS } : {}),
  };
  const { schedule, weekPlan } = buildCalendarSeasonSchedule(teams, gamesPerSeason, rng, calendarOptions);
  const seasonState = createSeasonState(teams, getTeamManager);

  // "50-man Roster System" arc, Phase 2 — null when expansionTriggerWeeksRemaining
  // isn't supplied, so `week.index >= expansionTriggerWeekIndex` below is
  // never true and getTeamRoster is always used, matching pre-Phase-2 behavior.
  const expansionTriggerWeekIndex =
    getExpandedTeamRoster && expansionTriggerWeeksRemaining != null
      ? getExpansionTriggerWeekIndex(weekPlan, expansionTriggerWeeksRemaining)
      : null;

  const cupWeekends = cupGroups ? buildCupGroupStageWeekends(teams, cupGroups.groups, rng).weekends : null;
  // Separate, LOCAL rotation counters for group-stage and knockout games —
  // matching engine/playoffs.js's own established precedent (a team's
  // regular rotation cycle shouldn't be skewed by however many Cup games
  // interrupted it). Kept distinct from each other too, since a team could
  // in principle be involved in both within the same season.
  const cupGroupRotationIndexById = cupGroups ? new Map(teams.map((t) => [t.id, 0])) : null;
  const cupKnockoutRotationIndexById = cupKnockout ? new Map(teams.map((t) => [t.id, 0])) : null;
  const cupGroupResults = cupGroups ? [] : null;

  // Knockout round-tracking state, carried across loop iterations as each
  // H1 blackout week resolves the next round and feeds its winners into
  // the following one — the real sequencing dependency Phase 1's header
  // flagged as unsolved ("knockout rounds depend on the previous round's
  // winners, a real sequencing dependency a single flat schedule array
  // can't express"). One dedicated variable per round — NOT reused across
  // rounds — so a later round's result can never silently clobber an
  // earlier round's already-recorded series.
  let playInResult = null;
  let roundOf16Result = null;
  let quarterfinalResult = null;
  let semifinalResult = null;
  let finalResult = null;

  const scheduleByWeek = new Map();
  for (const game of schedule) {
    if (!scheduleByWeek.has(game.week)) scheduleByWeek.set(game.week, []);
    scheduleByWeek.get(game.week).push(game);
  }

  let cupWeekendIndex = 0;
  let knockoutRoundIndex = 0; // 0=Play-In, 1=Round of 16, 2=Quarterfinal, 3=Semifinal

  for (const week of weekPlan.weeks) {
    if (week.kind === 'BLACKOUT' && week.half === 'H2') {
      // Every H2 blackout week is a group-stage weekend, in the same
      // front-loaded order buildSeasonWeekPlan already produces them in.
      const weekendGames = cupWeekends[cupWeekendIndex];
      cupWeekendIndex++;
      const batch = simulateGamesIntoState(seasonState, teams, getTeamRoster, weekendGames, rng, {
        trackStandings: false,
        trackManagerLifecycle: false,
        trackSeasonStats: false,
        rotationIndexById: cupGroupRotationIndexById,
        orgStrengthByTeamId,
      });
      cupGroupResults.push(...batch);
    } else if (week.kind === 'BLACKOUT' && week.half === 'H1') {
      // Every H1 blackout week resolves the NEXT pending knockout round,
      // in order — spread through H1 per buildSeasonWeekPlan's own
      // spreadEvenly, not necessarily evenly-spaced calendar days, but
      // always encountered in ascending week order here.
      if (knockoutRoundIndex === 0) {
        const pairs = cupKnockout.playInPairs.map((p) => [
          { seed: p.seedA, teamId: p.teamIdA },
          { seed: p.seedB, teamId: p.teamIdB },
        ]);
        playInResult = simulateKnockoutRound(seasonState, teams, getTeamRoster, pairs, KNOCKOUT_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById, orgStrengthByTeamId);
      } else if (knockoutRoundIndex === 1) {
        const participants = interleaveByesWithPlayInWinners(cupKnockout.byes, playInResult.winners);
        roundOf16Result = simulateKnockoutRound(seasonState, teams, getTeamRoster, consecutivePairs(participants), KNOCKOUT_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById, orgStrengthByTeamId);
      } else if (knockoutRoundIndex === 2) {
        quarterfinalResult = simulateKnockoutRound(seasonState, teams, getTeamRoster, consecutivePairs(roundOf16Result.winners), KNOCKOUT_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById, orgStrengthByTeamId);
      } else if (knockoutRoundIndex === 3) {
        semifinalResult = simulateKnockoutRound(seasonState, teams, getTeamRoster, consecutivePairs(quarterfinalResult.winners), KNOCKOUT_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById, orgStrengthByTeamId);
      }
      knockoutRoundIndex++;
    } else if (week.kind === 'ALL_STAR' && cupKnockout) {
      // The single-game Final, the day before the All-Star Game per
      // in-season-tournament.md.
      const [finalA, finalB] = semifinalResult.winners;
      const result = simulateKnockoutRound(seasonState, teams, getTeamRoster, [[finalA, finalB]], FINAL_GAMES_TO_WIN, rng, cupKnockoutRotationIndexById, orgStrengthByTeamId);
      finalResult = result.series[0];
    } else if (week.kind === 'OPEN') {
      const weekGames = scheduleByWeek.get(week.index) ?? [];
      // "50-man Roster System" arc, Phase 2 — 26-man Active Roster
      // Expansion only applies to real regular-season games (Cup group-
      // stage/knockout branches above never reach this branch), and only
      // once expansionTriggerWeekIndex is reached.
      const rosterFn = expansionTriggerWeekIndex != null && week.index >= expansionTriggerWeekIndex ? getExpandedTeamRoster : getTeamRoster;
      simulateGamesIntoState(seasonState, teams, rosterFn, weekGames, rng, { taxiIdsByTeamId, orgStrengthByTeamId });
    }
  }

  const cupKnockoutResult = cupKnockout
    ? {
        seeds: cupKnockout.seeds,
        playIn: playInResult.series,
        roundOf16: roundOf16Result.series,
        quarterfinal: quarterfinalResult.series,
        semifinal: semifinalResult.series,
        final: finalResult,
        championTeamId: finalResult?.winner.teamId ?? null,
      }
    : null;

  const seasonResult = {
    standingsById: seasonState.standingsById,
    injuryStatusById: seasonState.injuryStatusById,
    consecutiveGamesPlayedById: seasonState.consecutiveGamesPlayedById,
    // "50-man Roster System" arc, Phase 10 (engine/rehabAssignment.js) —
    // this is the return path data/season.js actually persists, so without
    // these three the rehab data would exist during simulation and then
    // silently vanish (exactly the `cupState` gap §33 had to fix).
    rustStatusById: seasonState.rustStatusById,
    rehabStintsStarted: seasonState.rehabStintsStarted,
    rehabActivations: seasonState.rehabActivations,
    streakStateById: seasonState.streakStateById,
    managerAssignmentById: seasonState.managerAssignmentById,
    firings: seasonState.firings,
    managerNameById: seasonState.managerNameById,
    seasonBattingStatsById: seasonState.seasonBattingStatsById,
    seasonPitchingStatsById: seasonState.seasonPitchingStatsById,
    results: seasonState.results,
  };

  return { schedule, weekPlan, seasonResult, cupGroupResults, cupKnockoutResult };
}
