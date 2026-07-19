// One-time build script — NOT part of the dev-server path. Simulates a
// real, bounded multi-season league history (engine/leagueProgression.js)
// and runs the full Hall of Fame eligibility/case-score/ballot/Legacy
// Committee pipeline (engine/hallOfFame.js) against it, then writes the
// result to src/data/hallOfFameSnapshot.json.
//
// Why a precomputed snapshot rather than a live simulation: data/
// realLeague.js/data/season.js are fixed, eager, computed-once-at-module-
// load singletons (no shared app state exists to make them advanceable —
// see baseball-sim/CLAUDE.md). Simulating enough seasons for a real Hall
// of Fame class to exist (10 years service + 5 retired = a ~15-season
// minimum) is also too slow to run on every dev-server load. Run this
// script manually (`node scripts/build-hall-of-fame-snapshot.mjs`)
// whenever the snapshot needs regenerating — it is NOT run automatically.
//
// Uses the real 150-game season length (engine/season.js's
// TARGET_GAMES_PER_TEAM) deliberately, not a shortened one — the Hall
// case score formula's "great career" denominators (engine/hallOfFame.js)
// are calibrated against real career-length accumulation at that pace
// (confirmed directly: a shortened 100-game/season trial run topped out
// around case score 38 — nowhere near the ~70 election-competitive range
// — while a 150-game/season trial reached 93). SNAPSHOT_SEASONS is the
// one real compromise, bounded to keep this a tractable one-time cost.

import { teams, getTeamRoster, getTeamManager } from '../src/data/realLeague.js';
import { buildWritersCorps } from '../src/models/seed/writersCorpsSeed.js';
import { simulateLeagueHistory } from '../src/engine/leagueProgression.js';
import {
  isHallEligible, computeBatterHallCaseScore, computePitcherHallCaseScore, computeManagerHallCaseScore,
  clearedNamedMilestone, runHallOfFameBallot, runLegacyCommitteeReview,
  SERVICE_YEARS_REQUIRED, RETIREMENT_WAIT_YEARS,
} from '../src/engine/hallOfFame.js';
import { createRng } from '../src/models/generation/random.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SNAPSHOT_SEED = 20260719;
const SNAPSHOT_SEASONS = 25;
const SNAPSHOT_GAMES_PER_SEASON = 150; // TARGET_GAMES_PER_TEAM — see file header for why this must be the real length, not a shortened one

const startedAt = Date.now();
const rng = createRng(SNAPSHOT_SEED);

console.log(`Building Hall of Fame snapshot: ${SNAPSHOT_SEASONS} seasons x ${SNAPSHOT_GAMES_PER_SEASON} games/team, ${teams.length} teams...`);

const rosterByTeamId = new Map(teams.map((t) => [t.id, getTeamRoster(t.id)]));
const managerByTeamId = new Map(teams.map((t) => [t.id, getTeamManager(t.id)]));
const writers = buildWritersCorps(teams, rng);
console.log(`Writers Corps: ${writers.length}`);

const history = simulateLeagueHistory(
  teams, rosterByTeamId, managerByTeamId, writers,
  {
    seasons: SNAPSHOT_SEASONS,
    gamesPerSeason: SNAPSHOT_GAMES_PER_SEASON,
    onSeasonComplete: ({ seasonNumber, totalSeasons, retiredPlayerCount, retiredManagerCount }) => {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`  season ${seasonNumber}/${totalSeasons} done (${elapsedSec}s elapsed) — ${retiredPlayerCount} player(s), ${retiredManagerCount} manager(s) retired`);
    },
  },
  rng
);

console.log(`League history simulated in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. Building candidate pool...`);

// ===== Build every candidate who ever becomes Hall-eligible, bucketed by
// the season number he FIRST becomes eligible =====

const candidatesByEligibleSeason = new Map();
function queueCandidate(eligibleFromSeason, candidate) {
  if (eligibleFromSeason < 1 || eligibleFromSeason > SNAPSHOT_SEASONS) return; // never actually reached within this snapshot's window
  if (!candidatesByEligibleSeason.has(eligibleFromSeason)) candidatesByEligibleSeason.set(eligibleFromSeason, []);
  candidatesByEligibleSeason.get(eligibleFromSeason).push(candidate);
}

for (const [playerId, retiredAfterSeason] of history.retiredAfterSeasonByPlayerId) {
  const seasonsOfService = history.seasonsPlayedById.get(playerId) ?? 0;
  if (!isHallEligible(seasonsOfService, RETIREMENT_WAIT_YEARS)) continue; // service gate — retirement-wait gate is what eligibleFromSeason encodes below
  if (seasonsOfService < SERVICE_YEARS_REQUIRED) continue;
  const registry = history.playerRegistryById.get(playerId);
  if (!registry) continue; // shouldn't happen — every retiree was on a roster at some point
  const totals = registry.isPitcher ? history.careerPitchingStatsById.get(playerId) : history.careerBattingStatsById.get(playerId);
  if (!totals) continue; // never actually recorded a PA/batter-faced (e.g. injured out immediately) — no real case to evaluate
  const caseScore = registry.isPitcher ? computePitcherHallCaseScore(totals) : computeBatterHallCaseScore(totals);
  queueCandidate(retiredAfterSeason + RETIREMENT_WAIT_YEARS, {
    id: playerId,
    type: registry.isPitcher ? 'pitcher' : 'batter',
    name: `${registry.firstName} ${registry.lastName}`,
    primaryTeamId: registry.teamId,
    caseScore,
    clearedMilestone: clearedNamedMilestone(totals),
    yearsOnBallot: 0,
  });
}

for (const [managerId, retiredAfterSeason] of history.retiredAfterSeasonByManagerId) {
  const record = history.careerManagerRecordById.get(managerId);
  if (!record || !isHallEligible(record.seasonsManaged, RETIREMENT_WAIT_YEARS) || record.seasonsManaged < SERVICE_YEARS_REQUIRED) continue;
  const registry = history.managerRegistryById.get(managerId);
  if (!registry) continue;
  queueCandidate(retiredAfterSeason + RETIREMENT_WAIT_YEARS, {
    id: managerId,
    type: 'manager',
    name: `${registry.firstName} ${registry.lastName}`,
    primaryTeamId: registry.teamId,
    caseScore: computeManagerHallCaseScore(record),
    clearedMilestone: false, // the doc's milestone table is batting/pitching-only, managers don't have an equivalent named milestone
    yearsOnBallot: 0,
  });
}

const totalQueued = [...candidatesByEligibleSeason.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`${totalQueued} candidate(s) will reach eligibility within this ${SNAPSHOT_SEASONS}-season window.`);

// ===== Chronological ballot simulation — one round per season from the
// first eligibility year through the final simulated season. Uses the
// FINAL Writers Corps for every round (a real, explicitly-flagged
// simplification — building per-season Writers Corps snapshots across 25
// seasons for a modest historical-accuracy gain wasn't attempted this
// pass; writer sliders don't change over a career anyway, only who's in
// the corps does). =====

let activeBallot = [];
const inductees = [];
const legacyPool = [];

for (let seasonNumber = 1; seasonNumber <= SNAPSHOT_SEASONS; seasonNumber++) {
  const newlyEligible = candidatesByEligibleSeason.get(seasonNumber) ?? [];
  activeBallot.push(...newlyEligible);
  if (activeBallot.length === 0) continue;

  const results = runHallOfFameBallot(activeBallot, history.finalWriters, rng);
  const stillActive = [];
  for (const result of results) {
    if (result.elected) {
      inductees.push({ ...result, inductionSeasonNumber: seasonNumber, viaLegacyCommittee: false });
    } else if (result.droppedFromBallot) {
      legacyPool.push(result);
    } else {
      stillActive.push(result);
    }
  }
  activeBallot = stillActive;
}

console.log(`Regular ballot: ${inductees.length} inductee(s), ${legacyPool.length} dropped candidate(s), ${activeBallot.length} still active at snapshot end.`);

// ===== Legacy Committee — one review pass over everyone the regular
// ballot dropped, per the doc's own "deliberately simplified for v1"
// permission. =====

if (legacyPool.length > 0) {
  const legacyResults = runLegacyCommitteeReview(legacyPool, history.finalWriters, rng);
  for (const legacyResult of legacyResults) {
    if (legacyResult.electedByLegacyCommittee) {
      const original = legacyPool.find((c) => c.id === legacyResult.id);
      inductees.push({ ...original, inductionSeasonNumber: SNAPSHOT_SEASONS, viaLegacyCommittee: true, voteShare: legacyResult.legacyVoteShare });
    }
  }
  console.log(`Legacy Committee: ${inductees.filter((i) => i.viaLegacyCommittee).length} additional inductee(s).`);
}

inductees.sort((a, b) => b.caseScore - a.caseScore);
activeBallot.sort((a, b) => b.caseScore - a.caseScore);

const snapshot = {
  generatedAt: new Date().toISOString(),
  seed: SNAPSHOT_SEED,
  seasonsSimulated: SNAPSHOT_SEASONS,
  gamesPerSeason: SNAPSHOT_GAMES_PER_SEASON,
  teamCount: teams.length,
  writersCorpsSize: writers.length,
  inductees,
  onBallot: activeBallot,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'src', 'data', 'hallOfFameSnapshot.json');
writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(`Total time: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
