import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { useLeagueState } from '../state/LeagueStateContext.jsx';

export default function Financials() {
  const { teams } = useLeagueState();
  const sorted = [...teams].sort((a, b) => b.marketSize - a.marketSize);

  return (
    <div>
      <PageHeader
        eyebrow="Two-Knob Model"
        title="Financials"
        description="Market size (sustainable payroll ceiling) and owner wealth (temporary overspend capacity) are independent — a small-market team with a rich owner can punch above its weight, at cost. Both are real per-team values now (market size loosely reflects real-world metro size, owner wealth is randomized — both are illustrative placeholders, not sourced numbers). Payroll itself isn't shown yet — no salary/contract mechanic exists in the engine to compute a real figure from these two knobs; that's real future work once player contracts exist, not dropped from the roadmap."
      />

      <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_5rem_10rem_10rem] px-4 py-2 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
          <span>Club</span>
          <span></span>
          <span>Market Size</span>
          <span>Owner Wealth</span>
        </div>
        {sorted.map((t) => (
          <div key={t.id} className="grid grid-cols-[1fr_5rem_10rem_10rem] items-center px-4 py-2.5 text-sm border-b border-field-line last:border-0">
            <span className="text-ledger/85 truncate">{t.city} {t.nickname}</span>
            <TierBadge tier={t.tier} />
            <div className="h-1.5 bg-field rounded-full overflow-hidden mr-4">
              <div className="h-full bg-navy-bright" style={{ width: `${t.marketSize * 100}%` }} />
            </div>
            <div className="h-1.5 bg-field rounded-full overflow-hidden mr-4">
              <div className="h-full bg-brass-bright" style={{ width: `${t.ownership.ownerWealth * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
