// A frozen, precomputed Hall of Fame class — NOT a live simulation. Built
// once by scripts/build-hall-of-fame-snapshot.mjs (25 simulated seasons at
// the real 150-game length) and written to hallOfFameSnapshot.json; this
// module just imports and exposes it, same "static seed data" precedent
// leagueSeed.js already established for the 50-team roster. Re-run the
// build script manually to regenerate — nothing here recomputes on load.

import snapshot from './hallOfFameSnapshot.json';

export const HALL_OF_FAME_SNAPSHOT_META = {
  generatedAt: snapshot.generatedAt,
  seasonsSimulated: snapshot.seasonsSimulated,
  gamesPerSeason: snapshot.gamesPerSeason,
  teamCount: snapshot.teamCount,
  writersCorpsSize: snapshot.writersCorpsSize,
};

/** @returns {object[]} inductees, sorted by case score descending */
export function getInductees() {
  return snapshot.inductees;
}

/** @returns {object[]} candidates still active on the regular ballot at snapshot end, sorted by case score descending */
export function getBallot() {
  return snapshot.onBallot;
}
