import { useState, useMemo } from 'react';
import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { getAge } from '../models/Player.js';
import { playerQualityScore } from '../engine/minorLeagues.js';

const ROSTER_SECTIONS = ['lineup', 'rotation', 'bullpen', 'bench'];

const POOL_LABEL = { ACTIVE: 'Active', RESERVE: 'Reserve', TAXI: 'Taxi' };
const POOL_COLOR = { ACTIVE: 'text-brass-bright/80', RESERVE: 'text-navy-bright/80', TAXI: 'text-ledger/60' };

// Combines a team's active roster + Reserve pool (Taxi Squad is always a
// subset of Reserve, see engine/taxiSquad.js's header) into one flat,
// quality-sorted, tradable-player list — the 50-man-pool scope this
// phase's trades are limited to (player-movement.md's own header: "these
// mechanics all concern 50-man-roster movement specifically").
function useTradeablePlayers(teamId, getTeamRoster, getReserveRoster, getTaxiSquad) {
  return useMemo(() => {
    if (!teamId) return [];
    const rows = [];
    const roster = getTeamRoster(teamId);
    if (roster) {
      for (const sectionKey of ROSTER_SECTIONS) {
        for (const player of roster[sectionKey]) rows.push({ player, pool: 'ACTIVE' });
      }
    }
    const taxiIds = new Set(getTaxiSquad(teamId).map((r) => r.player.id));
    for (const { player } of getReserveRoster(teamId)) {
      rows.push({ player, pool: taxiIds.has(player.id) ? 'TAXI' : 'RESERVE' });
    }
    return rows.sort((a, b) => playerQualityScore(b.player) - playerQualityScore(a.player));
  }, [teamId, getTeamRoster, getReserveRoster, getTaxiSquad]);
}

function TradeablePlayerRow({ row, selected, onToggle }) {
  const { player, pool } = row;
  return (
    <label className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_3.5rem_3rem] items-center px-3 py-1.5 text-sm border-b border-field-line last:border-b-0 cursor-pointer hover:bg-field/40">
      <input type="checkbox" checked={selected} onChange={onToggle} className="accent-brass-bright" />
      <span className="text-ledger/85 truncate">{player.firstName} {player.lastName}</span>
      <span className="agate text-ledger/70">{player.primaryPosition}</span>
      <span className="agate text-ledger/60">{getAge(player) ?? '—'}</span>
      <span className="agate text-ledger/60">{Math.round(playerQualityScore(player))}</span>
      <span className={`text-[10px] uppercase tracking-wider text-right ${POOL_COLOR[pool]}`}>{POOL_LABEL[pool]}</span>
    </label>
  );
}

function TeamTradePanel({ label, teamId, onTeamChange, teams, rows, selectedIds, onToggle }) {
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-field-line flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ledger/40">{label}</span>
        <select
          value={teamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className="flex-1 bg-field border border-field-line rounded-sm px-1.5 py-1 text-xs text-ledger/85"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.city} {t.nickname}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_3.5rem_3rem] px-3 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span />
        <span>Player</span>
        <span>Pos</span>
        <span>Age</span>
        <span>Qual</span>
        <span className="text-right">Pool</span>
      </div>
      <div className="max-h-[26rem] overflow-y-auto">
        {rows.map((row) => (
          <TradeablePlayerRow
            key={row.player.id}
            row={row}
            selected={selectedIds.has(row.player.id)}
            onToggle={() => onToggle(row.player.id)}
          />
        ))}
        {rows.length === 0 && <div className="px-3 py-6 text-center text-sm text-ledger/40">No tradable players.</div>}
      </div>
    </div>
  );
}

export default function Trades() {
  const { teams, isSimulating, getTeamRoster, getReserveRoster, getTaxiSquad, proposeTrade } = useLeagueState();
  const sortedTeams = [...teams].sort((a, b) => `${a.city} ${a.nickname}`.localeCompare(`${b.city} ${b.nickname}`));
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const teamLabel = (teamId) => {
    const t = teamsById.get(teamId);
    return t ? `${t.city} ${t.nickname}` : '—';
  };

  const [teamAId, setTeamAId] = useState(sortedTeams[0]?.id ?? '');
  const [teamBId, setTeamBId] = useState(sortedTeams[1]?.id ?? sortedTeams[0]?.id ?? '');
  const [selectedA, setSelectedA] = useState(new Set());
  const [selectedB, setSelectedB] = useState(new Set());
  const [lastResult, setLastResult] = useState(null);

  const rowsA = useTradeablePlayers(teamAId, getTeamRoster, getReserveRoster, getTaxiSquad);
  const rowsB = useTradeablePlayers(teamBId, getTeamRoster, getReserveRoster, getTaxiSquad);

  function toggle(setSelected) {
    return (playerId) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(playerId)) next.delete(playerId);
        else next.add(playerId);
        return next;
      });
    };
  }

  function changeTeam(setTeamId, setSelected) {
    return (teamId) => {
      setTeamId(teamId);
      setSelected(new Set());
      setLastResult(null);
    };
  }

  const canExecute = teamAId && teamBId && teamAId !== teamBId && (selectedA.size > 0 || selectedB.size > 0) && !isSimulating;

  async function handleExecute() {
    const result = await proposeTrade(teamAId, teamBId, [...selectedA], [...selectedB]);
    if (!result) {
      setLastResult({ ok: false, text: 'That trade could not be completed (stale roster listing) — refresh and try again.' });
      return;
    }
    if (result.outcome === 'MEDICAL_REVIEW_FAILED') {
      const flagged = [...rowsA, ...rowsB].find((r) => r.player.id === result.flaggedPlayerId)?.player;
      const name = flagged ? `${flagged.firstName} ${flagged.lastName}` : 'A player';
      setLastResult({ ok: false, text: `Trade fell through — ${name} failed his physical.` });
      return;
    }
    setLastResult({
      ok: true,
      text: `Trade completed: ${teamLabel(teamAId)} sent ${selectedA.size} player(s), ${teamLabel(teamBId)} sent ${selectedB.size} player(s).`,
    });
    setSelectedA(new Set());
    setSelectedB(new Set());
  }

  return (
    <div>
      <PageHeader
        eyebrow="Transactions"
        title="Trades"
        description="Exchange player contracts/rights between any two clubs — active roster, Reserve pool, or Taxi Squad. No salary matching required. Every trade passes a post-trade medical review (weighted by Durability) before it's finalized; a failed review falls the whole trade through with no state change. Draft picks, cash, and international bonus-pool space aren't tradeable yet."
      />

      {lastResult && (
        <div className={`mb-3 px-3 py-2 text-xs rounded-sm border ${lastResult.ok ? 'border-brass-bright/30 text-brass-bright/90' : 'border-brick-bright/30 text-brick-bright/90'}`}>
          {lastResult.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <TeamTradePanel
          label="Team A"
          teamId={teamAId}
          onTeamChange={changeTeam(setTeamAId, setSelectedA)}
          teams={sortedTeams}
          rows={rowsA}
          selectedIds={selectedA}
          onToggle={toggle(setSelectedA)}
        />
        <TeamTradePanel
          label="Team B"
          teamId={teamBId}
          onTeamChange={changeTeam(setTeamBId, setSelectedB)}
          teams={sortedTeams}
          rows={rowsB}
          selectedIds={selectedB}
          onToggle={toggle(setSelectedB)}
        />
      </div>

      <div className="mt-4 flex items-center justify-between bg-field-dark border border-field-line rounded-sm px-4 py-3">
        <div className="text-xs text-ledger/60">
          {teamLabel(teamAId)} sends <span className="text-ledger/85">{selectedA.size}</span> · {teamLabel(teamBId)} sends{' '}
          <span className="text-ledger/85">{selectedB.size}</span>
        </div>
        <button
          onClick={handleExecute}
          disabled={!canExecute}
          className="px-4 py-1.5 text-sm rounded-sm border border-field-line text-brass-bright/80 hover:text-brass-bright hover:border-brass-bright/50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Execute Trade
        </button>
      </div>
    </div>
  );
}
