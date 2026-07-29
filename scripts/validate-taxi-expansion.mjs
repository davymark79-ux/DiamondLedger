// Re-runnable sanity check for Taxi Squad + 28-man Active Roster Expansion —
// Phase 2 of the "50-man Roster System" arc (engine/taxiSquad.js,
// engine/rosterExpansion.js): `npm run validate:taxi`. Same style as the
// other validate:* scripts — eyeball checks plus hard asserts on structural
// invariants.
//
// Unlike Phase 1's Reserve pool (a pure designation, never touching game
// simulation), Taxi Squad genuinely enters simulated games as real rest/
// injury relief — see engine/season.js's resolveAvailableRoster/
// resolveRestedRoster, both extended with an optional taxiIdSet this phase.
// Sections 5 and 9 specifically test that live-game hook, not just the
// designation logic sections 1-2 mirror from Phase 1.

import {
  computeInitialTaxiSquad,
  revalidateAndTopUpTaxiSquad,
  resolveTaxiPlayers,
  TAXI_SQUAD_SIZE,
} from '../src/engine/taxiSquad.js';
import { applyShuttleFatigue } from '../src/engine/positionPlayerFatigue.js';
import {
  EXPANSION_BENCH_BONUS,
  EXPANSION_TRIGGER_WEEKS_REMAINING,
  getExpansionTriggerWeekIndex,
  buildExpansionBenchPlayers,
} from '../src/engine/rosterExpansion.js';
import { resolveAvailableRoster, resolveRestedRoster } from '../src/engine/season.js';
import { buildSeasonWeekPlan } from '../src/engine/calendar.js';
import { simulateSeasonWithCup } from '../src/engine/ledgerCup.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { teams as realTeams, getTeamRoster as getRealTeamRoster, getTeamManager as getRealTeamManager } from '../src/data/realLeague.js';
import { computeFreshSeason1State, advanceToNextSeason, STATE_SCHEMA_VERSION } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const BASE_RATINGS = {
  contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
  speed: createRating(50), baserunningInstincts: createRating(50),
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
};

function hitter(id, position, contactOverride) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: position, eligiblePositions: [position], isPitcher: false,
    ratings: { ...BASE_RATINGS, contact: createRating(contactOverride) },
  });
}

function emptyAffiliateRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

console.log('=== 1. computeInitialTaxiSquad: picks the best 5 from the RESERVE pool specifically, not the raw AAA/AA pool ===\n');
{
  // 10 reserve-eligible players (contact 21-30) + 5 much stronger
  // NON-reserve players (contact 90+) who must be ignored entirely,
  // proving Taxi Squad only ever draws from the given reserve list, never
  // the wider raw AAA/AA pool.
  const reservePlayers = Array.from({ length: 10 }, (_, i) => hitter(`res-${i}`, 'CF', 21 + i));
  const nonReservePlayers = Array.from({ length: 5 }, (_, i) => hitter(`nonres-${i}`, 'CF', 90 + i));
  const affiliateRosterByClubId = new Map([
    ['teamA-AAA', { ...emptyAffiliateRoster(), lineup: [...reservePlayers, ...nonReservePlayers] }],
    ['teamA-AA', emptyAffiliateRoster()],
  ]);
  const reserveRosterByTeamId = new Map([['teamA', reservePlayers.map((p) => p.id)]]);

  const taxi = computeInitialTaxiSquad('teamA', reserveRosterByTeamId, affiliateRosterByClubId);
  assert(taxi.length === TAXI_SQUAD_SIZE, `exactly ${TAXI_SQUAD_SIZE} selected (got ${taxi.length})`);
  assert(new Set(taxi).size === TAXI_SQUAD_SIZE, 'no duplicates');
  assert(taxi.every((id) => id.startsWith('res-')), 'every selected id comes from the reserve pool, never the stronger non-reserve players');
  for (const id of ['res-5', 'res-6', 'res-7', 'res-8', 'res-9']) {
    assert(taxi.includes(id), `${id} (one of the 5 best reserve players) is selected`);
  }
  for (const id of ['res-0', 'res-1', 'res-2', 'res-3', 'res-4']) {
    assert(!taxi.includes(id), `${id} (weaker reserve player) is correctly excluded`);
  }
}

console.log('\n=== 2. revalidateAndTopUpTaxiSquad: drops departed players, tops up from the next-best reserve id under real scarcity ===\n');
{
  const players = Array.from({ length: 10 }, (_, i) => hitter(`t${i}`, 'CF', 21 + i)); // t0 worst .. t9 best
  const affiliateRosterByClubId = new Map([
    ['teamB-AAA', { ...emptyAffiliateRoster(), lineup: players }],
    ['teamB-AA', emptyAffiliateRoster()],
  ]);
  // Deliberately taxi-tag the bottom 3 (t0-t2), not the best 3, to prove
  // top-up doesn't re-rank already-taxi members out.
  const currentTaxiIds = ['t0', 't1', 't2'];
  // New reserve list for the season drops t0 (called up/left) — everyone else stays reserve-eligible.
  const newReserveIds = players.filter((p) => p.id !== 't0').map((p) => p.id);

  const revalidated = revalidateAndTopUpTaxiSquad('teamB', currentTaxiIds, newReserveIds, affiliateRosterByClubId);
  assert(revalidated.length === TAXI_SQUAD_SIZE, `tops up to the full ${TAXI_SQUAD_SIZE} (got ${revalidated.length})`);
  assert(!revalidated.includes('t0'), 't0 (no longer in the new reserve list) is dropped');
  assert(revalidated.includes('t1') && revalidated.includes('t2'), 't1/t2 stay taxi-tagged untouched — no re-ranking of already-taxi members');
  for (const id of ['t7', 't8', 't9']) assert(revalidated.includes(id), `${id} (one of the 3 best remaining reserve-eligible candidates) tops up a freed slot`);
  for (const id of ['t3', 't4', 't5', 't6']) assert(!revalidated.includes(id), `${id} (weaker than the 3 that topped up) is correctly left off Taxi Squad`);
}

console.log('\n=== 3. resolveTaxiPlayers: resolves real ids to real player objects ===\n');
{
  const players = Array.from({ length: 5 }, (_, i) => hitter(`res-p${i}`, 'CF', 40 + i));
  const affiliateRosterByClubId = new Map([
    ['teamC-AAA', { ...emptyAffiliateRoster(), lineup: players.slice(0, 3) }],
    ['teamC-AA', { ...emptyAffiliateRoster(), lineup: players.slice(3) }],
  ]);
  const resolved = resolveTaxiPlayers('teamC', ['res-p0', 'res-p4'], affiliateRosterByClubId);
  assert(resolved.length === 2, `resolves exactly the requested ids (got ${resolved.length})`);
  assert(resolved.some((p) => p.id === 'res-p0') && resolved.some((p) => p.id === 'res-p4'), 'resolves both a AAA-level and a AA-level id correctly');
  assert(resolveTaxiPlayers('teamC', [], affiliateRosterByClubId).length === 0, 'an empty id list resolves to an empty array, not a crash');
}

console.log('\n=== 4. applyShuttleFatigue: rng-consuming, lowers on-field attributes, bounded, non-mutating ===\n');
{
  const player = hitter('shuttle-test', 'CF', 50);
  const rng = createRng(42);
  const fatigued = applyShuttleFatigue(player, rng);
  assert(fatigued.ratings.contact.current < player.ratings.contact.current, 'contact rating is lowered');
  assert(fatigued.ratings.fielding.current < player.ratings.fielding.current, 'a defensive attribute is also lowered');
  assert(fatigued !== player, 'returns a new object, does not mutate the original');
  assert(player.ratings.contact.current === 50, 'original player object is untouched');

  const rngA = createRng(1);
  const rngB = createRng(2);
  const a = applyShuttleFatigue(hitter('a', 'CF', 50), rngA);
  const b = applyShuttleFatigue(hitter('b', 'CF', 50), rngB);
  assert(a.ratings.contact.current !== b.ratings.contact.current, 'penalty magnitude is rng-variable, not a fixed constant (different seeds -> different results)');
}

console.log('\n=== 5. resolveAvailableRoster/resolveRestedRoster: a taxi replacement takes shuttle fatigue, a normal bench replacement does not ===\n');
{
  const starter = hitter('starter', 'CF', 50);
  const normalBench = hitter('normal-bench', 'CF', 50);
  const taxiBench = hitter('taxi-bench', 'CF', 50);
  const injuryStatusById = new Map([['starter', { type: 'strain', severity: 'MINOR', gamesRemaining: 3, sustainedGameNumber: 1 }]]);
  const taxiIdSet = new Set(['taxi-bench']);
  const rng = createRng(7);

  const roster = { lineup: [starter], rotation: [], bullpen: [], bench: [normalBench, taxiBench] };
  const resolved = resolveAvailableRoster(roster, injuryStatusById, taxiIdSet, rng);
  assert(resolved.lineup[0].id === 'normal-bench', 'the first unused bench player (normal-bench, array order) replaces the injured starter');
  assert(resolved.lineup[0].ratings.contact.current === 50, 'a NON-taxi replacement is not shuttle-fatigued');

  const rosterTaxiOnly = { lineup: [starter], rotation: [], bullpen: [], bench: [taxiBench] };
  const resolvedTaxi = resolveAvailableRoster(rosterTaxiOnly, injuryStatusById, taxiIdSet, rng);
  assert(resolvedTaxi.lineup[0].id === 'taxi-bench', 'the taxi player fills the injured slot when he is the only bench option');
  assert(resolvedTaxi.lineup[0].ratings.contact.current < 50, 'the taxi replacement IS shuttle-fatigued (lower contact rating)');

  const consecutiveGamesPlayedById = new Map([['starter', 20]]); // deep past the rest threshold
  const managerProfile = { sliders: { analyticsVsFeel: 100 } }; // maximally analytics-leaning -> rest fires reliably
  const forcedRestRng = () => 0; // always below any real rest probability -> rest always fires
  const restedTaxiOnly = resolveRestedRoster(rosterTaxiOnly, consecutiveGamesPlayedById, managerProfile, forcedRestRng, taxiIdSet);
  assert(restedTaxiOnly.lineup[0].id === 'taxi-bench', 'a rest-day substitution also correctly pulls the taxi player when he is the only bench option');
  assert(restedTaxiOnly.lineup[0].ratings.contact.current < 50, 'rest-day taxi substitutions are shuttle-fatigued too');

  const restedNormalOnly = resolveRestedRoster(
    { lineup: [starter], rotation: [], bullpen: [], bench: [normalBench] }, consecutiveGamesPlayedById, managerProfile, forcedRestRng, taxiIdSet
  );
  assert(restedNormalOnly.lineup[0].ratings.contact.current === 50, 'a normal rest-day substitution is not shuttle-fatigued');
}

console.log('\n=== 6. getExpansionTriggerWeekIndex: confirmed against a real weekPlan ===\n');
{
  const weekPlan = buildSeasonWeekPlan(); // no blackout weeks this test
  const { openWeekIndices } = weekPlan;
  const triggerIndex = getExpansionTriggerWeekIndex(weekPlan, EXPANSION_TRIGGER_WEEKS_REMAINING);
  const expectedIndex = openWeekIndices[openWeekIndices.length - EXPANSION_TRIGGER_WEEKS_REMAINING];
  assert(triggerIndex === expectedIndex, `trigger week index matches openWeekIndices[length - ${EXPANSION_TRIGGER_WEEKS_REMAINING}] exactly (got ${triggerIndex}, expected ${expectedIndex})`);
  assert(openWeekIndices.includes(triggerIndex), 'the trigger index is always a real OPEN week, never a blackout/All-Star week');

  const clamped = getExpansionTriggerWeekIndex(weekPlan, 9999);
  assert(clamped === openWeekIndices[0], 'an oversized weeksRemaining clamps to the first open week, not a crash');
}

console.log('\n=== 7. buildExpansionBenchPlayers: best 2 reserve players NOT already on Taxi Squad ===\n');
{
  const players = Array.from({ length: 10 }, (_, i) => hitter(`e${i}`, 'CF', 21 + i)); // e0 worst .. e9 best
  const affiliateRosterByClubId = new Map([
    ['teamD-AAA', { ...emptyAffiliateRoster(), lineup: players }],
    ['teamD-AA', emptyAffiliateRoster()],
  ]);
  const reserveRosterByTeamId = new Map([['teamD', players.map((p) => p.id)]]);
  const taxiIds = ['e8', 'e9']; // taxi-tag the 2 best -- expansion bench must reach past them

  const expansionBench = buildExpansionBenchPlayers('teamD', reserveRosterByTeamId, taxiIds, affiliateRosterByClubId);
  assert(expansionBench.length === EXPANSION_BENCH_BONUS, `exactly ${EXPANSION_BENCH_BONUS} selected (got ${expansionBench.length})`);
  assert(expansionBench.every((p) => !taxiIds.includes(p.id)), 'never re-selects a player already on the Taxi Squad');
  const ids = expansionBench.map((p) => p.id);
  assert(ids.includes('e7') && ids.includes('e6'), 'picks the 2 best NON-taxi reserve players (e7, e6)');
}

console.log('\n=== 8. Real data/season.js wiring: season-1 bootstrap + optionYearsUsed + season transition ===\n');
{
  const state1 = computeFreshSeason1State();
  assert(state1.schemaVersion === STATE_SCHEMA_VERSION && STATE_SCHEMA_VERSION === 18, `schemaVersion is the current STATE_SCHEMA_VERSION, 18 (got ${state1.schemaVersion})`);
  assert(state1.taxiRosterByTeamId.size === 50, `all 50 real teams have a taxi roster entry (got ${state1.taxiRosterByTeamId.size})`);

  let allValid = true;
  let allSubsetOfReserve = true;
  for (const [teamId, taxiIds] of state1.taxiRosterByTeamId) {
    if (taxiIds.length !== TAXI_SQUAD_SIZE) allValid = false;
    if (new Set(taxiIds).size !== taxiIds.length) allValid = false;
    const reserveSet = new Set(state1.reserveRosterByTeamId.get(teamId));
    if (!taxiIds.every((id) => reserveSet.has(id))) allSubsetOfReserve = false;
  }
  assert(allValid, `every real team starts with exactly ${TAXI_SQUAD_SIZE} unique taxi ids`);
  assert(allSubsetOfReserve, "every team's Taxi Squad is genuinely a subset of that team's own Reserve pool");

  let allOptionYearsCorrect = true;
  for (const [teamId, taxiIds] of state1.taxiRosterByTeamId) {
    const players = resolveTaxiPlayers(teamId, taxiIds, state1.affiliateRosterByClubId);
    if (players.length !== taxiIds.length || !players.every((p) => p.optionYearsUsed === 1)) allOptionYearsCorrect = false;
  }
  assert(allOptionYearsCorrect, 'every season-1 taxi player shows optionYearsUsed === 1');

  const state2 = advanceToNextSeason(state1);
  const sampleTeamId = [...state1.taxiRosterByTeamId.keys()][0];
  const stillTaxiIds = state2.taxiRosterByTeamId.get(sampleTeamId).filter((id) => state1.taxiRosterByTeamId.get(sampleTeamId).includes(id));
  const stillTaxiPlayers = resolveTaxiPlayers(sampleTeamId, stillTaxiIds, state2.affiliateRosterByClubId);
  assert(stillTaxiPlayers.length > 0, 'at least one player carries over on the Taxi Squad across a real season transition (precondition for the next check)');
  assert(stillTaxiPlayers.every((p) => p.optionYearsUsed === 2), 'a player who stays on the Taxi Squad a 2nd season shows optionYearsUsed === 2 (every season costs an option, not just the first)');

  let allSize5AfterTransition = true;
  for (const [, taxiIds] of state2.taxiRosterByTeamId) if (taxiIds.length !== TAXI_SQUAD_SIZE) allSize5AfterTransition = false;
  assert(allSize5AfterTransition, `every team still has exactly ${TAXI_SQUAD_SIZE} taxi ids after a real season transition`);
}

console.log('\n=== 9. Real simulateSeasonWithCup wiring: the expanded roster resolver is actually selected for OPEN weeks at/after the trigger ===\n');
{
  let expandedCalls = 0;
  let standardCalls = 0;
  const countingGetTeamRoster = (id) => { standardCalls++; return getRealTeamRoster(id); };
  const countingGetExpandedTeamRoster = (id) => { expandedCalls++; return getRealTeamRoster(id); };

  // (a) expansion configured but never triggered (expansionTriggerWeeksRemaining: null) -> expanded resolver never invoked.
  simulateSeasonWithCup(realTeams, countingGetTeamRoster, getRealTeamManager, createRng(555), null, null, 20, countingGetExpandedTeamRoster, null, new Map());
  assert(expandedCalls === 0, 'with no expansionTriggerWeeksRemaining, the expanded roster resolver is never invoked (off by default)');
  assert(standardCalls > 0, 'the standard roster resolver is used for every OPEN week in the baseline case');

  // (b) expansion triggered for effectively the whole season (weeksRemaining covers every open week) -> expanded resolver used exclusively.
  expandedCalls = 0; standardCalls = 0;
  simulateSeasonWithCup(realTeams, countingGetTeamRoster, getRealTeamManager, createRng(555), null, null, 20, countingGetExpandedTeamRoster, 9999, new Map());
  assert(expandedCalls > 0, 'with a weeksRemaining covering the whole season, the expanded roster resolver IS invoked for OPEN weeks');
  assert(standardCalls === 0, 'the standard roster resolver is never used once every open week is past a (fully-covering) trigger');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
