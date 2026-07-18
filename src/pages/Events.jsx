import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { scriptedEvents } from '../data/mockData';

const TYPES = ['all', 'injury', 'firing', 'financial', 'expansion', 'stadium', 'cba'];

export default function Events() {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? scriptedEvents : scriptedEvents.filter((e) => e.type === filter);

  return (
    <div>
      <PageHeader
        eyebrow="Scripted Event Framework"
        title="League Wire"
        description="One generic conditions + probabilities + effects framework drives all of these categories — none of it is running yet, this is just the feed layout."
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

      <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
        {filtered.map((e) => (
          <div key={e.id} className="px-5 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-brass-bright/80">{e.type}</span>
                <span className="text-xs text-ledger/40">{e.team}</span>
              </div>
              <span className="agate text-[11px] text-ledger/35">{e.date}</span>
            </div>
            <p className="text-sm text-ledger/85 leading-snug">{e.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
