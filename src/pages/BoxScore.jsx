import { useState, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import { simulateGame, formatInningsPitched, computePitcherDecisions } from '../engine/index.js';
import { createRng } from '../models/generation/random.js';
import { teams } from '../data/realLeague.js';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { deriveGameContext } from '../data/gameContext.js';

const sortedTeams = [...teams].sort((a, b) => `${a.city} ${a.nickname}`.localeCompare(`${b.city} ${b.nickname}`));

function pickTwoDistinctTeamIds(rng) {
  const first = Math.floor(rng() * teams.length);
  let second = Math.floor(rng() * teams.length);
  while (second === first) second = Math.floor(rng() * teams.length);
  return [teams[first].id, teams[second].id];
}

function simulateMatchup(awayTeamId, homeTeamId, buildMatchup) {
  const rng = createRng(Date.now());
  const matchup = buildMatchup(awayTeamId, homeTeamId, rng);
  const box = simulateGame({ away: matchup.away, home: matchup.home }, { rng });
  const decisions = computePitcherDecisions(box);
  const gameContext = deriveGameContext(matchup, box, rng);
  return { matchup, box, decisions, gameContext };
}

function sumBy(lines, key) {
  return lines.reduce((sum, line) => sum + line[key], 0);
}

function LineScore({ awayLabel, homeLabel, box }) {
  const innings = box.innings;
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
            <th className="text-left px-4 py-2 font-normal">Team</th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i} className="text-right px-2 py-2 font-normal agate">{i + 1}</th>
            ))}
            <th className="text-right px-4 py-2 font-normal agate">R</th>
            <th className="text-right px-4 py-2 font-normal agate">E</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-field-line">
            <td className="px-4 py-2 text-ledger/90">{awayLabel}</td>
            {Array.from({ length: innings }, (_, i) => (
              <td key={i} className="text-right px-2 py-2 agate text-ledger/60">{box.away.inningRuns[i] ?? '-'}</td>
            ))}
            <td className="text-right px-4 py-2 agate text-brass-bright font-medium">{box.away.runs}</td>
            <td className="text-right px-4 py-2 agate text-ledger/60">{box.away.errors}</td>
          </tr>
          <tr>
            <td className="px-4 py-2 text-ledger/90">{homeLabel}</td>
            {Array.from({ length: innings }, (_, i) => (
              <td key={i} className="text-right px-2 py-2 agate text-ledger/60">{box.home.inningRuns[i] ?? '-'}</td>
            ))}
            <td className="text-right px-4 py-2 agate text-brass-bright font-medium">{box.home.runs}</td>
            <td className="text-right px-4 py-2 agate text-ledger/60">{box.home.errors}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Last-name-only labels (used throughout the notes area below each table)
// collide whenever two players on the same side share a surname — a fairly
// common occurrence given how small the generated name pools are. This
// builds a per-side lookup that falls back to "F. Lastname" on a collision,
// and to a longer first-name prefix (or, in the rare case of genuinely
// identical full names, a position suffix) if first initials collide too.
function minimalUniquePrefixLength(firstNames) {
  const maxLen = Math.max(...firstNames.map((n) => n.length));
  for (let len = 1; len <= maxLen; len++) {
    if (new Set(firstNames.map((n) => n.slice(0, len))).size === firstNames.length) return len;
  }
  return maxLen;
}

function buildShortNameLookup(players) {
  const byLastName = new Map();
  for (const player of players) {
    if (!byLastName.has(player.lastName)) byLastName.set(player.lastName, []);
    byLastName.get(player.lastName).push(player);
  }

  const labels = new Map();
  for (const group of byLastName.values()) {
    if (group.length === 1) {
      labels.set(group[0].id, group[0].lastName);
      continue;
    }
    const prefixLen = minimalUniquePrefixLength(group.map((p) => p.firstName));
    const usedLabels = new Set();
    for (const player of group) {
      let label = prefixLen >= player.firstName.length
        ? `${player.firstName} ${player.lastName}`
        : `${player.firstName.slice(0, prefixLen)}. ${player.lastName}`;
      if (usedLabels.has(label)) label = `${label} (${player.primaryPosition})`; // identical full names — rare fallback
      usedLabels.add(label);
      labels.set(player.id, label);
    }
  }
  return labels;
}

function extraBaseNote(battingLines, key, nameLookup) {
  const entries = battingLines
    .filter((line) => line[key] > 0)
    .map((line) => {
      const name = nameLookup.get(line.player.id);
      return line[key] > 1 ? `${name} (${line[key]})` : name;
    });
  return entries.length ? entries.join(', ') : null;
}

function gidpNote(battingLines, nameLookup) {
  return extraBaseNote(battingLines, 'gidp', nameLookup);
}

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

const SUBSTITUTION_LABELS = { 'pinch-hit': 'PH', 'defensive-replacement': 'Defense', 'pinch-run': 'PR', injury: 'Injury' };

function substitutionNote(sub, nameLookup) {
  const label = SUBSTITUTION_LABELS[sub.type] ?? sub.type;
  const inName = nameLookup.get(sub.inPlayerId) ?? sub.inPlayerLastName;
  const outName = nameLookup.get(sub.outPlayerId) ?? sub.outPlayerLastName;
  return `${label}: ${inName} for ${outName} (${ordinal(sub.inning)})`;
}

function BattingTable({ label, side }) {
  const totals = {
    ab: sumBy(side.battingLines, 'ab'),
    r: sumBy(side.battingLines, 'r'),
    h: sumBy(side.battingLines, 'h'),
    hr: sumBy(side.battingLines, 'hr'),
    rbi: sumBy(side.battingLines, 'rbi'),
    bb: sumBy(side.battingLines, 'bb'),
    k: sumBy(side.battingLines, 'k'),
    sb: sumBy(side.battingLines, 'sb'),
    cs: sumBy(side.battingLines, 'cs'),
    sh: sumBy(side.battingLines, 'sh'),
  };
  const rispAb = side.battingLines.reduce((sum, line) => sum + line.risp.ab, 0);
  const rispH = side.battingLines.reduce((sum, line) => sum + line.risp.h, 0);
  const nameLookup = buildShortNameLookup(side.battingLines.map((line) => line.player));
  const doublesNote = extraBaseNote(side.battingLines, 'doubles', nameLookup);
  const triplesNote = extraBaseNote(side.battingLines, 'triples', nameLookup);
  const hrNote = extraBaseNote(side.battingLines, 'hr', nameLookup);
  const gidpNoteText = gidpNote(side.battingLines, nameLookup);

  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        {label} batting
      </div>
      <div className="grid grid-cols-[minmax(8rem,1fr)_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>Player</span>
        <span className="text-right">AB</span>
        <span className="text-right">R</span>
        <span className="text-right">H</span>
        <span className="text-right">HR</span>
        <span className="text-right">BI</span>
        <span className="text-right">BB</span>
        <span className="text-right">K</span>
        <span className="text-right">SB</span>
        <span className="text-right">CS</span>
        <span className="text-right">SH</span>
      </div>
      {side.battingLines.map((line) => (
        <div
          key={line.player.id}
          className="grid grid-cols-[minmax(8rem,1fr)_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem] px-4 py-1 text-sm border-b border-field-line"
        >
          <span className={`text-ledger/85 truncate ${line.subDepth > 0 ? 'pl-4' : ''}`}>
            {line.subDepth > 0 && <span className="text-ledger/30">&#8627;&nbsp;</span>}
            {line.player.firstName} {line.player.lastName}{' '}
            <span className="text-ledger/35 text-xs">{line.player.primaryPosition}</span>
          </span>
          <span className="text-right agate text-ledger/70">{line.ab}</span>
          <span className="text-right agate text-ledger/70">{line.r}</span>
          <span className="text-right agate text-ledger/70">{line.h}</span>
          <span className="text-right agate text-ledger/70">{line.hr}</span>
          <span className="text-right agate text-ledger/70">{line.rbi}</span>
          <span className="text-right agate text-ledger/70">{line.bb}</span>
          <span className="text-right agate text-ledger/70">{line.k}</span>
          <span className="text-right agate text-ledger/70">{line.sb}</span>
          <span className="text-right agate text-ledger/70">{line.cs}</span>
          <span className="text-right agate text-ledger/70">{line.sh}</span>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(8rem,1fr)_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem] px-4 py-1 text-sm border-b border-field-line font-medium">
        <span className="text-ledger/60 text-xs uppercase tracking-wide">Totals</span>
        <span className="text-right agate text-ledger/90">{totals.ab}</span>
        <span className="text-right agate text-ledger/90">{totals.r}</span>
        <span className="text-right agate text-ledger/90">{totals.h}</span>
        <span className="text-right agate text-ledger/90">{totals.hr}</span>
        <span className="text-right agate text-ledger/90">{totals.rbi}</span>
        <span className="text-right agate text-ledger/90">{totals.bb}</span>
        <span className="text-right agate text-ledger/90">{totals.k}</span>
        <span className="text-right agate text-ledger/90">{totals.sb}</span>
        <span className="text-right agate text-ledger/90">{totals.cs}</span>
        <span className="text-right agate text-ledger/90">{totals.sh}</span>
      </div>
      <div className="px-4 py-2 text-xs text-ledger/45 space-y-0.5">
        {doublesNote && <div><span className="text-ledger/30 uppercase tracking-wide">2B:</span> {doublesNote}</div>}
        {triplesNote && <div><span className="text-ledger/30 uppercase tracking-wide">3B:</span> {triplesNote}</div>}
        {hrNote && <div><span className="text-ledger/30 uppercase tracking-wide">HR:</span> {hrNote}</div>}
        {gidpNoteText && <div><span className="text-ledger/30 uppercase tracking-wide">GIDP:</span> {gidpNoteText}</div>}
        <div><span className="text-ledger/30 uppercase tracking-wide">RISP:</span> {rispH}-for-{rispAb}</div>
        {side.substitutions.map((sub, i) => (
          <div key={i}>{substitutionNote(sub, nameLookup)}</div>
        ))}
      </div>
    </div>
  );
}

// A pitcher can carry more than one badge at once — a blown save doesn't
// preclude also picking up the win or the loss (a real, intentional MLB
// combination, see pitcherDecisions.js) — so this stacks them vertically
// in the same narrow column rather than assuming just one applies.
function decisionBadge(playerId, decisions) {
  const badges = [];
  if (playerId === decisions.winningPitcherId) badges.push(['W', 'text-brass-bright']);
  if (playerId === decisions.losingPitcherId) badges.push(['L', 'text-brick-bright']);
  if (playerId === decisions.savePitcherId) badges.push(['S', 'text-navy-bright']);
  if (decisions.holdPitcherIds.includes(playerId)) badges.push(['H', 'text-ledger/50']);
  if (decisions.blownSavePitcherIds.includes(playerId)) badges.push(['BS', 'text-brick-bright/70']);
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-col leading-tight text-[10px]">
      {badges.map(([label, className]) => (
        <span key={label} className={className}>({label})</span>
      ))}
    </span>
  );
}

function PitchingTable({ label, side, decisions }) {
  const totalOuts = sumBy(side.pitchingLines, 'outsRecorded');
  const totals = {
    h: sumBy(side.pitchingLines, 'h'),
    r: sumBy(side.pitchingLines, 'r'),
    er: sumBy(side.pitchingLines, 'er'),
    bb: sumBy(side.pitchingLines, 'bb'),
    k: sumBy(side.pitchingLines, 'k'),
    hr: sumBy(side.pitchingLines, 'hr'),
    pitches: sumBy(side.pitchingLines, 'pitches'),
  };

  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        {label} pitching
      </div>
      <div className="grid grid-cols-[minmax(8.5rem,1fr)_1.6rem_2.15rem_1.65rem_1.65rem_1.65rem_1.65rem_1.65rem_1.65rem_2.25rem_0.6rem_2.5rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>Player</span>
        <span></span>
        <span className="text-right">IP</span>
        <span className="text-right">H</span>
        <span className="text-right">R</span>
        <span className="text-right">ER</span>
        <span className="text-right">BB</span>
        <span className="text-right">K</span>
        <span className="text-right">HR</span>
        <span className="text-right">PC</span>
        <span></span>
        <span className="text-right">ERA</span>
      </div>
      {side.pitchingLines.map((line) => {
        const innings = line.outsRecorded / 3;
        const era = innings > 0 ? (line.er * 9) / innings : 0;
        return (
          <div
            key={line.player.id}
            className="grid grid-cols-[minmax(8.5rem,1fr)_1.6rem_2.15rem_1.65rem_1.65rem_1.65rem_1.65rem_1.65rem_1.65rem_2.25rem_0.6rem_2.5rem] px-4 py-1 text-sm border-b border-field-line"
          >
            <span className="text-ledger/85 truncate">
              {line.player.firstName} {line.player.lastName}
            </span>
            <span className="text-left">{decisionBadge(line.player.id, decisions)}</span>
            <span className="text-right agate text-ledger/70">{formatInningsPitched(line.outsRecorded)}</span>
            <span className="text-right agate text-ledger/70">{line.h}</span>
            <span className="text-right agate text-ledger/70">{line.r}</span>
            <span className="text-right agate text-ledger/70">{line.er}</span>
            <span className="text-right agate text-ledger/70">{line.bb}</span>
            <span className="text-right agate text-ledger/70">{line.k}</span>
            <span className="text-right agate text-ledger/70">{line.hr}</span>
            <span className="text-right agate text-ledger/70">{line.pitches}</span>
            <span></span>
            <span className="text-right agate text-ledger/70">{era.toFixed(2)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(8.5rem,1fr)_1.6rem_2.15rem_1.65rem_1.65rem_1.65rem_1.65rem_1.65rem_1.65rem_2.25rem_0.6rem_2.5rem] px-4 py-1 text-sm font-medium">
        <span className="text-ledger/60 text-xs uppercase tracking-wide">Totals</span>
        <span></span>
        <span className="text-right agate text-ledger/90">{formatInningsPitched(totalOuts)}</span>
        <span className="text-right agate text-ledger/90">{totals.h}</span>
        <span className="text-right agate text-ledger/90">{totals.r}</span>
        <span className="text-right agate text-ledger/90">{totals.er}</span>
        <span className="text-right agate text-ledger/90">{totals.bb}</span>
        <span className="text-right agate text-ledger/90">{totals.k}</span>
        <span className="text-right agate text-ledger/90">{totals.hr}</span>
        <span className="text-right agate text-ledger/90">{totals.pitches}</span>
        <span></span>
        <span></span>
      </div>
    </div>
  );
}

export default function BoxScore() {
  const { buildMatchup } = useLeagueState();
  const [[initialAway, initialHome]] = useState(() => pickTwoDistinctTeamIds(createRng(Date.now())));
  const [awayTeamId, setAwayTeamId] = useState(initialAway);
  const [homeTeamId, setHomeTeamId] = useState(initialHome);
  const [result, setResult] = useState(() => simulateMatchup(initialAway, initialHome, buildMatchup));

  const resimulate = useCallback((away, home) => setResult(simulateMatchup(away, home, buildMatchup)), [buildMatchup]);

  const handleAwayChange = (e) => {
    const next = e.target.value;
    setAwayTeamId(next);
    resimulate(next, homeTeamId);
  };
  const handleHomeChange = (e) => {
    const next = e.target.value;
    setHomeTeamId(next);
    resimulate(awayTeamId, next);
  };
  const randomizeMatchup = () => {
    const [away, home] = pickTwoDistinctTeamIds(createRng(Date.now()));
    setAwayTeamId(away);
    setHomeTeamId(home);
    resimulate(away, home);
  };

  const { matchup, box, decisions, gameContext } = result;
  const awayLabel = `${matchup.awayTeam.city} ${matchup.awayTeam.nickname}`;
  const homeLabel = `${matchup.homeTeam.city} ${matchup.homeTeam.nickname}`;
  const winner = box.away.runs > box.home.runs ? awayLabel : homeLabel;

  const selectClass = 'bg-field-dark border border-field-line rounded-sm px-2 py-1.5 text-sm text-ledger/85';

  return (
    <div>
      <PageHeader
        eyebrow="Live Sim"
        title="Box Score"
        description="A real plate-appearance-by-plate-appearance simulated game between two real teams from the 50-team league — real rosters, real managers' tendencies, and the same live season-end state data/season.js already tracks (a currently-injured or overworked player is correctly unavailable here too, not a fresh healthy roster every time). Each team's rotation[0] starts, since there's no rotation-index tracking outside the season loop for a standalone game. Venue/attendance/game time are derived from real sim data (market size, pitch count) — not modeled stadium/weather systems, which don't exist yet."
      />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select value={awayTeamId} onChange={handleAwayChange} className={selectClass}>
            {sortedTeams.filter((t) => t.id !== homeTeamId).map((t) => (
              <option key={t.id} value={t.id}>{t.city} {t.nickname} ({t.tier})</option>
            ))}
          </select>
          <span className="text-ledger/30 text-sm">at</span>
          <select value={homeTeamId} onChange={handleHomeChange} className={selectClass}>
            {sortedTeams.filter((t) => t.id !== awayTeamId).map((t) => (
              <option key={t.id} value={t.id}>{t.city} {t.nickname} ({t.tier})</option>
            ))}
          </select>
        </div>
        <button
          onClick={randomizeMatchup}
          className="px-4 py-1.5 text-sm tracking-wide rounded-sm text-ledger/50 hover:text-ledger bg-field-dark border border-field-line transition-colors"
        >
          Random Matchup
        </button>
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm text-ledger/60">
          <span className="text-ledger/90">{awayLabel}</span> at <span className="text-ledger/90">{homeLabel}</span>
          <span className="mx-2 text-ledger/25">·</span>
          <span className="text-brass-bright">{winner} wins</span>
          <span className="mx-2 text-ledger/25">·</span>
          <span className="text-ledger/40">{box.innings} innings</span>
        </div>
        <button
          onClick={() => resimulate(awayTeamId, homeTeamId)}
          className="px-4 py-1.5 text-sm tracking-wide rounded-sm bg-brass text-field-dark font-medium hover:bg-brass-bright transition-colors"
        >
          Simulate Again
        </button>
      </div>

      <div className="text-xs text-ledger/35 mb-3">
        {gameContext.venue} · Attendance {gameContext.attendance.toLocaleString()} · Game Time {gameContext.gameTime}
      </div>

      <div className="mb-4">
        <LineScore awayLabel={awayLabel} homeLabel={homeLabel} box={box} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <BattingTable label={awayLabel} side={box.away} />
        <BattingTable label={homeLabel} side={box.home} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PitchingTable label={awayLabel} side={box.away} decisions={decisions} />
        <PitchingTable label={homeLabel} side={box.home} decisions={decisions} />
      </div>
    </div>
  );
}
