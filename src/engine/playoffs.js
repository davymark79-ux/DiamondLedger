// League Playoffs — league-playoffs.md (v0.3). A real postseason, separate
// from the Cup (in-season-tournament.md, unbuilt) and from the pennant
// proxy computePennantWinners uses (engine/leagueProgression.js) for the
// offline Hall-of-Fame snapshot pipeline — this file does NOT touch that
// pipeline; it's a live-season-only feature, same scope boundary
// engine/promotionRelegation.js drew for itself.
//
// Structure, per league (Foundry and Exchange run identical, independent
// brackets), MLB1 only: 3 division champs (Atlantic/Heartland/Pacific) +
// 1 wild card (best non-champ record) -> WC Round (best-of-5: best-record
// champ vs wild card; other two champs play each other) -> LCS (best-of-7,
// no reseeding) -> that league's pennant winner. The two leagues' pennant
// winners meet in the Finals (best-of-7).
//
// MLB2 has no bracket at all — the Foundry2/Exchange2 league leaders play
// one championship series. league-playoffs.md left the format an open
// question ("assumed single game... flag if you intended a short series
// instead") — confirmed directly with the user: best-of-7, matching the
// Finals/LCS format (reuses the same series helper, no extra code).

import { resolveAvailableRoster, resolveRestedRoster, buildGameSide } from './season.js';
import { simulateGame } from './game.js';
import { computeWinPct } from './managerFiring.js';
import { LEAGUE_IDS, TIERS, LEAGUES } from '../models/constants.js';
import { getDivisionsForTier } from '../models/League.js';

// Real MLB home/away patterns, indexed by gamesToWin (3 = best-of-5, 4 =
// best-of-7) — the design doc doesn't specify game-by-game scheduling, so
// this is this project's own placeholder convention, same tuning status as
// everything else here. 'A' means team A hosts that game.
const HOME_PATTERN_BY_GAMES_TO_WIN = {
  3: ['A', 'A', 'B', 'B', 'A'], // 2-2-1, real MLB LDS format
  4: ['A', 'A', 'B', 'B', 'B', 'A', 'A'], // 2-3-2, real 2003-2016 World Series format
};

function winPctFor(teamId, standingsById) {
  const { wins, losses } = standingsById.get(teamId) ?? { wins: 0, losses: 0 };
  return computeWinPct(wins, losses);
}

// No tiebreaker is specced anywhere in the design docs — same team-id
// tiebreak convention engine/promotionRelegation.js already established,
// for the same reason (this engine's rng-seeded determinism shouldn't
// depend on an unstable tiebreak).
function bestRecordTeam(candidateTeams, standingsById) {
  if (candidateTeams.length === 0) return null;
  return [...candidateTeams].sort(
    (a, b) => winPctFor(b.id, standingsById) - winPctFor(a.id, standingsById) || a.id.localeCompare(b.id)
  )[0];
}

/**
 * @param {object[]} teams - with each team's CURRENT tier/division already applied (data/season.js's applyLiveOverrides)
 * @param {Map<string, {wins: number, losses: number}>} standingsById
 * @returns {{leagueId: string, divisionChamps: string[], wildCard: string}[]} one entry per league that has a complete field
 */
export function computeMLB1PlayoffField(teams, standingsById) {
  const fields = [];
  for (const leagueId of Object.values(LEAGUE_IDS)) {
    const leagueTeams = teams.filter((t) => t.tier === TIERS.MLB1 && t.leagueId === leagueId);
    const divisionChamps = getDivisionsForTier(TIERS.MLB1)
      .map((division) => bestRecordTeam(leagueTeams.filter((t) => t.division === division), standingsById))
      .filter(Boolean);
    const champIds = new Set(divisionChamps.map((t) => t.id));
    const wildCard = bestRecordTeam(leagueTeams.filter((t) => !champIds.has(t.id)), standingsById);
    // Shouldn't happen given the real 15-team/3-division-per-league structure
    // (a 1-for-1 promotion/relegation swap never changes division counts),
    // but don't crash the whole postseason over a malformed field.
    if (divisionChamps.length < 3 || !wildCard) continue;
    fields.push({ leagueId, divisionChamps: divisionChamps.map((t) => t.id), wildCard: wildCard.id });
  }
  return fields;
}

function recordNewInjuries(injuryStatusById, box, seriesGameNumber) {
  for (const injury of box.injuries) {
    injuryStatusById.set(injury.playerId, {
      type: injury.type,
      severity: injury.severity,
      gamesRemaining: injury.gamesRemaining,
      sustainedGameNumber: seriesGameNumber,
    });
  }
}

/**
 * Plays real games between two teams until one reaches gamesToWin — reuses
 * the exact same roster-resolution + game-simulation pipeline as
 * src/state/LeagueStateContext.jsx's one-off /box-score matchups
 * (resolveAvailableRoster, resolveRestedRoster, buildGameSide,
 * simulateGame). Each game starts the next rotation slot in order (not
 * always the same "ace") — a local per-series counter, not persistent
 * state, unlike the regular season's own cross-game rotationIndexById.
 *
 * DH rule follows the HOME team's league for each individual game, not a
 * fixed rule for the whole series — real historical MLB practice (AL park
 * = DH, NL park = no DH, pre-universal-DH), and necessary here since the
 * Finals specifically pits a Foundry (no-DH) team against an Exchange (DH)
 * team, a genuinely cross-league series.
 *
 * Injuries update a working copy of injuryStatusById as the series
 * progresses — a player hurt in Game 1 correctly sits out Game 2+ of the
 * SAME series, real within-series consistency. Fatigue
 * (consecutiveGamesPlayedById) is read (so an already-fatigued player can
 * still be rested) but deliberately NOT incremented further during the
 * series — a flagged simplification; a short 5-7 game bonus stretch isn't
 * worth duplicating the regular season's own DH-aware
 * advanceFatigueForTeam bookkeeping for. Neither working copy is returned
 * or merged back into the season's own state — a playoff run is scoped to
 * itself, discarded once it's done, matching the existing fact that
 * regular-season-end injuries/fatigue don't persist into next season's
 * fresh simulateOneSeason() call either.
 * @param {object} teamA
 * @param {object} teamB
 * @param {number} gamesToWin - 3 for best-of-5, 4 for best-of-7
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object|null>} managerByTeamId
 * @param {Map<string, object>} injuryStatusById - read-only input; not mutated, a working copy is made internally
 * @param {Map<string, number>} consecutiveGamesPlayedById
 * @param {Map<string, object>} streakStateById
 * @param {() => number} rng
 * @returns {{teamAId: string, teamBId: string, gamesToWin: number, games: object[], winnerTeamId: string}}
 */
export function simulateBestOfSeries(teamA, teamB, gamesToWin, rosterByTeamId, managerByTeamId, injuryStatusById, consecutiveGamesPlayedById, streakStateById, rng) {
  const homePattern = HOME_PATTERN_BY_GAMES_TO_WIN[gamesToWin];
  const workingInjuryStatusById = new Map(injuryStatusById);
  let winsA = 0;
  let winsB = 0;
  const games = [];
  let gameIndex = 0;

  while (winsA < gamesToWin && winsB < gamesToWin) {
    const aIsHome = homePattern[Math.min(gameIndex, homePattern.length - 1)] === 'A';
    const homeTeam = aIsHome ? teamA : teamB;
    const awayTeam = aIsHome ? teamB : teamA;
    const dhRule = LEAGUES[homeTeam.leagueId].dhRule;

    const homeManager = managerByTeamId.get(homeTeam.id) ?? undefined;
    const awayManager = managerByTeamId.get(awayTeam.id) ?? undefined;

    const homeInjuryResolved = resolveAvailableRoster(rosterByTeamId.get(homeTeam.id), workingInjuryStatusById);
    const awayInjuryResolved = resolveAvailableRoster(rosterByTeamId.get(awayTeam.id), workingInjuryStatusById);
    const homeRoster = resolveRestedRoster(homeInjuryResolved, consecutiveGamesPlayedById, homeManager, rng);
    const awayRoster = resolveRestedRoster(awayInjuryResolved, consecutiveGamesPlayedById, awayManager, rng);
    const homeStarter = homeRoster.rotation[gameIndex % homeRoster.rotation.length];
    const awayStarter = awayRoster.rotation[gameIndex % awayRoster.rotation.length];

    const box = simulateGame(
      {
        home: buildGameSide(homeRoster, homeStarter, dhRule, consecutiveGamesPlayedById, homeManager, streakStateById),
        away: buildGameSide(awayRoster, awayStarter, dhRule, consecutiveGamesPlayedById, awayManager, streakStateById),
      },
      { rng }
    );

    recordNewInjuries(workingInjuryStatusById, box, gameIndex);

    const homeWon = box.home.runs > box.away.runs;
    const winnerTeamId = homeWon ? homeTeam.id : awayTeam.id;
    if (winnerTeamId === teamA.id) winsA++;
    else winsB++;

    games.push({
      gameNumber: gameIndex,
      awayTeamId: awayTeam.id,
      homeTeamId: homeTeam.id,
      awayRuns: box.away.runs,
      homeRuns: box.home.runs,
      winnerTeamId,
    });

    gameIndex++;
  }

  return {
    teamAId: teamA.id,
    teamBId: teamB.id,
    gamesToWin,
    games,
    winnerTeamId: winsA >= gamesToWin ? teamA.id : teamB.id,
  };
}

/**
 * The full postseason for one season: MLB1 bracket per league, the
 * cross-league Finals, and the MLB2 championship. Returns a plain,
 * JSON-native object (no Maps inside) — needs no special serialization.
 * @param {object[]} teams - with CURRENT tier/division already applied
 * @param {Map<string, {wins: number, losses: number}>} standingsById - this season's OWN final standings
 * @param {Map<string, object>} rosterByTeamId
 * @param {Map<string, object|null>} managerByTeamId
 * @param {Map<string, object>} injuryStatusById
 * @param {Map<string, number>} consecutiveGamesPlayedById
 * @param {Map<string, object>} streakStateById
 * @param {() => number} rng
 */
export function simulatePlayoffs(teams, standingsById, rosterByTeamId, managerByTeamId, injuryStatusById, consecutiveGamesPlayedById, streakStateById, rng) {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const series = (teamA, teamB, gamesToWin) =>
    simulateBestOfSeries(teamA, teamB, gamesToWin, rosterByTeamId, managerByTeamId, injuryStatusById, consecutiveGamesPlayedById, streakStateById, rng);

  const leagues = {};
  const pennantWinnerByLeagueId = {};

  for (const field of computeMLB1PlayoffField(teams, standingsById)) {
    const { leagueId, divisionChamps, wildCard } = field;
    const champTeams = divisionChamps.map((id) => teamsById.get(id));
    const wildCardTeam = teamsById.get(wildCard);
    const [bestChamp, champTwo, champThree] = [...champTeams].sort(
      (a, b) => winPctFor(b.id, standingsById) - winPctFor(a.id, standingsById) || a.id.localeCompare(b.id)
    );

    // Best-record champ vs. wild card; the other two champs play each
    // other — a deliberate design choice per league-playoffs.md, not the
    // more conventional "protect the top seed" approach.
    const wcSeriesA = series(bestChamp, wildCardTeam, 3);
    const wcSeriesB = series(champTwo, champThree, 3);
    const lcs = series(teamsById.get(wcSeriesA.winnerTeamId), teamsById.get(wcSeriesB.winnerTeamId), 4);

    leagues[leagueId] = {
      divisionChamps,
      wildCard,
      wcRound: [wcSeriesA, wcSeriesB],
      lcs,
      pennantWinnerTeamId: lcs.winnerTeamId,
    };
    pennantWinnerByLeagueId[leagueId] = lcs.winnerTeamId;
  }

  let finals = null;
  if (pennantWinnerByLeagueId[LEAGUE_IDS.FOUNDRY] && pennantWinnerByLeagueId[LEAGUE_IDS.EXCHANGE]) {
    finals = series(
      teamsById.get(pennantWinnerByLeagueId[LEAGUE_IDS.FOUNDRY]),
      teamsById.get(pennantWinnerByLeagueId[LEAGUE_IDS.EXCHANGE]),
      4
    );
  }

  // MLB2: no bracket, just the two league leaders — best-of-7 per the
  // user's explicit choice over the design doc's own "assumed single game"
  // default. Purely bragging rights: both are already promoting to MLB1
  // regardless of the outcome (see engine/promotionRelegation.js).
  let mlb2Championship = null;
  const mlb2Foundry = bestRecordTeam(teams.filter((t) => t.tier === TIERS.MLB2 && t.leagueId === LEAGUE_IDS.FOUNDRY), standingsById);
  const mlb2Exchange = bestRecordTeam(teams.filter((t) => t.tier === TIERS.MLB2 && t.leagueId === LEAGUE_IDS.EXCHANGE), standingsById);
  if (mlb2Foundry && mlb2Exchange) {
    mlb2Championship = series(mlb2Foundry, mlb2Exchange, 4);
  }

  return { leagues, finals, mlb2Championship };
}
