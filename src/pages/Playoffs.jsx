import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { LEAGUES } from '../models/constants';

function seriesRecord(series) {
  const winsA = series.games.filter((g) => g.winnerTeamId === series.teamAId).length;
  const winsB = series.games.filter((g) => g.winnerTeamId === series.teamBId).length;
  return { winsA, winsB };
}

function teamLabel(team) {
  return team ? `${team.city} ${team.nickname}` : '—';
}

function SeriesCard({ series, teamsById, roundLabel }) {
  const teamA = teamsById.get(series.teamAId);
  const teamB = teamsById.get(series.teamBId);
  const { winsA, winsB } = seriesRecord(series);
  const aWon = series.winnerTeamId === series.teamAId;
  const bestOf = 2 * series.gamesToWin - 1;

  return (
    <div className="bg-field-dark border border-field-line rounded-sm px-4 py-3">
      {roundLabel && <div className="text-[10px] uppercase tracking-wider text-brass-bright/70 mb-1.5">{roundLabel}</div>}
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={aWon ? 'text-brass-bright' : 'text-ledger/70'}>{teamLabel(teamA)}</span>
        <span className="agate text-ledger/85">{winsA}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={!aWon ? 'text-brass-bright' : 'text-ledger/70'}>{teamLabel(teamB)}</span>
        <span className="agate text-ledger/85">{winsB}</span>
      </div>
      <div className="text-[10px] text-ledger/35 mt-1.5">
        {series.games.length} game{series.games.length === 1 ? '' : 's'} · best-of-{bestOf}
      </div>
    </div>
  );
}

function LeagueBracket({ leagueName, leagueData, teamsById }) {
  if (!leagueData) {
    return (
      <div>
        <h3 className="display-face text-lg text-ledger mb-2 tracking-wide">{leagueName}</h3>
        <div className="text-ledger/40 text-sm">Bracket unavailable this season.</div>
      </div>
    );
  }

  const champs = leagueData.divisionChamps.map((id) => teamsById.get(id));
  const wildCard = teamsById.get(leagueData.wildCard);
  const pennantWinner = teamsById.get(leagueData.pennantWinnerTeamId);

  return (
    <div>
      <h3 className="display-face text-lg text-ledger mb-2 tracking-wide">{leagueName}</h3>
      <div className="text-xs text-ledger/50 mb-3">
        Division Champs: {champs.map(teamLabel).join(', ')} · Wild Card: {teamLabel(wildCard)}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <SeriesCard series={leagueData.wcRound[0]} teamsById={teamsById} roundLabel="WC Round" />
        <SeriesCard series={leagueData.wcRound[1]} teamsById={teamsById} roundLabel="WC Round" />
      </div>
      <SeriesCard series={leagueData.lcs} teamsById={teamsById} roundLabel="LCS" />
      <div className="text-sm text-brass-bright mt-2">Pennant Winner: {teamLabel(pennantWinner)}</div>
    </div>
  );
}

export default function Playoffs() {
  const { teams, playoffResult } = useLeagueState();
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div>
      <PageHeader
        eyebrow="League Playoffs"
        title="Playoffs"
        description="Each league runs its own postseason, independently: 3 division champs plus 1 wild card, a best-of-5 WC Round feeding a best-of-7 LCS — culminating in a cross-league Finals (best-of-7) between the two pennant winners. MLB2's Foundry/Exchange league leaders play their own best-of-7 championship, bragging rights only — both are already promoted to MLB1 regardless of the outcome."
      />

      <div className="grid grid-cols-2 gap-8 mb-10">
        <LeagueBracket leagueName={LEAGUES.FOUNDRY.name} leagueData={playoffResult.leagues[LEAGUES.FOUNDRY.id]} teamsById={teamsById} />
        <LeagueBracket leagueName={LEAGUES.EXCHANGE.name} leagueData={playoffResult.leagues[LEAGUES.EXCHANGE.id]} teamsById={teamsById} />
      </div>

      <div className="mb-10">
        <h2 className="display-face text-xl text-ledger mb-3 tracking-wide">The Finals</h2>
        {playoffResult.finals ? (
          <>
            <SeriesCard series={playoffResult.finals} teamsById={teamsById} />
            <div className="text-sm text-brass-bright mt-3">
              League Champion: {teamLabel(teamsById.get(playoffResult.finals.winnerTeamId))}
            </div>
          </>
        ) : (
          <div className="text-ledger/40 text-sm">Finals unavailable this season.</div>
        )}
      </div>

      <div>
        <h2 className="display-face text-xl text-ledger mb-3 tracking-wide">MLB2 Championship</h2>
        {playoffResult.mlb2Championship ? (
          <>
            <SeriesCard series={playoffResult.mlb2Championship} teamsById={teamsById} />
            <p className="text-xs text-ledger/40 mt-2">Both participants were already promoted to MLB1 regardless of this result — bragging rights only.</p>
          </>
        ) : (
          <div className="text-ledger/40 text-sm">Championship unavailable this season.</div>
        )}
      </div>
    </div>
  );
}
