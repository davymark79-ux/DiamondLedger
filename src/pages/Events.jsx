import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';

// Only injury and firing events are real in this engine — mockData.js's old
// 'financial'/'expansion'/'stadium'/'cba' categories had no underlying
// system at all (the design doc's Scripted Event framework was never built,
// see CLAUDE.md). Dropped rather than kept as dead filter options.
const TYPES = ['all', 'injury', 'firing'];

export default function Events() {
  const [filter, setFilter] = useState('all');
  const { getLeagueWireEvents } = useLeagueState();
  const events = getLeagueWireEvents();
  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);

  return (
    <div>
      <PageHeader
        eyebrow="Season Activity"
        title="League Wire"
        description="Real injury and manager Firing & Rehiring events from the simulated season. Injuries shown are only those still active as of season's end — a player hurt earlier who's already recovered leaves no trace here; firings are a complete log. No financial/expansion/stadium/CBA events exist yet — those systems aren't built."
      />

      <div className="flex gap-1 mb-5 flex-wrap">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1 text-xs tracking-wide rounded-sm capitalize transition-colors ${
              filter === t ? 'bg-brass text-field-dark font-medium' : 'text-ledger/50 hover:text-ledger bg-field-dark border border-field-line'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-field-dark border border-field-line rounded-sm px-4 py-6 text-center text-ledger/40 text-sm">
          No events of this type this season.
        </div>
      ) : (
        <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
          {filtered.map((e) => (
            <div key={e.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-brass-bright/80">{e.type}</span>
                  <span className="text-xs text-ledger/40">{e.team}</span>
                </div>
                <span className="agate text-[11px] text-ledger/35">Game {e.gameNumber}</span>
              </div>
              <p className="text-sm text-ledger/85 leading-snug">{e.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
