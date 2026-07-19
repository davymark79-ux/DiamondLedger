// Re-runnable sanity check for the Hall of Fame infrastructure (engine/
// season.js's season-total stats, engine/leagueProgression.js's season-
// to-season driver, models/Writer.js + generation/seed, engine/
// writerRetirement.js, engine/hallOfFame.js): `npm run validate:hof`.
// Same style as the other validate:* scripts — eyeball checks plus hard
// asserts on structural invariants.

import { createPlayer, createRating } from '../src/models/Player.js';
import { createManager } from '../src/models/Manager.js';
import { createWriter } from '../src/models/Writer.js';
import { createRng } from '../src/models/generation/random.js';
import { generateWriter } from '../src/models/generation/writerGenerator.js';
import { buildWritersCorps } from '../src/models/seed/writersCorpsSeed.js';
import { computeWriterRetirementProbability, rollWriterRetirement } from '../src/engine/writerRetirement.js';
import { advanceOffseason, simulateLeagueHistory } from '../src/engine/leagueProgression.js';
import {
  isHallEligible, computeBatterHallCaseScore, computePitcherHallCaseScore, computeManagerHallCaseScore,
  clearedNamedMilestone, runHallOfFameBallot, runLegacyCommitteeReview,
  SERVICE_YEARS_REQUIRED, RETIREMENT_WAIT_YEARS, ELECTION_THRESHOLD, BALLOT_DROP_THRESHOLD, MAX_BALLOT_YEARS,
} from '../src/engine/hallOfFame.js';
import { teams, getTeamRoster, getTeamManager } from '../src/data/realLeague.js';

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  OK   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures++;
  }
}

console.log('=== 1. Eligibility gating (locked BBWAA-ported numbers) ===\n');
{
  assert(SERVICE_YEARS_REQUIRED === 10 && RETIREMENT_WAIT_YEARS === 5, 'the two locked eligibility numbers match the doc exactly (10 years service, 5 years retired)');
  assert(ELECTION_THRESHOLD === 0.75 && BALLOT_DROP_THRESHOLD === 0.05 && MAX_BALLOT_YEARS === 10, 'the three locked ballot numbers match the doc exactly (75% elects, <5% drops, 10-year max)');
  assert(!isHallEligible(9, 10), 'below the service-years gate, never eligible regardless of how long ago he retired');
  assert(!isHallEligible(15, 4), 'below the retirement-wait gate, never eligible regardless of service length');
  assert(isHallEligible(10, 5), 'exactly at both locked thresholds, eligible');
  assert(isHallEligible(20, 10), 'well past both thresholds, eligible');
}

console.log('\n=== 2. Case score direction ===\n');
{
  const greatBatter = { h: 3000, hr: 500, rbi: 1600, r: 1600, sb: 300 };
  const mediocreBatter = { h: 800, hr: 60, rbi: 400, r: 400, sb: 40 };
  assert(computeBatterHallCaseScore(greatBatter) > computeBatterHallCaseScore(mediocreBatter), 'a legendary batting career scores meaningfully higher than a mediocre one');
  assert(computeBatterHallCaseScore(greatBatter) > 75, 'a career clearing every doc-anchored batting milestone scores well above the vote-center');

  const greatPitcher = { wins: 300, k: 3200, outsRecorded: 9500, saves: 0 };
  const mediocrePitcher = { wins: 90, k: 900, outsRecorded: 3000, saves: 10 };
  assert(computePitcherHallCaseScore(greatPitcher) > computePitcherHallCaseScore(mediocrePitcher), 'a legendary pitching career scores meaningfully higher than a mediocre one');

  const greatManager = { wins: 1800, pennants: 6, seasonsManaged: 22 };
  const mediocreManager = { wins: 600, pennants: 0, seasonsManaged: 8 };
  assert(computeManagerHallCaseScore(greatManager) > computeManagerHallCaseScore(mediocreManager), 'a legendary managerial career scores meaningfully higher than a mediocre one');

  assert(clearedNamedMilestone({ h: 2775, hr: 0 }) === true, 'clearing exactly the hits milestone counts as cleared');
  assert(clearedNamedMilestone({ h: 2000, hr: 200, wins: 0 }) === false, 'falling short of every named milestone does not count as cleared');
}

console.log('\n=== 3. Writers Corps generation ===\n');
{
  const rng = createRng(101);
  const sample = teams.slice(0, 12);
  const writers = buildWritersCorps(sample, rng);
  assert(writers.length >= sample.length, 'at least one writer per team city (the doc\'s "one or more per city")');
  assert(writers.every((w) => w.sliders.traditionalism >= 1 && w.sliders.traditionalism <= 100), 'every writer slider stays within the 1-100 scale');
  assert(writers.every((w) => w.favoriteTeamId), 'every generated writer has a favorite team (drives Homerism)');
  assert(new Set(writers.map((w) => w.id)).size === writers.length, 'every writer gets a unique id');
}

console.log('\n=== 4. Writer retirement ===\n');
{
  const young = createWriter({ birthdate: '2000-01-01' });
  const old = createWriter({ birthdate: '1950-01-01' });
  const asOfDate = new Date('2026-07-19');
  assert(computeWriterRetirementProbability(young, { asOfDate }) === 0, 'a writer well below the age-60 window has zero retirement probability');
  assert(computeWriterRetirementProbability(old, { asOfDate }) > 0, 'a writer well past the age-60 window has a real retirement probability');
  assert(rollWriterRetirement(old, () => 0, { asOfDate }) === true, 'rollWriterRetirement fires when rng() undercuts a positive probability');
}

console.log('\n=== 5. advanceOffseason — growth, retirement, replenishment ===\n');
{
  const team = teams[0];
  const oldPlayer = createPlayer({
    id: 'old-timer', firstName: 'Old', lastName: 'Timer', primaryPosition: 'CF', isPitcher: false,
    birthdate: '1975-01-01', teamId: team.id, developmentLevel: 'MLB',
    ratings: {
      contact: createRating(55), power: createRating(55), eye: createRating(55), buntingSkill: createRating(50),
      speed: createRating(50), baserunningInstincts: createRating(50),
      fielding: createRating(50), armStrength: createRating(50), armAccuracy: createRating(50),
      workEthic: createRating(50), durability: createRating(50), consistency: createRating(50), coachability: createRating(50), platoonSkill: createRating(50),
    },
  });
  const roster = { lineup: [oldPlayer], rotation: [], bullpen: [], bench: [] };
  const rosterByTeamId = new Map([[team.id, roster]]);
  const oldManager = createManager({ id: 'old-manager', teamId: team.id, birthdate: '1945-01-01' });
  const managerByTeamId = new Map([[team.id, oldManager]]);
  const roleStateById = new Map();
  const asOfDate = new Date('2026-07-19');

  // Not a literal 0 — advanceOffseason also runs growth (gaussianRandom),
  // which loops `while (u === 0) u = rng()` internally; a constant-0 rng
  // hangs it forever. A tiny positive constant still reliably forces
  // rollRetirement's `rng() < probability` check for this very-old player
  // (whose probability sits at the age curve's ~0.75 max) without
  // triggering that loop.
  const result = advanceOffseason([team], rosterByTeamId, managerByTeamId, roleStateById, asOfDate, () => 0.0001);
  assert(result.retiredPlayerIds.includes('old-timer'), 'a player well past the retirement age curve retires under a forced roll');
  assert(result.retiredManagerIds.includes('old-manager'), 'a manager well past the retirement age curve retires under a forced roll');
  const newRoster = result.rosterByTeamId.get(team.id);
  assert(newRoster.lineup.length === 1 && newRoster.lineup[0].id !== 'old-timer', 'the retired player\'s slot is refilled by a freshly generated replacement, not left empty');
  assert(newRoster.lineup[0].primaryPosition === 'CF', 'the replacement is generated at the same position the retiree played');
  const newManager = result.managerByTeamId.get(team.id);
  assert(newManager.id !== 'old-manager', 'the retired manager is replaced by a freshly generated one');
}

console.log('\n=== 6. simulateLeagueHistory — real multi-season wiring ===\n');
{
  const rng = createRng(303);
  const sample = teams.slice(0, 16);
  const rosterByTeamId = new Map(sample.map((t) => [t.id, getTeamRoster(t.id)]));
  const managerByTeamId = new Map(sample.map((t) => [t.id, getTeamManager(t.id)]));
  const writers = buildWritersCorps(sample, rng);

  const history = simulateLeagueHistory(sample, rosterByTeamId, managerByTeamId, writers, { seasons: 8, gamesPerSeason: 20 }, rng);

  assert(history.careerBattingStatsById.size > 0, 'career batting totals accumulate across multiple seasons');
  assert(history.careerPitchingStatsById.size > 0, 'career pitching totals accumulate across multiple seasons');
  assert(history.careerManagerRecordById.size > 0, 'career manager records accumulate across multiple seasons');

  // A career total after 8 seasons should exceed any single season's total
  // for a player who stuck around the whole time (a real accumulation
  // check, not just "the Map is non-empty").
  const multiSeasonPlayerId = [...history.seasonsPlayedById.entries()].find(([, seasons]) => seasons >= 6)?.[0];
  assert(Boolean(multiSeasonPlayerId), 'at least one player accumulated 6+ seasons of service over an 8-season run');
  if (multiSeasonPlayerId) {
    const totals = history.careerBattingStatsById.get(multiSeasonPlayerId) ?? history.careerPitchingStatsById.get(multiSeasonPlayerId);
    assert(Boolean(totals) && totals.pa + (totals.battersFaced ?? 0) > 0, 'a multi-season player\'s career totals reflect real accumulated activity, not a stray zeroed entry');
  }

  assert(history.finalWriters.length === writers.length, 'the writers corps population stays stable across seasons (retirees replaced 1-for-1)');
  assert(history.seasonLog.length === 8, 'the season log records exactly one entry per simulated season');
}

console.log('\n=== 7. Hall of Fame ballot mechanics ===\n');
{
  const rng = createRng(404);
  const writersCorps = Array.from({ length: 40 }, (_, i) => generateWriter({ rng, city: 'Testville', favoriteTeamId: i % 2 === 0 ? 'team-a' : null, overrides: { id: `w${i}` } }));

  const slamDunkCandidate = { id: 'slam-dunk', caseScore: 150, clearedMilestone: true, primaryTeamId: null, yearsOnBallot: 0 };
  const hopelessCandidate = { id: 'hopeless', caseScore: 5, clearedMilestone: false, primaryTeamId: null, yearsOnBallot: 0 };
  const [slamResult, hopelessResult] = runHallOfFameBallot([slamDunkCandidate, hopelessCandidate], writersCorps, rng);

  assert(slamResult.voteShare > hopelessResult.voteShare, 'a slam-dunk case score produces a higher vote share than a hopeless one');
  assert(slamResult.elected === (slamResult.voteShare >= ELECTION_THRESHOLD), 'election is correctly gated at exactly the 75% threshold');
  assert(hopelessResult.droppedFromBallot === (hopelessResult.voteShare < BALLOT_DROP_THRESHOLD || hopelessResult.yearsOnBallot >= MAX_BALLOT_YEARS), 'ballot-drop is correctly gated at the <5% threshold or the 10-year max');

  const perpetualCandidate = { id: 'perpetual', caseScore: 60, clearedMilestone: false, primaryTeamId: null, yearsOnBallot: 9 };
  const [perpetualResult] = runHallOfFameBallot([perpetualCandidate], writersCorps, rng);
  assert(perpetualResult.yearsOnBallot === 10 && (perpetualResult.droppedFromBallot || perpetualResult.elected), 'a candidate reaching his 10th ballot year is always resolved one way or the other (elected or dropped), never left in limbo');
}

console.log('\n=== 8. Legacy Committee ===\n');
{
  const rng = createRng(505);
  const writersCorps = Array.from({ length: 30 }, (_, i) => generateWriter({ rng, city: 'Testville', favoriteTeamId: null, overrides: { id: `lw${i}` } }));
  const droppedCandidates = [
    { id: 'legacy-strong', caseScore: 140, clearedMilestone: true, primaryTeamId: null },
    { id: 'legacy-weak', caseScore: 10, clearedMilestone: false, primaryTeamId: null },
  ];
  const reviewed = runLegacyCommitteeReview(droppedCandidates, writersCorps, rng);
  assert(reviewed.length === 2, 'every dropped candidate submitted gets a Legacy Committee review result');
  const strong = reviewed.find((r) => r.id === 'legacy-strong');
  const weak = reviewed.find((r) => r.id === 'legacy-weak');
  assert(strong.legacyVoteShare > weak.legacyVoteShare, 'a strong case still outperforms a weak one under Legacy Committee review');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
