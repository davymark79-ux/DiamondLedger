import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { allTeams } from '../data/mockData';

export default function Financials() {
  const sorted = [...allTeams].sort((a, b) => b.payroll - a.payroll).slice(0, 15);

  return (
    <div>
      <PageHeader
        eyebrow="Two-Knob Model"
        title="Financials"
        description="Market size (sustainable payroll ceiling) and owner wealth (temporary overspend capacity) are independent — a small-market team with a rich owner can punch above its weight, at cost."
      />

      <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_5rem_8rem_8rem_6rem] px-4 py-2 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
          <span>Club</span>
          <span></span>
          <span>Market Size</span>
          <span>Owner Wealth</span>
          <span className="text-right">Payroll</span>
        </div>
        {sorted.map((t) => (
          <div key={t.id} className="grid grid-cols-[1fr_5rem_8rem_8rem_6rem] items-center px-4 py-2.5 text-sm border-b border-field-line last:border-0">
            <span className="text-ledger/85">{t.city} {t.nickname}</span>
            <TierBadge tier={t.tier} />
            <div className="h-1.5 bg-field rounded-full overflow-hidden mr-4">
              <div className="h-full bg-navy-bright" style={{ width: `${t.marketSize * 100}%` }} />
            </div>
            <div className="h-1.5 bg-field rounded-full overflow-hidden mr-4">
              <div className="h-full bg-brass-bright" style={{ width: `${t.ownerWealth * 100}%` }} />
            </div>
            <span className="agate text-right text-ledger/70">${t.payroll}M</span>
          </div>
        ))}
      </div>
    </div>
  );
}
