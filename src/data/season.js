// The real 50-team league's LIVE, advanceable season state — persisted to
// localStorage so progress survives a reload (explicit user choice; the
// simpler alternative was resetting to season 1 on every reload).
//
// This module owns the pure state-transition + persistence logic; the React
// wiring (Context/hook, the "Simulate Next Season" action, per-page getters)
// lives in src/state/LeagueStateContext.jsx, which is the only thing that
// imports from here in practice.
//
// Rng design: no single continuously-mutating rng instance is shared across
// the app's lifetime. `createRng(seed)` returns a closure that mutates its
// own internal state on every call — a single long-lived instance touched
// anywhere React might double-invoke (a lazy useState initializer, a
// useReducer reducer body — both of which React 18 StrictMode, active in
// main.jsx, deliberately double-invokes in dev to surface impure code)
// would silently desync from a StrictMode-free build. Instead,
// `seasonRngForNumber(n)` derives a fresh, deterministic rng from the
// season number alone — season 1 always reproduces the exact same result
// (matching this league's original single-season seed, 20260201, so a
// fresh browser with no saved state sees identical season-1 values to
// before this feature existed), and there's nothing rng-related to
// serialize for persistence either.

import { teams, getTeamRoster, getTeamManager } from './realLeague.js';
import { simulateOneSeason, advanceOffseason } from '../engine/leagueProgression.js';
import { createRng } from '../models/generation/random.js';

const SEASON_RNG_BASE_SEED = 20260201; // this league's original single-season seed — season 1 must reproduce it exactly
const STORAGE_KEY = 'diamondLedger.leagueState.v1'; // versioned — a future shape change just falls back to fresh rather than crashing on old data

function seasonRngForNumber(seasonNumber) {
  return createRng(SEASON_RNG_BASE_SEED + (seasonNumber - 1));
}

// ===== Map <-> plain-object conversion + Infinity-safe JSON (de)serialization =====
// Real, not theoretical: injuryStatusById's gamesRemaining is a genuine
// Infinity for season-/career-ending injuries (engine/injuries.js) — a
// naive JSON.stringify silently turns that into null, which would make a
// permanently-out player misread as recovering after a reload.

const INFINITY_SENTINEL = '__Infinity__';
const NEG_INFINITY_SENTINEL = '__-Infinity__';
const NAN_SENTINEL = '__NaN__';

function jsonReplacer(_key, value) {
  if (value === Infinity) return INFINITY_SENTINEL;
  if (value === -Infinity) return NEG_INFINITY_SENTINEL;
  if (typeof value === 'number' && Number.isNaN(value)) return NAN_SENTINEL;
  return value;
}

function jsonReviver(_key, value) {
  if (value === INFINITY_SENTINEL) return Infinity;
  if (value === NEG_INFINITY_SENTINEL) return -Infinity;
  if (value === NAN_SENTINEL) return NaN;
  return value;
}

function mapToObj(map) {
  return Object.fromEntries(map);
}

function objToMap(obj) {
  return new Map(Object.entries(obj ?? {}));
}

function serializeSeasonResult(seasonResult) {
  return {
    standingsById: mapToObj(seasonResult.standingsById),
    injuryStatusById: mapToObj(seasonResult.injuryStatusById),
    consecutiveGamesPlayedById: mapToObj(seasonResult.consecutiveGamesPlayedById),
    streakStateById: mapToObj(seasonResult.streakStateById),
    managerAssignmentById: mapToObj(seasonResult.managerAssignmentById),
    managerNameById: mapToObj(seasonResult.managerNameById),
    firings: seasonResult.firings,
    results: seasonResult.results,
  };
}

function deserializeSeasonResult(plain) {
  return {
    standingsById: objToMap(plain.standingsById),
    injuryStatusById: objToMap(plain.injuryStatusById),
    consecutiveGamesPlayedById: objToMap(plain.consecutiveGamesPlayedById),
    streakStateById: objToMap(plain.streakStateById),
    managerAssignmentById: objToMap(plain.managerAssignmentById),
    managerNameById: objToMap(plain.managerNameById),
    firings: plain.firings,
    results: plain.results,
  };
}

function serializeState(state) {
  return {
    seasonNumber: state.seasonNumber,
    asOfDate: state.asOfDate.toISOString(),
    rosterByTeamId: mapToObj(state.rosterByTeamId),
    managerByTeamId: mapToObj(state.managerByTeamId),
    roleStateById: mapToObj(state.roleStateById),
    seasonResult: serializeSeasonResult(state.seasonResult),
  };
}

function deserializeState(plain) {
  return {
    seasonNumber: plain.seasonNumber,
    asOfDate: new Date(plain.asOfDate),
    rosterByTeamId: objToMap(plain.rosterByTeamId),
    managerByTeamId: objToMap(plain.managerByTeamId),
    roleStateById: objToMap(plain.roleStateById),
    seasonResult: deserializeSeasonResult(plain.seasonResult),
  };
}

/** Persists the full live season state — call after every advanceToNextSeason(). Never throws (a full/blocked/absent localStorage — e.g. a Node script importing this module — just means progress won't survive a reload, not a crash). */
export function saveState(state) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state), jsonReplacer));
  } catch (err) {
    console.warn('Failed to save league state to localStorage:', err);
  }
}

function loadState() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserializeState(JSON.parse(raw, jsonReviver));
  } catch (err) {
    console.warn('Failed to load saved league state, starting fresh:', err);
    return null;
  }
}

function computeFreshSeason1State() {
  const rosterByTeamId = new Map(teams.map((t) => [t.id, getTeamRoster(t.id)]));
  const managerByTeamId = new Map(teams.map((t) => [t.id, getTeamManager(t.id)]));
  const rng = seasonRngForNumber(1);
  const { seasonResult } = simulateOneSeason(
    teams,
    (id) => rosterByTeamId.get(id),
    (id) => managerByTeamId.get(id),
    rng
  );
  return {
    seasonNumber: 1,
    asOfDate: new Date(),
    rosterByTeamId,
    managerByTeamId,
    roleStateById: new Map(),
    seasonResult,
  };
}

/** Clears any saved progress and returns a fresh season-1 state. */
export function resetToSeason1() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear saved league state:', err);
  }
  return computeFreshSeason1State();
}

/**
 * The state the app boots with — a saved season if one exists, otherwise a
 * fresh season 1. Computed exactly once at module load (eager, outside
 * React entirely) so there's no lazy initializer or effect for StrictMode
 * to double-invoke.
 */
export const initialLeagueState = loadState() ?? computeFreshSeason1State();

/**
 * One offseason (growth/retirement/replenishment for every team) plus the
 * next season's full 150-game simulation, composed the same way
 * engine/leagueProgression.js's own simulateLeagueHistory() loop does it —
 * just one season at a time instead of a fixed N-season batch. Pure:
 * returns a new state object, does not touch storage itself (the caller —
 * LeagueStateContext.jsx's advanceSeason() — calls saveState() explicitly).
 * @param {object} state - the current live state (this module's own shape)
 * @returns {object} the next season's state, same shape
 */
export function advanceToNextSeason(state) {
  const seasonNumber = state.seasonNumber + 1;
  const asOfDate = new Date(state.asOfDate);
  asOfDate.setFullYear(asOfDate.getFullYear() + 1);

  const rng = seasonRngForNumber(seasonNumber);
  const { rosterByTeamId, managerByTeamId } = advanceOffseason(
    teams,
    state.rosterByTeamId,
    state.seasonResult.managerAssignmentById,
    state.roleStateById, // mutated in place by advanceOffseason — the same Map instance is carried forward, per its own "owned across seasons by the caller" contract
    asOfDate,
    rng
  );

  const { seasonResult } = simulateOneSeason(
    teams,
    (id) => rosterByTeamId.get(id),
    (id) => managerByTeamId.get(id),
    rng
  );

  return {
    seasonNumber,
    asOfDate,
    rosterByTeamId,
    managerByTeamId,
    roleStateById: state.roleStateById,
    seasonResult,
  };
}
