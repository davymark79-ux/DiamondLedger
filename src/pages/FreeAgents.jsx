import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { getAge } from '../models/Player.js';
import { playerQualityScore } from '../engine/minorLeagues.js';
import { NATION_CODES } from '../models/generation/nationalityPools.js';

const POOL_FILTERS = ['ESTABLISHED', 'COLLEGE', 'INTERNATIONAL'];
const POOL_LABELS = { ESTABLISHED: 'Established MLB', COLLEGE: 'College', INTERNATIONAL: 'International' };

// Real scope guard, not a nice-to-have: College's/International's pools
// can reach ~1,100-1,700 entries at steady state (see CLAUDE.md §26/27's
// own 20-season stability numbers) — rendering that many rows each with a
// 50-option <select> is a genuine usability problem. Sorted by current
// ability (playerQualityScore) and capped, no pagination/virtualization
// library — a simple cap is enough for this phase.
const DISPLAY_CAP = 100;

function FreeAgentRow({ player, showNation, teams, isSimulating, onSign }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  return (
    <div className="grid grid-cols-[1fr_3rem_2.5rem_3rem_1fr_13rem] items-center px-4 py-1.5 text-sm border-b border-field-line last:border-b-0">
      <span className="text-ledger/85 truncate">{player.firstName} {player.lastName}</span>
      <span className="agate text-ledger/70">{player.primaryPosition}</span>
      <span className="agate text-ledger/60">{getAge(player) ?? '—'}</span>
      <span className="agate text-ledger/60">{Math.round(playerQualityScore(player))}</span>
      {showNation ? (
        <span className="agate text-[11px] text-ledger/50">{NATION_CODES[player.birthNation] ?? player.birthNation ?? '—'}</span>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1.5 justify-end">
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="bg-field-dark border border-field-line rounded-sm px-1.5 py-1 text-xs text-ledger/85"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.city} {t.nickname}</option>
          ))}
        </select>
        <button
          onClick={() => onSign(player.id, teamId)}
          disabled={isSimulating || !teamId}
          className="px-2.5 py-1 text-xs rounded-sm border border-field-line text-brass-bright/80 hover:text-brass-bright hover:border-brass-bright/50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Sign
        </button>
      </div>
    </div>
  );
}

export default function FreeAgents() {
  const {
    teams,
    isSimulating,
    getCollegeFreeAgents,
    getInternationalFreeAgents,
    getEstablishedFreeAgents,
    signCollegeFreeAgent,
    signInternationalFreeAgent,
    signEstablishedFreeAgent,
  } = useLeagueState();
  const [pool, setPool] = useState('ESTABLISHED');
  const [lastResult, setLastResult] = useState(null);

  const sortedTeams = [...teams].sort((a, b) => `${a.city} ${a.nickname}`.localeCompare(`${b.city} ${b.nickname}`));
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const teamLabel = (teamId) => {
    const t = teamsById.get(teamId);
    return t ? `${t.city} ${t.nickname}` : '—';
  };

  const collegeFreeAgents = getCollegeFreeAgents();
  const internationalFreeAgents = getInternationalFreeAgents();
  const establishedFreeAgents = getEstablishedFreeAgents();

  const poolData = {
    ESTABLISHED: establishedFreeAgents,
    COLLEGE: collegeFreeAgents,
    INTERNATIONAL: internationalFreeAgents,
  };
  const activePool = poolData[pool];
  const sorted = [...activePool].sort((a, b) => playerQualityScore(b) - playerQualityScore(a));
  const displayed = sorted.slice(0, DISPLAY_CAP);

  async function handleSign(playerId, teamId) {
    let result = null;
    if (pool === 'COLLEGE') result = await signCollegeFreeAgent(playerId, teamId);
    else if (pool === 'INTERNATIONAL') result = await signInternationalFreeAgent(playerId, teamId);
    else result = await signEstablishedFreeAgent(playerId, teamId);

    if (!result) {
      setLastResult({ ok: false, text: 'That signing could not be completed (stale listing) — refresh and try again.' });
      return;
    }
    if (pool === 'ESTABLISHED') {
      setLastResult({
        ok: true,
        text: `Signed to ${teamLabel(teamId)} — released their weakest ${result.sectionKey} player to make room.`,
      });
    } else {
      setLastResult({ ok: true, text: `Signed to ${teamLabel(teamId)}'s ${result.level} affiliate.` });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Open Market"
        title="Free Agents"
        description="Three separate pools: established MLB/MLB2-quality players available for direct signing to a team's 26-man roster (releasing that team's weakest player at the same position to make room — no waiver/DFA system exists yet), plus College and International amateur free agents who sign onto a team's farm system instead. The established pool is closed-loop — it only shrinks (retirement) or churns (sign-in/release-out), with no season-to-season replenishment modeled yet."
      />

      <div className="flex gap-1 mb-3">
        {POOL_FILTERS.map((p) => (
          <button
            key={p}
            onClick={() => setPool(p)}
            className={`px-4 py-1.5 text-sm tracking-wide rounded-sm transition-colors ${
              pool === p ? 'bg-brass text-field-dark font-medium' : 'text-ledger/50 hover:text-ledger bg-field-dark border border-field-line'
            }`}
          >
            {POOL_LABELS[p]} ({poolData[p].length})
          </button>
        ))}
      </div>

      {lastResult && (
        <div className={`mb-3 px-3 py-2 text-xs rounded-sm border ${lastResult.ok ? 'border-brass-bright/30 text-brass-bright/90' : 'border-brick-bright/30 text-brick-bright/90'}`}>
          {lastResult.text}
        </div>
      )}

      <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
        <div className="grid grid-cols-[1fr_3rem_2.5rem_3rem_1fr_13rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
          <span>Player</span>
          <span>Pos</span>
          <span>Age</span>
          <span>Qual</span>
          <span>{pool === 'INTERNATIONAL' ? 'Nation' : ''}</span>
          <span className="text-right">Sign To</span>
        </div>
        {displayed.map((player) => (
          <FreeAgentRow
            key={player.id}
            player={player}
            showNation={pool === 'INTERNATIONAL'}
            teams={sortedTeams}
            isSimulating={isSimulating}
            onSign={handleSign}
          />
        ))}
        {displayed.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-ledger/40">No free agents in this pool right now.</div>
        )}
      </div>

      {sorted.length > DISPLAY_CAP && (
        <p className="text-xs text-ledger/40 mt-2">
          Showing top {DISPLAY_CAP} of {sorted.length} by current ability — sign a few to see more.
        </p>
      )}
    </div>
  );
}
