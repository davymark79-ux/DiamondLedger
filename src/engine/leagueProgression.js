// Season-to-season league progression — the real driver
// awards-and-hall-of-fame.md's Hall of Fame mechanics need ("once players
// actually exist and accumulate history"). Composes three previously
// real-but-completely-uncalled mechanics for the first time anywhere in
// this codebase: growthModel.js/development.js (growth + position
// reassignment + refusal reaction) and engine/retirement.js (player and
// manager retirement).
//
// Not wired into the live app — see baseball-sim/CLAUDE.md's Hall of Fame
// section for why (data/realLeague.js/data/season.js are fixed, eager,
// computed-once singletons; a real interactive "advance season" feature
// needs shared app state this app doesn't have, a distinct undertaking).
// This is a real, general-purpose, validated engine capability — a
// precomputed snapshot script is what actually drives the live Hall of
// Fame page, not this module directly at app-load time.
//
// Age comes entirely from the birthdate/asOfDate math every generation
// function already uses — advanceOffseason just moves asOfDate forward one
// year per season and lets advanceDevelopmentPeriod/rollRetirement/
// rollManagerRetirement derive age themselves, exactly as they already do
// for a single point-in-time call. No new age-tracking concept invented.
//
// Roster/manager replenishment simplification, flagged directly: a
// retiree is replaced via generateEstablishedPlayer/generateManager at the
// team's full tier quality band (rosterSeed.js's ROSTER_QUALITY_BY_TIER),
// not distinguishing the original slot's core-vs-depth discount
// (rosterSeed.js's DEPTH_QUALITY_DISCOUNT is module-private and inferring
// "was this a depth slot" from roster array position is fragile) — an
// explicit, acceptable simplification given this module's real focus is
// career-history accumulation, not perfectly reproducing initial-roster-
// construction nuance at every future replacement.
//
// Manager career-record attribution simplification, also flagged: a team's
// full-season win/loss record is credited to whichever manager is
// CURRENTLY assigned to that team at season's end (see engine/
// managerFiring.js's in-season Firing & Rehiring) — a manager fired
// mid-season doesn't retroactively lose credit for games he actually
// managed, and his successor gets the team's whole-season line rather than
// a precisely split one. Precisely attributing partial-season credit
// across manager changes is possible but not attempted here.
//
// "Championships" don't exist in this engine (no playoffs/promotion-
// relegation system) — pennants (best regular-season record per
// tier+league group, engine/season.js's groupTeamsForScheduling) are used
// as an explicit, flagged proxy wherever managers.md/awards-and-hall-of-
// fame.md call for championship credit.

import { buildSeasonSchedule, simulateSeason, groupTeamsForScheduling, BATTING_STAT_FIELDS, PITCHING_STAT_FIELDS, emptySeasonBattingTotals, emptySeasonPitchingTotals } from './season.js';
import { advanceDevelopmentPeriodWithReassignment } from './development.js';
import { rollRetirement, rollManagerRetirement } from './retirement.js';
import { rollWriterRetirement } from './writerRetirement.js';
import { generateEstablishedPlayer } from '../models/generation/playerGenerator.js';
import { generateManager } from '../models/generation/managerGenerator.js';
import { generateWriter } from '../models/generation/writerGenerator.js';
import { ROSTER_QUALITY_BY_TIER } from '../models/seed/rosterSeed.js';
import { TIERS } from '../models/constants.js';

function qualityRangeForTeam(team) {
  return ROSTER_QUALITY_BY_TIER[team.tier] ?? ROSTER_QUALITY_BY_TIER[TIERS.MLB2];
}

function advanceOnePlayer(player, team, roleStateById, rng, asOfDate) {
  const priorRoleState = roleStateById.get(player.id);
  const { player: grown, roleState } = advanceDevelopmentPeriodWithReassignment(player, priorRoleState, { rng, asOfDate });
  roleStateById.set(player.id, roleState);

  if (!rollRetirement(grown, rng, { asOfDate })) {
    return { player: grown, retiredPlayerId: null };
  }

  roleStateById.delete(player.id);
  const replacement = generateEstablishedPlayer({
    rng,
    position: grown.primaryPosition,
    qualityRange: qualityRangeForTeam(team),
    asOfDate,
    overrides: { id: `${team.id}-r${Math.floor(rng() * 1e9)}`, teamId: team.id },
  });
  return { player: replacement, retiredPlayerId: grown.id };
}

function advanceRosterForTeam(roster, team, roleStateById, rng, asOfDate) {
  const retiredPlayerIds = [];
  function advanceGroup(players) {
    return players.map((player) => {
      const result = advanceOnePlayer(player, team, roleStateById, rng, asOfDate);
      if (result.retiredPlayerId) retiredPlayerIds.push(result.retiredPlayerId);
      return result.player;
    });
  }

  return {
    roster: {
      lineup: advanceGroup(roster.lineup),
      rotation: advanceGroup(roster.rotation),
      bullpen: advanceGroup(roster.bullpen),
      bench: advanceGroup(roster.bench),
    },
    retiredPlayerIds,
  };
}

function advanceManagerForTeam(manager, team, rng, asOfDate) {
  if (!manager) return { manager: null, retiredManagerId: null };
  if (!rollManagerRetirement(manager, rng, { asOfDate })) {
    return { manager, retiredManagerId: null };
  }
  const replacement = generateManager({
    rng,
    leagueId: team.leagueId,
    overrides: { id: `${team.id}-m${Math.floor(rng() * 1e9)}`, teamId: team.id },
  });
  return { manager: replacement, retiredManagerId: manager.id };
}

/**
 * One offseason: growth + position reassignment + retirement/replenishment
 * for every player on every roster, and retirement/replacement for every
 * manager. Non-mutating — returns new roster/manager Maps.
 * @param {object[]} teams
 * @param {Map<string, {lineup: object[], rotation: object[], bullpen: object[], bench: object[]}>} rosterByTeamId
 * @param {Map<string, object|null>} managerByTeamId
 * @param {Map<string, object>} roleStateById - positionReassignment.js hysteresis state, owned across seasons by the caller
 * @param {Date} asOfDate
 * @param {() => number} rng
 * @returns {{rosterByTeamId: Map, managerByTeamId: Map, retiredPlayerIds: string[], retiredManagerIds: string[]}}
 */
export function advanceOffseason(teams, rosterByTeamId, managerByTeamId, roleStateById, asOfDate, rng) {
  const newRosterByTeamId = new Map();
  const newManagerByTeamId = new Map();
  const retiredPlayerIds = [];
  const retiredManagerIds = [];

  for (const team of teams) {
    const roster = rosterByTeamId.get(team.id);
    const { roster: advancedRoster, retiredPlayerIds: teamRetirees } = advanceRosterForTeam(roster, team, roleStateById, rng, asOfDate);
    newRosterByTeamId.set(team.id, advancedRoster);
    retiredPlayerIds.push(...teamRetirees);

    const { manager, retiredManagerId } = advanceManagerForTeam(managerByTeamId.get(team.id), team, rng, asOfDate);
    newManagerByTeamId.set(team.id, manager);
    if (retiredManagerId) retiredManagerIds.push(retiredManagerId);
  }

  return { rosterByTeamId: newRosterByTeamId, managerByTeamId: newManagerByTeamId, retiredPlayerIds, retiredManagerIds };
}

// writers-corps.md: "replaced immediately by a newly generated young
// writer at the same outlet/city, keeping each city's writer population
// roughly stable over time." A retired writer's exact outlet name is
// re-rolled (not preserved) — the doc frames the outlet as belonging to
// the city/beat, not a specific person, so this is a fresh draw at the
// same city, not literally reusing the old outlet string.
function advanceWritersCorps(writers, rng, asOfDate) {
  const retiredWriterIds = [];
  const advanced = writers.map((writer) => {
    if (!rollWriterRetirement(writer, rng, { asOfDate })) return writer;
    retiredWriterIds.push(writer.id);
    return generateWriter({
      rng,
      city: writer.city,
      favoriteTeamId: writer.favoriteTeamId,
      asOfDate,
      overrides: { id: `${writer.id}-r${Math.floor(rng() * 1e9)}` },
    });
  });
  return { writers: advanced, retiredWriterIds };
}

function foldStats(careerStatsById, seasonStatsById, fields) {
  for (const [playerId, seasonTotals] of seasonStatsById) {
    const career = careerStatsById.get(playerId) ?? (fields === BATTING_STAT_FIELDS ? emptySeasonBattingTotals() : emptySeasonPitchingTotals());
    for (const field of fields) career[field] += seasonTotals[field];
    if (seasonTotals.risp) {
      career.risp.ab += seasonTotals.risp.ab;
      career.risp.h += seasonTotals.risp.h;
    }
    if ('wins' in seasonTotals) {
      career.wins += seasonTotals.wins;
      career.losses += seasonTotals.losses;
      career.saves += seasonTotals.saves;
    }
    careerStatsById.set(playerId, career);
  }
}

function creditManagerSeason(careerManagerRecordById, teamId, managerAssignmentById, standingsById, pennantWinnerTeamIds) {
  const manager = managerAssignmentById.get(teamId);
  if (!manager) return;
  const standing = standingsById.get(teamId);
  const record = careerManagerRecordById.get(manager.id) ?? { wins: 0, losses: 0, pennants: 0, seasonsManaged: 0 };
  record.wins += standing.wins;
  record.losses += standing.losses;
  record.seasonsManaged += 1;
  if (pennantWinnerTeamIds.has(teamId)) record.pennants += 1;
  careerManagerRecordById.set(manager.id, record);
}

function computePennantWinners(teams, standingsById) {
  const groups = groupTeamsForScheduling(teams);
  const winners = new Set();
  for (const group of groups) {
    let best = null;
    let bestPct = -1;
    for (const team of group) {
      const { wins, losses } = standingsById.get(team.id);
      const pct = wins + losses > 0 ? wins / (wins + losses) : 0;
      if (pct > bestPct) {
        bestPct = pct;
        best = team;
      }
    }
    if (best) winners.add(best.id);
  }
  return winners;
}

/**
 * Simulates a full multi-season league history: real games, real growth,
 * real retirement, real roster/manager replenishment, real career-stat
 * accumulation. This is what awards-and-hall-of-fame.md's Hall of Fame
 * mechanics need to have anything real to evaluate.
 * @param {object[]} teams - from realLeague.js
 * @param {Map<string, object>} initialRosterByTeamId
 * @param {Map<string, object|null>} initialManagerByTeamId
 * @param {object[]} initialWriters - from writersCorpsSeed.js's buildWritersCorps()
 * @param {object} options
 * @param {number} options.seasons - how many seasons to simulate
 * @param {number} options.gamesPerSeason - real usage: 150 (TARGET_GAMES_PER_TEAM); shortened for fast validation runs
 * @param {Date} [options.startDate] - defaults to now; each season advances this by one year
 * @param {(progress: {seasonNumber: number, totalSeasons: number, retiredPlayerCount: number, retiredManagerCount: number}) => void} [options.onSeasonComplete] - optional progress callback, no-op by default
 * @param {() => number} rng
 * @returns {{
 *   careerBattingStatsById: Map<string, object>,
 *   careerPitchingStatsById: Map<string, object>,
 *   careerManagerRecordById: Map<string, {wins: number, losses: number, pennants: number, seasonsManaged: number}>,
 *   seasonsPlayedById: Map<string, number>,
 *   retiredAfterSeasonByPlayerId: Map<string, number>,
 *   retiredAfterSeasonByManagerId: Map<string, number>,
 *   retiredAfterSeasonByWriterId: Map<string, number>,
 *   playerRegistryById: Map<string, {firstName: string, lastName: string, isPitcher: boolean, primaryPosition: string, teamId: string}>,
 *   managerRegistryById: Map<string, {firstName: string, lastName: string, teamId: string}>,
 *   finalRosterByTeamId: Map<string, object>,
 *   finalManagerByTeamId: Map<string, object>,
 *   finalWriters: object[],
 *   seasonLog: {seasonNumber: number, pennantWinnerTeamIds: string[], retiredPlayerIds: string[], retiredManagerIds: string[]}[]
 * }}
 */
export function simulateLeagueHistory(teams, initialRosterByTeamId, initialManagerByTeamId, initialWriters, options, rng) {
  const { seasons, gamesPerSeason, startDate = new Date(), onSeasonComplete } = options;

  let rosterByTeamId = initialRosterByTeamId;
  let managerByTeamId = initialManagerByTeamId;
  let writers = initialWriters;
  const roleStateById = new Map();

  const careerBattingStatsById = new Map();
  const careerPitchingStatsById = new Map();
  const careerManagerRecordById = new Map();
  const seasonsPlayedById = new Map();
  const retiredAfterSeasonByPlayerId = new Map();
  const retiredAfterSeasonByManagerId = new Map();
  const retiredAfterSeasonByWriterId = new Map();
  const seasonLog = [];

  // Identity/bio bookkeeping, not simulation state — career-stat Maps are
  // keyed by id with numeric totals only, so anything presentation-layer
  // (a Hall of Fame page needs a name to show) has to be tracked
  // separately. Re-registered every season a player/manager is actually on
  // a roster, so the recorded teamId naturally ends up being his most
  // recent team by the time he retires.
  const playerRegistryById = new Map();
  const managerRegistryById = new Map();
  function registerRosterIdentities() {
    for (const team of teams) {
      const roster = rosterByTeamId.get(team.id);
      for (const player of [...roster.lineup, ...roster.rotation, ...roster.bullpen, ...roster.bench]) {
        playerRegistryById.set(player.id, {
          firstName: player.firstName, lastName: player.lastName,
          isPitcher: player.isPitcher, primaryPosition: player.primaryPosition,
          teamId: team.id,
        });
      }
      const manager = managerByTeamId.get(team.id);
      if (manager) managerRegistryById.set(manager.id, { firstName: manager.firstName, lastName: manager.lastName, teamId: team.id });
    }
  }

  for (let seasonNumber = 1; seasonNumber <= seasons; seasonNumber++) {
    const asOfDate = new Date(startDate);
    asOfDate.setFullYear(asOfDate.getFullYear() + (seasonNumber - 1));

    registerRosterIdentities();
    const getTeamRosterFn = (teamId) => rosterByTeamId.get(teamId);
    const getTeamManagerFn = (teamId) => managerByTeamId.get(teamId);
    const schedule = buildSeasonSchedule(teams, gamesPerSeason, rng);
    const seasonResult = simulateSeason(teams, getTeamRosterFn, schedule, rng, getTeamManagerFn);

    foldStats(careerBattingStatsById, seasonResult.seasonBattingStatsById, BATTING_STAT_FIELDS);
    foldStats(careerPitchingStatsById, seasonResult.seasonPitchingStatsById, PITCHING_STAT_FIELDS);
    // One season of service per player per season, not one per stat line —
    // a Foundry pitcher (no DH) both bats and pitches in the same season,
    // appearing in both seasonBattingStatsById and seasonPitchingStatsById;
    // counting him once per source would double his service time.
    const playedThisSeason = new Set([...seasonResult.seasonBattingStatsById.keys(), ...seasonResult.seasonPitchingStatsById.keys()]);
    for (const playerId of playedThisSeason) {
      seasonsPlayedById.set(playerId, (seasonsPlayedById.get(playerId) ?? 0) + 1);
    }

    const pennantWinnerTeamIds = computePennantWinners(teams, seasonResult.standingsById);
    for (const team of teams) {
      creditManagerSeason(careerManagerRecordById, team.id, seasonResult.managerAssignmentById, seasonResult.standingsById, pennantWinnerTeamIds);
    }

    const { rosterByTeamId: nextRosterByTeamId, managerByTeamId: nextManagerByTeamId, retiredPlayerIds, retiredManagerIds } =
      advanceOffseason(teams, rosterByTeamId, seasonResult.managerAssignmentById, roleStateById, asOfDate, rng);
    const { writers: nextWriters, retiredWriterIds } = advanceWritersCorps(writers, rng, asOfDate);

    for (const playerId of retiredPlayerIds) retiredAfterSeasonByPlayerId.set(playerId, seasonNumber);
    for (const managerId of retiredManagerIds) retiredAfterSeasonByManagerId.set(managerId, seasonNumber);
    for (const writerId of retiredWriterIds) retiredAfterSeasonByWriterId.set(writerId, seasonNumber);
    writers = nextWriters;

    rosterByTeamId = nextRosterByTeamId;
    managerByTeamId = nextManagerByTeamId;

    seasonLog.push({
      seasonNumber,
      pennantWinnerTeamIds: [...pennantWinnerTeamIds],
      retiredPlayerIds,
      retiredManagerIds,
    });

    // Optional — purely for a long real run's visibility (e.g. the Hall of
    // Fame snapshot script); never required for correctness, so it
    // defaults to a no-op and every existing caller is unaffected.
    onSeasonComplete?.({ seasonNumber, totalSeasons: seasons, retiredPlayerCount: retiredPlayerIds.length, retiredManagerCount: retiredManagerIds.length });
  }

  return {
    careerBattingStatsById,
    careerPitchingStatsById,
    careerManagerRecordById,
    seasonsPlayedById,
    retiredAfterSeasonByPlayerId,
    retiredAfterSeasonByManagerId,
    retiredAfterSeasonByWriterId,
    playerRegistryById,
    managerRegistryById,
    finalRosterByTeamId: rosterByTeamId,
    finalManagerByTeamId: managerByTeamId,
    finalWriters: writers,
    seasonLog,
  };
}
