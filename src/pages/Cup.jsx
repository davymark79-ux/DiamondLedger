import PageHeader from '../components/PageHeader';
import { useLeagueState } from '../state/LeagueStateContext.jsx';

function teamLabel(team) {
  return team ? `${team.city} ${team.nickname}` : '—';
}

// Same win% -> run-differential tiebreak convention engine/ledgerCup.js's
// own compareStanding already uses, mirrored here purely for DISPLAY sort
// order (the real advancement decision already happened server-side, in
// computeCupAdvancement).
function winPct({ wins, losses }) {
  return wins + losses > 0 ? wins / (wins + losses) : 0;
}
function compareRow(a, b) {
  return winPct(b) - winPct(a) || (b.runsFor - b.runsAgainst) - (a.runsFor - a.runsAgainst);
}

function GroupStandingsCard({ groupIds, cupGroupStandingsById, advancingTeamIds, teamsById }) {
  const advancingSet = new Set(advancingTeamIds);
  const rows = groupIds
    .map((id) => ({ id, ...(cupGroupStandingsById.get(id) ?? { wins: 0, losses: 0, runsFor: 0, runsAgainst: 0 }) }))
    .sort(compareRow);

  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-hidden">
      <div className="grid grid-cols-[1fr_2.5rem_2.5rem_3rem] px-3 py-1.5 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>Club</span>
        <span className="text-right">W</span>
        <span className="text-right">L</span>
        <span className="text-right">RD</span>
      </div>
      {rows.map((row) => {
        const team = teamsById.get(row.id);
        const advancing = advancingSet.has(row.id);
        const rd = row.runsFor - row.runsAgainst;
        return (
          <div key={row.id} className="grid grid-cols-[1fr_2.5rem_2.5rem_3rem] px-3 py-1.5 text-sm border-b border-field-line last:border-b-0">
            <span className={`truncate ${advancing ? 'text-brass-bright' : 'text-ledger/75'}`}>{teamLabel(team)}</span>
            <span className="agate text-right text-ledger/75">{row.wins}</span>
            <span className="agate text-right text-ledger/75">{row.losses}</span>
            <span className="agate text-right text-ledger/50">{rd > 0 ? `+${rd}` : rd}</span>
          </div>
        );
      })}
    </div>
  );
}

// The Cup's own series shape (engine/ledgerCup.js's simulateCupSeriesIntoState)
// differs from Playoffs.jsx's: {homeTeamId, awayTeamId, gamesToWin, games,
// winner: {seed, teamId}} — no teamAId/teamBId, and only the WINNER carries
// a seed number directly. Every participant's seed is looked up from
// seedByTeamId (derived from cupState.knockout.seeds) instead, rather than
// duplicating it onto every series.
function KnockoutSeriesCard({ series, teamsById, seedByTeamId, roundLabel }) {
  const homeTeam = teamsById.get(series.homeTeamId);
  const awayTeam = teamsById.get(series.awayTeamId);
  const winsHome = series.games.filter((g) => g.homeRuns > g.awayRuns).length;
  const winsAway = series.games.length - winsHome;
  const homeWon = series.winner.teamId === series.homeTeamId;
  const bestOf = series.gamesToWin === 1 ? 1 : 2 * series.gamesToWin - 1;

  return (
    <div className="bg-field-dark border border-field-line rounded-sm px-4 py-3">
      {roundLabel && <div className="text-[10px] uppercase tracking-wider text-brass-bright/70 mb-1.5">{roundLabel}</div>}
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={homeWon ? 'text-brass-bright' : 'text-ledger/70'}>
          <span className="agate text-ledger/35 mr-1.5">{seedByTeamId.get(series.homeTeamId)}</span>
          {teamLabel(homeTeam)}
        </span>
        <span className="agate text-ledger/85">{winsHome}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={!homeWon ? 'text-brass-bright' : 'text-ledger/70'}>
          <span className="agate text-ledger/35 mr-1.5">{seedByTeamId.get(series.awayTeamId)}</span>
          {teamLabel(awayTeam)}
        </span>
        <span className="agate text-right text-ledger/85">{winsAway}</span>
      </div>
      <div className="text-[10px] text-ledger/35 mt-1.5">
        {series.games.length} game{series.games.length === 1 ? '' : 's'} · best-of-{bestOf} · higher seed hosts every game
      </div>
    </div>
  );
}

function KnockoutRound({ title, series, teamsById, seedByTeamId }) {
  if (!series || series.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="display-face text-lg text-ledger mb-2 tracking-wide">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {series.map((s, i) => (
          <KnockoutSeriesCard key={`${s.homeTeamId}-${s.awayTeamId}-${i}`} series={s} teamsById={teamsById} seedByTeamId={seedByTeamId} />
        ))}
      </div>
    </div>
  );
}

export default function Cup() {
  const { teams, cupState } = useLeagueState();
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const groupStageActive = cupState.groupStagePhase === 'GROUP_STAGE';
  const knockoutActive = cupState.knockout.phase === 'COMPLETE';

  if (!groupStageActive && !knockoutActive) {
    return (
      <div>
        <PageHeader
          eyebrow="FA Cup-Style"
          title="The Ledger Cup"
          description="A cross-tier, season-spanning knockout tournament, open to every club regardless of league or tier."
        />
        <div className="bg-field-dark border border-field-line rounded-sm px-6 py-8 max-w-md text-center">
          <p className="text-ledger/60 text-sm leading-relaxed">
            The Cup hasn't started yet — the group-stage draw needs a full season of real Tournament Quotient history to seed
            pots from, so the first group stage runs in season 2 and the first knockout bracket resolves in season 3.
          </p>
        </div>
      </div>
    );
  }

  const championTeam = knockoutActive ? teamsById.get(cupState.knockout.championTeamId) : null;
  const seedByTeamId = knockoutActive ? new Map(cupState.knockout.seeds.map((id, i) => [id, i + 1])) : new Map();

  return (
    <div>
      <PageHeader
        eyebrow="FA Cup-Style"
        title="The Ledger Cup"
        description="Group stage runs across 3 weekends in this season's 2nd half — 10 groups of 5 (3 MLB1 + 2 MLB2, every group mixing Foundry and Exchange clubs), top 2 plus the best 4 third-place finishers advance. That 24-team field is reseeded and played out as a knockout bracket the FOLLOWING season — seeds 1-8 bye to the Round of 16, seeds 9-24 play a best-of-3 Play-In first — culminating in a single-game Final at the All-Star break."
      />

      {knockoutActive && (
        <div className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="display-face text-xl text-ledger tracking-wide">Knockout Bracket</h2>
            <span className="text-[11px] text-ledger/40">reseeded from last season's group stage</span>
          </div>
          {championTeam && (
            <div className="bg-field-dark border border-brass-bright/40 rounded-sm px-4 py-3 mb-5">
              <div className="text-[10px] uppercase tracking-wider text-brass-bright/70 mb-1">Cup Champion</div>
              <div className="text-lg text-brass-bright">{teamLabel(championTeam)}</div>
            </div>
          )}
          <KnockoutRound title="Play-In" series={cupState.knockout.playIn} teamsById={teamsById} seedByTeamId={seedByTeamId} />
          <KnockoutRound title="Round of 16" series={cupState.knockout.roundOf16} teamsById={teamsById} seedByTeamId={seedByTeamId} />
          <KnockoutRound title="Quarterfinal" series={cupState.knockout.quarterfinal} teamsById={teamsById} seedByTeamId={seedByTeamId} />
          <KnockoutRound title="Semifinal" series={cupState.knockout.semifinal} teamsById={teamsById} seedByTeamId={seedByTeamId} />
          {cupState.knockout.final && (
            <div className="mb-6">
              <h3 className="display-face text-lg text-ledger mb-2 tracking-wide">Final</h3>
              <div className="max-w-sm">
                <KnockoutSeriesCard series={cupState.knockout.final} teamsById={teamsById} seedByTeamId={seedByTeamId} />
              </div>
            </div>
          )}
        </div>
      )}

      {groupStageActive && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="display-face text-xl text-ledger tracking-wide">This Season's Group Stage</h2>
            <span className="text-[11px] text-ledger/40">gold = advancing (top 2, plus the best 4 third-place finishers)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cupState.groups.map((groupIds, i) => (
              <GroupStandingsCard
                key={i}
                groupIds={groupIds}
                cupGroupStandingsById={cupState.cupGroupStandingsById}
                advancingTeamIds={cupState.advancingTeamIds}
                teamsById={teamsById}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
