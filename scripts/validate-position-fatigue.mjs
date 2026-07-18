// Re-runnable sanity check for Position-Player Fatigue (engine/
// positionPlayerFatigue.js + game.js's per-game application + engine/
// season.js's cross-game persistence): `npm run validate:fatigue`. Same
// style as the other validate:* scripts — eyeball checks plus hard asserts
// on structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createManager } from '../src/models/Manager.js';
import { createRng } from '../src/models/generation/random.js';
import { computeFatiguePenalty, computeFatigueRiskMultiplier, computeRestProbability, rollRest } from '../src/engine/positionPlayerFatigue.js';
import { computeInjuryRisk } from '../src/engine/injuries.js';
import { teams, getTeamRoster } from '../src/data/realLeague.js';
import { buildSeasonSchedule, simulateSeason, resolveRestedRoster, TARGET_GAMES_PER_TEAM } from '../src/engine/season.js';
import { LEAGUE_IDS } from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const NEUTRAL = {
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  baserunningInstincts: createRating(50), workEthic: createRating(50), consistency: createRating(50), coachability: createRating(50),
};

function makeBatter(id, overrides = {}) {
  return createPlayer({
    id, firstName: 'Player', lastName: id, primaryPosition: overrides.position ?? 'CF',
    birthdate: '1996-01-01',
    ratings: { contact: createRating(50), power: createRating(50), eye: createRating(50), speed: createRating(50), durability: createRating(overrides.durability ?? 50), ...NEUTRAL },
  });
}

console.log('=== 1. computeFatiguePenalty shape ===\n');
assert(computeFatiguePenalty(0) === 0, 'no penalty at 0 consecutive games');
assert(computeFatiguePenalty(6) === 0, 'no penalty at exactly the rest threshold (6)');
assert(computeFatiguePenalty(7) > 0, 'a penalty kicks in just past the rest threshold (7)');
const penaltySamples = [0, 5, 6, 7, 10, 20, 50, 500].map(computeFatiguePenalty);
assert(
  penaltySamples.every((p, i) => i === 0 || p >= penaltySamples[i - 1]),
  'penalty is monotonically non-decreasing as consecutive games played climbs'
);
assert(computeFatiguePenalty(500) === computeFatiguePenalty(50), 'penalty is capped (plateaus at extreme values)');
assert(computeFatiguePenalty(500) <= 5, 'the cap stays small — meaningfully smaller than pitcher fatigue\'s 28-point cap');

console.log('\n=== 2. computeFatigueRiskMultiplier shape ===\n');
assert(computeFatigueRiskMultiplier(0) === 1, 'neutral (1x) multiplier when not fatigued');
assert(computeFatigueRiskMultiplier(20) > 1, 'multiplier climbs above 1x once fatigued');
assert(computeFatigueRiskMultiplier(20) < 2, 'the risk bump stays modest, not a dramatic multiplier');

console.log('\n=== 3. Wired into computeInjuryRisk (position players only) ===\n');
const freshBatter = makeBatter('fresh');
const tiredBatter = makeBatter('tired');
assert(
  computeInjuryRisk(tiredBatter, { isPitcher: false, consecutiveGamesPlayed: 20 }) >
    computeInjuryRisk(freshBatter, { isPitcher: false, consecutiveGamesPlayed: 0 }),
  'a fatigued position player (20 straight games) has higher injury risk than a fresh one'
);
assert(
  computeInjuryRisk(freshBatter, { isPitcher: false }) === computeInjuryRisk(freshBatter, { isPitcher: false, consecutiveGamesPlayed: 0 }),
  'omitting consecutiveGamesPlayed defaults to neutral (matches the standalone /box-score demo, which never threads a fatigue map through)'
);

console.log('\n=== 4. Wired into a real simulated season ===\n');
const rng = createRng(11);
const schedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, rng);
const { consecutiveGamesPlayedById, injuryStatusById } = simulateSeason(teams, getTeamRoster, schedule, rng);

const anyAccumulated = [...consecutiveGamesPlayedById.values()].some((games) => games > 6);
assert(anyAccumulated, 'at least one player has climbed past the rest threshold over a full season');

const gamesPlayedByTeamId = new Map(teams.map((t) => [t.id, 0]));
for (const game of schedule) {
  gamesPlayedByTeamId.set(game.awayTeamId, gamesPlayedByTeamId.get(game.awayTeamId) + 1);
  gamesPlayedByTeamId.set(game.homeTeamId, gamesPlayedByTeamId.get(game.homeTeamId) + 1);
}
let noRosterOverflow = true;
for (const team of teams) {
  const roster = getTeamRoster(team.id);
  const teamMax = gamesPlayedByTeamId.get(team.id);
  for (const player of [...roster.lineup, ...roster.bench]) {
    const games = consecutiveGamesPlayedById.get(player.id) ?? 0;
    if (games > teamMax) noRosterOverflow = false;
  }
}
assert(noRosterOverflow, 'no player\'s consecutive-games count exceeds his own team\'s total games played');

// Anyone currently hurt at season's end should read as rested (0) — an
// injury forces the same "no longer a consecutive appearance" reset a
// benching would.
let injuredPlayersRested = true;
for (const [playerId, injury] of injuryStatusById) {
  if (injury.gamesRemaining > 0 && (consecutiveGamesPlayedById.get(playerId) ?? 0) !== 0) injuredPlayersRested = false;
}
assert(injuredPlayersRested, 'a currently-injured player\'s consecutive-games count is reset to 0');

// A Foundry (no-DH) team's nominal DH-slot roster player never actually
// bats there (the pitcher does instead) — he should never accumulate.
const foundryTeam = teams.find((t) => t.leagueId === LEAGUE_IDS.FOUNDRY);
const foundryRoster = getTeamRoster(foundryTeam.id);
const foundryDh = foundryRoster.lineup.find((p) => p.primaryPosition === 'DH');
if (foundryDh) {
  assert(
    (consecutiveGamesPlayedById.get(foundryDh.id) ?? 0) === 0,
    'a Foundry (no-DH) team\'s DH-slot roster player never accumulates fatigue (he never actually plays)'
  );
} else {
  console.log('  (skipped — sampled Foundry team has no DH-position roster player)');
}

console.log('\n=== 5. computeRestProbability / rollRest — Analytics vs. Feel direction ===\n');
assert(computeRestProbability(20, 50) === 0, 'a neutral (50) manager never proactively rests anyone, regardless of fatigue');
assert(computeRestProbability(20, 30) === 0, 'a Feel-leaning manager (below neutral) never proactively rests anyone either');
assert(computeRestProbability(0, 100) === 0, 'an unfatigued player (0 games) is never rested, even under a fully-Analytics manager');
const moderateRest = computeRestProbability(16, 100); // MAX_FATIGUE_PENALTY reached at 16 straight starts
const partialRest = computeRestProbability(10, 100);
assert(moderateRest > partialRest, 'rest probability climbs with fatigue severity, holding the manager fixed');
assert(moderateRest > 0 && moderateRest <= 0.6, 'even a maximally-fatigued player under a fully-Analytics manager isn\'t a guaranteed sit (stays within REST_PROBABILITY_SCALE)');

const restRng = () => 0;
assert(rollRest(16, 100, restRng) === true, 'rollRest fires when rng() undercuts a positive probability');
assert(rollRest(16, 50, restRng) === false, 'rollRest never fires for a neutral-or-below manager, regardless of rng');

console.log('\n=== 6. resolveRestedRoster ===\n');
{
  const tired = makeBatter('tired-starter');
  const fresh = makeBatter('fresh-starter');
  const benchA = makeBatter('bench-a');
  const benchB = makeBatter('bench-b');
  const roster = { lineup: [tired, fresh], rotation: [], bullpen: [], bench: [benchA, benchB] };
  const consecutiveGamesPlayedById = new Map([['tired-starter', 20], ['fresh-starter', 1]]);
  const analyticsManager = createManager({ sliders: { analyticsVsFeel: 100 } });

  // Fixed rng: 0 always beats a positive probability, so the fatigued
  // starter (positive rest probability) gets rested; the fresh one
  // (probability exactly 0) never does, even against the same forced roll.
  const rested = resolveRestedRoster(roster, consecutiveGamesPlayedById, analyticsManager, () => 0);
  assert(rested.lineup[0].id === 'bench-a', 'the fatigued starter is swapped for the first available bench player');
  assert(rested.lineup[1].id === 'fresh-starter', 'the unfatigued starter is never rested, even under a forced roll');
  assert(!rested.bench.some((p) => p.id === 'bench-a'), 'the player who came in is removed from the returned bench (no double-use)');
  assert(rested.bench.some((p) => p.id === 'bench-b'), 'the unused bench player remains available');

  const neutralManager = createManager();
  const notRested = resolveRestedRoster(roster, consecutiveGamesPlayedById, neutralManager, () => 0);
  assert(notRested.lineup[0].id === 'tired-starter', 'a neutral manager never rests anyone, even under the same forced roll');
}

console.log('\n=== 7. Wired into a real season: Analytics-leaning manager rests his regulars more ===\n');
{
  const restRngSeed = createRng(22);
  const restSchedule = buildSeasonSchedule(teams, TARGET_GAMES_PER_TEAM, restRngSeed);
  const analyticsTeam = teams[0];
  const neutralTeam = teams[1];
  const analyticsManager = createManager({ id: 'validate-analytics-mgr', teamId: analyticsTeam.id, sliders: { analyticsVsFeel: 100 } });
  const getTeamManager = (teamId) => (teamId === analyticsTeam.id ? analyticsManager : null);

  const { consecutiveGamesPlayedById: restedById } = simulateSeason(teams, getTeamRoster, restSchedule, restRngSeed, getTeamManager);

  function maxConsecutive(team) {
    const roster = getTeamRoster(team.id);
    return Math.max(...roster.lineup.map((p) => restedById.get(p.id) ?? 0));
  }

  const analyticsMax = maxConsecutive(analyticsTeam);
  const neutralMax = maxConsecutive(neutralTeam);
  console.log(`  max consecutive-games-played at season's end — Analytics-leaning team: ${analyticsMax}, neutral team: ${neutralMax}`);
  assert(analyticsMax < neutralMax, 'an Analytics-leaning manager\'s regulars show real, actual rest days — no longer plateaued at the cap like a neutral team\'s');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
