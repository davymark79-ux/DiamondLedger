// Re-runnable sanity check for Trades — Phase 6 of the "50-man Roster
// System" arc (engine/trades.js): `npm run validate:trades`. Same style as
// the other validate:* scripts — eyeball checks plus hard asserts on
// structural invariants.
//
// Confirmed scope, flagged in the plan rather than asked as a separate
// question (Auto Mode): draft picks, cash, and international bonus-pool
// space are NOT tradeable this phase (no real prerequisite exists for any
// of the three); the trade deadline is not enforced (matches the doc's own
// flag); 10-and-5 no-trade rights are deferred to Phase 9 ("Player
// Rights"); trades are scoped to the 50-man pool only (active roster +
// Reserve + Taxi Squad), not full-organization prospect trades.

import { locatePlayer, executeTrade, evaluatePostTradeMedicalReview, MEDICAL_REVIEW_BASE_RATE, MEDICAL_REVIEW_MAX_RATE } from '../src/engine/trades.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { computeFreshSeason1State, advanceToNextSeason } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

const AS_OF_DATE = new Date('2026-07-27');
const BASE_RATINGS = {
  contact: createRating(50), power: createRating(50), eye: createRating(50), buntingSkill: createRating(50),
  speed: createRating(50), baserunningInstincts: createRating(50),
  fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
  workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
};

function birthdateForAge(age, asOfDate) {
  const d = new Date(asOfDate);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

function hitter(id, teamId, age = 27, overrides = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    teamId,
    birthdate: birthdateForAge(age, AS_OF_DATE),
    ratings: { ...BASE_RATINGS, ...(overrides.ratings ?? {}) },
    ...overrides,
  });
}

function emptyRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

console.log('=== 1. locatePlayer: across ACTIVE/RESERVE/TAXI, plus a not-found case ===\n');
{
  const activePlayer = hitter('active-p', 'teamA');
  const reservePlayer = hitter('reserve-p', 'teamA');
  const taxiPlayer = hitter('taxi-p', 'teamA');

  const rosterByTeamId = new Map([['teamA', { ...emptyRoster(), lineup: [activePlayer] }]]);
  const reserveRosterByTeamId = new Map([['teamA', ['reserve-p', 'taxi-p']]]);
  const taxiRosterByTeamId = new Map([['teamA', ['taxi-p']]]);
  const affiliateRosterByClubId = new Map([
    ['teamA-AAA', { ...emptyRoster(), lineup: [reservePlayer] }],
    ['teamA-AA', { ...emptyRoster(), lineup: [taxiPlayer] }],
  ]);

  const foundActive = locatePlayer('teamA', 'active-p', rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId);
  assert(foundActive?.pool === 'ACTIVE', `active roster player resolves as ACTIVE (got ${foundActive?.pool})`);

  const foundReserve = locatePlayer('teamA', 'reserve-p', rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId);
  assert(foundReserve?.pool === 'RESERVE', `AAA-level Reserve player resolves as RESERVE (got ${foundReserve?.pool})`);
  assert(foundReserve?.level === 'AAA', 'correct level recorded');

  const foundTaxi = locatePlayer('teamA', 'taxi-p', rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId);
  assert(foundTaxi?.pool === 'TAXI', `a player on BOTH the Reserve and Taxi lists resolves as TAXI, not RESERVE (got ${foundTaxi?.pool})`);
  assert(foundTaxi?.level === 'AA', 'correct level recorded for the AA-level Taxi player');

  const notFound = locatePlayer('teamA', 'nobody', rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId);
  assert(notFound === null, 'an unknown player id resolves to null');
}

console.log('\n=== 2. executeTrade: a clean active-roster trade, no medical review trigger ===\n');
{
  const aPlayer = hitter('a-active', 'teamA', 27, { ratings: { ...BASE_RATINGS, durability: createRating(80) } });
  const bPlayer = hitter('b-active', 'teamB', 27, { ratings: { ...BASE_RATINGS, durability: createRating(80) } });
  const rosterByTeamId = new Map([
    ['teamA', { ...emptyRoster(), lineup: [aPlayer] }],
    ['teamB', { ...emptyRoster(), lineup: [bPlayer] }],
  ]);
  const reserveRosterByTeamId = new Map([['teamA', []], ['teamB', []]]);
  const taxiRosterByTeamId = new Map([['teamA', []], ['teamB', []]]);
  const affiliateRosterByClubId = new Map();

  const result = executeTrade('teamA', 'teamB', ['a-active'], ['b-active'], rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId, () => 0.99);
  assert(result?.outcome === 'COMPLETED', `trade completes with a max-Durability roll (got ${result?.outcome})`);
  const newTeamA = result.updatedRosterByTeamId.get('teamA');
  const newTeamB = result.updatedRosterByTeamId.get('teamB');
  assert(newTeamA.lineup.some((p) => p.id === 'b-active'), 'Team A now has the player Team B sent');
  assert(!newTeamA.lineup.some((p) => p.id === 'a-active'), 'Team A no longer has its own traded player');
  assert(newTeamB.lineup.some((p) => p.id === 'a-active'), 'Team B now has the player Team A sent');
  assert(!newTeamB.lineup.some((p) => p.id === 'b-active'), 'Team B no longer has its own traded player');
  assert(newTeamA.lineup.find((p) => p.id === 'b-active').teamId === 'teamA', "the traded player's teamId updates");
}

console.log('\n=== 3. executeTrade: Reserve-for-Reserve, physically relocates on the correct affiliate roster ===\n');
{
  const aReserve = hitter('a-reserve', 'teamA', 24, { ratings: { ...BASE_RATINGS, durability: createRating(80) } });
  const bReserve = hitter('b-reserve', 'teamB', 24, { ratings: { ...BASE_RATINGS, durability: createRating(80) } });
  const rosterByTeamId = new Map([['teamA', emptyRoster()], ['teamB', emptyRoster()]]);
  const reserveRosterByTeamId = new Map([['teamA', ['a-reserve']], ['teamB', ['b-reserve']]]);
  const taxiRosterByTeamId = new Map([['teamA', []], ['teamB', []]]);
  const affiliateRosterByClubId = new Map([
    ['teamA-AAA', { ...emptyRoster(), lineup: [aReserve] }],
    ['teamA-AA', emptyRoster()],
    ['teamB-AAA', { ...emptyRoster(), lineup: [bReserve] }],
    ['teamB-AA', emptyRoster()],
  ]);

  const result = executeTrade('teamA', 'teamB', ['a-reserve'], ['b-reserve'], rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId, () => 0.99);
  assert(result?.outcome === 'COMPLETED', `Reserve-for-Reserve trade completes (got ${result?.outcome})`);
  assert(result.updatedAffiliateRosterByClubId.get('teamA-AAA').lineup.some((p) => p.id === 'b-reserve'), "Team A's AAA now has the incoming player");
  assert(result.updatedAffiliateRosterByClubId.get('teamB-AAA').lineup.some((p) => p.id === 'a-reserve'), "Team B's AAA now has the incoming player");
  assert(result.updatedReserveRosterByTeamId.get('teamA').includes('b-reserve'), "Team A's Reserve list gains the incoming player");
  assert(!result.updatedReserveRosterByTeamId.get('teamA').includes('a-reserve'), "Team A's Reserve list drops its own traded player");
  assert(result.updatedReserveRosterByTeamId.get('teamB').includes('a-reserve'), "Team B's Reserve list gains the incoming player");
}

console.log('\n=== 4. executeTrade: a Taxi player traded away leaves Taxi AND Reserve, lands only in Reserve on the new team ===\n');
{
  const taxiPlayer = hitter('taxi-traded', 'teamA', 24, { ratings: { ...BASE_RATINGS, durability: createRating(80) } });
  const rosterByTeamId = new Map([['teamA', emptyRoster()], ['teamB', emptyRoster()]]);
  const reserveRosterByTeamId = new Map([['teamA', ['taxi-traded']], ['teamB', []]]);
  const taxiRosterByTeamId = new Map([['teamA', ['taxi-traded']], ['teamB', []]]);
  const affiliateRosterByClubId = new Map([
    ['teamA-AAA', { ...emptyRoster(), lineup: [taxiPlayer] }],
    ['teamA-AA', emptyRoster()],
    ['teamB-AAA', emptyRoster()],
    ['teamB-AA', emptyRoster()],
  ]);

  const result = executeTrade('teamA', 'teamB', ['taxi-traded'], [], rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId, () => 0.99);
  assert(result?.outcome === 'COMPLETED', `a Taxi player trade completes (got ${result?.outcome})`);
  assert(!result.updatedReserveRosterByTeamId.get('teamA').includes('taxi-traded'), 'leaves Reserve on the old team');
  assert(!result.updatedTaxiRosterByTeamId.get('teamA').includes('taxi-traded'), 'leaves Taxi on the old team');
  assert(result.updatedReserveRosterByTeamId.get('teamB').includes('taxi-traded'), 'lands in Reserve on the new team');
  assert(!(result.updatedTaxiRosterByTeamId.get('teamB') ?? []).includes('taxi-traded'), 'does NOT land in Taxi on the new team — a trade never grants a new Taxi designation');
  assert(result.updatedAffiliateRosterByClubId.get('teamB-AAA').lineup.some((p) => p.id === 'taxi-traded'), 'physically relocates to the new team\'s AAA roster');
}

console.log('\n=== 5. executeTrade: invalid input returns null, no maps touched ===\n');
{
  const rosterByTeamId = new Map([['teamA', { ...emptyRoster(), lineup: [hitter('real-p', 'teamA')] }], ['teamB', emptyRoster()]]);
  const reserveRosterByTeamId = new Map([['teamA', []], ['teamB', []]]);
  const taxiRosterByTeamId = new Map([['teamA', []], ['teamB', []]]);
  const affiliateRosterByClubId = new Map();

  const badId = executeTrade('teamA', 'teamB', ['nonexistent'], [], rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId, () => 0.99);
  assert(badId === null, 'an unresolvable player id returns null');

  const sameTeam = executeTrade('teamA', 'teamA', ['real-p'], [], rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId, () => 0.99);
  assert(sameTeam === null, 'the same team on both sides returns null');

  const noPlayers = executeTrade('teamA', 'teamB', [], [], rosterByTeamId, reserveRosterByTeamId, taxiRosterByTeamId, affiliateRosterByClubId, () => 0.99);
  assert(noPlayers === null, 'zero players named on either side returns null');

  assert(rosterByTeamId.get('teamA').lineup.length === 1, 'the original roster Map is untouched after a null result');
}

console.log('\n=== 6. evaluatePostTradeMedicalReview: boundary + Durability-weighting direction ===\n');
{
  const durableGuy = hitter('durable', 'teamA', 27, { ratings: { ...BASE_RATINGS, durability: createRating(80) } });
  const fragileGuy = hitter('fragile', 'teamA', 27, { ratings: { ...BASE_RATINGS, durability: createRating(20) } });

  assert(Math.abs(MEDICAL_REVIEW_BASE_RATE - 0.05) < 1e-9, 'base rate is 0.05 (max Durability)');
  assert(Math.abs(MEDICAL_REVIEW_MAX_RATE - 0.1) < 1e-9, 'max rate is 0.10 (min Durability)');

  const justUnderDurable = evaluatePostTradeMedicalReview([durableGuy], () => MEDICAL_REVIEW_BASE_RATE - 0.001);
  assert(justUnderDurable.passed === false, 'a roll just under a max-Durability player\'s own threshold fails');
  const justOverDurable = evaluatePostTradeMedicalReview([durableGuy], () => MEDICAL_REVIEW_BASE_RATE + 0.001);
  assert(justOverDurable.passed === true, 'a roll just over that same threshold passes');

  const justUnderFragile = evaluatePostTradeMedicalReview([fragileGuy], () => MEDICAL_REVIEW_MAX_RATE - 0.001);
  assert(justUnderFragile.passed === false, 'a roll just under a min-Durability player\'s own (higher) threshold fails');
  const justOverFragile = evaluatePostTradeMedicalReview([fragileGuy], () => MEDICAL_REVIEW_MAX_RATE + 0.001);
  assert(justOverFragile.passed === true, 'a roll just over that same threshold passes');

  // A fixed roll strictly between the two thresholds passes for the durable
  // player but fails for the fragile one — direct proof of the weighting
  // direction (lower Durability -> higher failure chance), not just two
  // independent boundary checks.
  const midpoint = (MEDICAL_REVIEW_BASE_RATE + MEDICAL_REVIEW_MAX_RATE) / 2;
  const durableAtMidpoint = evaluatePostTradeMedicalReview([durableGuy], () => midpoint);
  const fragileAtMidpoint = evaluatePostTradeMedicalReview([fragileGuy], () => midpoint);
  assert(durableAtMidpoint.passed === true, 'the same mid-range roll passes for a max-Durability player');
  assert(fragileAtMidpoint.passed === false, 'the same mid-range roll fails for a min-Durability player');

  const multiPlayerFirstFails = evaluatePostTradeMedicalReview([fragileGuy, durableGuy], () => midpoint);
  assert(multiPlayerFirstFails.passed === false && multiPlayerFirstFails.flaggedPlayerId === 'fragile', 'the first player to fail flags the whole review');
}

console.log('\n=== 7. Real integration: a genuine multi-season save, real teams, real active rosters ===\n');
{
  let s = computeFreshSeason1State();
  for (let i = 0; i < 3; i++) s = advanceToNextSeason(s);

  const [teamAId, teamBId] = [...s.rosterByTeamId.keys()];
  const rosterA = s.rosterByTeamId.get(teamAId);
  const rosterB = s.rosterByTeamId.get(teamBId);
  const playerFromA = rosterA.lineup[0];
  const playerFromB = rosterB.lineup[0];

  const result = executeTrade(
    teamAId, teamBId, [playerFromA.id], [playerFromB.id],
    s.rosterByTeamId, s.reserveRosterByTeamId, s.taxiRosterByTeamId, s.affiliateRosterByClubId,
    () => 0.99
  );
  assert(result !== null, 'a real active-roster trade against real, live season-3 state succeeds');
  assert(result.outcome === 'COMPLETED', `a max-roll trade against real state completes (got ${result?.outcome})`);
  assert(result.updatedRosterByTeamId.get(teamAId).lineup.some((p) => p.id === playerFromB.id), 'Team A really has the incoming real player');
  assert(result.updatedRosterByTeamId.get(teamBId).lineup.some((p) => p.id === playerFromA.id), 'Team B really has the incoming real player');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
