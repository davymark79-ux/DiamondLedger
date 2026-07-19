import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { getInductees, getBallot, HALL_OF_FAME_SNAPSHOT_META } from '../data/hallOfFame';
import { teams } from '../data/realLeague';

const teamsById = new Map(teams.map((t) => [t.id, t]));

function teamLabel(teamId) {
  const team = teamsById.get(teamId);
  return team ? `${team.city} ${team.nickname}` : '—';
}

const TYPE_LABELS = { batter: 'Batter', pitcher: 'Pitcher', manager: 'Manager' };
const TYPE_COLORS = {
  batter: 'bg-brass/20 text-brass-bright',
  pitcher: 'bg-navy/30 text-navy-bright',
  manager: 'bg-ledger/15 text-ledger/70',
};

function TypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] tracking-wider font-medium agate ${TYPE_COLORS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  );
}

function InducteesTable({ inductees }) {
  if (inductees.length === 0) {
    return <div className="bg-field-dark border border-field-line rounded-sm px-4 py-6 text-center text-ledger/40 text-sm">No inductees yet in this snapshot.</div>;
  }
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
      <div className="grid grid-cols-[2rem_1fr_5rem_1fr_5rem_4.5rem] px-4 py-2 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>#</span>
        <span>Name</span>
        <span>Type</span>
        <span>Club</span>
        <span className="text-right">Case</span>
        <span className="text-right">Season</span>
      </div>
      {inductees.map((c, i) => (
        <div
          key={c.id}
          className="grid grid-cols-[2rem_1fr_5rem_1fr_5rem_4.5rem] px-4 py-2 text-sm border-b border-field-line last:border-b-0"
        >
          <span className="agate text-ledger/50">{i + 1}</span>
          <span className="text-ledger/90 truncate">
            {c.name}
            {c.viaLegacyCommittee && <span className="ml-1.5 text-[10px] text-brass-bright/70 tracking-wide">LEGACY</span>}
          </span>
          <span><TypeBadge type={c.type} /></span>
          <span className="text-ledger/60 truncate">{teamLabel(c.primaryTeamId)}</span>
          <span className="agate text-right text-ledger/75">{c.caseScore.toFixed(1)}</span>
          <span className="agate text-right text-ledger/50">Yr {c.inductionSeasonNumber}</span>
        </div>
      ))}
    </div>
  );
}

function BallotTable({ ballot }) {
  if (ballot.length === 0) {
    return <div className="bg-field-dark border border-field-line rounded-sm px-4 py-6 text-center text-ledger/40 text-sm">No candidates currently on the ballot.</div>;
  }
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
      <div className="grid grid-cols-[2rem_1fr_5rem_1fr_5rem_5rem_3rem] px-4 py-2 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>#</span>
        <span>Name</span>
        <span>Type</span>
        <span>Club</span>
        <span className="text-right">Case</span>
        <span className="text-right">Vote %</span>
        <span className="text-right">Yr</span>
      </div>
      {ballot.map((c, i) => (
        <div
          key={c.id}
          className="grid grid-cols-[2rem_1fr_5rem_1fr_5rem_5rem_3rem] px-4 py-2 text-sm border-b border-field-line last:border-b-0"
        >
          <span className="agate text-ledger/50">{i + 1}</span>
          <span className="text-ledger/90 truncate">{c.name}</span>
          <span><TypeBadge type={c.type} /></span>
          <span className="text-ledger/60 truncate">{teamLabel(c.primaryTeamId)}</span>
          <span className="agate text-right text-ledger/75">{c.caseScore.toFixed(1)}</span>
          <span className="agate text-right text-ledger/50">{(c.voteShare * 100).toFixed(0)}%</span>
          <span className="agate text-right text-ledger/50">{c.yearsOnBallot}</span>
        </div>
      ))}
    </div>
  );
}

export default function HallOfFame() {
  const [tab, setTab] = useState('inductees');
  const inductees = getInductees();
  const ballot = getBallot();

  return (
    <div>
      <PageHeader
        eyebrow="Cooperstown of the Pyramid"
        title="Hall of Fame"
        description={`A frozen, engine-simulated look ${HALL_OF_FAME_SNAPSHOT_META.seasonsSimulated} seasons into a hypothetical future — not a live simulation of this league's actual history. ${HALL_OF_FAME_SNAPSHOT_META.writersCorpsSize}-writer Corps ballots, real BBWAA-style eligibility (10 years service, 5 years retired, 75% to elect), and a Legacy Committee pass for candidates the writers dropped.`}
      />

      <div className="flex gap-1 mb-5">
        {[
          { key: 'inductees', label: `Inductees (${inductees.length})` },
          { key: 'ballot', label: `On the Ballot (${ballot.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm tracking-wide rounded-sm transition-colors ${
              tab === key ? 'bg-brass text-field-dark font-medium' : 'text-ledger/50 hover:text-ledger bg-field-dark border border-field-line'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'inductees' ? <InducteesTable inductees={inductees} /> : <BallotTable ballot={ballot} />}
    </div>
  );
}
