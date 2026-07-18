import PageHeader from '../components/PageHeader';
import { mlbStandings, mlb2Standings, scriptedEvents, upcomingFixtures } from '../data/mockData';
import TierBadge from '../components/TierBadge';

function StatBlock({ label, value, sub }) {
  return (
    <div className="bg-field-dark border border-field-line rounded-sm px-5 py-4">
      <div className="text-[10px] tracking-[0.15em] uppercase text-ledger/40 mb-1">{label}</div>
      <div className="display-face text-2xl text-ledger">{value}</div>
      {sub && <div className="text-xs text-ledger/40 mt-1">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const mlbLeader = mlbStandings[0];
  const mlb2Leader = mlb2Standings[0];

  return (
    <div>
      <PageHeader
        eyebrow="Season 1 · Week 14"
        title="League Overview"
        description="No sim engine wired up yet — everything below is placeholder data standing in for the real thing."
      />

      <div className="grid grid-cols-4 gap-4 mb-10">
        <StatBlock label="MLB Pace-Setter" value={`${mlbLeader.city} ${mlbLeader.nickname}`} sub={`${mlbLeader.wins}-${mlbLeader.losses}`} />
        <StatBlock label="MLB2 Pace-Setter" value={`${mlb2Leader.city} ${mlb2Leader.nickname}`} sub={`${mlb2Leader.wins}-${mlb2Leader.losses}`} />
        <StatBlock label="Open Wire Items" value={scriptedEvents.length} sub="injuries, firings, financial" />
        <StatBlock label="Games This Week" value={upcomingFixtures.length} sub="across all tiers" />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <section>
          <h2 className="display-face text-lg text-ledger mb-3 tracking-wide">Upcoming Fixtures</h2>
          <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
            {upcomingFixtures.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <TierBadge tier={f.tier} />
                  <span className="text-ledger/85">{f.away}</span>
                  <span className="text-ledger/30">at</span>
                  <span className="text-ledger/85">{f.home}</span>
                </div>
                <span className="agate text-xs text-ledger/40">{f.date}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="display-face text-lg text-ledger mb-3 tracking-wide">League Wire</h2>
          <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
            {scriptedEvents.slice(0, 5).map((e) => (
              <div key={e.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-brass-bright/70">{e.type}</span>
                  <span className="agate text-[11px] text-ledger/35">{e.date}</span>
                </div>
                <p className="text-sm text-ledger/80 leading-snug">{e.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
