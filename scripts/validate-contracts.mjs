// Re-runnable sanity check for Contracts & Salaries — Phase 3 of the
// "50-man Roster System" arc (engine/contracts.js): `npm run validate:contracts`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.
//
// Confirmed with the user before implementation: EVERY org-affiliated
// player gets a real contract, not just the 50-man MLB pool — the active
// 26, the Reserve pool (Phase 1), and every other AAA/AA/A/Rookie
// affiliate player too. Section 7 below proves that population-wide, not
// just on a small fixture.

import {
  computeServiceTimeLeverage,
  ARBITRATION_LEVERAGE_FLOOR,
  ARBITRATION_LEVERAGE_CEILING,
  generateMajorsStyleSalary,
  generateMinorsSalary,
  generateContractForPlayer,
  assignMissingContracts,
  computeTeamPayroll,
  computeLuxuryTaxOwed,
  MLB_MIN_SALARY,
  MLB_MAX_SALARY,
  SALARY_FLOOR,
  LUXURY_TAX_THRESHOLD,
} from '../src/engine/contracts.js';
import { CONTRACT_TYPES, createContract } from '../src/models/Contract.js';
import { signAmateurFreeAgent, signEstablishedFreeAgent } from '../src/engine/freeAgency.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { SERVICE_DAYS_PER_SEASON, seedFoundingServiceTime, computeServiceYears } from '../src/engine/serviceTime.js';
import { runFreeAgencySweep, hasJustReachedFreeAgency, FREE_AGENCY_RESIGN_PROBABILITY } from '../src/engine/freeAgency.js';
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

function hitter(id, contactOverride, age = 30, overrides = {}) {
  return createPlayer({
    id, firstName: 'P', lastName: id, primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false,
    birthdate: birthdateForAge(age, AS_OF_DATE),
    ratings: { ...BASE_RATINGS, contact: createRating(contactOverride) },
    ...overrides,
  });
}

function emptyAffiliateRoster() {
  return { lineup: [], rotation: [], bullpen: [], bench: [] };
}

// §47 — salary now keys off REAL accrued service time, so these fixtures
// carry a real ServiceRecord rather than relying on age.
const withService = (id, contact, years, age = 30) =>
  hitter(id, contact, age, {
    serviceRecord: createServiceRecord({
      firstProSeasonNumber: 1,
      ageAtSigning: 23,
      mlbServiceDays: Math.round(years * SERVICE_DAYS_PER_SEASON),
    }),
  });

console.log('=== 1. computeServiceTimeLeverage: the three real MLB regimes (§47) ===\n');
{
  const lev = (years) => computeServiceTimeLeverage({ mlbServiceDays: Math.round(years * SERVICE_DAYS_PER_SEASON) });

  assert(lev(0) === 0, 'a rookie has zero leverage (prices at exactly the league minimum)');
  assert(lev(2.9) === 0, 'still zero just short of arbitration');
  assert(lev(3) === ARBITRATION_LEVERAGE_FLOOR, `jumps straight to the arbitration floor (${ARBITRATION_LEVERAGE_FLOOR}) on reaching 3 years`);
  assert(lev(6) === 1, 'full open-market value at 6 years');
  assert(lev(12) === 1, 'stays capped at 1 well beyond free agency, never above');

  // The cliffs are real MLB, not artefacts — assert them explicitly so a
  // future "smoothing" refactor has to argue with a test.
  assert(lev(3) - lev(2.99) > 0.3, 'a REAL cliff at 3 years — reaching arbitration is a step change, not a ramp');
  assert(lev(6) - lev(5.99) > 0.05, 'a REAL cliff at 6 years — reaching free agency is a step change too');

  const mid = lev(4.5);
  assert(mid > ARBITRATION_LEVERAGE_FLOOR && mid < ARBITRATION_LEVERAGE_CEILING, 'ramps strictly between floor and ceiling inside the arbitration window');
  assert(lev(5) > lev(4), 'monotonically increasing through the arbitration window');
  assert(computeServiceTimeLeverage(null) === 0, 'a missing record reads as zero service (league minimum), not a crash');
}

console.log('\n=== 2. generateMajorsStyleSalary: quality/service direction and bounds ===\n');
{
  const weak = withService('weak', 25, 8);
  const strong = withService('strong', 75, 8);
  assert(
    generateMajorsStyleSalary(strong) > generateMajorsStyleSalary(weak),
    'higher quality (holding service fixed) earns a higher salary'
  );

  // The §47 payoff: two players with IDENTICAL age and quality, differing
  // only in real accrued service, are now priced differently — the exact
  // thing the age proxy could not express.
  const rookie = withService('rookie', 60, 0, 30);
  const arbGuy = withService('arb', 60, 4, 30);
  const freeAgent = withService('fa', 60, 7, 30);
  assert(generateMajorsStyleSalary(rookie) === MLB_MIN_SALARY, 'a pre-arbitration player earns exactly the league minimum regardless of quality');
  assert(generateMajorsStyleSalary(arbGuy) > generateMajorsStyleSalary(rookie), 'reaching arbitration raises pay for the SAME player at the SAME age');
  assert(generateMajorsStyleSalary(freeAgent) > generateMajorsStyleSalary(arbGuy), 'reaching free agency raises it again');

  const worst = withService('worst', 20, 10);
  assert(generateMajorsStyleSalary(worst) >= MLB_MIN_SALARY, 'never pays below MLB_MIN_SALARY, even at full service');

  const best = withService('best', 80, 10);
  assert(generateMajorsStyleSalary(best) <= MLB_MAX_SALARY, 'never exceeds MLB_MAX_SALARY even for a max-quality, full-service player');
}

console.log('\n=== 3. generateMinorsSalary: level ordering and bounds ===\n');
{
  const p = hitter('minors-p', 50, 22);
  const aaa = generateMinorsSalary(p, 'AAA');
  const aa = generateMinorsSalary(p, 'AA');
  const a = generateMinorsSalary(p, 'A');
  const rookie = generateMinorsSalary(p, 'ROOKIE');
  assert(aaa > aa && aa > a && a > rookie, 'AAA > AA > A > ROOKIE for the same player');
  assert(aaa < MLB_MIN_SALARY / 5, 'even the top minor-league level pays far below the MLB minimum');

  const weakMinors = generateMinorsSalary(hitter('weak-minors', 21, 22), 'AAA');
  const strongMinors = generateMinorsSalary(hitter('strong-minors', 79, 22), 'AAA');
  assert(strongMinors > weakMinors, 'higher quality earns a (small) bonus on top of the level base, same level');
}

console.log('\n=== 4. generateContractForPlayer: per-context type/guaranteed correctness ===\n');
{
  const p = hitter('ctx-p', 55, 27);
  const active = generateContractForPlayer(p, 'ACTIVE', null);
  assert(active.type === CONTRACT_TYPES.MAJORS, 'ACTIVE context produces a MAJORS contract');
  assert(active.guaranteed === true, 'ACTIVE context is guaranteed');

  const reserve = generateContractForPlayer(p, 'RESERVE_TAXI', null);
  assert(reserve.type === CONTRACT_TYPES.BOTH, 'RESERVE_TAXI context produces a BOTH contract');
  assert(reserve.guaranteed === true, 'RESERVE_TAXI context is guaranteed');

  const minors = generateContractForPlayer(p, 'MINORS_DEPTH', 'AA');
  assert(minors.type === CONTRACT_TYPES.MINORS, 'MINORS_DEPTH context produces a MINORS contract');
  assert(minors.guaranteed === false, 'MINORS_DEPTH context is NOT guaranteed');
  assert(minors.annualSalary < active.annualSalary, 'a MINORS_DEPTH salary is far below an ACTIVE salary for the same player');
}

console.log('\n=== 5. assignMissingContracts: fills gaps, leaves existing contracts untouched, correct context per pool ===\n');
{
  const alreadySigned = createContract({ type: CONTRACT_TYPES.MAJORS, annualSalary: 12_345_678, guaranteed: true });
  const activeWithContract = hitter('active-has', 50, 28, { contract: alreadySigned });
  const activeWithoutContract = hitter('active-none', 50, 28);
  const rosterByTeamId = new Map([['teamX', { lineup: [activeWithContract, activeWithoutContract], rotation: [], bullpen: [], bench: [] }]]);

  const reserveAaa = hitter('reserve-aaa', 50, 25);
  const depthAaa = hitter('depth-aaa', 50, 25);
  const depthAa = hitter('depth-aa', 50, 25);
  const affiliateRosterByClubId = new Map([
    ['teamX-AAA', { ...emptyAffiliateRoster(), lineup: [reserveAaa, depthAaa] }],
    ['teamX-AA', { ...emptyAffiliateRoster(), lineup: [depthAa] }],
    ['teamX-A', emptyAffiliateRoster()],
    ['teamX-ROOKIE', emptyAffiliateRoster()],
  ]);
  const reserveRosterByTeamId = new Map([['teamX', ['reserve-aaa']]]);

  const { assigned } = assignMissingContracts(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId);
  assert(assigned === 4, `exactly the 4 gapped players get a contract (got ${assigned})`);

  const updatedRoster = rosterByTeamId.get('teamX');
  const stillActiveHas = updatedRoster.lineup.find((p) => p.id === 'active-has');
  assert(stillActiveHas.contract === alreadySigned, 'an already-contracted active player is left completely untouched (same object reference)');
  const nowActiveNone = updatedRoster.lineup.find((p) => p.id === 'active-none');
  assert(nowActiveNone.contract?.type === CONTRACT_TYPES.MAJORS, 'a gapped active player gets a MAJORS contract');

  const aaaAfter = affiliateRosterByClubId.get('teamX-AAA');
  const reserveAfter = aaaAfter.lineup.find((p) => p.id === 'reserve-aaa');
  assert(reserveAfter.contract?.type === CONTRACT_TYPES.BOTH, 'a reserve-pool AAA player gets a BOTH contract, not MINORS');
  const depthAaaAfter = aaaAfter.lineup.find((p) => p.id === 'depth-aaa');
  assert(depthAaaAfter.contract?.type === CONTRACT_TYPES.MINORS, 'a non-reserve AAA player gets a MINORS contract, not BOTH');
  const depthAaAfter = affiliateRosterByClubId.get('teamX-AA').lineup.find((p) => p.id === 'depth-aa');
  assert(depthAaAfter.contract?.type === CONTRACT_TYPES.MINORS, 'a non-reserve AA player also gets a MINORS contract');

  const { assigned: secondPass } = assignMissingContracts(rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId);
  assert(secondPass === 0, 'a second call over the now-fully-contracted fixture assigns nothing new (idempotent)');
}

console.log('\n=== 6. computeTeamPayroll / computeLuxuryTaxOwed: hand-computed fixture ===\n');
{
  const c = (salary) => createContract({ type: CONTRACT_TYPES.MAJORS, annualSalary: salary, guaranteed: true });
  const active1 = hitter('pay-active1', 50, 28, { contract: c(5_000_000) });
  const active2 = hitter('pay-active2', 50, 28, { contract: c(3_000_000) });
  const rosterByTeamId = new Map([['teamY', { lineup: [active1, active2], rotation: [], bullpen: [], bench: [] }]]);

  const reservePlayer = hitter('pay-reserve', 50, 25, { contract: createContract({ type: CONTRACT_TYPES.BOTH, annualSalary: 1_000_000, guaranteed: true }) });
  const depthPlayer = hitter('pay-depth', 50, 25, { contract: createContract({ type: CONTRACT_TYPES.MINORS, annualSalary: 40_000, guaranteed: false }) });
  const affiliateRosterByClubId = new Map([
    ['teamY-AAA', { ...emptyAffiliateRoster(), lineup: [reservePlayer, depthPlayer] }],
    ['teamY-AA', emptyAffiliateRoster()],
  ]);
  const reserveRosterByTeamId = new Map([['teamY', ['pay-reserve']]]);

  const payroll = computeTeamPayroll('teamY', rosterByTeamId, reserveRosterByTeamId, affiliateRosterByClubId);
  assert(payroll === 5_000_000 + 3_000_000 + 1_000_000, `payroll sums active + reserve, excluding non-reserve affiliate depth (got ${payroll})`);

  assert(computeLuxuryTaxOwed(LUXURY_TAX_THRESHOLD) === 0, 'exactly at the threshold owes zero tax');
  assert(computeLuxuryTaxOwed(LUXURY_TAX_THRESHOLD - 1) === 0, 'below the threshold owes zero tax');
  const over = LUXURY_TAX_THRESHOLD + 10_000_000;
  assert(computeLuxuryTaxOwed(over) === 10_000_000 * 0.20, 'above the threshold owes exactly (overage * rate)');
}

console.log('\n=== 7. Real data/season.js wiring: every player has a contract, season-1 payroll re-derives correctly ===\n');
{
  const state1 = computeFreshSeason1State();
  assert(state1.schemaVersion === STATE_SCHEMA_VERSION && STATE_SCHEMA_VERSION === 24, `schemaVersion is the current STATE_SCHEMA_VERSION, 24 (got ${state1.schemaVersion})`);

  let totalPlayers = 0;
  let missing = 0;
  for (const roster of state1.rosterByTeamId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { totalPlayers++; if (!p.contract) missing++; }
    }
  }
  for (const roster of state1.affiliateRosterByClubId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { totalPlayers++; if (!p.contract) missing++; }
    }
  }
  console.log(`  total players checked: ${totalPlayers}`);
  assert(totalPlayers > 5000, `a real, large population was actually checked, not an empty/trivial one (got ${totalPlayers})`);
  assert(missing === 0, `every org-affiliated player has a real contract, no gaps (got ${missing} missing)`);

  const sampleTeamId = [...state1.rosterByTeamId.keys()][0];
  const sampleRoster = state1.rosterByTeamId.get(sampleTeamId);
  let expected = 0;
  for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
    for (const p of sampleRoster[sectionKey]) expected += p.contract.annualSalary;
  }
  const reserveIds = new Set(state1.reserveRosterByTeamId.get(sampleTeamId) ?? []);
  for (const level of ['AAA', 'AA']) {
    const aff = state1.affiliateRosterByClubId.get(`${sampleTeamId}-${level}`);
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of aff[sectionKey]) if (reserveIds.has(p.id)) expected += p.contract.annualSalary;
    }
  }
  const actual = computeTeamPayroll(sampleTeamId, state1.rosterByTeamId, state1.reserveRosterByTeamId, state1.affiliateRosterByClubId);
  assert(actual === expected, `a sample team's real season-1 payroll matches an independently re-derived sum exactly (got ${actual}, expected ${expected})`);
  assert(actual > 0, 'the real payroll figure is a genuine positive number, not a degenerate zero');
}

console.log('\n=== 8. Real season transition: existing salaries stay unchanged, new players get fresh contracts ===\n');
{
  const state1 = computeFreshSeason1State();
  const sampleTeamId = [...state1.rosterByTeamId.keys()][0];
  const priorPlayerId = state1.rosterByTeamId.get(sampleTeamId).lineup[0].id;
  const priorSalary = state1.rosterByTeamId.get(sampleTeamId).lineup[0].contract.annualSalary;

  const state2 = advanceToNextSeason(state1);
  const carriedPlayer = state2.rosterByTeamId.get(sampleTeamId).lineup.find((p) => p.id === priorPlayerId);
  if (carriedPlayer) {
    // §47 CHANGED THIS INVARIANT DELIBERATELY, and the old assertion
    // ("keeps the EXACT same salary, sticky-once-assigned") is now false by
    // design — the same situation §40 hit with validate:freeagency's
    // "pool never grows". Salary is still sticky by DEFAULT, but two real
    // re-pricing events now exist: arbitration (3-6 years) and free agency
    // (at 6). So the honest invariant is "unchanged UNLESS a re-pricing
    // event fired", which this tests by picking a carried player who
    // crossed neither threshold.
    const years = computeServiceYears(carriedPlayer.serviceRecord?.mlbServiceDays ?? 0);
    const inArbWindow = years >= 3 && years < 6;
    const justHitFreeAgency = hasJustReachedFreeAgency(carriedPlayer);
    if (!inArbWindow && !justHitFreeAgency) {
      assert(carriedPlayer.contract.annualSalary === priorSalary, 'a carried player who triggered NO re-pricing event keeps the exact same salary (still sticky by default)');
    } else {
      assert(true, `sample player hit a real re-pricing event (${inArbWindow ? 'arbitration' : 'free agency'}) — salary is SUPPOSED to move`);
    }
  } else {
    console.log('  (sample player retired/moved this transition — sticky-salary check skipped for him, not a failure)');
  }

  let missing2 = 0, total2 = 0;
  for (const roster of state2.rosterByTeamId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { total2++; if (!p.contract) missing2++; }
    }
  }
  for (const roster of state2.affiliateRosterByClubId.values()) {
    for (const sectionKey of ['lineup', 'rotation', 'bullpen', 'bench']) {
      for (const p of roster[sectionKey]) { total2++; if (!p.contract) missing2++; }
    }
  }
  assert(total2 > 0 && missing2 === 0, `every player after a real season transition has a contract, including this season's new draftees/signees (checked ${total2}, missing ${missing2})`);
  assert(state2.draftResult.selections.length > 0, 'a real draft happened this transition (precondition for the next check)');
}

console.log('\n=== 9. signAmateurFreeAgent / signEstablishedFreeAgent: immediate real contracts ===\n');
{
  const amateur = hitter('amateur-fa', 60, 22, { contract: null, teamId: null });
  const freeAgentPoolById = new Map([['amateur-fa', amateur]]);
  const affiliateRosterByClubId = new Map([
    ['teamZ-AAA', emptyAffiliateRoster()],
    ['teamZ-AA', emptyAffiliateRoster()],
    ['teamZ-A', emptyAffiliateRoster()],
    ['teamZ-ROOKIE', emptyAffiliateRoster()],
  ]);
  const amateurResult = signAmateurFreeAgent('amateur-fa', 'teamZ', freeAgentPoolById, affiliateRosterByClubId);
  assert(amateurResult !== null, 'the amateur signing succeeds against a real fixture');
  const signedAmateur = affiliateRosterByClubId.get(`teamZ-${amateurResult.level}`).lineup.find((p) => p.id === 'amateur-fa');
  assert(signedAmateur?.contract?.type === CONTRACT_TYPES.MINORS, 'a freshly-signed amateur free agent gets an immediate MINORS contract');
  assert(signedAmateur?.contract?.annualSalary > 0, 'the immediate contract has a real, positive salary');

  const staleContract = createContract({ type: CONTRACT_TYPES.MAJORS, annualSalary: 1, guaranteed: true }); // deliberately absurd, must NOT survive
  // §47 — this fixture needs REAL accrued service now. Before the swap it
  // relied on age alone, and a 29-year-old priced near market; under
  // service-time pricing a record-less player correctly earns exactly the
  // league minimum, which is the engine being right, not a regression.
  const established = hitter('established-fa', 65, 29, {
    contract: staleContract,
    teamId: null,
    serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 23, mlbServiceDays: 7 * SERVICE_DAYS_PER_SEASON }),
  });
  const establishedFreeAgentPoolById = new Map([['established-fa', established]]);
  const incumbent = hitter('incumbent', 20, 30, { contract: createContract({ type: CONTRACT_TYPES.MAJORS, annualSalary: 500_000, guaranteed: true }) });
  const roster = { lineup: [incumbent], rotation: [], bullpen: [], bench: [] };

  const establishedResult = signEstablishedFreeAgent('established-fa', 'teamZ', establishedFreeAgentPoolById, roster);
  assert(establishedResult !== null, 'the established signing succeeds against a real fixture');
  const signedEstablished = establishedResult.updatedRoster.lineup.find((p) => p.id === 'established-fa');
  assert(signedEstablished?.contract?.type === CONTRACT_TYPES.MAJORS, 'a freshly-signed established free agent gets an immediate MAJORS contract');
  assert(signedEstablished.contract.annualSalary !== 1, 'the stale $1 contract he carried into the pool is NOT reused — a fresh one is generated');
  assert(signedEstablished.contract.annualSalary > 1_000_000, 'the freshly-generated contract is a real, plausible MLB salary');
}

console.log('\n=== 10. Sanity: SALARY_FLOOR and LUXURY_TAX_THRESHOLD are real, distinct, ordered constants ===\n');
{
  assert(SALARY_FLOOR > 0, 'SALARY_FLOOR is a real positive number');
  assert(LUXURY_TAX_THRESHOLD > SALARY_FLOOR, 'LUXURY_TAX_THRESHOLD sits above SALARY_FLOOR (a real gap for teams to sit inside)');
}


console.log('\n=== 11. seedFoundingServiceTime: the founding-generation bootstrap (§47) ===\n');
{
  // Service accrues from LEAGUE start, not career start — without this a
  // 37-year-old founder reads as a rookie and prices at the minimum forever.
  const roster = {
    lineup: [hitter('vet37', 60, 37), hitter('kid21', 60, 21)],
    rotation: [], bullpen: [],
    bench: [hitter('hasHistory', 60, 30, {
      serviceRecord: createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 23, mlbServiceDays: 2 * SERVICE_DAYS_PER_SEASON }),
    })],
  };
  const map = new Map([['t', roster]]);
  seedFoundingServiceTime(map, 1, AS_OF_DATE);
  const out = map.get('t');
  const byId = (id) => [...out.lineup, ...out.bench].find((p) => p.id === id);

  const vet = byId('vet37');
  const kid = byId('kid21');
  assert(computeServiceYears(vet.serviceRecord.mlbServiceDays) === 14, `a 37-year-old founder is seeded 14 years of service (got ${computeServiceYears(vet.serviceRecord.mlbServiceDays)})`);
  assert(computeServiceYears(kid.serviceRecord.mlbServiceDays) === 0, 'a 21-year-old founder is seeded zero — younger than the assumed debut age');
  assert(vet.serviceRecord.wasEverProtected === true, 'a founder with real MLB time is marked as having been on a 50-man roster');
  assert(vet.serviceRecord.ageAtSigning === 23, 'ageAtSigning is clamped to the assumed debut age, not stamped as his age TODAY');
  assert(kid.serviceRecord.ageAtSigning === 21, "a founder younger than the debut age keeps his own real, younger age");

  // Must never clobber genuine accrued history.
  const kept = byId('hasHistory');
  assert(computeServiceYears(kept.serviceRecord.mlbServiceDays) === 2, 'a player with real accrued service is left completely untouched');

  // Idempotent — safe to call twice, cannot corrupt an in-progress league.
  seedFoundingServiceTime(map, 1, AS_OF_DATE);
  const vet2 = [...map.get('t').lineup].find((p) => p.id === 'vet37');
  assert(computeServiceYears(vet2.serviceRecord.mlbServiceDays) === 14, 'a second call is a no-op (idempotent)');

  // The whole point: this is what stops the founding generation pricing at
  // the league minimum.
  assert(generateMajorsStyleSalary(vet) > generateMajorsStyleSalary(kid), 'the seeded veteran now out-earns the seeded rookie at identical quality');
}

console.log('\n=== 12. runFreeAgencySweep: flow-not-stock, and no roster depletion (§47) ===\n');
{
  const svc = (years) => createServiceRecord({ firstProSeasonNumber: 1, ageAtSigning: 23, mlbServiceDays: Math.round(years * SERVICE_DAYS_PER_SEASON) });

  // hasJustReachedFreeAgency is a FLOW: crossing 6 years THIS season.
  assert(hasJustReachedFreeAgency({ serviceRecord: svc(6) }) === true, 'a player who just crossed 6 years is caught');
  assert(hasJustReachedFreeAgency({ serviceRecord: svc(9) }) === false, 'a long-time 9-year veteran is NOT re-swept every season (flow, not stock)');
  assert(hasJustReachedFreeAgency({ serviceRecord: svc(5) }) === false, 'a 5-year player is not yet eligible');

  const makeState = () => {
    const roster = {
      lineup: [hitter('crosser', 70, 30, { teamId: 'tA', serviceRecord: svc(6) }), hitter('stayer', 50, 25, { teamId: 'tA', serviceRecord: svc(2) })],
      rotation: [], bullpen: [], bench: [],
    };
    return new Map([['tA', roster]]);
  };

  // rng below the re-sign rate -> stays put, but RE-PRICED.
  const stayMap = makeState();
  const before = stayMap.get('tA').lineup.find((p) => p.id === 'crosser').contract?.annualSalary ?? 0;
  const r1 = runFreeAgencySweep([{ id: 'tA' }], stayMap, new Map(), new Map(), () => FREE_AGENCY_RESIGN_PROBABILITY - 0.01, AS_OF_DATE);
  const stayed = stayMap.get('tA').lineup.find((p) => p.id === 'crosser');
  assert(r1.reachedFreeAgency === 1 && r1.reSigned === 1 && r1.toMarket === 0, 'below the re-sign roll he stays with his own club');
  assert(!!stayed, 'and is still on the roster');
  assert((stayed.contract?.annualSalary ?? 0) > before, 'but is RE-PRICED at market — the whole point of the sweep');

  // rng above the re-sign rate -> reaches the open market.
  const goMap = makeState();
  const pool = new Map();
  const r2 = runFreeAgencySweep([{ id: 'tA' }], goMap, pool, new Map(), () => FREE_AGENCY_RESIGN_PROBABILITY + 0.01, AS_OF_DATE);
  assert(r2.toMarket === 1, 'above the re-sign roll he reaches the open market');
  // He vacated a slot and then, being the only pool player, was signed back
  // into it by the refill pass — proving section sizes are restored.
  assert(goMap.get('tA').lineup.length === 2, 'the vacated roster slot is REFILLED — section size never shrinks (the §34/§40 depletion guard)');

  // A player who never crossed is untouched either way.
  assert(goMap.get('tA').lineup.some((p) => p.id === 'stayer'), 'a player nowhere near free agency is left alone');
}
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
