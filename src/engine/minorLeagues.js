// Minor League System — minor-leagues.md / rookie-league.md. Phase 1 of the
// "Path to Draft, Minors & Free Agency" arc (baseball-sim/CLAUDE.md):
// foundational, since a real HS draft/free-agency system needs somewhere
// real to put a signed player. Reuses the existing plate-appearance/game/
// season engine wholesale — minor-leagues.md v0.7 is explicit that minors
// are simulated, not abstracted like college — rather than building a
// second engine. Scoped down from the doc's full peripheral system (no
// unaffiliated-club pool, no contraction/relocation, no real geographic
// distance modeling) per the "minimal Minor League System" prerequisite
// the user confirmed for this phase; the sim itself is real.
//
// Season-boundary call-ups only for v1, not a mid-season injury-reactive
// cascade — rookie-league.md itself notes a call-up chain actually reaching
// Rookie ball is expected to be rare, and this hooks into the SAME season
// boundary leagueProgression.js's retiree-replacement already runs at.
// Call-up/backfill fit is rating-based (best current-rating composite for
// the open position/section), not stats-based — real stat-driven scouting
// needs the still-unbuilt Scouts system (scouts.md) to be meaningful; this
// is an honest, flagged placeholder, same status as retirement.js's age/
// decline proxy.

import { simulateSeason, buildGroupSchedule } from './season.js';
import { generateEstablishedPlayer } from '../models/generation/playerGenerator.js';
import {
  MINOR_LEAGUE_LEVELS_ORDER,
  MINOR_LEAGUE_SEASON_LENGTHS,
  MINOR_LEAGUE_QUALITY_BANDS,
  DEVELOPMENT_LEVELS,
  HITTING_ATTRIBUTES,
  BASERUNNING_ATTRIBUTES,
  DEFENSE_ATTRIBUTES,
  PITCHING_ATTRIBUTES,
} from '../models/constants.js';

// ===== Season simulation =====

// AAA/AA/A group by leagueId (mirrors league-structure.md's own "no
// interleague" MLB1/MLB2 split, keeping a club's DH rule consistent across
// its whole simulated season — a group mixing Foundry/Exchange affiliates
// would otherwise force an arbitrary per-game DH-rule pick, per
// engine/season.js's own `LEAGUES[awayTeam.leagueId].dhRule` convention).
// Rookie groups by its own real, doc-specified regional hub instead
// (rookie-league.md's four regional leagues), regardless of parent league.
function groupAffiliatesForScheduling(clubsAtLevel, level) {
  const keyOf = level === 'ROOKIE' ? (club) => club.regionalHub : (club) => club.leagueId;
  const groups = new Map();
  for (const club of clubsAtLevel) {
    const key = keyOf(club);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(club);
  }
  return [...groups.values()];
}

/**
 * Runs one real simulated season per minor-league level (AAA/AA/A/Rookie),
 * reusing engine/season.js's simulateSeason() wholesale — same game engine,
 * same DH-rule/fatigue/injury/streak machinery, just against affiliate
 * clubs instead of the 50 real MLB teams. No manager is ever passed (minor-
 * league clubs don't have their own Manager entity — managers.md's Manager
 * is MLB-specific), so every game runs against simulateSeason()'s neutral
 * synthetic-manager default, same as any validate script that doesn't pass
 * getTeamManager.
 *
 * Deliberately lean: only standings are returned/kept. Per-game injuries,
 * fatigue, and streak state are computed internally by simulateSeason() but
 * discarded here rather than persisted — same treatment the regular MLB
 * season already gives its own in-season injury/fatigue state at a season
 * boundary (nothing carries into next season's fresh simulation there
 * either), and avoids a 200-club x ~130-game persistence payload for no
 * real consumer yet.
 * @param {object[]} affiliateClubs - from realAffiliates.js, all 200
 * @param {Map<string, {lineup: object[], rotation: object[], bullpen: object[], bench: object[]}>} affiliateRosterByClubId
 * @param {() => number} rng
 * @param {Record<string, number>} [seasonLengthByLevel] - real usage: MINOR_LEAGUE_SEASON_LENGTHS; shortened for fast validation runs (see scripts/validate-minor-leagues.mjs), same precedent as simulateOneSeason's own gamesPerSeason param
 * @returns {{ standingsById: Map<string, {wins: number, losses: number}> }} keyed by affiliate club id
 */
export function simulateMinorLeagueSeasons(affiliateClubs, affiliateRosterByClubId, rng, seasonLengthByLevel = MINOR_LEAGUE_SEASON_LENGTHS) {
  const standingsById = new Map();

  for (const level of MINOR_LEAGUE_LEVELS_ORDER) {
    const clubsAtLevel = affiliateClubs.filter((club) => club.level === level);
    const groups = groupAffiliatesForScheduling(clubsAtLevel, level);
    const games = groups.flatMap((group) => buildGroupSchedule(group, seasonLengthByLevel[level], rng));
    const schedule = games.map((game, i) => ({ ...game, gameNumber: i }));

    const getRoster = (clubId) => affiliateRosterByClubId.get(clubId);
    const { standingsById: levelStandingsById } = simulateSeason(clubsAtLevel, getRoster, schedule, rng);
    for (const [clubId, record] of levelStandingsById) standingsById.set(clubId, record);
  }

  return { standingsById };
}

// ===== Call-up / backfill cascade =====

function playerQualityScore(player) {
  const attributes = player.isPitcher
    ? PITCHING_ATTRIBUTES
    : [...HITTING_ATTRIBUTES, ...BASERUNNING_ATTRIBUTES, ...DEFENSE_ATTRIBUTES];
  return attributes.reduce((sum, name) => sum + player.ratings[name].current, 0) / attributes.length;
}

// SP/RP fill their own roster section generically (any rotation/bullpen
// arm is a structural fit); every other position needs an exact
// primaryPosition match, same convention advanceOnePlayer() already uses
// when replacing a retiree (generateEstablishedPlayer's own required,
// exact `position` param). Exported — engine/draft.js reuses this exact
// position->section mapping for appending signed draftees into a Rookie
// roster, rather than redefining it a second time.
export function sectionKeyForPosition(position) {
  if (position === 'SP') return 'rotation';
  if (position === 'RP') return 'bullpen';
  return 'lineup';
}

function findBestFit(roster, position) {
  const sectionKey = sectionKeyForPosition(position);
  const candidates = sectionKey === 'lineup' ? roster.lineup.filter((p) => p.primaryPosition === position) : roster[sectionKey];
  if (!candidates || candidates.length === 0) return null;
  return candidates.reduce((best, p) => (playerQualityScore(p) > playerQualityScore(best) ? p : best));
}

function removeFromRoster(roster, sectionKey, playerId) {
  return { ...roster, [sectionKey]: roster[sectionKey].filter((p) => p.id !== playerId) };
}

function addToRoster(roster, sectionKey, player) {
  return { ...roster, [sectionKey]: [...roster[sectionKey], player] };
}

// Fresh-fill fallback when no eligible prospect exists at a given level
// (thin early-season affiliate rosters, or a genuine position mismatch) —
// generated in that level's own quality band, same graceful-degradation
// convention used everywhere else in this engine a substitution pool runs
// dry (e.g. resolveAvailableRoster's "nobody left to promote" fallback).
function generateForLevel(level, position, team, rng, asOfDate) {
  return generateEstablishedPlayer({
    rng,
    position,
    asOfDate,
    qualityRange: MINOR_LEAGUE_QUALITY_BANDS[level],
    overrides: {
      id: `${team.id}-${level}-r${Math.floor(rng() * 1e9)}`,
      teamId: team.id,
      developmentLevel: DEVELOPMENT_LEVELS[level],
    },
  });
}

/**
 * Fills one MLB roster opening (a retiree's old slot, per engine/
 * leagueProgression.js's advanceOnePlayer) by cascading a real call-up
 * through the organization's own affiliate chain: AAA -> MLB, AA -> AAA,
 * A -> AA, Rookie -> A. Whichever level's opening the chain reaches with no
 * eligible fit gets a fresh, level-appropriate generated player instead (see
 * generateForLevel) rather than leaving that slot empty or continuing the
 * cascade past a genuine gap — Rookie's own opening always ends this way,
 * since nothing feeds Rookie ball with real signees until the draft/
 * international-pathway phases of this arc get built.
 *
 * Mutates `affiliateRosterByClubId` in place (same "owned across seasons by
 * the caller" contract as leagueProgression.js's own roleStateById) — the
 * caller carries the same Map instance forward season to season.
 * @param {object} team - the MLB club with the opening (needs `.id`)
 * @param {string} position - the exact position needed (one of POSITIONS)
 * @param {Map<string, object>} affiliateRosterByClubId - clubId -> sectioned roster; entries may be absent (e.g. a caller that never wired up affiliates), in which case this returns null immediately
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {object|null} the real MLB call-up, or null if the whole chain
 *   came up empty (AAA had no fit at all) — the caller falls back to its own
 *   existing thin-air generation in that case.
 */
export function promoteAndBackfill(team, position, affiliateRosterByClubId, rng, asOfDate) {
  const sectionKey = sectionKeyForPosition(position);
  let mlbPromotee = null;
  let priorClubId = null;

  for (let i = 0; i < MINOR_LEAGUE_LEVELS_ORDER.length; i++) {
    const level = MINOR_LEAGUE_LEVELS_ORDER[i];
    const clubId = `${team.id}-${level}`;
    const roster = affiliateRosterByClubId.get(clubId);
    if (!roster) return mlbPromotee; // no affiliate wired up for this caller — fall back entirely

    const fit = findBestFit(roster, position);
    if (!fit) {
      if (priorClubId) {
        const fresh = generateForLevel(MINOR_LEAGUE_LEVELS_ORDER[i - 1], position, team, rng, asOfDate);
        affiliateRosterByClubId.set(priorClubId, addToRoster(affiliateRosterByClubId.get(priorClubId), sectionKey, fresh));
      }
      return mlbPromotee;
    }

    affiliateRosterByClubId.set(clubId, removeFromRoster(roster, sectionKey, fit.id));
    const promotedLevel = i === 0 ? DEVELOPMENT_LEVELS.MLB : DEVELOPMENT_LEVELS[MINOR_LEAGUE_LEVELS_ORDER[i - 1]];
    const promoted = { ...fit, developmentLevel: promotedLevel };

    if (i === 0) mlbPromotee = promoted;
    else affiliateRosterByClubId.set(priorClubId, addToRoster(affiliateRosterByClubId.get(priorClubId), sectionKey, promoted));

    priorClubId = clubId;
  }

  // Reached the end of the chain (Rookie itself had a fit and got drained)
  // — Rookie's own opening always gets a fresh signee.
  const fresh = generateForLevel('ROOKIE', position, team, rng, asOfDate);
  affiliateRosterByClubId.set(priorClubId, addToRoster(affiliateRosterByClubId.get(priorClubId), sectionKey, fresh));
  return mlbPromotee;
}
