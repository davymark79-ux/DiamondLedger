// Free Agency wiring — Phase 5 (final) of the "Path to Draft, Minors &
// Free Agency" arc (baseball-sim/CLAUDE.md). Consumes three separate
// free-agent populations:
//   - state.freeAgentPoolById (College, engine/college.js) — young amateur
//     washouts, already pruned each season by rollFreeAgentRetirement.
//   - state.internationalFreeAgentPoolById (International Academy,
//     engine/internationalAcademy.js) — same shape, pruned by
//     rollInternationalFreeAgentRetirement.
//   - state.establishedFreeAgentPoolById — established MLB/MLB2-quality
//     players (age 21-37 at generation, generateEstablishedPlayer),
//     migrated this phase from realLeague.js's frozen, never-wired
//     `freeAgents` array into live, persisted, season-advanceable state
//     (see data/season.js's computeFreshSeason1State).
//
// Two signing actions, deliberately different mechanics:
//
// 1. signAmateurFreeAgent — shared by College's and International's pools
//    (both are already-realized, current-ability players by the time they
//    reach a free-agent pool: a college senior grown through up to 4 years
//    of advanceDevelopmentPeriod, or an academy player grown through its
//    3-year window). Lands on an AFFILIATE roster at a level picked by
//    CURRENT quality (playerQualityScore, not draft.js's potential-based
//    scoutedScore) rather than always ROOKIE — unlike a graduating college
//    senior (college.js's levelForYearsCompleted), a raw free agent has no
//    "years completed" concept to key a level off, so quality is the only
//    real signal, and a polished-but-overlooked player shouldn't be sent to
//    complete-beginners' ball just because he's a free agent, not a draftee.
//
// 2. signEstablishedFreeAgent — a genuinely new mechanic: no existing code
//    adds/removes a player from the MLB rosterByTeamId roster except 1-for-1
//    retiree replacement (engine/leagueProgression.js's advanceRosterForTeam,
//    never net-additive). Signs a free agent into the matching roster
//    section, releasing the CURRENT weakest player in that same section
//    (by playerQualityScore, current ability — a real GM cuts by current
//    production, not long-term ceiling) back into establishedFreeAgentPoolById.
//    Keeps the 26-man invariant intact without any waiver/DFA/taxi-squad
//    system — confirmed entirely unbuilt in
//    diamond-ledger-design-docs/commissioner-vision-and-roster-rules.md and
//    player-movement.md (50-man pool + Taxi Squad + 28-man expansion +
//    tournament roster). Only this narrow release-to-make-room mechanic is
//    in scope this phase.
//
//    Deliberately PURE with respect to the roster — returns the updated
//    roster object rather than mutating rosterByTeamId itself. That Map is
//    the one piece of state everywhere else in this codebase treated as
//    "replaced with a fresh Map reference on every change" (confirmed:
//    engine/leagueProgression.js's advanceOffseason always builds a new
//    Map, never mutates its input) — state/LeagueStateContext.jsx's
//    playersById is a useMemo keyed on that Map's reference, so mutating it
//    in place here would silently leave that memo stale. The caller
//    (LeagueStateContext.jsx) is responsible for constructing the new Map.
//
// advanceEstablishedFreeAgentPool — the season-boundary retirement pass,
// reuses engine/retirement.js's REAL rollRetirement (the same curve every
// rostered MLB/MLB2 player's own end-of-season retirement already uses,
// via engine/leagueProgression.js's advanceOnePlayer) rather than inventing
// a third dedicated curve like College's/International's own pools — this
// population genuinely IS established, pro-age talent (not raw amateur
// washouts), so reusing the real curve is correct here, unlike those two.
//
// FLAGGED, NOT SOLVED THIS PHASE: this pool is closed-loop after migration
// — it only shrinks (retirement) or churns (sign-in/release-out), with no
// season-to-season replenishment mechanism (real free agency's actual
// source, expiring contracts, has no analog in this codebase, which models
// no contracts at all). Over many simulated seasons this pool could
// theoretically shrink toward empty. Noted, not fixed — inventing a
// replenishment mechanism wasn't asked for.

import { sectionKeyForPosition, playerQualityScore, promoteAndBackfill } from './minorLeagues.js';
import { rollRetirement } from './retirement.js';
import { generateContractForPlayer } from './contracts.js';
import { computeServiceYears, SERVICE_DAYS_PER_SEASON, FREE_AGENCY_SERVICE_YEARS } from './serviceTime.js';
import { MINOR_LEAGUE_LEVELS_ORDER, MINOR_LEAGUE_QUALITY_BANDS, DEVELOPMENT_LEVELS } from '../models/constants.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

// Share of players reaching free agency who re-sign with their own club
// rather than reaching the open market. Without an incumbent advantage the
// signing pass below (reverse-standings order, worst club picks first)
// would funnel every star to the weakest clubs every single season — the
// same reason engine/minorLeagueFreeAgency.js bounds its own exodus with a
// "most re-sign with their own org" rate. Illustrative placeholder.
export const FREE_AGENCY_RESIGN_PROBABILITY = 0.55;

// ===== Amateur free agency (College + International, shared) =====

/**
 * Picks the highest minor-league level whose quality-band floor this free
 * agent's CURRENT-ability composite clears (MINOR_LEAGUE_LEVELS_ORDER is
 * AAA-first, so the first band whose floor is cleared is the right one).
 * Falls back to ROOKIE for anyone below every band — the common case for a
 * passed-over amateur washout.
 * @param {number} quality - playerQualityScore(player)
 * @returns {string} one of MINOR_LEAGUE_LEVELS_ORDER
 */
export function levelForFreeAgentQuality(quality) {
  for (const level of MINOR_LEAGUE_LEVELS_ORDER) {
    if (quality >= MINOR_LEAGUE_QUALITY_BANDS[level][0]) return level;
  }
  return 'ROOKIE';
}

// Deliberately duplicated rather than importing college.js's/
// internationalAcademy.js's private assign-to-affiliate helpers — matches
// the existing 3x-duplication precedent already in this codebase
// (assignSignedDraftees/assignSignedPlayerToLevel/
// assignSignedAcademyPlayerToLevel), not a refactor opportunity this phase.
function assignSignedAmateurToAffiliate(player, teamId, level, affiliateRosterByClubId) {
  const clubId = `${teamId}-${level}`;
  const roster = affiliateRosterByClubId.get(clubId);
  if (!roster) return false; // no affiliate system wired up for this caller
  const sectionKey = sectionKeyForPosition(player.primaryPosition);
  // "50-man Roster System" arc, Phase 3 — he had no contract in the
  // free-agent pool (amateurs get NIL, not salary, until signed). He isn't
  // on any team's Reserve pool yet either (that's a separate, season-
  // boundary computation, see engine/rosterProtection.js) regardless of
  // how strong `level` turned out, so MINORS_DEPTH is the objectively
  // correct context here, not a guess — matches exactly how
  // engine/contracts.js's own assignMissingContracts would classify him if
  // it encountered him at the next season boundary instead.
  const contract = player.contract ?? generateContractForPlayer(player, 'MINORS_DEPTH', level);
  const signedPlayer = { ...player, developmentLevel: DEVELOPMENT_LEVELS[level], teamId, contract };
  affiliateRosterByClubId.set(clubId, { ...roster, [sectionKey]: [...roster[sectionKey], signedPlayer] });
  return true;
}

/**
 * Signs a free agent from EITHER College's freeAgentPoolById or
 * International's internationalFreeAgentPoolById onto teamId's own
 * affiliate system. Mutates `freeAgentPoolById` and
 * `affiliateRosterByClubId` in place — same ownership contract as
 * engine/college.js's/engine/internationalAcademy.js's own free-agent-pool
 * consumption (mutated-in-place Maps carried forward by the caller).
 * @param {string} playerId
 * @param {string} teamId
 * @param {Map<string, object>} freeAgentPoolById - either pool; caller picks which
 * @param {Map<string, object>} affiliateRosterByClubId
 * @returns {{playerId: string, teamId: string, level: string}|null} null if
 *   playerId isn't actually in the given pool (stale UI — caller no-ops) or
 *   no affiliate roster is wired up for teamId at the chosen level
 */
export function signAmateurFreeAgent(playerId, teamId, freeAgentPoolById, affiliateRosterByClubId) {
  const player = freeAgentPoolById.get(playerId);
  if (!player) return null;
  const level = levelForFreeAgentQuality(playerQualityScore(player));
  if (!assignSignedAmateurToAffiliate(player, teamId, level, affiliateRosterByClubId)) return null;
  freeAgentPoolById.delete(playerId);
  return { playerId, teamId, level };
}

// ===== Established free agency (sign onto the 26-man MLB roster) =====

// SP/RP fill their section generically (any arm is a structural fit, same
// convention as sectionKeyForPosition's own doc comment); every other
// position needs an exact primaryPosition match WITHIN the lineup section —
// falls back to the whole section if positionReassignment.js drift has left
// nobody at that exact slot (a real, not just theoretical, possibility over
// many simulated seasons). Exported — engine/optionsWaiversDfa.js (the
// "50-man Roster System" arc's Phase 5) reuses this exact same-section
// weakest-player search for waiver-claim make-room logic, rather than
// redefining it a second time.
export function candidatesForSigning(roster, sectionKey, position) {
  if (sectionKey !== 'lineup') return roster[sectionKey];
  const exact = roster.lineup.filter((p) => p.primaryPosition === position);
  return exact.length > 0 ? exact : roster.lineup;
}

/**
 * Signs an established free agent onto ONE team's roster, releasing the
 * CURRENT weakest player in the matching section back into
 * establishedFreeAgentPoolById, to keep the 26-man invariant intact. No
 * waiver/DFA/taxi-squad claim process — a direct swap only, see file
 * header for why.
 *
 * Deliberately PURE with respect to the roster (returns the updated roster
 * object; does not mutate `roster` or write into a rosterByTeamId Map
 * itself) — see file header. Mutates `establishedFreeAgentPoolById` in
 * place, same ownership contract as every other free-agent pool in this
 * arc.
 * @param {string} playerId - must be a key in establishedFreeAgentPoolById
 * @param {string} teamId
 * @param {Map<string, object>} establishedFreeAgentPoolById
 * @param {{lineup:object[], rotation:object[], bullpen:object[], bench:object[]}|undefined} roster - teamId's CURRENT roster object
 * (No asOfDate any more: §47 moved contract salary off an age proxy onto
 * real accrued service time, so nothing here needs the in-game date.)
 * @returns {{updatedRoster: object, releasedPlayerId: string, sectionKey: string}|null}
 *   null if playerId isn't in the pool, or no roster was passed — caller no-ops
 */
export function signEstablishedFreeAgent(playerId, teamId, establishedFreeAgentPoolById, roster) {
  const player = establishedFreeAgentPoolById.get(playerId);
  if (!player || !roster) return null;

  const sectionKey = sectionKeyForPosition(player.primaryPosition);
  const candidates = candidatesForSigning(roster, sectionKey, player.primaryPosition);
  const releasedPlayer = candidates.reduce((worst, p) => (playerQualityScore(p) < playerQualityScore(worst) ? p : worst));

  // "50-man Roster System" arc, Phase 3 — free agency is a real
  // renegotiation event, unlike every other case engine/contracts.js
  // treats as sticky-once-assigned: this ALWAYS generates a fresh contract,
  // even if the player already carried a (now-stale) one from before he
  // hit the pool.
  const contract = generateContractForPlayer(player, 'ACTIVE', null);
  const signedPlayer = { ...player, teamId, contract };
  const updatedRoster = {
    ...roster,
    [sectionKey]: [...roster[sectionKey].filter((p) => p.id !== releasedPlayer.id), signedPlayer],
  };

  establishedFreeAgentPoolById.delete(playerId);
  establishedFreeAgentPoolById.set(releasedPlayer.id, { ...releasedPlayer, teamId: null });

  return { updatedRoster, releasedPlayerId: releasedPlayer.id, sectionKey };
}

/**
 * Season-boundary retirement pass over the established free-agent pool —
 * reuses engine/retirement.js's REAL rollRetirement rather than inventing a
 * third dedicated curve (see file header for why this population is
 * different from College's/International's own pools). Mutates
 * `establishedFreeAgentPoolById` in place.
 * @param {Map<string, object>} establishedFreeAgentPoolById
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{retirements: number}}
 */
export function advanceEstablishedFreeAgentPool(establishedFreeAgentPoolById, rng, asOfDate) {
  let retirements = 0;
  for (const [playerId, player] of [...establishedFreeAgentPoolById]) {
    if (rollRetirement(player, rng, { asOfDate })) {
      establishedFreeAgentPoolById.delete(playerId);
      retirements++;
    }
  }
  return { retirements };
}

// ===== Free agency at 6 years (CLAUDE.md §47) =====

/**
 * Has this player JUST crossed the free-agency threshold this season?
 *
 * Deliberately a FLOW, not a stock: `>= 6 years now, < 6 years before this
 * season's own credit`. Testing the stock instead would sweep every
 * already-6+ player into free agency at once on the very first run
 * (measured: ~770 of 1300 active players), which is absurd — and it would
 * re-sweep the same players every season thereafter. Framing it as a flow
 * also means NO new persisted field is needed to remember who has already
 * been processed.
 *
 * The founding generation needs no special case: engine/serviceTime.js's
 * seedFoundingServiceTime gives them high accrued service BEFORE their
 * first contract is priced, so they are already on full-market deals
 * (measured at season 1: 684 of 768 six-plus players already at market).
 * @param {object} player
 */
export function hasJustReachedFreeAgency(player) {
  const days = player.serviceRecord?.mlbServiceDays ?? 0;
  return (
    computeServiceYears(days) >= FREE_AGENCY_SERVICE_YEARS &&
    computeServiceYears(days - SERVICE_DAYS_PER_SEASON) < FREE_AGENCY_SERVICE_YEARS
  );
}

function bestPoolFitForSection(pool, sectionKey) {
  let best = null;
  for (const player of pool.values()) {
    if (sectionKeyForPosition(player.primaryPosition) !== sectionKey) continue;
    if (!best || playerQualityScore(player) > playerQualityScore(best)) best = player;
  }
  return best;
}

/**
 * Season-boundary free agency — the mechanic engine/contracts.js's
 * service-time pricing (§47) requires to be coherent, and the recurring
 * inflow this file's own header flagged as missing ("real free agency's
 * actual source, expiring contracts, has no analog in this codebase").
 *
 * Diagnosed before it was built: contracts are sticky (assignMissingContracts
 * only fills `contract === null`, and only the 3-6yr arbitration sweep ever
 * re-prices one), so nothing lifted a player to market value on reaching six
 * years. Measured over 14 seasons, mean service time and mean leverage held
 * flat while mean active-roster salary fell from $2.66M to $1.48M and league
 * payroll collapsed with no equilibrium. This closes that loop.
 *
 * Three steps, in order:
 *  1. Everyone who JUST crossed six years leaves his old deal. He either
 *     re-signs in place at a fresh market-value contract
 *     (FREE_AGENCY_RESIGN_PROBABILITY) or vacates his roster spot and
 *     enters the open pool, also re-priced so his asking price is real.
 *  2. Clubs refill, worst-record-first (engine/draft.js's own
 *     reverse-standings convention, shared with waivers), taking the best
 *     positional fit available in the pool.
 *  3. Anything the pool cannot fill falls through to promoteAndBackfill —
 *     MANDATORY, not optional. This removes players from active rosters, so
 *     it carries exactly the depletion risk that shipped broken twice
 *     (CLAUDE.md §34, §40); section sizes are captured BEFORE any removal
 *     and restored to those exact counts, so no section can ever shrink.
 *
 * Mutates `rosterByTeamId`/`establishedFreeAgentPoolById`/
 * `affiliateRosterByClubId` in place, the same ownership contract every
 * other season-boundary sweep in this codebase uses.
 * @param {object[]} teamsInWaiverOrder - worst record first
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object>} establishedFreeAgentPoolById
 * @param {Map<string, object>} affiliateRosterByClubId
 * @param {() => number} rng
 * @param {Date} asOfDate
 * @returns {{reachedFreeAgency: number, reSigned: number, toMarket: number, signedFromPool: number, backfilled: number}}
 */
export function runFreeAgencySweep(teamsInWaiverOrder, rosterByTeamId, establishedFreeAgentPoolById, affiliateRosterByClubId, rng, asOfDate) {
  let reachedFreeAgency = 0, reSigned = 0, toMarket = 0, signedFromPool = 0, backfilled = 0;

  // Step 1 — departures and in-place re-signings.
  const targetSizes = new Map();
  for (const [teamId, roster] of rosterByTeamId) {
    const sizes = {};
    for (const key of ROSTER_SECTIONS) sizes[key] = roster[key].length;
    targetSizes.set(teamId, sizes);

    const updated = { ...roster };
    for (const key of ROSTER_SECTIONS) {
      const kept = [];
      for (const player of roster[key]) {
        if (!hasJustReachedFreeAgency(player)) { kept.push(player); continue; }
        reachedFreeAgency++;
        const repriced = { ...player, contract: generateContractForPlayer(player, 'ACTIVE', null) };
        if (rng() < FREE_AGENCY_RESIGN_PROBABILITY) {
          kept.push(repriced);
          reSigned++;
        } else {
          establishedFreeAgentPoolById.set(player.id, { ...repriced, teamId: null });
          toMarket++;
        }
      }
      updated[key] = kept;
    }
    rosterByTeamId.set(teamId, updated);
  }

  // Steps 2 and 3 — refill every section back to its pre-sweep size.
  for (const team of teamsInWaiverOrder) {
    const roster = rosterByTeamId.get(team.id);
    if (!roster) continue;
    const sizes = targetSizes.get(team.id);
    const updated = { ...roster };

    for (const key of ROSTER_SECTIONS) {
      while (updated[key].length < sizes[key]) {
        const signing = bestPoolFitForSection(establishedFreeAgentPoolById, key);
        if (signing) {
          establishedFreeAgentPoolById.delete(signing.id);
          // A pool player may legitimately carry NO contract — the season-1
          // pool is seeded from realLeague.js's `freeAgents`, which
          // assignMissingContracts never walks (it only covers rosters and
          // affiliates). Signing him onto an active roster without one
          // would leave him unpaid for a season.
          updated[key] = [...updated[key], {
            ...signing,
            teamId: team.id,
            contract: signing.contract ?? generateContractForPlayer(signing, 'ACTIVE', null),
          }];
          signedFromPool++;
          continue;
        }
        // Pool exhausted for this section — fall back to the org's own
        // call-up cascade rather than leaving a hole (the §34/§40 lesson).
        const position = updated[key][0]?.primaryPosition ?? 'RP';
        const calledUp = promoteAndBackfill(team, position, affiliateRosterByClubId, rng, asOfDate);
        if (!calledUp) break; // genuinely nothing anywhere — degrade gracefully
        // This sweep runs AFTER engine/contracts.js's assignMissingContracts
        // for the season, so anyone it introduces would otherwise carry
        // `contract: null` (promoteAndBackfill can generate a fresh player
        // from thin air) or a stale MINORS deal, and go a whole season
        // unpaid. Caught by validate:contracts' population-wide
        // "no player is missing a contract" check — 28 real gaps.
        updated[key] = [...updated[key], { ...calledUp, contract: generateContractForPlayer(calledUp, 'ACTIVE', null) }];
        backfilled++;
      }
    }
    rosterByTeamId.set(team.id, updated);
  }

  return { reachedFreeAgency, reSigned, toMarket, signedFromPool, backfilled };
}
