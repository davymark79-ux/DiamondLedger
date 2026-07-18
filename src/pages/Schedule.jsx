import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { teams } from '../data/realLeague';
import { results } from '../data/season';

const RECENT_RESULTS_COUNT = 30;

const teamsById = new Map(teams.map((t) => [t.id, t]));

export default function Schedule() {
  // results is chronologically ordered (gameNumber ascending); most recent
  // is the tail end.
  const recent = results.slice(-RECENT_RESULTS_COUNT).reverse();

  return (
    <div>
      <PageHeader
        eyebrow="Results"
        title="Schedule"
        description="A full season has already been simulated (no calendar/date model yet — this is a completed-season snapshot, not day-by-day fixtures leading up to today). Showing the most recent results."
      />

      <div className="bg-field-dark border border-field-line rounded-sm divide-y divide-field-line">
        {recent.map((r) => {
          const away = teamsById.get(r.awayTeamId);
          const home = teamsById.get(r.homeTeamId);
          const awayWon = r.awayRuns > r.homeRuns;
          return (
            <div key={r.gameNumber} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <TierBadge tier={away.tier} />
                <span className={`text-sm ${awayWon ? 'text-ledger/90' : 'text-ledger/50'}`}>
                  {away.city} {away.nickname}
                </span>
                <span className="agate text-xs text-ledger/60">{r.awayRuns}</span>
                <span className="text-ledger/30 text-xs">at</span>
                <span className={`text-sm ${!awayWon ? 'text-ledger/90' : 'text-ledger/50'}`}>
                  {home.city} {home.nickname}
                </span>
                <span className="agate text-xs text-ledger/60">{r.homeRuns}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-ledger/30 border border-field-line rounded-sm px-2 py-1">
                Final
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
