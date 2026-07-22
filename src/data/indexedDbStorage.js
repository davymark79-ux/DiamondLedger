// A small, purpose-built IndexedDB wrapper for the one thing this app
// persists: the live league state (see data/season.js). Replaces an
// earlier localStorage-backed version — that quota (~5-10MB per origin,
// hard-capped) was too small for this state's real, by-design size: the
// College System + International Academy populations alone already run
// 15-25MB+ and are retirement-BOUNDED, not capped, so they keep growing
// every season (see engine/college.js's and engine/internationalAcademy.js's
// own population-realism headers) — localStorage could never keep up
// long-term. IndexedDB's quota is typically a large share of free disk
// space (often hundreds of MB to GB, browser-dependent), and it stores
// values via the structured-clone algorithm, which natively supports
// Map/Date/Infinity/NaN directly — data/season.js no longer needs the
// JSON serialize/deserialize dance or Infinity-sentinel workaround its
// localStorage-backed version required.
//
// Only one entry ever lives in this store (STATE_KEY) — this app has no
// multi-slot save concept, so a generic keyed API would be unused
// generality.

const DB_NAME = 'diamondLedgerDb';
const DB_VERSION = 1;
const STORE_NAME = 'leagueState';
const STATE_KEY = 'current';

function openDb() {
  // Guards Node execution (e.g. a validate script importing data/season.js)
  // the same way the old code guarded `typeof localStorage === 'undefined'`
  // — nothing here is actually reached from a validate script today (they
  // only use initialLeagueState/advanceToNextSeason, never storage), but
  // keeping this safe-by-construction costs nothing.
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {object} state - data/season.js's live state shape, stored as-is (real Maps/Dates intact). */
export async function saveLeagueState(state) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** @returns {Promise<object|null>} the saved state, or null if none exists */
export async function loadLeagueState() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLeagueState() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
