import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { DRAFT_ROUNDS, DRAFT_LOTTERY_PICKS } from '../models/constants';

function teamLabel(team) {
  return team ? `${team.city} ${team.nickname}` : '—';
}

// Round 1's own 50 slots are always laid out lottery-winners-first, then
// the rest of the non-exempt pool in rank order, then MLB1's 8 real
// playoff teams last (engine/draft.js's computeDraftOrder) — inferable
// directly from pick position within round 1, no extra data needed.
function round1SlotLabel(pickIndexWithinRound) {
  if (pickIndexWithinRound < DRAFT_LOTTERY_PICKS) return 'Lottery';
  if (pickIndexWithinRound < 50 - 8) return 'Order';
  return 'Playoff';
}

const SLOT_LABEL_COLOR = {
  Lottery: 'text-brass-bright',
  Order: 'text-ledger/70',
  Playoff: 'text-navy-bright',
};

function DraftRow({ pick, selection, teamsById, round }) {
  const team = teamsById.get(pick.currentOwnerTeamId);
  const slot = round === 1 ? round1SlotLabel(pick.pickNumber - 1) : null;
  return (
    <div className="grid grid-cols-[3rem_1fr_2.5rem_minmax(9rem,1fr)_3rem] px-4 py-1.5 text-sm border-b border-field-line">
      <span className="agate text-ledger/50">{pick.pickNumber}</span>
      <span className="text-ledger/85 truncate">{teamLabel(team)}</span>
      {slot ? (
        <span className={`text-[10px] uppercase tracking-wider ${SLOT_LABEL_COLOR[slot]}`}>{slot}</span>
      ) : (
        <span />
      )}
      <span className="text-ledger/85 truncate">{selection ? `${selection.firstName} ${selection.lastName}` : '—'}</span>
      <span className="text-right agate text-ledger/70">{selection?.primaryPosition ?? '—'}</span>
    </div>
  );
}

export default function Draft() {
  const { teams, getDraftResult } = useLeagueState();
  const [round, setRound] = useState(1);
  const draftResult = getDraftResult();
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const picksThisRound = draftResult.picks.filter((p) => p.round === round);
  const selectionByPickId = new Map(draftResult.selections.map((s) => [s.pickId, s]));

  return (
    <div>
      <PageHeader
        eyebrow="Domestic Draft"
        title="Draft"
        description={`A unified ${DRAFT_ROUNDS}-round draft across all 50 clubs, both tiers combined. Round 1: the ${DRAFT_LOTTERY_PICKS} non-playoff clubs with the worst records enter a weighted lottery for the top picks (real post-elimination performance earns extra lottery equity, on top of a bad record alone), the rest of the non-playoff pool follows in reverse-standings order, and MLB1's 8 real playoff clubs fill the last slots by how far they advanced. Round 2 on: straight worst-to-first, same order every round. Every pick signs immediately and reports to Rookie ball.`}
      />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {Array.from({ length: DRAFT_ROUNDS }, (_, i) => i + 1).map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
              round === r
                ? 'border-brass-bright bg-field text-ledger'
                : 'border-field-line text-ledger/50 hover:text-ledger hover:bg-field/60'
            }`}
          >
            Round {r}
          </button>
        ))}
      </div>

      <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
        <div className="grid grid-cols-[3rem_1fr_2.5rem_minmax(9rem,1fr)_3rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
          <span>Pick</span>
          <span>Club</span>
          <span></span>
          <span>Player</span>
          <span className="text-right">Pos</span>
        </div>
        {picksThisRound.map((pick) => (
          <DraftRow key={pick.id} pick={pick} selection={selectionByPickId.get(pick.id)} teamsById={teamsById} round={round} />
        ))}
      </div>

      <p className="text-xs text-ledger/40 mt-3">
        Signing scope, this phase: every pick signs to a minors contract at a placeholder 100% rate — the refuse/defer-to-college/flex-contract
        paths wait for the College system. See a team's <Link to="/teams" className="text-brass-bright/80 hover:text-brass-bright">Farm System</Link> card for where signees land.
      </p>
    </div>
  );
}
