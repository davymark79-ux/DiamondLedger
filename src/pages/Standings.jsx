import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { TIERS, LEAGUES } from '../models/constants';

// Standings are grouped by (tier, league) — the same grouping the schedule
// itself uses, since there's no interleague play in the regular season
// (league-structure.md). A flat single table per tier (the old mockData-era
// shape) would mix teams that never actually play each other. `teams` comes
// from useLeagueState() now, not realLeague.js directly — tier changes via
// promotion/relegation, so a team's group membership can shift each season.
function buildGroupStandings(teams, tier, leagueId, getTeamRecord) {
  const groupTeams = teams.filter((t) => t.tier === tier && t.leagueId === leagueId);
  const withRecords = groupTeams.map((team) => {
    const { wins, losses } = getTeamRecord(team.id);
    const pct = wins + losses > 0 ? wins / (wins + losses) : 0;
    return { team, wins, losses, pct };
  });
  withRecords.sort((a, b) => b.pct - a.pct);

  const leader = withRecords[0];
  return withRecords.map((row, i) => ({
    ...row,
    rank: i + 1,
    gb: leader ? (leader.wins - row.wins + (row.losses - leader.losses)) / 2 : 0,
  }));
}

// Promotion/relegation happened at the boundary entering the CURRENT
// season — a real, cheap way to surface "what just changed," matching the
// InjuryTag/FatigueTag/StreakTag convention already established elsewhere.
function swapLabelForTeam(teamId, promotionRelegationSwaps) {
  if (promotionRelegationSwaps.some((s) => s.promotedTeamId === teamId)) return { label: '↑ Promoted', className: 'text-brass-bright/80' };
  if (promotionRelegationSwaps.some((s) => s.relegatedTeamId === teamId)) return { label: '↓ Relegated', className: 'text-brick-bright/80' };
  return null;
}

function StandingsTable({ label, standings, promotionRelegationSwaps }) {
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        {label}
      </div>
      <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_4rem_3rem] px-4 py-2 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>#</span>
        <span>Club</span>
        <span className="text-right">W</span>
        <span className="text-right">L</span>
        <span className="text-right">PCT</span>
        <span className="text-right">GB</span>
      </div>
      {standings.map((row) => {
        const swapLabel = swapLabelForTeam(row.team.id, promotionRelegationSwaps);
        return (
          <div
            key={row.team.id}
            className="grid grid-cols-[2.5rem_1fr_3rem_3rem_4rem_3rem] px-4 py-2 text-sm border-b border-field-line"
          >
            <span className="agate text-ledger/50">{row.rank}</span>
            <span className="text-ledger/90 truncate">
              {row.team.city} {row.team.nickname}
              {swapLabel && <span className={`ml-1.5 text-[10px] ${swapLabel.className} whitespace-nowrap`}>{swapLabel.label}</span>}
            </span>
            <span className="agate text-right text-ledger/75">{row.wins}</span>
            <span className="agate text-right text-ledger/75">{row.losses}</span>
            <span className="agate text-right text-ledger/50">{row.pct.toFixed(3).replace(/^0/, '')}</span>
            <span className="agate text-right text-ledger/50">{row.gb === 0 ? '-' : row.gb.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Standings() {
  const [tier, setTier] = useState(TIERS.MLB1);
  const { teams, getTeamRecord, promotionRelegationSwaps } = useLeagueState();

  const foundryStandings = buildGroupStandings(teams, tier, 'FOUNDRY', getTeamRecord);
  const exchangeStandings = buildGroupStandings(teams, tier, 'EXCHANGE', getTeamRecord);

  return (
    <div>
      <PageHeader
        eyebrow="Pyramid"
        title="Standings"
        description="No interleague play in the regular season — Foundry and Exchange clubs never face each other until the Cup or Finals, so standings are grouped by league. Promotion/relegation executes at every season boundary: each league's last-place MLB1 club swaps tiers with that league's first-place MLB2 club (see the League Wire for exactly which clubs moved)."
      />

      <div className="flex gap-1 mb-5">
        {[TIERS.MLB1, TIERS.MLB2].map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`px-4 py-1.5 text-sm tracking-wide rounded-sm transition-colors ${
              tier === t ? 'bg-brass text-field-dark font-medium' : 'text-ledger/50 hover:text-ledger bg-field-dark border border-field-line'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StandingsTable label={LEAGUES.FOUNDRY.name} standings={foundryStandings} promotionRelegationSwaps={promotionRelegationSwaps} />
        <StandingsTable label={LEAGUES.EXCHANGE.name} standings={exchangeStandings} promotionRelegationSwaps={promotionRelegationSwaps} />
      </div>
    </div>
  );
}
