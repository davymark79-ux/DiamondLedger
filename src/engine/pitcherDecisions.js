// Pitcher decisions (Win/Loss/Save/Hold/Blown Save) — post-game analysis
// over a finished box score (simulateGame()'s return value). Simplified,
// documented standard MLB rules, same placeholder-constant tuning status
// as everything else in this engine.
//
// Not modeled: real baseball's "most effective reliever" judgment call,
// used when a starter doesn't qualify for the win — famously a subjective,
// official-scorer decision, not a formula. We use a deterministic proxy
// instead (most outs recorded among the winning team's relievers). Also
// simplified: "entered with the tying run on base/at bat/on deck" (one of
// the three real save/hold/blown-save-eligibility clauses) isn't checked
// directly — only lead-margin and outs-recorded, which cover the large
// majority of real save situations. Holds/blown saves specifically only
// check the short-lead entry clause (not the "3+ effective innings
// regardless of score" clause) — that clause is a save-specific carve-out
// for a reliever who single-handedly covers most of a game, a much rarer
// shape for a genuine hold/blown-save appearance.
//
// Attributing a specific pitcher to a specific past moment relies on
// entryInning (see boxScore.js's createPitchingLine) rather than an exact
// out-by-out timeline, so a pitching change made mid-inning at the exact
// inning the decisive run scored has some irreducible ambiguity — an
// acceptable approximation given every other engine constant here is a
// placeholder too. The same inning-level granularity applies to the
// margin timeline below: a mid-inning pitching change can misattribute a
// run to the incoming rather than outgoing pitcher (or vice versa).

const MIN_OUTS_FOR_STARTER_WIN = 15; // 5 complete innings
const SAVE_MAX_LEAD_MARGIN = 3;
const SAVE_MIN_OUTS_SHORT_LEAD = 3; // at least 1 inning
const SAVE_MIN_OUTS_LONG_OUTING = 9; // at least 3 innings, regardless of lead size

// Last pitching line (by entry order) whose entryInning is at or before the
// given inning — i.e. whoever was pitching for this side at that point.
function findPitcherAtInning(pitchingLines, inning) {
  let candidate = null;
  for (const line of pitchingLines) {
    if (line.entryInning != null && line.entryInning <= inning) candidate = line;
  }
  return candidate;
}

// This side's own lead margin (their runs minus the opponent's) after each
// scoring play in the game, in chronological order — scoringEvents already
// carries the absolute cumulative score for both teams at each run, so this
// just reprojects it onto one side's perspective.
function marginTimeline(scoringEvents, sideIsAway) {
  return scoringEvents.map((event) => ({
    inning: event.inning,
    margin: sideIsAway ? event.awayRuns - event.homeRuns : event.homeRuns - event.awayRuns,
  }));
}

// The lowest this side's margin ever dropped to while `line` was their
// active pitcher — inning-level granularity, see file header.
function minMarginDuringTenure(timeline, line, nextEntryInning) {
  let min = line.entryLeadMargin;
  for (const point of timeline) {
    if (point.inning < line.entryInning) continue;
    if (nextEntryInning != null && point.inning >= nextEntryInning) break;
    min = Math.min(min, point.margin);
  }
  return min;
}

function findDecisiveEvent(scoringEvents, winningSideIsAway) {
  const winningTeamAheadAt = (event) => (winningSideIsAway ? event.awayRuns > event.homeRuns : event.homeRuns > event.awayRuns);
  let decisive = null;
  for (let i = scoringEvents.length - 1; i >= 0; i--) {
    if (winningTeamAheadAt(scoringEvents[i])) {
      decisive = scoringEvents[i];
    } else {
      break;
    }
  }
  return decisive ?? scoringEvents[scoringEvents.length - 1] ?? null;
}

// Every reliever (any pitcher who isn't his side's starter) who entered in
// a short-lead save situation, checked against both sides independently —
// holds and blown saves aren't restricted to the winning team's bullpen
// the way wins/losses/saves are (a loss can have a blown save in it too:
// the setup guy who coughs up the lead before his own team's offense wins
// it back late). A pitcher who never surrendered the lead during his own
// stint gets a hold if he wasn't the one who finished the game (the
// finisher's reward for that is a save, not a hold — mutually exclusive by
// rule); a pitcher whose side's margin dipped to zero or below at any point
// while he was the active pitcher is charged a blown save instead,
// regardless of whether he finished the game or how things turned out
// after — a pitcher can blow a save and still get the win, a real,
// intentional combination this doesn't special-case away.
function computeHoldsAndBlownSaves(box) {
  const holdPitcherIds = [];
  const blownSavePitcherIds = [];

  for (const [side, sideIsAway] of [[box.away, true], [box.home, false]]) {
    const timeline = marginTimeline(box.scoringEvents, sideIsAway);
    const lines = side.pitchingLines;

    lines.forEach((line, i) => {
      if (line.entryInning === 1) return; // starters aren't hold/blown-save eligible
      const enteredWithLead = line.entryLeadMargin;
      const enteredInSaveSituation = enteredWithLead != null && enteredWithLead > 0 && enteredWithLead <= SAVE_MAX_LEAD_MARGIN;
      if (!enteredInSaveSituation || line.outsRecorded === 0) return;

      const nextEntryInning = lines[i + 1]?.entryInning ?? null;
      const min = minMarginDuringTenure(timeline, line, nextEntryInning);
      const isFinisher = i === lines.length - 1;

      if (min <= 0) {
        blownSavePitcherIds.push(line.player.id);
      } else if (!isFinisher) {
        holdPitcherIds.push(line.player.id);
      }
    });
  }

  return { holdPitcherIds, blownSavePitcherIds };
}

/**
 * @param {object} box - simulateGame()'s return value: { away, home, scoringEvents }
 * @returns {{winningPitcherId: string|null, losingPitcherId: string|null, savePitcherId: string|null, holdPitcherIds: string[], blownSavePitcherIds: string[]}}
 */
export function computePitcherDecisions(box) {
  const { away, home, scoringEvents } = box;
  const emptyResult = { winningPitcherId: null, losingPitcherId: null, savePitcherId: null, holdPitcherIds: [], blownSavePitcherIds: [] };
  if (away.runs === home.runs || scoringEvents.length === 0) {
    return emptyResult;
  }

  const winningSideIsAway = away.runs > home.runs;
  const winningSide = winningSideIsAway ? away : home;

  const decisiveEvent = findDecisiveEvent(scoringEvents, winningSideIsAway);
  if (!decisiveEvent) {
    return emptyResult;
  }

  // The decisive event is the winning team scoring — its defendingPitcherId
  // is whoever was pitching for the LOSING team at that moment.
  const losingPitcherId = decisiveEvent.defendingPitcherId;

  const winningCandidate = findPitcherAtInning(winningSide.pitchingLines, decisiveEvent.inning);
  const candidateIsStarter = winningCandidate?.entryInning === 1;
  const candidateQualifies = winningCandidate && (!candidateIsStarter || winningCandidate.outsRecorded >= MIN_OUTS_FOR_STARTER_WIN);

  let winningPitcherId;
  if (candidateQualifies) {
    winningPitcherId = winningCandidate.player.id;
  } else {
    const relievers = winningSide.pitchingLines.filter((line) => line.entryInning !== 1);
    const mostEffective = relievers.reduce((best, line) => (!best || line.outsRecorded > best.outsRecorded ? line : best), null);
    winningPitcherId = (mostEffective ?? winningCandidate)?.player.id ?? null;
  }

  // A hold can't coincide with a decision (W/L/S) for the same pitcher by
  // rule — a pitcher who happens to also qualify for the win (the "most
  // effective reliever" proxy above can land on someone who'd otherwise
  // read as hold-eligible) gets the win only, not a hold on top of it.
  const { holdPitcherIds: rawHoldPitcherIds, blownSavePitcherIds } = computeHoldsAndBlownSaves(box);
  const holdPitcherIds = rawHoldPitcherIds.filter((id) => id !== winningPitcherId);

  const finishingPitcher = winningSide.pitchingLines[winningSide.pitchingLines.length - 1];
  let savePitcherId = null;
  if (finishingPitcher && finishingPitcher.player.id !== winningPitcherId && finishingPitcher.entryInning !== 1) {
    const enteredWithLead = finishingPitcher.entryLeadMargin;
    const qualifiesShortLead =
      enteredWithLead != null && enteredWithLead > 0 && enteredWithLead <= SAVE_MAX_LEAD_MARGIN
      && finishingPitcher.outsRecorded >= SAVE_MIN_OUTS_SHORT_LEAD;
    const qualifiesLongOuting = finishingPitcher.outsRecorded >= SAVE_MIN_OUTS_LONG_OUTING;
    if (qualifiesShortLead || qualifiesLongOuting) {
      // A save additionally requires the lead was never actually
      // relinquished during his outing — allowing the tying run at any
      // point makes this a blown save, not a save, even if the team goes
      // on to win it back before he leaves.
      const timeline = marginTimeline(scoringEvents, winningSideIsAway);
      const min = minMarginDuringTenure(timeline, finishingPitcher, null);
      if (min > 0) savePitcherId = finishingPitcher.player.id;
    }
  }

  return { winningPitcherId, losingPitcherId, savePitcherId, holdPitcherIds, blownSavePitcherIds };
}
