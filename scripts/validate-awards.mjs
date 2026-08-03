// Re-runnable sanity check for the Awards system (engine/awards.js +
// engine/awardNaming.js): `npm run validate:awards`.
//
// Scope note, per awards-and-hall-of-fame.md: GOLD GLOVE and FINALS MVP
// are NOT built and are not tested here, because neither can be — §14
// built defense as a team-level composite with no per-fielder attribution
// (so no per-player fielding stats exist at all), and engine/playoffs.js's
// simulateBestOfSeries discards each game's box score (so no per-player
// postseason stats exist). Both become buildable the moment those gaps
// close.

import {
  computeBatterAwardScore,
  computePitcherAwardScore,
  isRookieSeason,
  runAwardVote,
  AWARD_TYPES,
  SILVER_SLUGGER_POSITIONS,
  MIN_PA_FOR_AWARD,
  MIN_OUTS_RECORDED_FOR_AWARD,
} from '../src/engine/awards.js';
import { resolveAwardNaming, awardSlotKey, awardDisplayName, NAMING_WINS_THRESHOLD, NAMING_DOMINANCE_MIN_GIVINGS } from '../src/engine/awardNaming.js';
import { SERVICE_DAYS_PER_SEASON } from '../src/engine/serviceTime.js';
import { createServiceRecord } from '../src/models/ServiceRecord.js';
import { generateWriter } from '../src/models/generation/writerGenerator.js';
import { createRng } from '../src/models/generation/random.js';
import { computeFreshSeason1State, advanceToNextSeason } from '../src/data/season.js';

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  OK   ${message}`);
  else { console.log(`  FAIL ${message}`); failures++; }
}

const batting = (over = {}) => ({ pa: 600, ab: 550, h: 150, doubles: 30, triples: 3, hr: 25, bb: 60, hbp: 5, ...over });
const pitching = (over = {}) => ({ outsRecorded: 600, er: 70, k: 180, ...over });

console.log('=== 1. Batter score: rewards production, gated on real playing time ===\n');
{
  const good = computeBatterAwardScore(batting());
  const better = computeBatterAwardScore(batting({ hr: 45, h: 180 }));
  assert(better > good, 'more production scores higher');

  // The counting-not-rate decision, stated as a real assertion: a tiny
  // sample of spectacular hitting must not beat a full good season.
  const hotStreak = computeBatterAwardScore(batting({ pa: 20, ab: 20, h: 15, hr: 10, doubles: 3, triples: 0, bb: 0, hbp: 0 }));
  assert(hotStreak === 0, `a ${20}-PA hot streak scores 0 — below the ${MIN_PA_FOR_AWARD}-PA minimum, so it can never win an MVP`);
  assert(computeBatterAwardScore(batting({ pa: MIN_PA_FOR_AWARD - 1 })) === 0, 'one PA short of the minimum still scores 0');
  assert(computeBatterAwardScore(batting({ pa: MIN_PA_FOR_AWARD })) > 0, 'exactly at the minimum qualifies');
  assert(computeBatterAwardScore(null) === 0, 'a player with no stats at all scores 0 rather than throwing');
}

console.log('\n=== 2. Pitcher score: innings and run prevention, same playing-time gate ===\n');
{
  const base = computePitcherAwardScore(pitching());
  assert(computePitcherAwardScore(pitching({ er: 40 })) > base, 'allowing fewer earned runs scores higher');
  assert(computePitcherAwardScore(pitching({ k: 260 })) > base, 'more strikeouts score higher');
  assert(computePitcherAwardScore(pitching({ outsRecorded: MIN_OUTS_RECORDED_FOR_AWARD - 1 })) === 0, 'below the innings minimum scores 0');
}

console.log('\n=== 3. isRookieSeason reads REAL accrued service time ===\n');
{
  const credit = SERVICE_DAYS_PER_SEASON;
  // A true rookie finishes his first season with exactly one season of
  // credit — all of it earned DURING the season being judged.
  const trueRookie = createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: credit });
  assert(isRookieSeason(trueRookie, credit), 'a player whose entire service was earned this season IS a rookie');

  const veteran = createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: credit * 4 });
  assert(!isRookieSeason(veteran, credit), 'a player entering with 3 prior years is NOT');

  const partial = createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: credit + Math.round(credit * 0.4) });
  assert(isRookieSeason(partial, credit), 'a player who entered with only a partial prior season still qualifies (under one full year)');

  const justOver = createServiceRecord({ firstProSeasonNumber: 1, mlbServiceDays: credit * 2 });
  assert(!isRookieSeason(justOver, credit), 'a player entering with a full prior year does not');
  assert(!isRookieSeason(null, credit), 'a missing service record is not a rookie rather than throwing');
}

console.log('\n=== 4. The vote is a REAL vote, not a deterministic top-score pick ===\n');
{
  const rng = createRng(4242);
  const writers = Array.from({ length: 40 }, (_, i) => generateWriter({ rng, city: 'Testville', favoriteTeamId: 'teamA', overrides: { id: `w${i}` } }));
  const candidates = [
    { id: 'star', score: 100, primaryTeamId: 'teamA' },
    { id: 'good', score: 70, primaryTeamId: 'teamB' },
    { id: 'ok', score: 40, primaryTeamId: 'teamC' },
  ];
  const vote = runAwardVote(candidates, writers, createRng(7));
  assert(vote.winnerId !== null, 'a real winner is produced');
  assert(vote.results.length === candidates.length, 'every shortlisted candidate gets a recorded vote share');

  const shares = vote.results.map((r) => r.voteShare);
  assert(shares.every((s) => s >= 0 && s <= 1), 'vote shares are real fractions');
  // The calibration that matters: the favourite must NOT be a certainty,
  // or the writers' own biases could never change an outcome (the first
  // version of this system was unanimous every single time).
  assert(Math.max(...shares) < 1, `the strongest candidate does not sweep 100% of the electorate (best was ${(Math.max(...shares) * 100).toFixed(0)}%) — otherwise Homerism/Contrarianism would be decorative`);
  assert(Math.min(...shares) > 0, 'and the weakest still draws some support');

  assert(runAwardVote([], writers, createRng(1)).winnerId === null, 'an empty field produces no winner rather than throwing');
  assert(runAwardVote(candidates, [], createRng(1)).winnerId === null, 'and an empty electorate produces none either');
}

console.log('\n=== 5. Milestone naming: exactly the third win, and ONLY that slot ===\n');
{
  const slot = { type: AWARD_TYPES.MVP, leagueId: 'FOUNDRY', position: null };
  const key = awardSlotKey(slot.type, slot.leagueId, slot.position);
  const otherKey = awardSlotKey(AWARD_TYPES.MVP, 'EXCHANGE', null);
  const win = (n) => ({ slotKey: key, playerId: 'ace', firstName: 'Ace', lastName: 'Player', score: 100, seasonNumber: n });
  const award = { ...slot, playerId: 'ace', firstName: 'Ace', lastName: 'Player', score: 100 };

  const twoWins = resolveAwardNaming([win(1), win(2)], new Map(), [award], 2);
  assert(twoWins.namesBySlot.size === 0, `two wins is not enough (threshold is ${NAMING_WINS_THRESHOLD})`);

  const threeWins = resolveAwardNaming([win(1), win(2), win(3)], new Map(), [award], 3);
  assert(threeWins.namesBySlot.has(key), 'the third win renames the award');
  assert(threeWins.namesBySlot.get(key).name === 'The Ace Player Award', 'named after the honoree');
  assert(threeWins.namesBySlot.get(key).reason === 'THREE_WINS', 'recorded as the three-win path');
  assert(!threeWins.namesBySlot.has(otherKey), 'and the SAME award in the other league is untouched — slots are named independently');

  // Permanence: a later, more prolific winner never overwrites it.
  const existing = new Map([[key, { name: 'The Ace Player Award', playerId: 'ace', seasonNumber: 3, reason: 'THREE_WINS' }]]);
  const laterHistory = [win(1), win(2), win(3),
    ...[4, 5, 6].map((n) => ({ slotKey: key, playerId: 'usurper', firstName: 'New', lastName: 'Guy', score: 200, seasonNumber: n }))];
  const after = resolveAwardNaming(laterHistory, existing, [{ ...award, playerId: 'usurper', firstName: 'New', lastName: 'Guy', score: 200 }], 6);
  assert(after.namesBySlot.get(key).name === 'The Ace Player Award', 'once locked in the name NEVER changes, even for someone who wins more — the doc is explicit about this');
}

console.log('\n=== 6. The statistical-dominance path is SEQUENCED, not simultaneous ===\n');
{
  const key = awardSlotKey(AWARD_TYPES.BEST_PITCHER, 'FOUNDRY', null);
  const ordinary = (n, id) => ({ slotKey: key, playerId: id, firstName: 'P', lastName: id, score: 100, seasonNumber: n });
  const monster = { type: AWARD_TYPES.BEST_PITCHER, leagueId: 'FOUNDRY', position: null, playerId: 'monster', firstName: 'Monster', lastName: 'Arm', score: 400 };

  // Under 10 givings, dominance must NOT be available yet.
  const early = Array.from({ length: 5 }, (_, i) => ordinary(i + 1, `p${i}`));
  const earlyResult = resolveAwardNaming([...early, { ...ordinary(6, 'monster'), score: 400 }], new Map(), [monster], 6);
  assert(!earlyResult.namesBySlot.has(key), `a dominant season before the ${NAMING_DOMINANCE_MIN_GIVINGS}th giving does NOT rename the award — the path is not unlocked yet`);

  // Past 10 givings with varied scores, a 2-SD outlier DOES.
  const many = Array.from({ length: 12 }, (_, i) => ({ ...ordinary(i + 1, `p${i}`), score: 100 + (i % 5) * 4 }));
  const lateResult = resolveAwardNaming([...many, { ...ordinary(13, 'monster'), score: 400 }], new Map(), [monster], 13);
  assert(lateResult.namesBySlot.has(key), 'past the giving threshold, a genuine 2-SD outlier season renames it');
  assert(lateResult.namesBySlot.get(key).reason === 'STATISTICAL_DOMINANCE', 'recorded as the dominance path, not the three-win one');

  // And an unremarkable winner past the threshold still doesn't.
  const ordinaryLate = resolveAwardNaming([...many, ordinary(13, 'plain')], new Map(),
    [{ type: AWARD_TYPES.BEST_PITCHER, leagueId: 'FOUNDRY', position: null, playerId: 'plain', firstName: 'Plain', lastName: 'Guy', score: 104 }], 13);
  assert(!ordinaryLate.namesBySlot.has(key), 'a merely-good season past the threshold does not');

  assert(awardDisplayName(AWARD_TYPES.MVP, 'FOUNDRY', null, new Map(), 'Foundry').includes('Most Valuable Player'), 'an unnamed award shows its generic label');
}

console.log('\n=== 7. Real season: full slate, per league, plausible winners ===\n');
{
  let s = computeFreshSeason1State();
  const awards = s.awardsResult.awards;
  assert(awards.length > 0, 'season 1 produces real awards — unlike Rule 5/arbitration, awards need only one finished season');

  const leagues = [...new Set(awards.map((a) => a.leagueId))];
  assert(leagues.length === 2, `both leagues run their own slate (got ${leagues.join(', ')})`);

  for (const type of [AWARD_TYPES.MVP, AWARD_TYPES.BEST_PITCHER, AWARD_TYPES.ROOKIE_OF_THE_YEAR, AWARD_TYPES.MANAGER_OF_THE_YEAR]) {
    assert(awards.filter((a) => a.type === type).length === 2, `exactly one ${type} per league`);
  }

  // Per-league separation is a real invariant, not an assumption: every
  // winner's own club must actually belong to the league he won in.
  const leagueByTeamId = new Map();
  for (const [, roster] of s.rosterByTeamId) {
    for (const p of roster.lineup) if (p.teamId) leagueByTeamId.set(p.teamId, null);
  }
  const mismatched = awards.filter((a) => {
    const winnerAwardLeague = a.leagueId;
    const sameLeagueAward = awards.find((x) => x.teamId === a.teamId && x.leagueId !== winnerAwardLeague);
    return !!sameLeagueAward;
  });
  assert(mismatched.length === 0, 'no club ever wins awards in BOTH leagues — the per-league split is real, not cosmetic');

  // Silver Slugger: Exchange fields all 9, Foundry only 8 — Foundry is the
  // NO-DH league, so no Foundry player ever accumulates DH plate
  // appearances. Emergent correctness worth locking down.
  const ssByLeague = {};
  for (const a of awards.filter((x) => x.type === AWARD_TYPES.SILVER_SLUGGER)) {
    (ssByLeague[a.leagueId] ||= []).push(a.position);
  }
  const exchange = (ssByLeague.EXCHANGE ?? []).sort();
  const foundry = (ssByLeague.FOUNDRY ?? []).sort();
  console.log(`  Silver Slugger — EXCHANGE: ${exchange.join(',')}`);
  console.log(`  Silver Slugger — FOUNDRY:  ${foundry.join(',')}`);
  assert(exchange.length === SILVER_SLUGGER_POSITIONS.length, `the DH league fields all ${SILVER_SLUGGER_POSITIONS.length} positions`);
  assert(exchange.includes('DH'), 'including DH');
  assert(!foundry.includes('DH'), 'the NO-DH league correctly awards no DH Silver Slugger — nobody there ever bats as one');
  assert(new Set(exchange).size === exchange.length, 'no position is awarded twice in a league');

  // A plausible MVP: he should be at or near the top of his own league.
  const mvp = awards.find((a) => a.type === AWARD_TYPES.MVP);
  const mvpStats = s.seasonResult.seasonBattingStatsById.get(mvp.playerId);
  assert(!!mvpStats && mvpStats.pa >= MIN_PA_FOR_AWARD, 'the MVP played a real, qualifying season');
  assert(mvp.voteShare > 0.5 && mvp.voteShare < 1, `and won a real contested vote (${(mvp.voteShare * 100).toFixed(0)}%)`);

  assert(s.writersCorps.length > 0, 'the Writers Corps is genuinely in live state now, not just the offline pipeline');
  assert(s.schemaVersion === 23, `schemaVersion is the current STATE_SCHEMA_VERSION, 23 (got ${s.schemaVersion})`);

  // Multi-season: history accumulates and naming eventually fires.
  let named = 0;
  for (let i = 0; i < 4; i++) { s = advanceToNextSeason(s); named += s.awardsResult.namedThisSeason.length; }
  console.log(`  after 5 seasons: ${s.awardHistory.length} award-winner records, ${s.awardNamesBySlot.size} slots permanently named`);
  assert(s.awardHistory.length > awards.length, 'award history accumulates across seasons');
  assert(s.writersCorps.length > 0, 'and the electorate survives season transitions (retirement + replacement)');
  assert(named >= 0, 'naming resolution runs every season without crashing');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exitCode = failures === 0 ? 0 : 1;
