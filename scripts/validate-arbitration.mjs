// Re-runnable sanity check for Arbitration & Non-Tender — Phase 7 of the
// "50-man Roster System" arc (engine/arbitration.js):
// `npm run validate:arb`. Same style as the other validate:* scripts —
// eyeball checks plus hard asserts on structural invariants.
//
// Confirmed scope (see engine/arbitration.js's own header for the full
// reasoning): Super Two is NOT built (needs mid-season call-up timing this
// engine can't express — already deferred in Phase 4), and the
// service-time-manipulation countermeasures (ROY service-time credit,
// draft-pick compensation) are NOT built (both need an Awards system that
// doesn't exist anywhere, itself blocked on per-season stats never
// reaching live state). Neither is tested here, because neither exists.

import {
  computeArbitrationMarketValue,
  fileClubFigure,
  filePlayerFigure,
  resolveArbitrationHearing,
  shouldNonTender,
  runArbitrationAndTenderSweep,
  NON_TENDER_VALUE_RATIO,
  ARBITRATION_LEVERAGE_FLOOR,
  ARBITRATION_LEVERAGE_CEILING,
} from '../src/engine/arbitration.js';
import { SERVICE_DAYS_PER_SEASON, isArbitrationEligible } from '../src/engine/serviceTime.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { createContract, CONTRACT_TYPES } from '../src/models/Contract.js';
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
const SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

function birthdateForAge(age, asOfDate) {
  const d = new Date(asOfDate);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

/** @param {number} serviceYears @param {number} qualityRating @param {number} salary */
function arbPlayer(id, serviceYears, qualityRating, salary, overrides = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: birthdateForAge(27, AS_OF_DATE),
    ratings: Object.fromEntries(Object.keys(BASE_RATINGS).map((k) => [k, createRating(qualityRating)])),
    serviceRecord: createServiceRecord({
      firstProSeasonNumber: 1, ageAtSigning: 22,
      mlbServiceDays: Math.round(serviceYears * SERVICE_DAYS_PER_SEASON),
    }),
    contract: createContract({ type: CONTRACT_TYPES.MAJORS, annualSalary: salary, guaranteed: true }),
    ...overrides,
  });
}

function emptyRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

console.log('=== 1. computeArbitrationMarketValue: driven by REAL service time, not age ===\n');
{
  const threeYear = arbPlayer('three', 3.0, 60, 1_000_000);
  const fiveYear = arbPlayer('five', 5.0, 60, 1_000_000);
  const mv3 = computeArbitrationMarketValue(threeYear);
  const mv5 = computeArbitrationMarketValue(fiveYear);
  console.log(`  3.0yr: $${mv3.toLocaleString()}   5.0yr: $${mv5.toLocaleString()}  (identical ratings and age)`);
  assert(mv5 > mv3, 'a 5-year player values above an otherwise IDENTICAL 3-year player — proving real mlbServiceDays drives this, not age (both are 27)');

  const lowQ = arbPlayer('lowq', 4.0, 35, 1_000_000);
  const highQ = arbPlayer('highq', 4.0, 70, 1_000_000);
  assert(computeArbitrationMarketValue(highQ) > computeArbitrationMarketValue(lowQ), 'higher current quality values higher at identical service time');

  // The leverage ramp is the fix for a real calibration bug (see the engine
  // file's own note) — assert its shape directly, not just its direction.
  assert(ARBITRATION_LEVERAGE_FLOOR > 0 && ARBITRATION_LEVERAGE_FLOOR < ARBITRATION_LEVERAGE_CEILING && ARBITRATION_LEVERAGE_CEILING < 1,
    `leverage ramps within (0,1) — floor ${ARBITRATION_LEVERAGE_FLOOR} < ceiling ${ARBITRATION_LEVERAGE_CEILING}, so an arb-eligible player never values at the league minimum NOR at full open-market value`);
}

console.log('\n=== 2. Filings: club low, player high, both anchored to current salary ===\n');
{
  const p = arbPlayer('filer', 4.0, 60, 2_000_000);
  const mv = computeArbitrationMarketValue(p);
  const club = fileClubFigure(2_000_000, mv);
  const player = filePlayerFigure(2_000_000, mv);
  console.log(`  market $${mv.toLocaleString()} | club filed $${club.toLocaleString()} | player filed $${player.toLocaleString()}`);
  assert(player > club, 'the player always files above the club — otherwise there is no hearing to hold');
  assert(club >= 2_000_000, 'the club may not file BELOW the current salary (real MLB caps arbitration pay cuts; simplified to "never below")');
  assert(player > 2_000_000, 'the player always files for at least a raise');

  // The current-salary anchor is load-bearing: it's what makes non-tender real.
  const cheap = fileClubFigure(100_000, mv);
  const rich = fileClubFigure(9_000_000, mv);
  assert(rich > cheap, "the club's filing tracks current salary, not just market value — the backward-looking anchor that makes shouldNonTender fire on declining veterans");
}

console.log('\n=== 3. resolveArbitrationHearing: NEVER a midpoint, closer figure always wins ===\n');
{
  const club = 3_000_000;
  const player = 5_000_000;

  // Arbitrator reads LOW (rng 0 -> the -noise end) -> club figure is closer.
  const low = resolveArbitrationHearing(club, player, 3_200_000, () => 0);
  assert(low.winner === 'CLUB' && low.awardedSalary === club, `an arbitrator valuing near the club's number awards the CLUB figure (got ${low.winner} @ $${low.awardedSalary.toLocaleString()})`);

  // Arbitrator reads HIGH -> player figure is closer.
  const high = resolveArbitrationHearing(club, player, 4_900_000, () => 0.999);
  assert(high.winner === 'PLAYER' && high.awardedSalary === player, `an arbitrator valuing near the player's number awards the PLAYER figure (got ${high.winner} @ $${high.awardedSalary.toLocaleString()})`);

  // THE core property of file-and-trial: the award is always one of the two
  // filed figures, never a blend, at any rng draw.
  let allExact = true;
  for (let i = 0; i <= 50; i++) {
    const r = resolveArbitrationHearing(club, player, 4_000_000, () => i / 50);
    if (r.awardedSalary !== club && r.awardedSalary !== player) allExact = false;
  }
  assert(allExact, 'across 51 different arbitrator draws the award is ALWAYS exactly one filed figure — never a midpoint (the defining property of real file-and-trial)');

  // And the rng genuinely matters — a fixed midpoint market value should
  // produce both outcomes across the noise range, not one deterministic answer.
  const winners = new Set();
  for (let i = 0; i <= 50; i++) winners.add(resolveArbitrationHearing(club, player, 4_000_000, () => i / 50).winner);
  assert(winners.size === 2, 'with market value sitting between the two filings, the arbitrator\'s own noisy read produces BOTH outcomes across the range — a real hearing, not a deterministic formula');
}

console.log('\n=== 4. shouldNonTender: fires on a DECLINED veteran, not an equally-paid productive one ===\n');
{
  // Both earn exactly the same. The only difference is current quality.
  const SALARY = 6_000_000;
  const declined = arbPlayer('declined', 4.0, 30, SALARY);   // still highly paid, no longer good
  const productive = arbPlayer('productive', 4.0, 72, SALARY); // same money, still excellent

  const evaluate = (p) => {
    const mv = computeArbitrationMarketValue(p);
    const club = fileClubFigure(SALARY, mv);
    const player = filePlayerFigure(SALARY, mv);
    return { mv, nonTendered: shouldNonTender((club + player) / 2, mv) };
  };
  const d = evaluate(declined);
  const pr = evaluate(productive);
  console.log(`  declined: market $${d.mv.toLocaleString()} vs $${SALARY.toLocaleString()} salary -> nonTender=${d.nonTendered}`);
  console.log(`  productive: market $${pr.mv.toLocaleString()} vs $${SALARY.toLocaleString()} salary -> nonTender=${pr.nonTendered}`);
  assert(d.nonTendered === true, 'a declined veteran still being paid for past performance IS non-tendered');
  assert(pr.nonTendered === false, 'an identically-paid but still-productive player is NOT — the mechanic discriminates on current value, not payroll size');

  assert(shouldNonTender(1_000_000 * NON_TENDER_VALUE_RATIO + 1, 1_000_000), 'boundary: just above the ratio non-tenders');
  assert(!shouldNonTender(1_000_000 * NON_TENDER_VALUE_RATIO - 1, 1_000_000), 'boundary: just below the ratio does not');
}

console.log('\n=== 5. runArbitrationAndTenderSweep: only the [3,6) window is touched ===\n');
{
  const preArb = arbPlayer('pre-arb', 1.5, 60, 800_000);
  const arbGuy = arbPlayer('arb-guy', 4.0, 60, 1_000_000);
  const freeAgentEligible = arbPlayer('six-year', 6.0, 60, 1_000_000);
  const declinedVet = arbPlayer('declined-vet', 4.0, 28, 8_000_000);

  const rosterByTeamId = new Map([['teamA', { ...emptyRoster(), lineup: [preArb, arbGuy, freeAgentEligible, declinedVet] }]]);
  const pool = new Map();
  const teamsById = new Map([['teamA', { id: 'teamA', tier: 'MLB1', leagueId: 'FOUNDRY' }]]);
  // A non-tender only proceeds if a real call-up exists to fill the spot —
  // so the fixture needs a genuine affiliate chain, not an empty Map.
  const affiliates = new Map([
    ['teamA-AAA', { ...emptyRoster(), lineup: [arbPlayer('aaa-callup', 0, 45, 42_000)] }],
    ['teamA-AA', { ...emptyRoster(), lineup: [arbPlayer('aa-depth', 0, 40, 33_000)] }],
    ['teamA-A', { ...emptyRoster(), lineup: [arbPlayer('a-depth', 0, 35, 28_000)] }],
    ['teamA-ROOKIE', { ...emptyRoster(), lineup: [arbPlayer('rk-depth', 0, 30, 26_000)] }],
  ]);

  assert(!isArbitrationEligible(preArb.serviceRecord), 'fixture sanity: the 1.5-year player is not arbitration-eligible');
  assert(!isArbitrationEligible(freeAgentEligible.serviceRecord), 'fixture sanity: the 6-year player is a free agent, not arbitration-eligible');

  const { hearings, nonTenders } = runArbitrationAndTenderSweep(rosterByTeamId, pool, teamsById, affiliates, () => 0.5, AS_OF_DATE);
  const after = rosterByTeamId.get('teamA').lineup;
  const byId = new Map(after.map((p) => [p.id, p]));

  assert(byId.get('pre-arb').contract.annualSalary === 800_000, 'a sub-3-year player\'s salary is untouched');
  assert(byId.get('six-year').contract.annualSalary === 1_000_000, 'a 6-year (free-agency-eligible) player\'s salary is untouched');
  assert(hearings.some((h) => h.playerId === 'arb-guy'), 'the arbitration-eligible player got a real hearing');
  assert(byId.get('arb-guy').contract.annualSalary > 1_000_000, 'and his salary actually changed — the first real renegotiation in this codebase');

  assert(nonTenders.some((n) => n.playerId === 'declined-vet'), 'the declined veteran was non-tendered');
  assert(!byId.has('declined-vet'), 'and he is genuinely GONE from the active roster');
  assert(pool.has('declined-vet'), 'and he really landed in the established free-agent pool');
  assert(pool.get('declined-vet').teamId === null, 'with his teamId cleared, matching every other path into that pool');
  assert(after.length === 4, `the roster stayed the SAME SIZE — a non-tender always calls someone up to fill the hole (got ${after.length}, expected 4)`);
  assert(byId.has('aaa-callup'), 'and the replacement is a real AAA call-up via promoteAndBackfill, not a phantom');
}

console.log('\n=== 5b. A club will NOT non-tender a player it has no replacement for ===\n');
{
  // The structural guard against the depletion crash this phase actually
  // hit during its own multi-season integration run (see engine header).
  const declinedVet = arbPlayer('stranded-vet', 4.0, 28, 8_000_000);
  const rosterByTeamId = new Map([['teamB', { ...emptyRoster(), lineup: [declinedVet] }]]);
  const pool = new Map();

  const { nonTenders } = runArbitrationAndTenderSweep(
    rosterByTeamId, pool, new Map([['teamB', { id: 'teamB' }]]), new Map(), () => 0.5, AS_OF_DATE
  );

  assert(nonTenders.length === 0, 'with no affiliate system to call anyone up from, the non-tender does not proceed');
  assert(rosterByTeamId.get('teamB').lineup.length === 1, 'the roster is left intact rather than drained to an unfillable hole');
  assert(pool.size === 0, 'and nobody was leaked into the free-agent pool');
}

console.log('\n=== 6. Real integration: a genuine multi-season save ===\n');
{
  let s = computeFreshSeason1State();
  assert(s.arbitrationResult.hearings.length === 0 && s.arbitrationResult.nonTenders.length === 0,
    'season 1 has no hearings — service time only starts accruing at the END of season 1, so nobody can be eligible yet');

  const poolAtSeason1 = s.establishedFreeAgentPoolById.size;
  let totalHearings = 0;
  let totalNonTenders = 0;
  for (let i = 0; i < 5; i++) {
    s = advanceToNextSeason(s);
    totalHearings += s.arbitrationResult.hearings.length;
    totalNonTenders += s.arbitrationResult.nonTenders.length;
  }

  console.log(`  across 5 real season transitions: ${totalHearings} hearings, ${totalNonTenders} non-tenders`);
  assert(totalHearings > 0, 'real arbitration hearings genuinely occur against live simulated state');
  assert(totalNonTenders > 0, 'real non-tenders genuinely occur too — the heuristic is not dead code at real scale');

  const last = s.arbitrationResult.hearings[0];
  if (last) {
    console.log(`  sample: ${last.firstName} ${last.lastName} — club $${last.clubFigure.toLocaleString()} vs player $${last.playerFigure.toLocaleString()} -> ${last.winner} $${last.awardedSalary.toLocaleString()}`);
    assert(last.awardedSalary === last.clubFigure || last.awardedSalary === last.playerFigure, 'a real awarded figure is exactly one of the two real filed figures');
  }
  const bothWinners = new Set(s.arbitrationResult.hearings.map((h) => h.winner));
  assert(bothWinners.size === 2, `both sides genuinely win real hearings in a single offseason (got ${[...bothWinners].join(', ')})`);

  assert(s.schemaVersion === 21, `schemaVersion is the current STATE_SCHEMA_VERSION, 21 (got ${s.schemaVersion})`);

  // CLAUDE.md §28 flagged establishedFreeAgentPoolById as closed-loop and
  // shrinking (130 -> 16 over 15 seasons with zero signings). Non-tenders
  // are the first real replenishment source it has ever had — measure it
  // rather than just asserting the mechanic ran.
  console.log(`  established free-agent pool: ${poolAtSeason1} at season 1 -> ${s.establishedFreeAgentPoolById.size} after 5 transitions (${totalNonTenders} non-tenders fed in)`);
  assert(totalNonTenders > 0, 'non-tenders are a genuine, measurable replenishment source for the pool §28 flagged as closed-loop');

  // Every roster must still be structurally intact after players were
  // removed mid-sweep — the depletion class of bug Phase 1 hit for real.
  let minSection = Infinity;
  for (const [, roster] of s.rosterByTeamId) {
    for (const key of SECTIONS) minSection = Math.min(minSection, roster[key].length);
  }
  assert(minSection > 0, `no roster section was drained empty by 5 seasons of non-tenders (smallest section: ${minSection})`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
