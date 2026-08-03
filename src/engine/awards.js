// Individual Season Awards — awards-and-hall-of-fame.md's "Individual
// Season Awards" section. The first real awards system anywhere in this
// project: engine/hallOfFame.js's header has said since §18 that awards are
// a zero-weighted case-score extension point precisely because "no awards
// ... system exists," and Phase 7 of the 50-man Roster arc had to defer its
// ROY service-time credit and draft-pick compensation for the same reason.
//
// Per the doc, every award is **per league** — Foundry and Exchange each
// run their own slate, exactly as real MLB's two leagues do.
//
// **Two of the doc's awards are genuinely NOT buildable and are documented
// rather than faked** (both with real, named blockers):
//   - GOLD GLOVE: §14 built defense as a TEAM-LEVEL composite with no
//     per-fielder attribution, so no per-player fielding stats exist at all
//     — there is literally nothing to vote on.
//   - FINALS MVP: engine/playoffs.js's simulateBestOfSeries discards each
//     game's box score (it keeps only runs and injuries), so no per-player
//     postseason stats exist either.
// Both become buildable the moment those two gaps close; neither is
// approximated here.
//
// The electorate is REUSED, not reinvented: engine/hallOfFame.js's
// simulateWriterVote already models Traditionalism (milestone bias),
// Homerism (favourite-team bias) and Quirkiness/Contrarianism (real
// gaussian noise) against a Writer's own sliders. Award candidates are
// shaped to that same {caseScore, clearedMilestone, primaryTeamId}
// contract rather than growing a second voting system.

import { WOBA_WEIGHTS } from './hotColdStreaks.js';
import { simulateWriterVote } from './hallOfFame.js';
import { computeServiceYears } from './serviceTime.js';
import { computeWinPct } from './managerFiring.js';
import { PA_OUTCOMES } from './plateAppearanceConstants.js';

export const AWARD_TYPES = Object.freeze({
  MVP: 'MVP',
  BEST_PITCHER: 'BEST_PITCHER',
  ROOKIE_OF_THE_YEAR: 'ROOKIE_OF_THE_YEAR',
  MANAGER_OF_THE_YEAR: 'MANAGER_OF_THE_YEAR',
  SILVER_SLUGGER: 'SILVER_SLUGGER',
});

// The doc's confirmed "full granular slate" for Silver Slugger. Pitchers
// are excluded on purpose — it's a hitting award.
export const SILVER_SLUGGER_POSITIONS = Object.freeze(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);

// A player needs a real season before he can win anything — otherwise a
// 12-plate-appearance September call-up with three home runs tops the rate
// stats. Placeholders, same tuning status as every constant in this engine.
export const MIN_PA_FOR_AWARD = 300;
export const MIN_OUTS_RECORDED_FOR_AWARD = 300; // 100 innings

// simulateWriterVote is calibrated around a Hall-of-Fame case score
// (center 70, spread 40). Award scores live on a completely different
// scale, so candidates are NORMALISED into that band relative to their own
// field before voting — the best candidate in a league lands clearly above
// the center, the weakest clearly below, and the writers' own biases still
// decide between them. Mapping raw award scores onto the HOF scale
// directly would make every vote unanimous or unanimous-against.
const VOTE_SCALE_CENTER = 70;
// **Calibrated empirically, and the first value made the electorate
// decorative.** simulateWriterVote's own probability is
// `0.5 + (caseScore - 70) / 40`, so at spread 30 the best candidate landed
// at caseScore 100 -> probability 1.25, clamped to certainty: EVERY award
// was unanimous and the writers' Homerism/Contrarianism sliders could
// never change an outcome. The vote existed but did nothing. At 12 the
// field spans roughly 0.8 down to 0.2 vote probability, so a strong
// favourite usually wins but a homer-heavy or contrarian corps can
// genuinely swing a close race — which is the entire reason for reusing
// the Writers Corps rather than just taking the top score.
const VOTE_SCALE_SPREAD = 12;
// Only a real shortlist goes to a ballot; nobody votes on the 200th-best
// hitter, and including everyone would flatten the normalisation.
export const AWARD_BALLOT_SIZE = 8;

// ===== Scoring =====

/**
 * Season offensive value, using engine/hotColdStreaks.js's own real-MLB
 * linear weights (exported for this reuse) rather than a second composite.
 * Deliberately a COUNTING total, not a rate: an award should reward a
 * whole season's production, so 600 good plate appearances beat 200
 * excellent ones — which is also what stops a hot streak winning an MVP.
 * @param {object} stats - a seasonBattingStatsById entry
 * @returns {number}
 */
export function computeBatterAwardScore(stats) {
  if (!stats || (stats.pa ?? 0) < MIN_PA_FOR_AWARD) return 0;
  const singles = Math.max(0, (stats.h ?? 0) - (stats.doubles ?? 0) - (stats.triples ?? 0) - (stats.hr ?? 0));
  return (
    singles * WOBA_WEIGHTS[PA_OUTCOMES.SINGLE] +
    (stats.doubles ?? 0) * WOBA_WEIGHTS[PA_OUTCOMES.DOUBLE] +
    (stats.triples ?? 0) * WOBA_WEIGHTS[PA_OUTCOMES.TRIPLE] +
    (stats.hr ?? 0) * WOBA_WEIGHTS[PA_OUTCOMES.HOME_RUN] +
    (stats.bb ?? 0) * WOBA_WEIGHTS[PA_OUTCOMES.WALK] +
    (stats.hbp ?? 0) * WOBA_WEIGHTS[PA_OUTCOMES.HIT_BY_PITCH]
  );
}

/**
 * Season pitching value — innings shouldered, strikeouts, and runs
 * prevented relative to a league-ish baseline. Same counting-not-rate
 * reasoning as the batter score.
 * @param {object} stats - a seasonPitchingStatsById entry
 * @returns {number}
 */
export function computePitcherAwardScore(stats) {
  if (!stats || (stats.outsRecorded ?? 0) < MIN_OUTS_RECORDED_FOR_AWARD) return 0;
  const innings = stats.outsRecorded / 3;
  // Runs saved against a ~4.5 ER/9 reference, plus a modest strikeout
  // credit — both illustrative placeholders needing real playtesting.
  const runsSaved = innings * (4.5 / 9) - (stats.er ?? 0);
  return runsSaved * 2 + (stats.k ?? 0) * 0.15 + innings * 0.1;
}

/**
 * **A real payoff from the 50-man Roster arc's Phase 4**: rookie status is
 * genuine accrued MLB service time, not a guess at age or a "first season
 * we saw him" heuristic. A player is a rookie for the season he enters
 * with under one full year of service.
 * @param {object} serviceRecord
 * @param {number} seasonJustPlayedCredit - service days credited for the
 *   season being judged, which must be excluded (he accrues it DURING the
 *   season he'd win the award for).
 */
export function isRookieSeason(serviceRecord, seasonJustPlayedCredit) {
  if (!serviceRecord) return false;
  const priorDays = Math.max(0, (serviceRecord.mlbServiceDays ?? 0) - seasonJustPlayedCredit);
  return computeServiceYears(priorDays) < 1;
}

// ===== Voting =====

/**
 * Normalises a field of candidates onto simulateWriterVote's own case-score
 * scale, then runs a real ballot: every writer votes yes/no on every
 * candidate, and the highest vote share wins.
 * @param {{id: string, score: number, primaryTeamId: string|null, clearedMilestone?: boolean}[]} candidates
 * @param {object[]} writers - Writer[]
 * @param {() => number} rng
 * @returns {{winnerId: string|null, results: {id: string, voteShare: number, score: number}[]}}
 */
export function runAwardVote(candidates, writers, rng) {
  if (candidates.length === 0 || writers.length === 0) return { winnerId: null, results: [] };

  const shortlist = [...candidates].sort((a, b) => b.score - a.score).slice(0, AWARD_BALLOT_SIZE);
  const best = shortlist[0].score;
  const worst = shortlist[shortlist.length - 1].score;
  const span = best - worst;

  const results = shortlist.map((candidate) => {
    // A degenerate field (one candidate, or all identical) sits at the
    // center rather than dividing by zero.
    const fraction = span > 0 ? (candidate.score - worst) / span : 0.5;
    const caseScore = VOTE_SCALE_CENTER - VOTE_SCALE_SPREAD + fraction * VOTE_SCALE_SPREAD * 2;
    const yes = writers.filter((w) =>
      simulateWriterVote(w, { caseScore, clearedMilestone: candidate.clearedMilestone ?? false, primaryTeamId: candidate.primaryTeamId ?? null }, rng)
    ).length;
    return { id: candidate.id, voteShare: yes / writers.length, score: candidate.score };
  });

  // Highest vote share; ties broken by award score then id — this
  // codebase's standing deterministic-tiebreak convention (see
  // promotionRelegation.js/playoffs.js).
  const winner = [...results].sort((a, b) => b.voteShare - a.voteShare || b.score - a.score || a.id.localeCompare(b.id))[0];
  return { winnerId: winner?.id ?? null, results: results.sort((a, b) => b.voteShare - a.voteShare) };
}

// ===== The season slate =====

function playerLeague(player, teamsById) {
  return teamsById.get(player.teamId)?.leagueId ?? null;
}

/**
 * Runs every award for one league. Kept separate from runSeasonAwards so
 * the per-league split (the doc's own structure) is explicit rather than
 * buried in a loop body.
 */
function runLeagueAwards({ leagueId, players, teamsById, battingStats, pitchingStats, managers, standingsById, writers, rng, seasonServiceCredit }) {
  const awards = [];
  const leaguePlayers = players.filter((p) => playerLeague(p, teamsById) === leagueId);
  const leagueWriters = writers.filter((w) => teamsById.get(w.favoriteTeamId)?.leagueId === leagueId);
  // Fall back to the whole corps if a league somehow has no local writers,
  // rather than silently producing no award.
  const voters = leagueWriters.length > 0 ? leagueWriters : writers;

  const batterCandidates = leaguePlayers
    .filter((p) => !p.isPitcher)
    .map((p) => ({ id: p.id, player: p, score: computeBatterAwardScore(battingStats.get(p.id)), primaryTeamId: p.teamId }))
    .filter((c) => c.score > 0);

  const pitcherCandidates = leaguePlayers
    .filter((p) => p.isPitcher)
    .map((p) => ({ id: p.id, player: p, score: computePitcherAwardScore(pitchingStats.get(p.id)), primaryTeamId: p.teamId }))
    .filter((c) => c.score > 0);

  function record(type, position, vote, pool) {
    if (!vote.winnerId) return;
    const winner = pool.find((c) => c.id === vote.winnerId);
    awards.push({
      type, position: position ?? null, leagueId,
      playerId: winner.id,
      firstName: winner.player?.firstName ?? winner.firstName,
      lastName: winner.player?.lastName ?? winner.lastName,
      teamId: winner.primaryTeamId,
      voteShare: vote.results[0]?.voteShare ?? 0,
      score: winner.score,
    });
  }

  record(AWARD_TYPES.MVP, null, runAwardVote(batterCandidates, voters, rng), batterCandidates);
  record(AWARD_TYPES.BEST_PITCHER, null, runAwardVote(pitcherCandidates, voters, rng), pitcherCandidates);

  // Rookie of the Year draws from BOTH pools — a rookie pitcher can win it.
  const rookiePool = [...batterCandidates, ...pitcherCandidates].filter((c) => isRookieSeason(c.player.serviceRecord, seasonServiceCredit));
  record(AWARD_TYPES.ROOKIE_OF_THE_YEAR, null, runAwardVote(rookiePool, voters, rng), rookiePool);

  for (const position of SILVER_SLUGGER_POSITIONS) {
    const pool = batterCandidates.filter((c) => c.player.primaryPosition === position);
    record(AWARD_TYPES.SILVER_SLUGGER, position, runAwardVote(pool, voters, rng), pool);
  }

  // Manager of the Year — scored on real win%, voted like the rest.
  const managerCandidates = managers
    .filter((m) => teamsById.get(m.teamId)?.leagueId === leagueId)
    .map((m) => {
      const record_ = standingsById.get(m.teamId) ?? { wins: 0, losses: 0 };
      return {
        id: m.manager.id, firstName: m.manager.firstName, lastName: m.manager.lastName,
        score: computeWinPct(record_.wins, record_.losses), primaryTeamId: m.teamId, player: null,
      };
    })
    .filter((c) => c.score > 0);
  record(AWARD_TYPES.MANAGER_OF_THE_YEAR, null, runAwardVote(managerCandidates, voters, rng), managerCandidates);

  return awards;
}

/**
 * Every award for every league, for one completed season.
 * @returns {{awards: object[]}}
 */
export function runSeasonAwards({ teams, rosterByTeamId, seasonResult, managerAssignmentById, writers, rng, seasonServiceCredit }) {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const players = [];
  for (const [, roster] of rosterByTeamId) {
    for (const key of ['lineup', 'rotation', 'bullpen', 'bench']) players.push(...roster[key]);
  }

  const managers = [];
  for (const [teamId, manager] of managerAssignmentById ?? new Map()) {
    if (manager) managers.push({ teamId, manager });
  }

  const leagueIds = [...new Set(teams.map((t) => t.leagueId))];
  const awards = [];
  for (const leagueId of leagueIds) {
    awards.push(
      ...runLeagueAwards({
        leagueId, players, teamsById,
        battingStats: seasonResult.seasonBattingStatsById ?? new Map(),
        pitchingStats: seasonResult.seasonPitchingStatsById ?? new Map(),
        managers, standingsById: seasonResult.standingsById ?? new Map(),
        writers, rng, seasonServiceCredit,
      })
    );
  }
  return { awards };
}
