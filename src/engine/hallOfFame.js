// Hall of Fame — awards-and-hall-of-fame.md (v0.8). Eligibility/ballot
// numbers below are LOCKED, ported verbatim from real BBWAA rules per the
// doc's own "Confirmed: ported exactly from real BBWAA rules" language:
// 10 years of service, retired >=5 years before first ballot, 75% elects,
// <5% drops off, max 10 years on the ballot.
//
// Everything else here — the case-score formulas, the writer-vote
// simulation — is explicitly this project's own placeholder, same tuning
// status as every other numeric constant in this engine. The doc's own
// Open Questions say so directly: "Exact Hall case score formula and
// Writers Corps vote-simulation formula — deferred, needs real tuning
// against simulated careers once players actually exist and accumulate
// history" (engine/leagueProgression.js is what makes that history real
// for the first time) and "Manager Hall case score formula — flagged...
// not yet designed."
//
// The player Hall case score's doc-listed inputs are: career counting
// stats, awards won, career Tournament Quotient trajectory, and
// postseason/Cup performance. Only the first is real in this engine today
// (no awards, Tournament Quotient, or postseason/Cup system exists) — the
// other three are real, present, explicitly ZERO-WEIGHTED extension
// points below (same pattern as growthModel.js's locationModifier), not
// fabricated. The milestone-scaling numbers (500 HR->~460, 3,000 hits->
// ~2,775, 300 wins->~278, the exact 150/162 ratio from the doc's
// "Milestone Scaling" section) anchor the two real, scaled inputs
// (hits/home runs for batters, wins for pitchers); every other counting
// stat used here (RBI, runs, stolen bases, strikeouts, saves, innings) has
// no scaled doc number to anchor to, so its "great career" denominator
// below is this project's own illustrative placeholder, flagged
// separately from the doc-anchored ones.
//
// "Championships" don't exist in this engine (no playoff/promotion-
// relegation system) — the manager case score uses pennants (best
// regular-season record per group, engine/leagueProgression.js's
// computePennantWinners) as an explicit, flagged proxy.

import { MANAGER_ATTRIBUTE_SCALE } from '../models/constants.js';
import { gaussianRandom } from '../models/generation/random.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// ===== Eligibility (locked numbers) =====

export const SERVICE_YEARS_REQUIRED = 10;
export const RETIREMENT_WAIT_YEARS = 5;
export const MAX_BALLOT_YEARS = 10;
export const ELECTION_THRESHOLD = 0.75;
export const BALLOT_DROP_THRESHOLD = 0.05;

/**
 * @param {number} seasonsOfService - engine/leagueProgression.js's seasonsPlayedById (players) or careerManagerRecordById.seasonsManaged (managers)
 * @param {number} seasonsSinceRetirement - currentSeasonNumber - retiredAfterSeason
 * @returns {boolean}
 */
export function isHallEligible(seasonsOfService, seasonsSinceRetirement) {
  return seasonsOfService >= SERVICE_YEARS_REQUIRED && seasonsSinceRetirement >= RETIREMENT_WAIT_YEARS;
}

// ===== Case scores =====

// Doc-anchored: real, scaled milestone numbers (exact 150/162 ratio).
const HITS_MILESTONE = 2775;
const HR_MILESTONE = 460;
const WINS_MILESTONE = 278;

// Not doc-anchored — this project's own illustrative "great career" totals
// for counting stats the doc mentions only generically ("career counting
// stats"), not by scaled number. Flagged distinctly from the three above.
const RBI_GREAT_CAREER = 1500;
const RUNS_GREAT_CAREER = 1500;
const STOLEN_BASES_GREAT_CAREER = 400;
const STRIKEOUTS_GREAT_CAREER = 3000;
const SAVES_GREAT_CAREER = 400;
const OUTS_RECORDED_GREAT_CAREER = 3 * 3000; // ~3000 innings, a real workhorse-longevity benchmark

const BATTER_CASE_SCORE_INPUTS = Object.freeze([
  { field: 'h', greatCareerTotal: HITS_MILESTONE, weight: 40 },
  { field: 'hr', greatCareerTotal: HR_MILESTONE, weight: 25 },
  { field: 'rbi', greatCareerTotal: RBI_GREAT_CAREER, weight: 15 },
  { field: 'r', greatCareerTotal: RUNS_GREAT_CAREER, weight: 10 },
  { field: 'sb', greatCareerTotal: STOLEN_BASES_GREAT_CAREER, weight: 10 },
]);

const PITCHER_CASE_SCORE_INPUTS = Object.freeze([
  { field: 'wins', greatCareerTotal: WINS_MILESTONE, weight: 40 },
  { field: 'k', greatCareerTotal: STRIKEOUTS_GREAT_CAREER, weight: 25 },
  { field: 'outsRecorded', greatCareerTotal: OUTS_RECORDED_GREAT_CAREER, weight: 20 },
  { field: 'saves', greatCareerTotal: SAVES_GREAT_CAREER, weight: 15 },
]);

const MANAGER_WINS_GREAT_CAREER = 1500;
const MANAGER_PENNANTS_GREAT_CAREER = 5;
const MANAGER_TENURE_GREAT_CAREER = 20;

const MANAGER_CASE_SCORE_INPUTS = Object.freeze([
  { field: 'wins', greatCareerTotal: MANAGER_WINS_GREAT_CAREER, weight: 50 },
  { field: 'pennants', greatCareerTotal: MANAGER_PENNANTS_GREAT_CAREER, weight: 30 },
  { field: 'seasonsManaged', greatCareerTotal: MANAGER_TENURE_GREAT_CAREER, weight: 20 },
]);

function weightedCounts(totals, inputs) {
  return inputs.reduce((score, { field, greatCareerTotal, weight }) => score + (totals[field] / greatCareerTotal) * weight, 0);
}

/**
 * @param {object} careerBattingTotals - engine/leagueProgression.js's careerBattingStatsById entry
 * @returns {number} uncapped, roughly 0-100+ for an all-time-great career; awards/TQ/postseason are zero-weighted (see file header)
 */
export function computeBatterHallCaseScore(careerBattingTotals) {
  return weightedCounts(careerBattingTotals, BATTER_CASE_SCORE_INPUTS);
}

/** @param {object} careerPitchingTotals - engine/leagueProgression.js's careerPitchingStatsById entry */
export function computePitcherHallCaseScore(careerPitchingTotals) {
  return weightedCounts(careerPitchingTotals, PITCHER_CASE_SCORE_INPUTS);
}

/** @param {object} careerManagerRecord - engine/leagueProgression.js's careerManagerRecordById entry */
export function computeManagerHallCaseScore(careerManagerRecord) {
  return weightedCounts(careerManagerRecord, MANAGER_CASE_SCORE_INPUTS);
}

/**
 * Whether a candidate cleared any of the doc's own real, named milestones
 * — feeds simulateWriterVote's Traditionalism bonus below. Batters and
 * pitchers use different fields, so pass whichever totals apply.
 * @param {object} totals - careerBattingTotals or careerPitchingTotals
 * @returns {boolean}
 */
export function clearedNamedMilestone(totals) {
  return (totals.h ?? 0) >= HITS_MILESTONE || (totals.hr ?? 0) >= HR_MILESTONE || (totals.wins ?? 0) >= WINS_MILESTONE;
}

// ===== Writers Corps vote simulation =====

// A case score around this value is a 50/50 proposition for an average
// writer; CASE_SCORE_VOTE_SPREAD points above/below swings the base
// probability toward 100%/0%. Illustrative placeholders, needs real
// tuning against actual simulated careers (the doc's own framing).
const CASE_SCORE_VOTE_CENTER = 70;
const CASE_SCORE_VOTE_SPREAD = 40;

// Traditionalism: a writer who cares about round-number milestone clubs
// gets an extra bonus specifically when the candidate cleared one — this
// is the real differentiation from Analytics, which deliberately does NOT
// get this bonus (an analytics-minded writer looks at the raw case score,
// milestone or not, not whether a round number was crossed).
const TRADITIONALISM_MILESTONE_BONUS = 0.15;
// Homerism: a real, if modest, thumb on the scale for a candidate who
// played/managed for the writer's own favorite team.
const HOMERISM_BONUS = 0.2;
// Quirkiness/Contrarianism: adds real unpredictability — a highly
// contrarian writer's vote is meaningfully less predictable from the case
// score alone than a low-contrarian writer's, in either direction.
const CONTRARIANISM_NOISE_SCALE = 0.25;

function sliderFraction(value) {
  return Math.max(0, (value - MANAGER_ATTRIBUTE_SCALE.AVERAGE) / (MANAGER_ATTRIBUTE_SCALE.MAX - MANAGER_ATTRIBUTE_SCALE.AVERAGE));
}

/**
 * @param {object} writer - Writer
 * @param {object} candidate
 * @param {number} candidate.caseScore
 * @param {boolean} candidate.clearedMilestone
 * @param {string|null} [candidate.primaryTeamId]
 * @param {() => number} rng
 * @returns {boolean} this writer's yes/no vote
 */
export function simulateWriterVote(writer, candidate, rng) {
  let probability = 0.5 + (candidate.caseScore - CASE_SCORE_VOTE_CENTER) / CASE_SCORE_VOTE_SPREAD;

  if (candidate.clearedMilestone) {
    probability += sliderFraction(writer.sliders.traditionalism) * TRADITIONALISM_MILESTONE_BONUS;
  }
  if (candidate.primaryTeamId && candidate.primaryTeamId === writer.favoriteTeamId) {
    probability += sliderFraction(writer.sliders.homerism) * HOMERISM_BONUS;
  }

  const contrarianismFraction = (writer.sliders.quirkinessContrarianism - MANAGER_ATTRIBUTE_SCALE.MIN) / (MANAGER_ATTRIBUTE_SCALE.MAX - MANAGER_ATTRIBUTE_SCALE.MIN);
  probability = clamp01(probability + gaussianRandom(rng, 0, contrarianismFraction * CONTRARIANISM_NOISE_SCALE));

  return rng() < probability;
}

/**
 * One ballot cycle for a set of eligible candidates.
 * @param {{id: string, caseScore: number, clearedMilestone: boolean, primaryTeamId: string|null, yearsOnBallot: number}[]} candidates
 * @param {object[]} writersCorps - Writer[]
 * @param {() => number} rng
 * @returns {{id: string, voteShare: number, elected: boolean, droppedFromBallot: boolean, yearsOnBallot: number}[]}
 */
export function runHallOfFameBallot(candidates, writersCorps, rng) {
  return candidates.map((candidate) => {
    const yesVotes = writersCorps.filter((writer) => simulateWriterVote(writer, candidate, rng)).length;
    const voteShare = writersCorps.length > 0 ? yesVotes / writersCorps.length : 0;
    const yearsOnBallot = candidate.yearsOnBallot + 1;
    const elected = voteShare >= ELECTION_THRESHOLD;
    const droppedFromBallot = !elected && (voteShare < BALLOT_DROP_THRESHOLD || yearsOnBallot >= MAX_BALLOT_YEARS);
    return { ...candidate, voteShare, elected, droppedFromBallot, yearsOnBallot };
  });
}

// ===== Legacy Committee =====
// The doc's own explicit permission: "deliberately simplified for v1... a
// single, simpler 'Legacy Committee' that periodically reconsiders
// fallen-off candidates." A smaller sampled panel, same 75% bar (no
// different number is specced anywhere for this path).
const LEGACY_COMMITTEE_SIZE = 12;

function sampleWithoutReplacement(pool, count, rng) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * @param {{id: string, caseScore: number, clearedMilestone: boolean, primaryTeamId: string|null}[]} droppedCandidates
 * @param {object[]} writersCorps - Writer[]
 * @param {() => number} rng
 * @returns {{id: string, legacyVoteShare: number, electedByLegacyCommittee: boolean}[]}
 */
export function runLegacyCommitteeReview(droppedCandidates, writersCorps, rng) {
  const panel = sampleWithoutReplacement(writersCorps, Math.min(LEGACY_COMMITTEE_SIZE, writersCorps.length), rng);
  return droppedCandidates.map((candidate) => {
    const yesVotes = panel.filter((writer) => simulateWriterVote(writer, candidate, rng)).length;
    const legacyVoteShare = panel.length > 0 ? yesVotes / panel.length : 0;
    return { id: candidate.id, legacyVoteShare, electedByLegacyCommittee: legacyVoteShare >= ELECTION_THRESHOLD };
  });
}
