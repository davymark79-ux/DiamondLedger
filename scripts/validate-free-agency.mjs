// Re-runnable sanity check for Free Agency wiring — Phase 5 (final) of the
// "Path to Draft, Minors & Free Agency" arc (engine/freeAgency.js):
// `npm run validate:freeagency`. Same style as the other validate:* scripts
// — eyeball checks plus hard asserts on structural invariants.

import { createRng } from '../src/models/generation/random.js';
import { createPlayer, createRating, getAge } from '../src/models/Player.js';
import {
  levelForFreeAgentQuality,
  signAmateurFreeAgent,
  signEstablishedFreeAgent,
  advanceEstablishedFreeAgentPool,
} from '../src/engine/freeAgency.js';
import { playerQualityScore } from '../src/engine/minorLeagues.js';
import { computeRetirementProbability, rollRetirement } from '../src/engine/retirement.js';
import { MINOR_LEAGUE_LEVELS_ORDER, MINOR_LEAGUE_QUALITY_BANDS, TIERS } from '../src/models/constants.js';
import { freeAgents, teams } from '../src/data/realLeague.js';
import { ROSTER_SIZE_PER_TEAM } from '../src/models/seed/rosterSeed.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const AS_OF_DATE = new Date('2026-07-22');

function makeHitter(id, current = 50) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    ratings: {
      contact: createRating(current), power: createRating(current), eye: createRating(current), buntingSkill: createRating(50),
      speed: createRating(current), baserunningInstincts: createRating(current),
      fielding: createRating(current), armStrength: createRating(current), armAccuracy: createRating(current),
      workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
    },
  });
}

function fullAffiliateRosterByClubId(teamIds) {
  const map = new Map();
  for (const teamId of teamIds) {
    for (const level of ['ROOKIE', 'A', 'AA', 'AAA']) {
      map.set(`${teamId}-${level}`, { lineup: [], rotation: [], bullpen: [], bench: [] });
    }
  }
  return map;
}

function makeFullMlbRoster(teamId, quality = 50) {
  const lineup = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map((pos, i) => ({
    ...makeHitter(`${teamId}-lineup-${i}`, quality), primaryPosition: pos, teamId,
  }));
  const rotation = Array.from({ length: 5 }, (_, i) => ({ ...makeHitter(`${teamId}-rot-${i}`, quality), primaryPosition: 'SP', isPitcher: true, teamId }));
  const bullpen = Array.from({ length: 8 }, (_, i) => ({ ...makeHitter(`${teamId}-bp-${i}`, quality), primaryPosition: 'RP', isPitcher: true, teamId }));
  const bench = Array.from({ length: 4 }, (_, i) => ({ ...makeHitter(`${teamId}-bench-${i}`, quality), primaryPosition: '1B', teamId }));
  return { lineup, rotation, bullpen, bench };
}

function rosterCount(roster) {
  return roster.lineup.length + roster.rotation.length + roster.bullpen.length + roster.bench.length;
}

console.log('=== 1. Migration structural check: realLeague.js freeAgents ===\n');
{
  assert(freeAgents.length > 0, `freeAgents is non-empty (got ${freeAgents.length})`);
  assert(freeAgents.every((p) => p.teamId === null), 'every generated free agent has teamId: null');
  assert(new Set(freeAgents.map((p) => p.id)).size === freeAgents.length, 'every free agent has a unique id');
  const ages = freeAgents.map((p) => getAge(p, AS_OF_DATE));
  assert(ages.every((a) => a >= 21 && a <= 40), 'every free agent is a plausible established-player age (21-40, allowing for a few real years since the season-1 seed date)');

  for (const tier of Object.values(TIERS)) {
    const tierTeamCount = teams.filter((t) => t.tier === tier).length;
    const rosteredCount = tierTeamCount * ROSTER_SIZE_PER_TEAM;
    const tierFreeAgentCount = freeAgents.filter((p) => {
      // freeAgents don't carry a tier tag directly; approximate by id prefix (FA-<tier>-n)
      return p.id.startsWith(`FA-${tier}-`);
    }).length;
    console.log(`  ${tier}: ${rosteredCount} rostered, ${tierFreeAgentCount} free agents (~${(tierFreeAgentCount / rosteredCount * 100).toFixed(1)}%)`);
    assert(tierFreeAgentCount > 0, `${tier} has a real, non-zero free-agent pool`);
    assert(Math.abs(tierFreeAgentCount / rosteredCount - 0.1) < 0.02, `${tier}'s free-agent pool is close to the configured 10% of its rostered count`);
  }
}

console.log('\n=== 2. playerQualityScore export sanity ===\n');
{
  const weak = makeHitter('weak', 30);
  const strong = makeHitter('strong', 70);
  assert(playerQualityScore(strong) > playerQualityScore(weak), 'a higher-rated player scores higher than a lower-rated one');
}

console.log('\n=== 3. levelForFreeAgentQuality: monotonic direction + band correctness ===\n');
{
  assert(levelForFreeAgentQuality(5) === 'ROOKIE', 'a below-every-band quality falls back to ROOKIE');
  assert(levelForFreeAgentQuality(MINOR_LEAGUE_QUALITY_BANDS.AAA[0] + 1) === 'AAA', 'a quality clearing AAA\'s floor lands at AAA (the highest level whose floor is cleared)');
  const levels = MINOR_LEAGUE_LEVELS_ORDER;
  for (let i = 0; i < levels.length - 1; i++) {
    const higherLevelFloor = MINOR_LEAGUE_QUALITY_BANDS[levels[i]][0];
    assert(
      levelForFreeAgentQuality(higherLevelFloor) === levels[i],
      `a quality exactly at ${levels[i]}'s floor (${higherLevelFloor}) resolves to ${levels[i]}, not a lower level`
    );
  }
}

console.log('\n=== 4. signAmateurFreeAgent — College pool ===\n');
{
  const freeAgentPoolById = new Map([['college-fa-1', makeHitter('college-fa-1', 45)]]);
  const affiliateRosterByClubId = fullAffiliateRosterByClubId(['team-a']);

  const staleResult = signAmateurFreeAgent('nonexistent', 'team-a', freeAgentPoolById, affiliateRosterByClubId);
  assert(staleResult === null, 'signing a stale/unknown playerId returns null and mutates nothing');
  assert(freeAgentPoolById.size === 1, 'the pool is untouched after a stale-id no-op');

  const result = signAmateurFreeAgent('college-fa-1', 'team-a', freeAgentPoolById, affiliateRosterByClubId);
  assert(result !== null && result.teamId === 'team-a', 'a real signing returns a real result');
  assert(!freeAgentPoolById.has('college-fa-1'), 'the signed player is removed from the College pool');
  const clubId = `team-a-${result.level}`;
  const roster = affiliateRosterByClubId.get(clubId);
  assert(roster.lineup.some((p) => p.id === 'college-fa-1'), 'the signed player lands on the correct affiliate club/section');
  assert(roster.lineup.find((p) => p.id === 'college-fa-1').developmentLevel === result.level, 'developmentLevel is set to the assigned level');
}

console.log('\n=== 5. signAmateurFreeAgent — International pool (same shared function) ===\n');
{
  const internationalFreeAgentPoolById = new Map([['intl-fa-1', makeHitter('intl-fa-1', 45)]]);
  const affiliateRosterByClubId = fullAffiliateRosterByClubId(['team-b']);

  const result = signAmateurFreeAgent('intl-fa-1', 'team-b', internationalFreeAgentPoolById, affiliateRosterByClubId);
  assert(result !== null, 'signing from the International pool via the SAME shared function works identically');
  assert(!internationalFreeAgentPoolById.has('intl-fa-1'), 'the signed player is removed from the International pool');
  const roster = affiliateRosterByClubId.get(`team-b-${result.level}`);
  assert(roster.lineup.some((p) => p.id === 'intl-fa-1'), 'lands on the correct affiliate club/section, proving one implementation serves both pools');
}

console.log('\n=== 6. signEstablishedFreeAgent ===\n');
{
  const establishedFreeAgentPoolById = new Map([['est-fa-1', { ...makeHitter('est-fa-1', 70), primaryPosition: '1B' }]]);
  const roster = makeFullMlbRoster('team-c', 40); // deliberately weak roster so the new signee is clearly the best

  const staleResult = signEstablishedFreeAgent('nonexistent', 'team-c', establishedFreeAgentPoolById, roster);
  assert(staleResult === null, 'a stale playerId returns null');
  const noRosterResult = signEstablishedFreeAgent('est-fa-1', 'team-c', establishedFreeAgentPoolById, undefined);
  assert(noRosterResult === null, 'a missing roster returns null');
  assert(establishedFreeAgentPoolById.size === 1, 'no mutation happened on either no-op path');

  const beforeCount = rosterCount(roster);
  const result = signEstablishedFreeAgent('est-fa-1', 'team-c', establishedFreeAgentPoolById, roster);
  assert(result !== null, 'a real signing returns a real result');
  assert(result.sectionKey === 'lineup', '1B is a lineup position, correctly section-mapped');
  assert(rosterCount(result.updatedRoster) === beforeCount, 'the 26-man roster size invariant is preserved (one out, one in)');
  assert(result.updatedRoster.lineup.some((p) => p.id === 'est-fa-1'), 'the signed player is now on the roster');
  assert(!establishedFreeAgentPoolById.has('est-fa-1'), 'the signed player is removed from the pool');
  const released = establishedFreeAgentPoolById.get(result.releasedPlayerId);
  assert(!!released, 'the released player re-enters the pool');
  assert(released.teamId === null, 'the released player is marked teamId: null (a real free agent again)');
  assert(!result.updatedRoster.lineup.some((p) => p.id === result.releasedPlayerId), 'the released player is actually removed from the roster');

  // Position-drift fallback: nobody at the exact position in lineup.
  const driftedRoster = makeFullMlbRoster('team-d', 40);
  driftedRoster.lineup = driftedRoster.lineup.filter((p) => p.primaryPosition !== 'SS'); // remove the only SS
  const ssFreeAgent = { ...makeHitter('ss-fa', 60), primaryPosition: 'SS' };
  const pool2 = new Map([['ss-fa', ssFreeAgent]]);
  const driftResult = signEstablishedFreeAgent('ss-fa', 'team-d', pool2, driftedRoster);
  assert(driftResult !== null, 'signing still succeeds when no exact-position match exists (falls back to the whole lineup section)');
}

console.log('\n=== 7. advanceEstablishedFreeAgentPool: reuses the REAL retirement curve ===\n');
{
  const player = makeHitter('curve-check', 50);
  player.birthdate = new Date(AS_OF_DATE.getFullYear() - 35, 0, 1).toISOString().slice(0, 10);
  const directProbability = computeRetirementProbability(player, { asOfDate: AS_OF_DATE });

  // rollRetirement(player, rng, {asOfDate}) is the exact call shape
  // advanceEstablishedFreeAgentPool uses internally — a deterministic rng
  // pinned just under/over the real curve's own probability confirms no
  // second, different curve was substituted.
  const justUnder = () => Math.max(0, directProbability - 0.001);
  const justOver = () => Math.min(0.999999, directProbability + 0.001);
  assert(rollRetirement(player, justUnder, { asOfDate: AS_OF_DATE }) === true, 'rollRetirement fires just under the real computed probability');
  assert(rollRetirement(player, justOver, { asOfDate: AS_OF_DATE }) === false, 'rollRetirement does not fire just over the real computed probability');

  const young = makeHitter('young-est', 50);
  young.birthdate = new Date(AS_OF_DATE.getFullYear() - 24, 0, 1).toISOString().slice(0, 10);
  const old = makeHitter('old-est', 50);
  old.birthdate = new Date(AS_OF_DATE.getFullYear() - 42, 0, 1).toISOString().slice(0, 10);
  const pool = new Map([['young-est', young], ['old-est', old]]);

  let youngSurvived = 0;
  let oldSurvived = 0;
  const trials = 300;
  for (let seed = 1; seed <= trials; seed++) {
    const trialPool = new Map(pool);
    advanceEstablishedFreeAgentPool(trialPool, createRng(seed), AS_OF_DATE);
    if (trialPool.has('young-est')) youngSurvived++;
    if (trialPool.has('old-est')) oldSurvived++;
  }
  console.log(`  young (24) survived ${youngSurvived}/${trials}; old (42) survived ${oldSurvived}/${trials}`);
  assert(youngSurvived > oldSurvived, 'a young established free agent survives the retirement pass far more often than an old one');

  const shrinkOnlyPool = new Map([['a', young], ['b', old]]);
  const sizeBefore = shrinkOnlyPool.size;
  advanceEstablishedFreeAgentPool(shrinkOnlyPool, createRng(999), AS_OF_DATE);
  assert(shrinkOnlyPool.size <= sizeBefore, 'the pool never grows from this call, only shrinks or holds');
}

console.log('\n=== 8. isCompatibleSave: schema-version compatibility ===\n');
{
  const mod = await import('../src/data/season.js');
  assert(mod.isCompatibleSave(null) === false, 'null is never compatible');
  assert(mod.isCompatibleSave({}) === false, 'a missing schemaVersion is incompatible');
  assert(mod.isCompatibleSave({ schemaVersion: mod.STATE_SCHEMA_VERSION - 1 }) === false, 'an older schemaVersion is incompatible');
  assert(mod.isCompatibleSave({ schemaVersion: mod.STATE_SCHEMA_VERSION + 1 }) === false, 'a newer schemaVersion is incompatible (this build cannot assume it understands a future shape)');
  assert(mod.isCompatibleSave({ schemaVersion: mod.STATE_SCHEMA_VERSION }) === true, 'a matching schemaVersion is compatible');
  assert(mod.initialLeagueState.schemaVersion === mod.STATE_SCHEMA_VERSION, 'a freshly computed state is stamped with the current schema version');
}

console.log('\n=== 9. Real wiring: data/season.js ===\n');
{
  const mod = await import('../src/data/season.js');
  const state = mod.initialLeagueState;

  assert(state.establishedFreeAgentPoolById instanceof Map, 'establishedFreeAgentPoolById is real live state');
  assert(state.establishedFreeAgentPoolById.size > 0, 'season 1 has a real, populated established free-agent pool');

  const sizeHistory = [state.establishedFreeAgentPoolById.size];
  let currentState = state;
  const state2 = mod.advanceToNextSeason(currentState);
  assert(state2.establishedFreeAgentPoolById === state.establishedFreeAgentPoolById, 'advanceToNextSeason carries the SAME Map instance forward (mutated in place, per this pool\'s ownership contract)');
  currentState = state2;
  sizeHistory.push(currentState.establishedFreeAgentPoolById.size);

  // A real multi-season loop, same technique as College's/International's
  // own stability checks — confirms the pool's size never increases absent
  // any signings (the flagged closed-loop limitation, demonstrated not
  // just asserted). Continues the SAME forward chain from state2 above —
  // calling advanceToNextSeason twice from the same starting state would
  // double-process that season's draft/college pathway against
  // already-mutated Maps with the identical deterministic rng (exactly the
  // "reusing the same season's results through the draft twice" mistake
  // college.js's own comments warn against).
  for (let season = 1; season <= 14; season++) {
    currentState = mod.advanceToNextSeason(currentState);
    sizeHistory.push(currentState.establishedFreeAgentPoolById.size);
  }
  console.log(`  established free-agent pool size across 15 seasons: ${sizeHistory.join(', ')}`);
  for (let i = 1; i < sizeHistory.length; i++) {
    assert(sizeHistory[i] <= sizeHistory[i - 1], `season ${i}: pool size never increases absent any signings (${sizeHistory[i - 1]} -> ${sizeHistory[i]})`);
  }
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
