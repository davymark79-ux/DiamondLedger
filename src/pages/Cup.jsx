import PageHeader from '../components/PageHeader';
import { cupRounds } from '../data/mockData';

const statusStyle = {
  complete: 'text-ledger/35 border-field-line',
  'in progress': 'text-brass-bright border-brass-bright/50 bg-brass/10',
  upcoming: 'text-ledger/25 border-field-line border-dashed',
};

export default function Cup() {
  return (
    <div>
      <PageHeader
        eyebrow="FA Cup-Style"
        title="The Ledger Cup"
        description="Spans the season, open across tiers. Christopher's scheduling approach for cross-tier calendar conflicts hasn't been documented yet — this is just round progress."
      />

      <div className="flex flex-col gap-2 max-w-md">
        {cupRounds.map((r) => (
          <div
            key={r.round}
            className={`flex items-center justify-between px-4 py-3 rounded-sm border bg-field-dark ${statusStyle[r.status]}`}
          >
            <span className="text-sm tracking-wide">{r.round}</span>
            <span className="text-[10px] uppercase tracking-wider">{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
