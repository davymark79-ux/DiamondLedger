// Re-runnable sanity check for real roster construction (rosterSeed.js +
// leagueSeed.js): `npm run validate:roster`. Same style as the other
// validate:* scripts — an eyeball check plus a handful of hard asserts on
// structural invariants that should never be violated regardless of the
// (explicitly placeholder) quality-band numbers.

import { buildSeedLeagues } from '../src/models/seed/leagueSeed.js';
import {
  buildSeedRosters,
  LINEUP_POSITIONS,
  ROTATION_SIZE,
  BULLPEN_GENERATED_ROLES,
  BULLPEN_DEPTH_COUNT,
  BENCH_POSITIONS,
  ROSTER_SIZE_PER_TEAM,
  ROSTER_QUALITY_BY_TIER,
} from '../src/models/seed/rosterSeed.js';
import { createRng } from '../src/models/generation/random.js';
import { TIERS, DEVELOPMENT_LEVELS } from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const { teams: seedTeams } = buildSeedLeagues();
const rng = createRng(42);
const { teams, players, freeAgents } = buildSeedRosters(seedTeams, rng);

console.log('=== 1. Team/roster counts ===\n');
assert(teams.length === 50, `50 total teams (got ${teams.length})`);
assert(teams.filter((t) => t.tier === TIERS.MLB1).length === 30, 'MLB1 has 30 teams');
assert(teams.filter((t) => t.tier === TIERS.MLB2).length === 20, 'MLB2 has 20 teams');
assert(
  teams.every((t) => t.roster.length === ROSTER_SIZE_PER_TEAM),
  `every team has exactly ${ROSTER_SIZE_PER_TEAM} rostered players`
);
assert(players.length === teams.length * ROSTER_SIZE_PER_TEAM, `${players.length} total rostered players`);

console.log('\n=== 2. Id uniqueness ===\n');
const allIds = [...players.map((p) => p.id), ...freeAgents.map((p) => p.id)];
assert(new Set(allIds).size === allIds.length, `all ${allIds.length} player+free-agent ids are unique`);

console.log('\n=== 3. Position coverage per team ===\n');
const playersById = new Map(players.map((p) => [p.id, p]));
let coverageOk = true;
for (const team of teams) {
  const roster = team.roster.map((id) => playersById.get(id));
  let cursor = 0;
  const take = (count) => roster.slice(cursor, (cursor += count));
  const lineup = take(LINEUP_POSITIONS.length);
  const rotation = take(ROTATION_SIZE);
  const namedBullpen = take(BULLPEN_GENERATED_ROLES.length);
  const bullpenDepth = take(BULLPEN_DEPTH_COUNT);
  const bench = take(BENCH_POSITIONS.length);

  const lineupPositionsOk = LINEUP_POSITIONS.every((pos, i) => lineup[i]?.primaryPosition === pos);
  const rotationOk = rotation.every((p) => p?.primaryPosition === 'SP' && p.isPitcher);
  const namedBullpenOk = namedBullpen.every((p) => p?.primaryPosition === 'RP' && p.isPitcher);
  const bullpenDepthOk = bullpenDepth.every((p) => p?.primaryPosition === 'RP' && p.isPitcher);
  const benchPositionsOk = BENCH_POSITIONS.every((pos, i) => bench[i]?.primaryPosition === pos);

  if (!lineupPositionsOk || !rotationOk || !namedBullpenOk || !bullpenDepthOk || !benchPositionsOk) coverageOk = false;
}
assert(coverageOk, 'every team\'s lineup/rotation/bullpen/bench slots match the expected position composition');

console.log('\n=== 4. Depth-piece quality discount + free agents ===\n');
const sampleTeamForDiscount = teams.find((t) => t.tier === TIERS.MLB1);
const sampleRosterForDiscount = sampleTeamForDiscount.roster.map((id) => playersById.get(id));
const starters = sampleRosterForDiscount.slice(0, LINEUP_POSITIONS.length + ROTATION_SIZE + BULLPEN_GENERATED_ROLES.length);
const depth = sampleRosterForDiscount.slice(LINEUP_POSITIONS.length + ROTATION_SIZE + BULLPEN_GENERATED_ROLES.length);
const avgStarterQuality = starters.reduce((s, p) => s + (p.ratings.contact?.current ?? p.ratings.velocity.current), 0) / starters.length;
const avgDepthQuality = depth.reduce((s, p) => s + (p.ratings.contact?.current ?? p.ratings.velocity.current), 0) / depth.length;
console.log(`  Avg starter-group quality: ${avgStarterQuality.toFixed(1)}, avg depth-group quality: ${avgDepthQuality.toFixed(1)}`);
assert(avgDepthQuality < avgStarterQuality, 'bench/bullpen-depth players are a real quality downgrade from starters');

const expectedFreeAgents = Math.round(30 * ROSTER_SIZE_PER_TEAM * 0.1) + Math.round(20 * ROSTER_SIZE_PER_TEAM * 0.1);
assert(freeAgents.length === expectedFreeAgents, `${freeAgents.length} free agents (expected ${expectedFreeAgents})`);
assert(freeAgents.every((p) => p.teamId === null), 'all free agents have teamId: null');

console.log('\n=== 5. developmentLevel ===\n');
assert(
  [...players, ...freeAgents].every((p) => p.developmentLevel === DEVELOPMENT_LEVELS.MLB),
  'every generated player (rostered + free agent) has developmentLevel MLB'
);

console.log('\n=== 6. MLB1 vs. MLB2 quality gap ===\n');
function avgCurrent(playerList, attr) {
  return playerList.reduce((sum, p) => sum + p.ratings[attr].current, 0) / playerList.length;
}
const mlb1Ids = new Set(teams.filter((t) => t.tier === TIERS.MLB1).flatMap((t) => t.roster));
const mlb2Ids = new Set(teams.filter((t) => t.tier === TIERS.MLB2).flatMap((t) => t.roster));
const mlb1Players = players.filter((p) => mlb1Ids.has(p.id));
const mlb2Players = players.filter((p) => mlb2Ids.has(p.id));
const mlb1Avg = avgCurrent(mlb1Players, 'contact');
const mlb2Avg = avgCurrent(mlb2Players, 'contact');
const gap = mlb1Avg - mlb2Avg;
console.log(`  MLB1 avg contact (current): ${mlb1Avg.toFixed(1)}`);
console.log(`  MLB2 avg contact (current): ${mlb2Avg.toFixed(1)}`);
console.log(`  Gap: ${gap.toFixed(1)} (quality-band midpoint gap: ${(
  (ROSTER_QUALITY_BY_TIER[TIERS.MLB1][0] + ROSTER_QUALITY_BY_TIER[TIERS.MLB1][1]) / 2 -
  (ROSTER_QUALITY_BY_TIER[TIERS.MLB2][0] + ROSTER_QUALITY_BY_TIER[TIERS.MLB2][1]) / 2
).toFixed(1)})`);
assert(gap > 10, 'MLB1 average rating is meaningfully higher than MLB2 (>10 points)');

console.log('\n=== 7. Sample roster (first MLB1 team) ===\n');
const sampleTeam = teams.find((t) => t.tier === TIERS.MLB1);
console.log(`  ${sampleTeam.city} ${sampleTeam.nickname} (${sampleTeam.id})`);
for (const id of sampleTeam.roster) {
  const p = playersById.get(id);
  const age = new Date().getFullYear() - new Date(p.birthdate).getFullYear();
  const headline = p.isPitcher
    ? `VEL ${p.ratings.velocity.current} CTL ${p.ratings.control.current} STA ${p.ratings.stamina.current}`
    : `CON ${p.ratings.contact.current} POW ${p.ratings.power.current} FLD ${p.ratings.fielding.current}`;
  console.log(`  ${p.primaryPosition.padEnd(4)} ${p.firstName} ${p.lastName} (age ${age})  ${headline}`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
