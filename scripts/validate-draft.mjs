// Re-runnable sanity check for the Domestic Draft — Phase 2 of the "Path to
// Draft, Minors & Free Agency" arc (engine/draft.js): `npm run validate:draft`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.

import { createRng } from '../src/models/generation/random.js';
import { createPlayer, createRating } from '../src/models/Player.js';
import {
  computeCombinedReverseStandingsOrder,
  computePostseasonRoundsCleared,
  computePostEliminationWinPct,
  computeDraftOrder,
  buildDraftPicks,
  resolveDraft,
  assignSignedDraftees,
} from '../src/engine/draft.js';
import { TIERS, LEAGUE_IDS, DRAFT_ROUNDS, DRAFT_LOTTERY_MAX_RISE } from '../src/models/constants.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

function team(id, tier, leagueId = LEAGUE_IDS.FOUNDRY) {
  return { id, tier, leagueId };
}

function standings(record) {
  return new Map(Object.entries(record).map(([id, [wins, losses]]) => [id, { wins, losses }]));
}

console.log('=== 1. computeCombinedReverseStandingsOrder ===\n');
{
  const teams = [team('a', TIERS.MLB1), team('b', TIERS.MLB1), team('c', TIERS.MLB2), team('d', TIERS.MLB2)];
  const standingsById = standings({ a: [90, 60], b: [40, 110], c: [70, 80], d: [70, 80] }); // c/d tied on purpose
  const order = computeCombinedReverseStandingsOrder(teams, standingsById);
  assert(order[0] === 'b', 'worst record (b) picks first');
  assert(order[order.length - 1] === 'a', 'best record (a) picks last');
  assert(order.indexOf('c') < order.indexOf('d'), 'tied records tiebreak by team id ascending (c before d)');
  assert(order.length === 4, 'every team appears exactly once, regardless of tier');
}

console.log('\n=== 2. computePostseasonRoundsCleared ===\n');
{
  const playoffResult = {
    leagues: {
      [LEAGUE_IDS.FOUNDRY]: {
        divisionChamps: ['f1', 'f2', 'f3'],
        wildCard: 'f4',
        wcRound: [
          { teamAId: 'f1', teamBId: 'f4', winnerTeamId: 'f1' },
          { teamAId: 'f2', teamBId: 'f3', winnerTeamId: 'f2' },
        ],
        lcs: { teamAId: 'f1', teamBId: 'f2', winnerTeamId: 'f1' },
        pennantWinnerTeamId: 'f1',
      },
      [LEAGUE_IDS.EXCHANGE]: {
        divisionChamps: ['e1', 'e2', 'e3'],
        wildCard: 'e4',
        wcRound: [
          { teamAId: 'e1', teamBId: 'e4', winnerTeamId: 'e1' },
          { teamAId: 'e2', teamBId: 'e3', winnerTeamId: 'e2' },
        ],
        lcs: { teamAId: 'e1', teamBId: 'e2', winnerTeamId: 'e1' },
        pennantWinnerTeamId: 'e1',
      },
    },
    finals: { teamAId: 'f1', teamBId: 'e1', winnerTeamId: 'f1' },
    mlb2Championship: { teamAId: 'm1', teamBId: 'm2', winnerTeamId: 'm1' },
  };

  const roundsCleared = computePostseasonRoundsCleared(playoffResult);
  assert(roundsCleared.size === 8, 'exactly the 8 MLB1 bracket participants are included');
  assert(!roundsCleared.has('m1') && !roundsCleared.has('m2'), "MLB2 championship participants are NOT included — they stay in the lottery pool per the user's correction");
  assert(roundsCleared.get('f4') === 0 && roundsCleared.get('f3') === 0 && roundsCleared.get('e4') === 0 && roundsCleared.get('e3') === 0, 'WC Round losers cleared 0 rounds');
  assert(roundsCleared.get('f2') === 1 && roundsCleared.get('e2') === 1, 'LCS losers cleared 1 round');
  assert(roundsCleared.get('e1') === 2, 'the Finals loser cleared 2 rounds');
  assert(roundsCleared.get('f1') === 3, 'the Finals winner cleared 3 rounds');
}

console.log('\n=== 3. computePostEliminationWinPct: hand-verified elimination + post-elimination record ===\n');
{
  // LEADER vs TANK, 10 head-to-head games, MLB2 (qualifyingSpots=1 — a
  // single league-leader threshold). LEADER wins games 0-5 (6 straight),
  // TANK wins games 6-9 (the last 4) — hand-traced: TANK's maxPossibleWins
  // (0 + remaining) dips below the (single-leader) threshold (LEADER's own
  // running win total) exactly at game index 5 (LEADER's 6th win: TANK's
  // max = 0+(10-6)=4 < 6), so TANK is eliminated there with 4 games left,
  // and wins all 4 of them: postElimWinPct(TANK) should read exactly 1.0.
  const teams = [team('LEADER', TIERS.MLB2), team('TANK', TIERS.MLB2)];
  const results = [];
  for (let i = 0; i < 6; i++) results.push({ gameNumber: i, awayTeamId: 'LEADER', homeTeamId: 'TANK', awayRuns: 1, homeRuns: 0 });
  for (let i = 6; i < 10; i++) results.push({ gameNumber: i, awayTeamId: 'TANK', homeTeamId: 'LEADER', awayRuns: 1, homeRuns: 0 });

  const postElim = computePostEliminationWinPct(teams, results);
  assert(postElim.get('TANK') === 1, `TANK's post-elimination win% is exactly 1.0 (got ${postElim.get('TANK')})`);
  assert(postElim.get('LEADER') === 0, "LEADER, never eliminated (stayed the group's own leader throughout), reads 0");

  // Same final 4-6 / 6-4 records, but TANK's 4 wins happen BEFORE its
  // elimination point instead of after (front-loaded) — TANK isn't
  // mathematically eliminated until the very last game this way (it stays
  // tied/reachable deep into the season), leaving zero games to measure
  // afterward: postElimWinPct should read exactly 0, even though TANK's
  // overall season record is identical to the case above. Isolates that
  // the bonus tracks WHEN wins
  // happened, not just the final record.
  const resultsFrontLoaded = [];
  for (let i = 0; i < 4; i++) resultsFrontLoaded.push({ gameNumber: i, awayTeamId: 'TANK', homeTeamId: 'LEADER', awayRuns: 1, homeRuns: 0 });
  for (let i = 4; i < 10; i++) resultsFrontLoaded.push({ gameNumber: i, awayTeamId: 'LEADER', homeTeamId: 'TANK', awayRuns: 1, homeRuns: 0 });
  const postElimFrontLoaded = computePostEliminationWinPct(teams, resultsFrontLoaded);
  assert(postElimFrontLoaded.get('TANK') === 0, "TANK, with the identical 4-6 final record but its wins front-loaded before elimination, reads 0 post-elimination win%");

  // A team that's alive through its literal last game never gets marked at all.
  const closeRace = [];
  for (let i = 0; i < 5; i++) closeRace.push({ gameNumber: i, awayTeamId: 'LEADER', homeTeamId: 'TANK', awayRuns: 1, homeRuns: 0 });
  for (let i = 5; i < 10; i++) closeRace.push({ gameNumber: i, awayTeamId: 'TANK', homeTeamId: 'LEADER', awayRuns: 1, homeRuns: 0 });
  const postElimCloseRace = computePostEliminationWinPct(teams, closeRace);
  assert(postElimCloseRace.get('LEADER') === 0 && postElimCloseRace.get('TANK') === 0, 'a genuinely close race where neither team is ever mathematically eliminated reads 0 for both');
}

console.log('\n=== 4. computeDraftOrder: lottery cap enforcement ===\n');
{
  // 20-team lottery pool (no postseason teams — empty playoffResult), no
  // elimination-affecting results (empty array — every team defaults to 0
  // post-elimination win%, isolating pure rank+cap behavior). Ranks are
  // 1 (worst) through 20 (best of the non-exempt pool).
  const teams = Array.from({ length: 20 }, (_, i) => team(`t${i + 1}`, TIERS.MLB2));
  const record = {};
  teams.forEach((t, i) => { record[t.id] = [i, 20 - i]; }); // t1 = 0-20 (worst), t20 = 19-1 (best of the pool)
  const standingsById = standings(record);
  const playoffResult = { leagues: {}, finals: null };

  const winnersBySeed = new Map();
  for (let seed = 1; seed <= 3000; seed++) {
    const { round1Order } = computeDraftOrder(teams, standingsById, playoffResult, [], createRng(seed));
    for (const winnerId of round1Order.slice(0, 2)) {
      winnersBySeed.set(winnerId, (winnersBySeed.get(winnerId) ?? 0) + 1);
    }
  }

  const maxEligibleRank = 2 + DRAFT_LOTTERY_MAX_RISE; // slot 2's cap is the widest — rank <= 12
  const capViolations = [...winnersBySeed.keys()].filter((id) => Number(id.slice(1)) > maxEligibleRank);
  assert(capViolations.length === 0, `no team ranked worse than ${maxEligibleRank} ever wins a lottery slot across 3000 trials (violations: ${capViolations.join(', ') || 'none'})`);
  assert(winnersBySeed.get('t1') > 0, 'the worst-ranked team (t1) does win a lottery slot at least sometimes');
}

console.log('\n=== 5. computeDraftOrder: base odds direction (worse rank wins more often) ===\n');
{
  const teams = Array.from({ length: 10 }, (_, i) => team(`t${i + 1}`, TIERS.MLB2));
  const record = {};
  teams.forEach((t, i) => { record[t.id] = [i, 10 - i]; });
  const standingsById = standings(record);
  const playoffResult = { leagues: {}, finals: null };

  let t1Wins = 0;
  let t8Wins = 0; // a meaningfully better rank, but still cap-eligible
  const trials = 4000;
  for (let seed = 1; seed <= trials; seed++) {
    const { round1Order } = computeDraftOrder(teams, standingsById, playoffResult, [], createRng(seed * 7919));
    const top2 = new Set(round1Order.slice(0, 2));
    if (top2.has('t1')) t1Wins++;
    if (top2.has('t8')) t8Wins++;
  }
  console.log(`  t1 (worst rank) won a top-2 slot ${t1Wins}/${trials}; t8 (much better rank) won ${t8Wins}/${trials}`);
  assert(t1Wins > t8Wins, 'the worst-ranked team wins a lottery slot meaningfully more often than a much-better-ranked team, bonus held equal (both 0)');
}

console.log('\n=== 6. computeDraftOrder: anti-tanking bonus direction (real elimination detector, identical final record) ===\n');
{
  // Reuses section 3's exact two constructions (same 4-6/6-4 final
  // records either way) so TANK's RANK is identical in both universes —
  // only the bonus differs, isolating its real effect end-to-end rather
  // than just the weight formula in isolation.
  const filler = Array.from({ length: 8 }, (_, i) => team(`f${i + 1}`, TIERS.MLB1)); // separate tier -> separate group, never interferes with TANK/LEADER's own elimination detection
  const teams = [team('LEADER', TIERS.MLB2), team('TANK', TIERS.MLB2), ...filler];
  const fillerRecords = { f1: [0, 10], f2: [1, 9], f3: [2, 8], f4: [3, 7], f5: [5, 5], f6: [7, 3], f7: [8, 2], f8: [9, 1] };
  const standingsById = standings({ LEADER: [6, 4], TANK: [4, 6], ...fillerRecords });
  const playoffResult = { leagues: {}, finals: null };

  const rewarded = []; // TANK eliminated then goes 4-0 the rest of the way (section 3's first construction)
  for (let i = 0; i < 6; i++) rewarded.push({ gameNumber: i, awayTeamId: 'LEADER', homeTeamId: 'TANK', awayRuns: 1, homeRuns: 0 });
  for (let i = 6; i < 10; i++) rewarded.push({ gameNumber: i, awayTeamId: 'TANK', homeTeamId: 'LEADER', awayRuns: 1, homeRuns: 0 });

  const tanked = []; // identical 4-6 final record, wins front-loaded before elimination
  for (let i = 0; i < 4; i++) tanked.push({ gameNumber: i, awayTeamId: 'TANK', homeTeamId: 'LEADER', awayRuns: 1, homeRuns: 0 });
  for (let i = 4; i < 10; i++) tanked.push({ gameNumber: i, awayTeamId: 'LEADER', homeTeamId: 'TANK', awayRuns: 1, homeRuns: 0 });

  let tankWinsRewarded = 0;
  let tankWinsTanked = 0;
  const trials = 4000;
  for (let seed = 1; seed <= trials; seed++) {
    const rng1 = createRng(seed * 104729);
    const { round1Order: orderRewarded } = computeDraftOrder(teams, standingsById, playoffResult, rewarded, rng1);
    if (new Set(orderRewarded.slice(0, 2)).has('TANK')) tankWinsRewarded++;

    const rng2 = createRng(seed * 104729); // identical rng stream — only the results (and thus the bonus) differ
    const { round1Order: orderTanked } = computeDraftOrder(teams, standingsById, playoffResult, tanked, rng2);
    if (new Set(orderTanked.slice(0, 2)).has('TANK')) tankWinsTanked++;
  }
  console.log(`  TANK (same rank, real post-elimination record) won a top-2 slot ${tankWinsRewarded}/${trials}; TANK (same rank, tanked out) won ${tankWinsTanked}/${trials}`);
  assert(tankWinsRewarded > tankWinsTanked, "with an identical final record and rank, TANK's real post-elimination competitiveness wins it a lottery slot more often than tanking out would have");
}

console.log('\n=== 7. computeDraftOrder: playoff-tail ordering + win% tiebreak ===\n');
{
  const teams = [team('L1', TIERS.MLB2), ...['f1', 'f2', 'f3', 'f4'].map((id) => team(id, TIERS.MLB1))];
  const standingsById = standings({ L1: [10, 100], f1: [90, 72], f2: [80, 82], f3: [70, 92], f4: [95, 67] });
  const playoffResult = {
    leagues: {
      [LEAGUE_IDS.FOUNDRY]: {
        divisionChamps: ['f1', 'f2'],
        wildCard: 'f3',
        wcRound: [
          { teamAId: 'f1', teamBId: 'f3', winnerTeamId: 'f1' }, // f3 loses, 0 rounds cleared
          { teamAId: 'f2', teamBId: 'f4', winnerTeamId: 'f4' }, // f2 loses, 0 rounds cleared (f2's record .494 vs f3's .432 — f3 should still draft before f2 despite tied rounds only if win% breaks the tie correctly)
        ],
        lcs: { teamAId: 'f1', teamBId: 'f4', winnerTeamId: 'f1' },
        pennantWinnerTeamId: 'f1',
      },
    },
    finals: null,
  };

  const { round1Order } = computeDraftOrder(teams, standingsById, playoffResult, [], createRng(1));
  const tailOrder = round1Order.slice(-4); // exactly the 4 MLB1 playoff teams
  assert(new Set(tailOrder).size === 4 && ['f1', 'f2', 'f3', 'f4'].every((id) => tailOrder.includes(id)), 'the playoff tail contains exactly the 4 MLB1 bracket participants');
  assert(tailOrder.indexOf('f3') < tailOrder.indexOf('f2'), 'both f2 and f3 cleared 0 rounds, so the tiebreak (worse season record) puts f3 (.432) before f2 (.494)');
  assert(tailOrder.indexOf('f2') < tailOrder.indexOf('f1'), 'f1 (Finals winner, 3 rounds cleared) drafts last among the tail');
  assert(round1Order[0] === 'L1', 'the sole lottery-pool team (L1) still drafts before every playoff team');
}

console.log('\n=== 8. buildDraftPicks: shape, non-snake ===\n');
{
  const round1Order = ['a', 'b', 'c'];
  const regularOrder = ['c', 'a', 'b']; // deliberately different from round1Order
  const picks = buildDraftPicks(round1Order, regularOrder, 3);

  assert(picks.length === 9, '3 rounds x 3 teams = 9 total picks');
  assert(new Set(picks.map((p) => p.id)).size === 9, 'every pick has a unique id');
  assert(picks.slice(0, 3).map((p) => p.currentOwnerTeamId).join(',') === 'a,b,c', 'round 1 uses round1Order');
  assert(picks.slice(3, 6).map((p) => p.currentOwnerTeamId).join(',') === 'c,a,b', 'round 2 uses regularOrder');
  assert(picks.slice(6, 9).map((p) => p.currentOwnerTeamId).join(',') === 'c,a,b', 'round 3 uses the SAME regularOrder as round 2 — not a snake draft');
  assert(picks.every((p) => p.originalTeamId === p.currentOwnerTeamId), 'no pick has been traded — original and current owner match');
}

console.log('\n=== 9. resolveDraft: best-available-by-scoutedPotential ===\n');
{
  function prospect(id, scoutedPotential) {
    return createPlayer({
      id, firstName: 'P', lastName: id, primaryPosition: 'SS', eligiblePositions: ['SS'], isPitcher: false,
      ratings: { contact: createRating(50, 50, scoutedPotential), power: createRating(50, 50, scoutedPotential), eye: createRating(50, 50, scoutedPotential),
        buntingSkill: createRating(50), speed: createRating(50), baserunningInstincts: createRating(50),
        fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
        workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50) },
    });
  }
  const draftClass = [prospect('low', 30), prospect('high', 70), prospect('mid', 50)];
  const picks = buildDraftPicks(['teamA', 'teamB', 'teamC'], ['teamA', 'teamB', 'teamC'], 1);
  const { selections } = resolveDraft(picks, draftClass);

  assert(selections.length === 3, 'every pick resolves to a selection');
  assert(selections[0].playerId === 'high', 'the first pick takes the highest-scoutedPotential prospect');
  assert(selections[1].playerId === 'mid', 'the second pick takes the next-best remaining prospect');
  assert(selections[2].playerId === 'low', 'the third pick takes whoever is left');
  assert(new Set(selections.map((s) => s.playerId)).size === 3, 'no prospect is drafted twice');
}

console.log('\n=== 10. assignSignedDraftees: real Rookie-roster insertion ===\n');
{
  const hitter = createPlayer({ id: 'draftee-hitter', firstName: 'New', lastName: 'Guy', primaryPosition: 'CF', eligiblePositions: ['CF'], isPitcher: false });
  const pitcher = createPlayer({ id: 'draftee-pitcher', firstName: 'New', lastName: 'Arm', primaryPosition: 'RP', eligiblePositions: ['RP'], isPitcher: true });
  const draftClass = [hitter, pitcher];
  const selections = [
    { pickId: 'p1', round: 1, pickNumber: 1, teamId: 'my-team', playerId: 'draftee-hitter' },
    { pickId: 'p2', round: 1, pickNumber: 2, teamId: 'my-team', playerId: 'draftee-pitcher' },
  ];
  const affiliateRosterByClubId = new Map([
    ['my-team-ROOKIE', { lineup: [], rotation: [], bullpen: [], bench: [] }],
  ]);

  assignSignedDraftees(selections, draftClass, affiliateRosterByClubId);
  const rookieRoster = affiliateRosterByClubId.get('my-team-ROOKIE');
  assert(rookieRoster.lineup.some((p) => p.id === 'draftee-hitter'), 'the drafted position player is appended to the Rookie lineup section');
  assert(rookieRoster.bullpen.some((p) => p.id === 'draftee-pitcher'), 'the drafted RP is appended to the Rookie bullpen section');
  assert(rookieRoster.lineup.find((p) => p.id === 'draftee-hitter').developmentLevel === 'ROOKIE', "the signed draftee's developmentLevel is set to ROOKIE");
  assert(rookieRoster.lineup.find((p) => p.id === 'draftee-hitter').teamId === 'my-team', "the signed draftee's teamId is the parent MLB club, not the affiliate");

  const missingClub = assignSignedDraftees(selections, draftClass, new Map());
  assert(missingClub === undefined, 'gracefully no-ops (does not throw) when the target affiliate roster is missing');
}

console.log('\n=== 11. Real wiring: data/season.js ===\n');
{
  const mod = await import('../src/data/season.js');
  const { affiliateClubs } = await import('../src/data/realAffiliates.js');
  const state = mod.initialLeagueState;

  assert(!!state.draftResult, 'season 1 has a real draftResult');
  assert(state.draftResult.picks.length === DRAFT_ROUNDS * 50, `the full draft has ${DRAFT_ROUNDS * 50} picks (got ${state.draftResult.picks.length})`);
  assert(state.draftResult.selections.length === state.draftResult.picks.length, 'every pick resolves to a selection (100% sign-rate placeholder)');
  assert(state.draftResult.selections.every((s) => s.firstName && s.lastName && s.primaryPosition), 'every selection is enriched with real display fields, not just a bare playerId');

  const rookieClubs = affiliateClubs.filter((c) => c.level === 'ROOKIE');
  let totalRookiePlayers = 0;
  for (const club of rookieClubs) {
    const roster = state.affiliateRosterByClubId.get(club.id);
    totalRookiePlayers += roster.lineup.length + roster.rotation.length + roster.bullpen.length + roster.bench.length;
  }
  const expected = rookieClubs.length * 20 + DRAFT_ROUNDS * 50; // Phase 1's initial 20/club + this season's full draft class, all signed to Rookie
  assert(totalRookiePlayers === expected, `total Rookie-ball headcount reflects the full draft class added on top of Phase 1's seed rosters (expected ${expected}, got ${totalRookiePlayers})`);

  // Real bug caught and fixed during this phase's own live verification:
  // advanceToNextSeason() must run the draft against the season it JUST
  // simulated (seasonNumber 2's own results), not the incoming state's
  // (season 1's — already consumed by season 1's own draft above) —
  // reusing the same season's results twice would silently draft the same
  // competitive picture again instead of a fresh one. Headcount after one
  // real advance should reflect TWO full draft classes on top of the seed.
  const state2 = mod.advanceToNextSeason(state);
  assert(state2.draftResult.seasonNumber === 2, "advancing one season produces a draftResult sourced from season 2's own results, not season 1's again");
  assert(
    JSON.stringify(state2.draftResult.selections.map((s) => s.playerId)) !== JSON.stringify(state.draftResult.selections.map((s) => s.playerId)),
    "season 2's draft class is a genuinely fresh set of prospects, not a re-run of season 1's"
  );
  let totalRookiePlayersAfter = 0;
  for (const club of rookieClubs) {
    const roster = state2.affiliateRosterByClubId.get(club.id);
    totalRookiePlayersAfter += roster.lineup.length + roster.rotation.length + roster.bullpen.length + roster.bench.length;
  }
  assert(
    totalRookiePlayersAfter === rookieClubs.length * 20 + DRAFT_ROUNDS * 50 * 2,
    `after one real season advance, Rookie-ball headcount reflects exactly TWO draft classes on top of the seed (expected ${rookieClubs.length * 20 + DRAFT_ROUNDS * 50 * 2}, got ${totalRookiePlayersAfter})`
  );
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
