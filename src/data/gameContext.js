// Cosmetic game-info (venue, attendance, game time) for the /box-score
// page — derived from real sim/data inputs rather than fabricated flavor
// text. Split out from the old simDemoRoster.js (which also generated a
// throwaway synthetic roster/matchup; that part is gone now that
// data/season.js's buildRealMatchup() builds real matchups from the real
// 50-team league instead) since this half is genuinely reusable regardless
// of where the matchup's teams came from.

import { pick, randomInRange } from '../models/generation/random.js';

const VENUE_SUFFIXES = ['Field', 'Park', 'Stadium'];

function computeAttendance(rng, homeTeam, awayTeam) {
  const capacity = 25000 + homeTeam.marketSize * 30000;
  const occupancy = randomInRange(rng, 0.4, 0.95) + (awayTeam.marketSize - 0.5) * 0.05; // a notable visiting market draws a bit better
  return Math.round(capacity * Math.min(1, Math.max(0.25, occupancy)));
}

function computeGameTimeMinutes(box) {
  const totalPitches = [...box.away.pitchingLines, ...box.home.pitchingLines].reduce((sum, line) => sum + line.pitches, 0);
  return Math.round(25 + totalPitches * 0.2 + box.innings * 3);
}

function formatGameTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

/**
 * @param {object} matchup - from data/season.js's buildRealMatchup()
 * @param {object} box - simulateGame()'s return value
 * @param {() => number} rng
 * @returns {{venue: string, attendance: number, gameTime: string}}
 */
export function deriveGameContext(matchup, box, rng) {
  return {
    venue: `${matchup.homeTeam.city} ${pick(rng, VENUE_SUFFIXES)}`,
    attendance: computeAttendance(rng, matchup.homeTeam, matchup.awayTeam),
    gameTime: formatGameTime(computeGameTimeMinutes(box)),
  };
}
