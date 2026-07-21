import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { teams } from '../data/realLeague';
import { getTeamRecord, results, getLeagueWireEvents } from '../data/season';
import { TIERS } from '../models/constants';

const RECENT_RESULTS_COUNT = 5;
const WIRE_ITEMS_COUNT = 5;

// "Pace-setter" is a best-record-in-tier summary, not a real cross-league
// ranking — Foundry and Exchange clubs never play each other in the regular
// season (league-structure.md), so there's no real single "MLB1 leader" the
// way a Standings.jsx table would produce one.
function bestRecordInTier(tier) {
  let best = null;
  for (const team of teams) {
    if (team.tier !== tier) continue;
    const { wins, losses } = getTeamRecord(team.id);
    const pct = wins + losses > 0 ? wins / (wins + losses) : 0;
    if (!best || pct > best.pct) best = { team, wins, losses, pct };
  }
  return best;
}

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
  const mlb1Leader = bestRecordInTier(TIERS.MLB1);
  const mlb2Leader = bestRecordInTier(TIERS.MLB2);
  const wireEvents = getLeagueWireEvents();
  const recentResults = results.slice(-RECENT_RESULTS_COUNT).reverse();
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div>
      <PageHeader
        eyebrow="Season Snapshot"
        title="League Overview"
        description="A full season has already been simulated across all 50 real teams (no calendar/date model yet — see Schedule for the same caveat). Everything below is real, engine-computed data."
      />

      <div className="grid grid-cols-4 gap-4 mb-10">
        <StatBlock label="MLB1 Pace-Setter" value={`${mlb1Leader.team.city} ${mlb1Leader.team.nickname}`} sub={`${mlb1Leader.wins}-${mlb1Leader.losses}`} />
        <StatBlock label="MLB2 Pace-Setter" value={`${mlb2Leader.team.city} ${mlb2Leader.team.nickname}`} sub={`${mlb2Leader.wins}-${mlb2Leader.losses}`} />
        <StatBlock label="Open Wire Items" value={wireEvents.length} sub="injuries + manager changes" />
        <StatBlock label="Games Simulated" value={results.length} sub="across all tiers" />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <section>
          <h2 className="display-face text-lg text-ledger mb-3 tracking-wide">Recent Results</h2>
          <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
            {recentResults.map((r) => {
              const away = teamsById.get(r.awayTeamId);
              const home = teamsById.get(r.homeTeamId);
              return (
                <div key={r.gameNumber} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <TierBadge tier={away.tier} />
                    <span className="text-ledger/85">{away.city} {away.nickname}</span>
                    <span className="agate text-xs text-ledger/60">{r.awayRuns}</span>
                    <span className="text-ledger/30">at</span>
                    <span className="text-ledger/85">{home.city} {home.nickname}</span>
                    <span className="agate text-xs text-ledger/60">{r.homeRuns}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="display-face text-lg text-ledger mb-3 tracking-wide">League Wire</h2>
          <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
            {wireEvents.slice(0, WIRE_ITEMS_COUNT).map((e) => (
              <div key={e.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-brass-bright/70">{e.type}</span>
                  <span className="text-xs text-ledger/40">{e.team}</span>
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
