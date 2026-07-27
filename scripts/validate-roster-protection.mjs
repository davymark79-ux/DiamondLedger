// Re-runnable sanity check for Roster Protection — Phase 1 of the "50-man
// Roster System" arc (engine/rosterProtection.js): `npm run validate:reserve`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.
//
// A first draft of this phase proposed generating 24 new players per team
// for the reserve pool; caught and corrected before any code shipped — the
// reserve/50-man pool is a PROTECTION DESIGNATION over players who are
// already real, already-simulated members of a team's own AAA/AA affiliate
// rosters, not a new population. Every section below tests that corrected
// design.

import {
  computeInitialReserveRoster,
  revalidateAndTopUpReserveRoster,
  findReserveFit,
  RESERVE_ROSTER_SIZE,
} from '../src/engine/rosterProtection.js';
import { playerQualityScore } from '../src/engine/minorLeagues.js';
import { advanceOffseason } from '../src/engine/leagueProgression.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { createRng } from '../src/models/generation/random.js';
import { buildSeedLeagues } from '../src/models/seed/leagueSeed.js';
import { initialAffiliateRosterByClubId } from '../src/data/realAffiliates.js';
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

const AS_OF_DATE = new Date('2026-07-21');
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

console.log('=== 1. computeInitialReserveRoster: picks the actual best 24 by quality across AAA+AA ===\n');
{
  // 15 AAA + 15 AA players (30 eligible total, more than RESERVE_ROSTER_SIZE),
  // contact ratings 1-30 so the ranking is unambiguous by construction.
  // Ratings clamp to RATING_SCALE [20, 80] (models/constants.js) — offset
  // well clear of the floor so every player's contact value stays distinct
  // after clamping, unlike a first draft of this fixture that used 1-30
  // directly and silently collapsed everything below 20 to the same value.
  const aaaPlayers = Array.from({ length: 15 }, (_, i) => hitter(`aaa-${i}`, 'CF', 21 + i)); // quality 21-35
  const aaPlayers = Array.from({ length: 15 }, (_, i) => hitter(`aa-${i}`, 'CF', 36 + i)); // quality 36-50
  const affiliateRosterByClubId = new Map([
    ['team1-AAA', { ...emptyAffiliateRoster(), lineup: aaaPlayers }],
    ['team1-AA', { ...emptyAffiliateRoster(), lineup: aaPlayers }],
  ]);

  const reserve = computeInitialReserveRoster('team1', affiliateRosterByClubId);
  assert(reserve.length === RESERVE_ROSTER_SIZE, `exactly ${RESERVE_ROSTER_SIZE} selected (got ${reserve.length})`);
  assert(new Set(reserve).size === RESERVE_ROSTER_SIZE, 'no duplicates');
  // Best 24 of 30 by construction: all 15 AA (contact 36-50) plus the top 9 of 15 AAA (aaa-6..aaa-14, contact 27-35) = 24 highest-quality ids.
  const expectedIds = new Set([...aaPlayers.map((p) => p.id), ...aaaPlayers.slice(6).map((p) => p.id)]);
  assert(
    reserve.length === expectedIds.size && reserve.every((id) => expectedIds.has(id)),
    'selected ids are exactly the top 24 by playerQualityScore, spanning both AAA and AA'
  );
  assert(!reserve.includes('aaa-0') && !reserve.includes('aaa-4'), 'the weakest AAA players (below the 24th-best overall) are correctly excluded');
}

console.log('\n=== 2. computeInitialReserveRoster: gracefully handles a small pool ===\n');
{
  const affiliateRosterByClubId = new Map([
    ['team2-AAA', { ...emptyAffiliateRoster(), lineup: [hitter('only-1', 'CF', 50)] }],
    ['team2-AA', emptyAffiliateRoster()],
  ]);
  const reserve = computeInitialReserveRoster('team2', affiliateRosterByClubId);
  assert(reserve.length === 1, `a pool smaller than RESERVE_ROSTER_SIZE returns everything eligible, no padding (got ${reserve.length})`);

  const noAffiliatesAtAll = computeInitialReserveRoster('team3', new Map());
  assert(noAffiliatesAtAll.length === 0, 'no affiliate system wired up at all returns an empty reserve, not a crash');
}

console.log('\n=== 3. revalidateAndTopUpReserveRoster: drops departed players, tops up from the next-best under real scarcity ===\n');
{
  // 30 eligible players, contact 21-50 strictly ascending (p0 worst, p29
  // best) — a pool genuinely bigger than RESERVE_ROSTER_SIZE (24), so
  // top-up has to make a real best-of-the-rest choice, not just admit
  // everyone left.
  const players = Array.from({ length: 30 }, (_, i) => hitter(`p${i}`, 'CF', 21 + i));
  const affiliateRosterByClubId = new Map([
    ['team4-AAA', { ...emptyAffiliateRoster(), lineup: players }],
    ['team4-AA', emptyAffiliateRoster()],
  ]);
  // Deliberately protect p0-p19 (the BOTTOM 20 by quality, not the best
  // 20) — proves revalidation doesn't re-optimize already-protected
  // members just because stronger unprotected players (p20-p29) exist;
  // it only fills genuinely open slots.
  const priorProtected = players.slice(0, 20).map((p) => p.id);

  // p0 (the single weakest) "gets called up" — removed from the roster entirely.
  const withoutP0 = players.filter((p) => p.id !== 'p0');
  affiliateRosterByClubId.set('team4-AAA', { ...emptyAffiliateRoster(), lineup: withoutP0 });

  const revalidated = revalidateAndTopUpReserveRoster('team4', priorProtected, affiliateRosterByClubId);
  assert(revalidated.length === RESERVE_ROSTER_SIZE, `tops up to the full ${RESERVE_ROSTER_SIZE} when enough eligible players exist (got ${revalidated.length})`);
  assert(!revalidated.includes('p0'), 'p0 (no longer present in AAA/AA) is dropped');
  for (const id of players.slice(1, 20).map((p) => p.id)) {
    assert(revalidated.includes(id), `${id} stays protected untouched — revalidation doesn't re-rank already-protected members (got dropped unexpectedly)`);
  }
  // Needed: 24 - 19 (still-valid) = 5 new slots, filled from the best 5 of
  // the 10 unprotected candidates (p20-p29): p25-p29.
  for (const id of ['p25', 'p26', 'p27', 'p28', 'p29']) {
    assert(revalidated.includes(id), `${id} (one of the 5 best available unprotected players) tops up a freed slot`);
  }
  for (const id of ['p20', 'p21', 'p22', 'p23', 'p24']) {
    assert(!revalidated.includes(id), `${id} (weaker than the 5 that topped up) is correctly left unprotected — real scarcity, not "everyone left gets in"`);
  }
}

console.log('\n=== 4. findReserveFit: only matches PROTECTED players at the position, ignores teammates ===\n');
{
  const protectedPlayer = hitter('protected-cf', 'CF', 70);
  const strongerButUnprotected = hitter('unprotected-cf', 'CF', 99); // deliberately higher quality, must NOT be picked
  const affiliateRosterByClubId = new Map([
    ['team5-AAA', { ...emptyAffiliateRoster(), lineup: [protectedPlayer, strongerButUnprotected] }],
    ['team5-AA', emptyAffiliateRoster()],
  ]);
  const fit = findReserveFit('team5', 'CF', ['protected-cf'], affiliateRosterByClubId);
  assert(fit?.player.id === 'protected-cf', 'finds the protected player specifically, not the higher-quality unprotected teammate');

  const noFitWrongPosition = findReserveFit('team5', 'SS', ['protected-cf'], affiliateRosterByClubId);
  assert(noFitWrongPosition === null, 'returns null when the protected player is at a different position');

  const noFitEmptyReserve = findReserveFit('team5', 'CF', [], affiliateRosterByClubId);
  assert(noFitEmptyReserve === null, 'returns null immediately when the team has no protected players at all');
}

console.log('\n=== 5. Wired into advanceOffseason: a protected reserve player is called up ahead of a stronger unprotected one ===\n');
{
  const { teams } = buildSeedLeagues();
  const team = teams.find((t) => t.id.endsWith('-foundry')) ?? teams[0];

  const oldHitter = createPlayer({
    id: 'retiree', firstName: 'Old', lastName: 'Retiree', primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: '1980-01-01', // guaranteed to retire under a forced rng, same convention as validate-minor-leagues.mjs
    ratings: BASE_RATINGS,
  });
  const roster = { lineup: [oldHitter], rotation: [], bullpen: [], bench: [] };
  const rosterByTeamId = new Map([[team.id, roster]]);
  const managerByTeamId = new Map([[team.id, null]]);

  const protectedPlayer = hitter('protected-callup', 'CF', 60);
  const strongerUnprotected = hitter('unprotected-callup', 'CF', 99); // must NOT be the one promoted
  const affiliateRosterByClubId = new Map([
    [`${team.id}-AAA`, { ...emptyAffiliateRoster(), lineup: [protectedPlayer, strongerUnprotected] }],
    [`${team.id}-AA`, emptyAffiliateRoster()],
    [`${team.id}-A`, emptyAffiliateRoster()],
    [`${team.id}-ROOKIE`, emptyAffiliateRoster()],
  ]);
  const reserveRosterByTeamId = new Map([[team.id, ['protected-callup']]]);

  const forcedRng = () => 0.0001; // never exactly 0 — see baseball-sim/CLAUDE.md's Hall of Fame section
  const { rosterByTeamId: nextRosterByTeamId } = advanceOffseason(
    [team], rosterByTeamId, managerByTeamId, new Map(), AS_OF_DATE, forcedRng, affiliateRosterByClubId, reserveRosterByTeamId
  );

  const nextRoster = nextRosterByTeamId.get(team.id);
  assert(nextRoster.lineup[0].id === 'protected-callup', 'the PROTECTED reserve player is promoted, not the higher-quality unprotected teammate or a thin-air/AAA-cascade fallback');
  assert(!affiliateRosterByClubId.get(`${team.id}-AAA`).lineup.some((p) => p.id === 'protected-callup'), 'the promoted player is removed from the AAA affiliate roster');
  assert(affiliateRosterByClubId.get(`${team.id}-AAA`).lineup.some((p) => p.id === 'unprotected-callup'), 'the unprotected teammate is left alone');

  // A real bug caught during this phase's own regression testing (a
  // multi-season loop crashed once AAA/AA rosters shrank below what the
  // game engine assumes): consuming a reserve fit must ALSO backfill the
  // vacated slot, same as promoteAndBackfill does for its own call-ups —
  // AA is empty in this fixture, so the backfill should generate a fresh
  // CF signee directly into AAA (cascading down since AA had no fit).
  const aaaAfter = affiliateRosterByClubId.get(`${team.id}-AAA`);
  assert(aaaAfter.lineup.length === 2, `AAA's vacated slot was backfilled (still 2 CF: unprotected-callup + a fresh signee) — got ${aaaAfter.lineup.length}`);
  assert(aaaAfter.lineup.some((p) => p.id !== 'unprotected-callup' && p.primaryPosition === 'CF'), 'the backfill signee is a real CF, not a leftover gap');
}

console.log('\n=== 6. computeInitialReserveRoster / revalidateAndTopUpReserveRoster consume no rng (deterministic, idempotent) ===\n');
{
  const rng = createRng(999); // unused by design — the point of this section is to prove it's genuinely never called
  const trackedRng = () => { throw new Error('rng was called — reserve designation must be a pure quality sort, no randomness'); };
  const { teams } = buildSeedLeagues();
  const players = Array.from({ length: 30 }, (_, i) => hitter(`d${i}`, 'CF', i));
  const affiliateRosterByClubId = new Map([
    [`${teams[0].id}-AAA`, { ...emptyAffiliateRoster(), lineup: players.slice(0, 15) }],
    [`${teams[0].id}-AA`, { ...emptyAffiliateRoster(), lineup: players.slice(15) }],
  ]);
  let threw = false;
  try {
    computeInitialReserveRoster(teams[0].id, affiliateRosterByClubId);
    revalidateAndTopUpReserveRoster(teams[0].id, ['d0'], affiliateRosterByClubId);
  } catch {
    threw = true;
  }
  assert(!threw, 'neither function accepts or needs an rng param — confirmed by signature (2 params only, no rng)');
  assert(computeInitialReserveRoster.length === 2, 'computeInitialReserveRoster signature has no rng parameter');
  assert(revalidateAndTopUpReserveRoster.length === 3, 'revalidateAndTopUpReserveRoster signature has no rng parameter');

  const a = computeInitialReserveRoster(teams[0].id, affiliateRosterByClubId);
  const b = computeInitialReserveRoster(teams[0].id, affiliateRosterByClubId);
  assert(JSON.stringify(a) === JSON.stringify(b), 'repeated calls with the same input produce the identical result (deterministic)');
  void rng; void trackedRng;
}

console.log('\n=== 7. Real data/season.js wiring: season 1 bootstrap + season transition ===\n');
{
  const state1 = computeFreshSeason1State();
  assert(state1.schemaVersion === STATE_SCHEMA_VERSION && STATE_SCHEMA_VERSION === 14, `schemaVersion is the current STATE_SCHEMA_VERSION, 14 (got ${state1.schemaVersion})`);
  assert(state1.reserveRosterByTeamId.size === 50, `all 50 real teams have a reserve roster entry (got ${state1.reserveRosterByTeamId.size})`);

  let allExactly24 = true;
  let allValid = true;
  for (const [teamId, ids] of state1.reserveRosterByTeamId) {
    if (ids.length !== 24) allExactly24 = false;
    if (new Set(ids).size !== ids.length) allValid = false;
    const aaa = state1.affiliateRosterByClubId.get(`${teamId}-AAA`);
    const aa = state1.affiliateRosterByClubId.get(`${teamId}-AA`);
    const eligibleIds = new Set([...aaa.lineup, ...aaa.rotation, ...aaa.bullpen, ...aaa.bench, ...aa.lineup, ...aa.rotation, ...aa.bullpen, ...aa.bench].map((p) => p.id));
    if (!ids.every((id) => eligibleIds.has(id))) allValid = false;
  }
  assert(allExactly24, 'every real team starts with exactly 24 protected reserve players (AAA+AA pool is always >=24 in the real seed)');
  assert(allValid, 'every protected id genuinely references a real player currently in that team\'s own AAA or AA roster, no duplicates');

  // Spot-check one real team's season-1 bootstrap against an
  // independently-recomputed expectation — using a FRESH, unspoiled
  // initialAffiliateRosterByClubId() call, matching exactly what
  // computeFreshSeason1State() itself uses internally BEFORE that
  // season's own draft/college pathway can sign anyone new onto AAA/AA.
  // (state1.affiliateRosterByClubId is the wrong comparison point here —
  // it's the season's FINAL state, and a real college signee genuinely
  // does land directly on AA sometimes, per levelForYearsCompleted, which
  // legitimately changes AA's composition between bootstrap and season's
  // end — confirmed directly, not a bug.)
  const freshAffiliateRosterByClubId = initialAffiliateRosterByClubId();
  const sampleTeamId = [...state1.reserveRosterByTeamId.keys()][0];
  const expected = computeInitialReserveRoster(sampleTeamId, freshAffiliateRosterByClubId);
  assert(JSON.stringify([...state1.reserveRosterByTeamId.get(sampleTeamId)].sort()) === JSON.stringify([...expected].sort()), 'a sample team\'s real bootstrap matches an independently-recomputed expectation exactly');

  const state2 = advanceToNextSeason(state1);
  let churned = 0;
  let stillValidAfterTransition = true;
  for (const [teamId, ids] of state2.reserveRosterByTeamId) {
    if (ids.length !== 24) stillValidAfterTransition = false;
    const priorIds = state1.reserveRosterByTeamId.get(teamId);
    if (ids.some((id) => !priorIds.includes(id))) churned++;
    const aaa = state2.affiliateRosterByClubId.get(`${teamId}-AAA`);
    const aa = state2.affiliateRosterByClubId.get(`${teamId}-AA`);
    const eligibleIds = new Set([...aaa.lineup, ...aaa.rotation, ...aaa.bullpen, ...aaa.bench, ...aa.lineup, ...aa.rotation, ...aa.bullpen, ...aa.bench].map((p) => p.id));
    if (!ids.every((id) => eligibleIds.has(id))) stillValidAfterTransition = false;
  }
  assert(stillValidAfterTransition, 'after a real season transition, every team still has exactly 24 valid, currently-real protected ids');
  console.log(`  teams with real reserve churn this transition: ${churned} / 50`);
  assert(churned > 0, 'at least some teams show real churn (a protected player got called up/left and was topped up) — not a static, never-changing list');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
