import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { AWARD_TYPES } from '../engine/awards.js';
import { awardDisplayName } from '../engine/awardNaming.js';
import { LEAGUES } from '../models/constants';

const MAJOR_ORDER = [
  AWARD_TYPES.MVP,
  AWARD_TYPES.BEST_PITCHER,
  AWARD_TYPES.ROOKIE_OF_THE_YEAR,
  AWARD_TYPES.MANAGER_OF_THE_YEAR,
];

function WinnerRow({ label, award, teamLabel }) {
  return (
    <div className="grid grid-cols-[minmax(11rem,1.2fr)_minmax(9rem,1fr)_1fr_4rem] px-4 py-1.5 text-sm border-b border-field-line last:border-b-0">
      <span className="text-ledger/60 truncate">{label}</span>
      <span className="text-ledger/85 truncate">{award ? `${award.firstName} ${award.lastName}` : '—'}</span>
      <span className="text-ledger/50 truncate">{award ? teamLabel(award.teamId) : ''}</span>
      <span className="agate text-right text-brass-bright/80">{award ? `${Math.round(award.voteShare * 100)}%` : ''}</span>
    </div>
  );
}

function LeagueAwards({ leagueId, awards, names, teamLabel }) {
  const leagueName = LEAGUES[leagueId]?.name ?? leagueId;
  const forLeague = awards.filter((a) => a.leagueId === leagueId);
  const majors = MAJOR_ORDER.map((type) => ({ type, award: forLeague.find((a) => a.type === type) }));
  const sluggers = forLeague
    .filter((a) => a.type === AWARD_TYPES.SILVER_SLUGGER)
    .sort((a, b) => a.position.localeCompare(b.position));

  return (
    <div className="mb-8">
      <div className="px-1 text-[11px] uppercase tracking-wider text-brass-bright/80 mb-2">{leagueName}</div>

      <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
        <div className="grid grid-cols-[minmax(11rem,1.2fr)_minmax(9rem,1fr)_1fr_4rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
          <span>Award</span>
          <span>Winner</span>
          <span>Club</span>
          <span className="text-right">Vote</span>
        </div>
        {majors.map(({ type, award }) => (
          <WinnerRow
            key={type}
            label={awardDisplayName(type, leagueId, null, names, leagueName)}
            award={award}
            teamLabel={teamLabel}
          />
        ))}
      </div>

      {sluggers.length > 0 && (
        <>
          <div className="px-1 mt-4 mb-2 text-[10px] uppercase tracking-wider text-ledger/35">Silver Slugger</div>
          <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
            <div className="grid grid-cols-[minmax(11rem,1.2fr)_minmax(9rem,1fr)_1fr_4rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
              <span>Position</span>
              <span>Winner</span>
              <span>Club</span>
              <span className="text-right">Vote</span>
            </div>
            {sluggers.map((award) => (
              <WinnerRow
                key={award.position}
                label={awardDisplayName(AWARD_TYPES.SILVER_SLUGGER, leagueId, award.position, names, leagueName)}
                award={award}
                teamLabel={teamLabel}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Awards() {
  const { teams, getAwardsResult, getAwardNames } = useLeagueState();
  const result = getAwardsResult();
  const names = getAwardNames();
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const teamLabel = (teamId) => {
    const t = teamsById.get(teamId);
    return t ? `${t.city} ${t.nickname}` : '—';
  };

  const leagueIds = [...new Set(teams.map((t) => t.leagueId))];

  return (
    <div>
      <PageHeader
        eyebrow={`Season ${result.seasonNumber}`}
        title="Awards"
        description="Voted by the real Writers Corps — the same electorate that votes on the Hall of Fame, with its own Traditionalism, Homerism and Contrarianism biases, so a close race genuinely can turn on who's voting. Every award runs separately per league. An award is permanently renamed after the first player to win it three times (or, once it has been given ten times and nobody has, after a historically dominant season). Gold Glove and Finals MVP aren't awarded — neither per-player fielding stats nor per-player postseason stats exist in this engine yet."
      />

      {result.namedThisSeason.length > 0 && (
        <div className="mb-5 px-3 py-2 text-xs rounded-sm border border-brass-bright/30 text-brass-bright/90">
          {result.namedThisSeason.map((n) => (
            <div key={n.slotKey}>
              <span className="font-medium">{n.name}</span> — permanently renamed this season
              {n.reason === 'STATISTICAL_DOMINANCE' ? ' after a historically dominant season.' : ' after a third win.'}
            </div>
          ))}
        </div>
      )}

      {result.awards.length === 0 ? (
        <div className="bg-field-dark border border-field-line rounded-sm px-4 py-6 text-center text-sm text-ledger/40">
          No awards yet — simulate a season to hold the first vote.
        </div>
      ) : (
        leagueIds.map((leagueId) => (
          <LeagueAwards key={leagueId} leagueId={leagueId} awards={result.awards} names={names} teamLabel={teamLabel} />
        ))
      )}
    </div>
  );
}
