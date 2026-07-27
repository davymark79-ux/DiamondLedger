import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { useLeagueState } from '../state/LeagueStateContext.jsx';

// "50-man Roster System" arc, Phase 3 — real dollar figures for the first
// time anywhere in this codebase; every other financial value stays an
// abstract 0-1 scale.
function formatMillions(dollars) {
  return `$${(dollars / 1_000_000).toFixed(1)}M`;
}

export default function Financials() {
  const { teams, getTeamPayroll } = useLeagueState();
  const sorted = [...teams].sort((a, b) => b.marketSize - a.marketSize);

  return (
    <div>
      <PageHeader
        eyebrow="Two-Knob Model"
        title="Financials"
        description="Market size (sustainable payroll ceiling) and owner wealth (temporary overspend capacity) are independent — a small-market team with a rich owner can punch above its weight, at cost. Both are real per-team values now (market size loosely reflects real-world metro size, owner wealth is randomized — both are illustrative placeholders, not sourced numbers). Payroll is now real too (engine/contracts.js) — every player under an organization's control has a real contract, summed here across the active 26 and the Reserve pool (the same 50-man basis a real luxury tax applies to). The salary floor and luxury tax threshold below are flat, CBA-negotiable placeholders, informational only for now — no scripted-event consequence is wired to them yet."
      />

      <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_5rem_10rem_10rem_10rem] px-4 py-2 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
          <span>Club</span>
          <span></span>
          <span>Market Size</span>
          <span>Owner Wealth</span>
          <span>Payroll (50-man)</span>
        </div>
        {sorted.map((t) => {
          const { payroll, belowFloor, overThreshold } = getTeamPayroll(t.id);
          return (
            <div key={t.id} className="grid grid-cols-[1fr_5rem_10rem_10rem_10rem] items-center px-4 py-2.5 text-sm border-b border-field-line last:border-0">
              <span className="text-ledger/85 truncate">{t.city} {t.nickname}</span>
              <TierBadge tier={t.tier} />
              <div className="h-1.5 bg-field rounded-full overflow-hidden mr-4">
                <div className="h-full bg-navy-bright" style={{ width: `${t.marketSize * 100}%` }} />
              </div>
              <div className="h-1.5 bg-field rounded-full overflow-hidden mr-4">
                <div className="h-full bg-brass-bright" style={{ width: `${t.ownership.ownerWealth * 100}%` }} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="agate text-ledger/85">{formatMillions(payroll)}</span>
                {belowFloor && <span className="text-[10px] uppercase tracking-wider text-navy-bright/80">Below Floor</span>}
                {overThreshold && <span className="text-[10px] uppercase tracking-wider text-brass-bright/80">Over Tax</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
