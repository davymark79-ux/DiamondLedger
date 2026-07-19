// Season/schedule loop — builds a schedule of games between real teams and
// simulates all of them through the existing game engine, accumulating
// standings. Non-mutating, like the rest of this engine (growthModel.js's
// "returns a new object" convention) — callers own attaching results to
// whatever team data they're using.
//
// Schedule-generation algorithm and the games-per-team target aren't specced
// in the design docs (season-calendar.md gives the format — 150 games/team,
// no interleague regular season — not the pairing algorithm) — this is this
// session's own placeholder, same tuning status as everything else here. No
// division-weighted balancing (real MLB plays division rivals more) — that's
// future work.

import { simulateGame } from './game.js';
import { computePitcherDecisions } from './pitcherDecisions.js';
import { maybeEscalateInjury } from './injuries.js';
import { updateStreakState } from './hotColdStreaks.js';
import { rollRest } from './positionPlayerFatigue.js';
import { computeWinPct, updateOwnerPatience, rollFiring, HONEYMOON_PATIENCE, OWNER_PATIENCE_NEUTRAL } from './managerFiring.js';
import { createManager } from '../models/Manager.js';
import { generateManager } from '../models/generation/managerGenerator.js';
import { LEAGUES } from '../models/constants.js';

export const TARGET_GAMES_PER_TEAM = 150;

function shuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// The only grouping that ever plays itself — no interleague in the regular
// season (league-structure.md: "Foundry clubs play Foundry clubs, Exchange
// clubs play Exchange clubs, never each other"). Tier is included since
// MLB1/MLB2 obviously don't play each other either. Exported — engine/
// leagueProgression.js reuses this exact grouping to determine each
// season's pennant winner (best regular-season record per group).
export function groupTeamsForScheduling(teams) {
  const groups = new Map();
  for (const team of teams) {
    const key = `${team.tier}-${team.leagueId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(team);
  }
  return [...groups.values()];
}

// Repeats shuffled single-round-robin cycles (every team plays every other
// team in the group once per cycle, home/away flipped by cycle parity so it
// balances out over two cycles) until every team has at least
// targetGamesPerTeam games. For odd cycle counts against a group size that
// doesn't divide evenly into the target, some teams end up with a handful
// more than the target (up to groupSize - 2) — an accepted approximation,
// not engineered away (see validate-season.mjs, which checks for exactly
// this tolerance rather than an exact count).
function buildGroupSchedule(teams, targetGamesPerTeam, rng) {
  const pairs = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push([teams[i].id, teams[j].id]);
    }
  }
  if (pairs.length === 0) return [];

  const gamesPerCycle = teams.length - 1;
  const cyclesNeeded = Math.ceil(targetGamesPerTeam / gamesPerCycle);

  const games = [];
  for (let cycle = 0; cycle < cyclesNeeded; cycle++) {
    const homeFirst = cycle % 2 === 0;
    for (const [a, b] of shuffle(pairs, rng)) {
      games.push({ awayTeamId: homeFirst ? b : a, homeTeamId: homeFirst ? a : b });
    }
  }
  return games;
}

// Merges several per-group schedules into one chronological-feeling
// sequence (round-robin by index across groups) — purely cosmetic, since
// groups don't share teams and don't interact mechanically either way. No
// real calendar/date model here, just a nicer display order.
function interleave(lists) {
  const merged = [];
  const maxLength = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < maxLength; i++) {
    for (const list of lists) {
      if (list[i]) merged.push(list[i]);
    }
  }
  return merged;
}

/**
 * @param {object[]} teams - from realLeague.js
 * @param {number} targetGamesPerTeam
 * @param {() => number} rng
 * @returns {{gameNumber: number, awayTeamId: string, homeTeamId: string}[]}
 */
export function buildSeasonSchedule(teams, targetGamesPerTeam, rng) {
  const groups = groupTeamsForScheduling(teams);
  const perGroupSchedules = groups.map((group) => buildGroupSchedule(group, targetGamesPerTeam, rng));
  return interleave(perGroupSchedules).map((game, i) => ({ ...game, gameNumber: i }));
}

// Foundry (no DH) games bat the day's starting pitcher instead of a
// dedicated DH; Exchange (DH) games use the roster's lineup as-is.
// getTeamRoster() always builds a DH slot regardless of league (a known,
// explicitly-deferred simplification from the roster-construction session)
// — this is the first place that distinction actually matters, since games
// now count. Also the "who's actually a position player in this game"
// filter position-player fatigue needs (see advanceFatigueForTeam) — a
// Foundry team's DH-slot player doesn't play that game at all, which reads
// as a rest, not an appearance.
function positionPlayersInGame(roster, dhRule) {
  return dhRule ? roster.lineup : roster.lineup.filter((player) => player.primaryPosition !== 'DH');
}

function buildGameSide(roster, startingPitcher, dhRule, consecutiveGamesPlayedById, managerProfile, streakStateById) {
  const fieldPlayers = positionPlayersInGame(roster, dhRule);
  const lineup = dhRule ? fieldPlayers : [...fieldPlayers, startingPitcher];
  // dhRule/managerProfile/streakStateById all ride along on the side object
  // too — engine/game.js's per-PA decision hooks (bunting's Foundry bonus,
  // managers.md's sliders, the streak-aware pinch-hit factor) need to know
  // which league/manager/recent-form a side carries, same "attach it to the
  // side object" pattern already established for consecutiveGamesPlayedById.
  return { lineup, startingPitcher, bullpen: roster.bullpen, bench: roster.bench, consecutiveGamesPlayedById, dhRule, managerProfile, streakStateById };
}

function isAvailable(player, injuryStatusById) {
  const injury = injuryStatusById.get(player.id);
  return !injury || injury.gamesRemaining <= 0;
}

// injuries.md, cross-game persistence half: getTeamRoster() always returns
// the full, healthy 26 — this filters out anyone currently hurt
// (injuryStatusById, this loop's own accumulator, see simulateSeason)
// before a game gets built, promoting an available bench player into an
// injured lineup slot the same way an in-game emergency substitution would.
// If there's truly nobody left to promote (bench already exhausted, or the
// entire rotation/bullpen out at once), that player plays anyway — the
// same graceful-degradation fallback game.js already accepts everywhere
// else a substitution pool runs dry, not a new special case.
export function resolveAvailableRoster(roster, injuryStatusById) {
  const availableBench = roster.bench.filter((player) => isAvailable(player, injuryStatusById));
  const usedBenchIds = new Set();

  function replaceIfInjured(player) {
    if (isAvailable(player, injuryStatusById)) return player;
    const replacement = availableBench.find((candidate) => !usedBenchIds.has(candidate.id));
    if (!replacement) return player; // nobody left to promote — plays through it
    usedBenchIds.add(replacement.id);
    return replacement;
  }

  const lineup = roster.lineup.map(replaceIfInjured);
  const availableRotation = roster.rotation.filter((player) => isAvailable(player, injuryStatusById));
  const availableBullpen = roster.bullpen.filter((player) => isAvailable(player, injuryStatusById));

  return {
    lineup,
    // Falls back to the full (unfiltered) rotation in the vanishingly rare
    // case every starter is hurt at once — an empty array would break the
    // `rotation[index % rotation.length]` cycling math outright.
    rotation: availableRotation.length > 0 ? availableRotation : roster.rotation,
    bullpen: availableBullpen,
    bench: availableBench.filter((player) => !usedBenchIds.has(player.id)),
  };
}

// Auto-rest (managers.md's Analytics vs. Feel slider, positionPlayerFatigue.js's
// rollRest) — a structural twin of resolveAvailableRoster above, applied
// after it (injuries are mandatory; rest is a voluntary managerial choice
// layered on top of an already-injury-resolved lineup). Same "first unused
// bench player in array order" simplification resolveAvailableRoster's own
// replaceIfInjured already uses — no position-eligibility check exists there
// today either, so this doesn't introduce a new inconsistency. Pitchers
// aren't touched (rotation/bullpen pass through unchanged) — this mechanic
// is position-player-only, per positionPlayerFatigue.js's own header.
export function resolveRestedRoster(roster, consecutiveGamesPlayedById, managerProfile = createManager(), rng) {
  const usedBenchIds = new Set();

  function restIfFatigued(player) {
    const consecutiveGamesPlayed = consecutiveGamesPlayedById.get(player.id) ?? 0;
    if (!rollRest(consecutiveGamesPlayed, managerProfile.sliders.analyticsVsFeel, rng)) return player;
    const replacement = roster.bench.find((candidate) => !usedBenchIds.has(candidate.id));
    if (!replacement) return player; // nobody left on the bench — plays through it, same fallback as injuries
    usedBenchIds.add(replacement.id);
    return replacement;
  }

  const lineup = roster.lineup.map(restIfFatigued);

  return {
    lineup,
    rotation: roster.rotation,
    bullpen: roster.bullpen,
    bench: roster.bench.filter((player) => !usedBenchIds.has(player.id)),
  };
}

function teamPlayerIds(roster) {
  return [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench].map((player) => player.id);
}

// Called once per game a team plays, for each of that team's players
// currently on the shelf — the setback check (see engine/injuries.js) plus
// the countdown decrement. Deletes the entry once fully healed
// (gamesRemaining <= 0) so "available" can simply mean "absent from the
// map" everywhere else (isAvailable, resolveAvailableRoster).
function advanceInjuriesForTeam(roster, injuryStatusById, rng) {
  for (const playerId of teamPlayerIds(roster)) {
    const injury = injuryStatusById.get(playerId);
    if (!injury || injury.gamesRemaining <= 0) continue;
    const updated = maybeEscalateInjury(injury, rng);
    if (updated.gamesRemaining <= 0) injuryStatusById.delete(playerId);
    else injuryStatusById.set(playerId, updated);
  }
}

// Position-player fatigue (engine/positionPlayerFatigue.js) cross-game
// bookkeeping — called once per side, per game, after that game has already
// been simulated (must read the map's pre-increment value while the game
// itself was running, via consecutiveGamesPlayedById on the side object
// buildGameSide() passed in; incrementing before the game would double-count
// this game's own fatigue effect). `fullRoster` is the untrimmed 26-man (so
// bench players who didn't play are still visited to have their counters
// reset); `resolvedRoster` is this game's actual lineup after injury-based
// substitution. Pitchers are never touched by this map at all — their own,
// separate, heavier fatigue mechanic already exists (pitcherFatigue.js), and
// the rotation cycle itself is a built-in rest between starts.
//
// `injuryStatusById` is checked *after* the game (the caller folds this
// game's box.injuries into it before calling this) so a player hurt
// mid-game is force-reset immediately rather than lagging a game behind —
// `resolvedRoster` was computed pre-game and has no way to know he'd get
// hurt during it, so without this check he'd still read as "played" (and
// get incremented) for the very game he went down in.
function advanceFatigueForTeam(fullRoster, resolvedRoster, dhRule, consecutiveGamesPlayedById, injuryStatusById) {
  const playedIds = new Set(positionPlayersInGame(resolvedRoster, dhRule).map((player) => player.id));
  for (const player of [...fullRoster.lineup, ...fullRoster.bench]) {
    const injury = injuryStatusById.get(player.id);
    const currentlyInjured = injury && injury.gamesRemaining > 0;
    if (playedIds.has(player.id) && !currentlyInjured) {
      consecutiveGamesPlayedById.set(player.id, (consecutiveGamesPlayedById.get(player.id) ?? 0) + 1);
    } else {
      // Benched, injured (including newly hurt this same game), or
      // (Foundry) a DH-slot player who didn't play — all read as "rested"
      // for next time.
      consecutiveGamesPlayedById.delete(player.id);
    }
  }
}

// Season-total stat accumulation (awards-and-hall-of-fame.md's Hall case
// score needs career totals; this is the foundational layer — nothing in
// this engine had ever summed a single season's box-score lines before,
// let alone a career's). Reuses boxScore.js's own field names directly
// rather than inventing a parallel shape. `seasonBattingStatsById`/
// `seasonPitchingStatsById` are keyed by player id, folded once per game;
// engine/leagueProgression.js's simulateLeagueHistory is what rolls these
// up further into real career totals across multiple simulated seasons.
// Exported — engine/leagueProgression.js's career-stat folding reuses these
// exact field lists/shapes rather than redefining them a third time (season
// totals and career totals are structurally identical, just summed over
// more games).
export const BATTING_STAT_FIELDS = Object.freeze(['pa', 'ab', 'r', 'h', 'doubles', 'triples', 'hr', 'rbi', 'bb', 'hbp', 'k', 'gidp', 'sb', 'cs', 'sh']);
export const PITCHING_STAT_FIELDS = Object.freeze(['battersFaced', 'outsRecorded', 'pitches', 'h', 'r', 'er', 'bb', 'hbp', 'k', 'hr']);

export function emptySeasonBattingTotals() {
  const totals = { risp: { ab: 0, h: 0 } };
  for (const field of BATTING_STAT_FIELDS) totals[field] = 0;
  return totals;
}

export function emptySeasonPitchingTotals() {
  const totals = { wins: 0, losses: 0, saves: 0 };
  for (const field of PITCHING_STAT_FIELDS) totals[field] = 0;
  return totals;
}

function accumulateBattingStats(statsById, battingLines) {
  for (const line of battingLines) {
    if (line.pa <= 0) continue; // matches advanceStreakState's own "only visited players" gate
    const totals = statsById.get(line.player.id) ?? emptySeasonBattingTotals();
    for (const field of BATTING_STAT_FIELDS) totals[field] += line[field];
    totals.risp.ab += line.risp.ab;
    totals.risp.h += line.risp.h;
    statsById.set(line.player.id, totals);
  }
}

function accumulatePitchingStats(statsById, pitchingLines, decisions) {
  for (const line of pitchingLines) {
    const totals = statsById.get(line.player.id) ?? emptySeasonPitchingTotals();
    for (const field of PITCHING_STAT_FIELDS) totals[field] += line[field];
    if (decisions.winningPitcherId === line.player.id) totals.wins += 1;
    if (decisions.losingPitcherId === line.player.id) totals.losses += 1;
    if (decisions.savePitcherId === line.player.id) totals.saves += 1;
    statsById.set(line.player.id, totals);
  }
}

// Hot/Cold Streaks (engine/hotColdStreaks.js) cross-game bookkeeping —
// called once per game for every batting line with at least one PA
// (subs included, via their own partial-game line). `streakAccumulatorById`
// (each player's decaying {effectivePa, effectiveTotal} pair — not exposed
// externally, an internal working accumulator, same as rotationIndexById)
// feeds updateStreakState(), which returns both the updated accumulator
// and the latest streakState to persist in `streakStateById` — the one
// consumers read.
function advanceStreakState(battingLines, streakAccumulatorById, streakStateById) {
  for (const line of battingLines) {
    if (line.pa <= 0) continue;
    const gameLine = { pa: line.pa, h: line.h, doubles: line.doubles, triples: line.triples, hr: line.hr, bb: line.bb, hbp: line.hbp };
    const priorAccumulator = streakAccumulatorById.get(line.player.id);
    const { accumulator, streakState } = updateStreakState(priorAccumulator, gameLine, line.player);
    streakAccumulatorById.set(line.player.id, accumulator);
    streakStateById.set(line.player.id, streakState);
  }
}

// managers.md's Career Lifecycle — Firing & Rehiring (engine/managerFiring.js).
// Checked once per team per game, right after that game's standings update.
// Only active when the team has a REAL manager assigned — a team running on
// the neutral synthetic default (no real manager was ever supplied to
// simulateSeason via getTeamManager) is never fired/hired, and no tenure/
// patience is tracked for it either, matching today's exact behavior for
// every existing caller that doesn't pass getTeamManager (every validate
// script). Production (data/season.js) DOES pass a real getTeamManager for
// all 50 teams, so this is fully live there.
function maybeFireAndRehireManager(
  teamId,
  team,
  won,
  managerAssignmentById,
  tenureRecordById,
  ownerPatienceById,
  availableManagerPool,
  firings,
  gameNumber,
  rng
) {
  const currentManager = managerAssignmentById.get(teamId);
  if (!currentManager) return;

  // Tenure is under the CURRENT manager, not the team's whole season — a
  // new hire gets a clean evaluation window, not blamed for his
  // predecessor's record (see managerFiring.js's header).
  const tenure = tenureRecordById.get(teamId) ?? { wins: 0, losses: 0 };
  if (won) tenure.wins += 1;
  else tenure.losses += 1;
  tenureRecordById.set(teamId, tenure);

  const patience = updateOwnerPatience(ownerPatienceById.get(teamId) ?? OWNER_PATIENCE_NEUTRAL, won);
  ownerPatienceById.set(teamId, patience);

  const gamesUnderManager = tenure.wins + tenure.losses;
  const winPct = computeWinPct(tenure.wins, tenure.losses);
  if (!rollFiring(winPct, gamesUnderManager, patience, rng)) return;

  // Fired — the real "career ladder" managers.md wants: pull the next
  // available manager from the labor-market pool (another club's earlier
  // firing) before generating a brand-new one. currentManager is pushed
  // into the pool only AFTER this pick, so he can't rehire himself in the
  // same event.
  const hired = availableManagerPool.length > 0
    ? availableManagerPool.shift()
    : generateManager({ rng, leagueId: team.leagueId, overrides: { id: `${teamId}-hire-${gameNumber}`, teamId } });
  availableManagerPool.push({ ...currentManager, teamId: null });

  managerAssignmentById.set(teamId, { ...hired, teamId });
  tenureRecordById.set(teamId, { wins: 0, losses: 0 });
  ownerPatienceById.set(teamId, HONEYMOON_PATIENCE); // a real honeymoon for the new hire, not a blank slate

  firings.push({ gameNumber, teamId, firedManagerId: currentManager.id, hiredManagerId: hired.id, winPctAtFiring: winPct });
}

/**
 * @param {object[]} teams - from realLeague.js
 * @param {(teamId: string) => object} getTeamRoster - from realLeague.js
 * @param {object[]} schedule - from buildSeasonSchedule()
 * @param {() => number} rng
 * @param {(teamId: string) => object|null} [getTeamManager] - from realLeague.js's
 *   getTeamManager; defaults to no manager (createSide's own neutral-synthetic-manager
 *   default applies), so existing callers that don't pass this see identical behavior,
 *   including no Firing/Rehiring activity at all (see maybeFireAndRehireManager above).
 * @returns {{
 *   standingsById: Map<string, {wins: number, losses: number}>,
 *   injuryStatusById: Map<string, {type: string, severity: string, gamesRemaining: number, sustainedGameNumber: number}>,
 *   consecutiveGamesPlayedById: Map<string, number>,
 *   streakStateById: Map<string, {baselineCompositeValue: number, recentCompositeValue: number|null, standardDeviationsFromBaseline: number, tier: string}>,
 *   managerAssignmentById: Map<string, object|null> - the CURRENT manager per team, post any in-season firings/rehires,
 *   firings: {gameNumber: number, teamId: string, firedManagerId: string, hiredManagerId: string, winPctAtFiring: number}[],
 *   seasonBattingStatsById: Map<string, object> - summed boxScore.js battingLine fields across every game this player batted in,
 *   seasonPitchingStatsById: Map<string, object> - summed pitchingLine fields plus wins/losses/saves across every game this pitcher appeared in,
 *   results: {gameNumber: number, awayTeamId: string, homeTeamId: string, awayRuns: number, homeRuns: number,
 *     winningPitcherId: string|null, losingPitcherId: string|null, savePitcherId: string|null, innings: number}[]
 * }}
 */
export function simulateSeason(teams, getTeamRoster, schedule, rng, getTeamManager = () => null) {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const standingsById = new Map(teams.map((team) => [team.id, { wins: 0, losses: 0 }]));
  const rotationIndexById = new Map(teams.map((team) => [team.id, 0]));
  const injuryStatusById = new Map();
  const consecutiveGamesPlayedById = new Map();
  const streakAccumulatorById = new Map();
  const streakStateById = new Map();
  const seasonBattingStatsById = new Map();
  const seasonPitchingStatsById = new Map();
  const results = [];

  // Pre-seeded once — the ONLY thing every per-game manager lookup reads
  // from here on (not getTeamManager directly), since a firing can change
  // a team's assignment mid-loop. Stays null for a team getTeamManager
  // never supplied one for (see maybeFireAndRehireManager above).
  const managerAssignmentById = new Map(teams.map((team) => [team.id, getTeamManager(team.id) ?? null]));
  const tenureRecordById = new Map();
  const ownerPatienceById = new Map();
  const availableManagerPool = [];
  const firings = [];

  for (const game of schedule) {
    const awayTeam = teamsById.get(game.awayTeamId);
    const homeTeam = teamsById.get(game.homeTeamId);
    const dhRule = LEAGUES[awayTeam.leagueId].dhRule; // same league for both sides, guaranteed by grouping

    const awayFullRoster = getTeamRoster(game.awayTeamId);
    const homeFullRoster = getTeamRoster(game.homeTeamId);
    advanceInjuriesForTeam(awayFullRoster, injuryStatusById, rng);
    advanceInjuriesForTeam(homeFullRoster, injuryStatusById, rng);

    // `?? undefined` — a null manager (no real one assigned) must become
    // undefined, not null, to actually trigger buildGameSide/createSide's/
    // resolveRestedRoster's default-param neutral manager (destructuring
    // defaults only fire on undefined, not null).
    const awayManager = managerAssignmentById.get(game.awayTeamId) ?? undefined;
    const homeManager = managerAssignmentById.get(game.homeTeamId) ?? undefined;

    // Injuries first (mandatory), then auto-rest (a voluntary managerial
    // choice layered on top of the already-injury-resolved lineup) — see
    // resolveRestedRoster's own header.
    const awayInjuryResolved = resolveAvailableRoster(awayFullRoster, injuryStatusById);
    const homeInjuryResolved = resolveAvailableRoster(homeFullRoster, injuryStatusById);
    const awayRoster = resolveRestedRoster(awayInjuryResolved, consecutiveGamesPlayedById, awayManager, rng);
    const homeRoster = resolveRestedRoster(homeInjuryResolved, consecutiveGamesPlayedById, homeManager, rng);
    const awayStarter = awayRoster.rotation[rotationIndexById.get(game.awayTeamId) % awayRoster.rotation.length];
    const homeStarter = homeRoster.rotation[rotationIndexById.get(game.homeTeamId) % homeRoster.rotation.length];
    rotationIndexById.set(game.awayTeamId, rotationIndexById.get(game.awayTeamId) + 1);
    rotationIndexById.set(game.homeTeamId, rotationIndexById.get(game.homeTeamId) + 1);

    const box = simulateGame(
      {
        away: buildGameSide(awayRoster, awayStarter, dhRule, consecutiveGamesPlayedById, awayManager, streakStateById),
        home: buildGameSide(homeRoster, homeStarter, dhRule, consecutiveGamesPlayedById, homeManager, streakStateById),
      },
      { rng }
    );
    const decisions = computePitcherDecisions(box);

    for (const injury of box.injuries) {
      injuryStatusById.set(injury.playerId, {
        type: injury.type,
        severity: injury.severity,
        gamesRemaining: injury.gamesRemaining,
        sustainedGameNumber: game.gameNumber,
      });
    }

    advanceFatigueForTeam(awayFullRoster, awayRoster, dhRule, consecutiveGamesPlayedById, injuryStatusById);
    advanceFatigueForTeam(homeFullRoster, homeRoster, dhRule, consecutiveGamesPlayedById, injuryStatusById);

    advanceStreakState(box.away.battingLines, streakAccumulatorById, streakStateById);
    advanceStreakState(box.home.battingLines, streakAccumulatorById, streakStateById);

    accumulateBattingStats(seasonBattingStatsById, box.away.battingLines);
    accumulateBattingStats(seasonBattingStatsById, box.home.battingLines);
    accumulatePitchingStats(seasonPitchingStatsById, box.away.pitchingLines, decisions);
    accumulatePitchingStats(seasonPitchingStatsById, box.home.pitchingLines, decisions);

    const awayStanding = standingsById.get(game.awayTeamId);
    const homeStanding = standingsById.get(game.homeTeamId);
    const awayWon = box.away.runs > box.home.runs;
    if (awayWon) {
      awayStanding.wins++;
      homeStanding.losses++;
    } else {
      homeStanding.wins++;
      awayStanding.losses++;
    }

    maybeFireAndRehireManager(
      game.awayTeamId, awayTeam, awayWon,
      managerAssignmentById, tenureRecordById, ownerPatienceById, availableManagerPool, firings, game.gameNumber, rng
    );
    maybeFireAndRehireManager(
      game.homeTeamId, homeTeam, !awayWon,
      managerAssignmentById, tenureRecordById, ownerPatienceById, availableManagerPool, firings, game.gameNumber, rng
    );

    results.push({
      gameNumber: game.gameNumber,
      awayTeamId: game.awayTeamId,
      homeTeamId: game.homeTeamId,
      awayRuns: box.away.runs,
      homeRuns: box.home.runs,
      winningPitcherId: decisions.winningPitcherId,
      losingPitcherId: decisions.losingPitcherId,
      savePitcherId: decisions.savePitcherId,
      innings: box.innings,
    });
  }

  return {
    standingsById, injuryStatusById, consecutiveGamesPlayedById, streakStateById,
    managerAssignmentById, firings, seasonBattingStatsById, seasonPitchingStatsById, results,
  };
}
