import { useParams, Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { getAge } from '../models/Player';
import { getManagerAge } from '../models/Manager';
import { HOT_COLD_TIERS, MANAGER_SLIDER_NAMES, MANAGER_ORIGINS, MINOR_LEAGUE_LEVELS_ORDER } from '../models/constants';
import { NATION_CODES } from '../models/generation/nationalityPools';

function InjuryTag({ playerId }) {
  const { getPlayerInjuryStatus } = useLeagueState();
  const injury = getPlayerInjuryStatus(playerId);
  if (!injury || injury.gamesRemaining <= 0) return null;
  const label = Number.isFinite(injury.gamesRemaining) ? `IL · ${injury.gamesRemaining}g` : 'OUT';
  return <span className="ml-1.5 text-[10px] text-brick-bright/80 whitespace-nowrap" title={injury.type}>{label}</span>;
}

// Position-player fatigue only (engine/positionPlayerFatigue.js) — pitchers
// are never tracked by this mechanic, so this only ever renders on
// PositionPlayerRow, never PitcherRow.
function FatigueTag({ playerId }) {
  const { getPlayerFatiguePenalty, getPlayerFatigueStatus } = useLeagueState();
  if (getPlayerFatiguePenalty(playerId) <= 0) return null;
  const games = getPlayerFatigueStatus(playerId);
  return (
    <span className="ml-1.5 text-[10px] text-navy-bright/80 whitespace-nowrap" title={`${games} straight games played without a rest`}>
      Fatigued · {games}g
    </span>
  );
}

// Hot/Cold Streaks (engine/hotColdStreaks.js) — purely descriptive, per
// player-attributes-and-development.md ("does not feed back into
// performance"). Only ever renders for a *confirmed* streak: `tier` is
// already gated by updateStreakState() to read NEUTRAL both for a
// genuinely unremarkable stretch and for "not enough sample yet," so a
// one- or two-game blip never surfaces a tag.
const STREAK_TAG_LABELS = Object.freeze({
  [HOT_COLD_TIERS.ICE_COLD]: 'Ice Cold',
  [HOT_COLD_TIERS.COLD]: 'Cold',
  [HOT_COLD_TIERS.HOT]: 'Hot',
  [HOT_COLD_TIERS.ON_FIRE]: 'On Fire',
});
const STREAK_TAG_COLOR = Object.freeze({
  [HOT_COLD_TIERS.ICE_COLD]: 'text-navy/80',
  [HOT_COLD_TIERS.COLD]: 'text-navy/80',
  [HOT_COLD_TIERS.HOT]: 'text-brass-bright/80',
  [HOT_COLD_TIERS.ON_FIRE]: 'text-brass-bright/80',
});

function StreakTag({ playerId }) {
  const { getPlayerStreakState } = useLeagueState();
  const streak = getPlayerStreakState(playerId);
  const label = streak && STREAK_TAG_LABELS[streak.tier];
  if (!label) return null;
  const sd = streak.standardDeviationsFromBaseline.toFixed(2);
  return (
    <span className={`ml-1.5 text-[10px] ${STREAK_TAG_COLOR[streak.tier]} whitespace-nowrap`} title={`${sd} SD from expected`}>
      {label}
    </span>
  );
}

// international-tournament-and-nationality.md — purely cosmetic flavor
// data, never affects any sim outcome. Quiet by design: a plain-USA,
// no-heritage player (the common case) renders nothing at all; anyone
// with a non-USA birth nation or any heritage tag gets a small code, with
// the full detail (including heritage nations) available on hover.
function NationalityTag({ player }) {
  const { birthNation, heritageNations } = player;
  if (!birthNation || (birthNation === 'USA' && heritageNations.length === 0)) return null;
  const code = NATION_CODES[birthNation] ?? birthNation;
  const title = heritageNations.length > 0 ? `${birthNation} (heritage: ${heritageNations.join(', ')})` : birthNation;
  return (
    <span className="ml-1.5 text-[10px] text-ledger/50 whitespace-nowrap" title={title}>
      {code}
    </span>
  );
}

const RECENT_RESULTS_COUNT = 20;

function ownershipDisplay(ownership) {
  if (ownership.type === 'FAN_OWNED') {
    return `Fan-Owned (${Math.round(ownership.fanShare * 100)}% fan share)`;
  }
  return `Single Owner (Wealth ${Math.round(ownership.ownerWealth * 100)}/100)`;
}

const POSITION_PLAYER_GRID = 'grid-cols-[minmax(9rem,1fr)_2rem_2.25rem_2.5rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem]';

function SectionLabelRow({ gridColsClass, label }) {
  return (
    <div className={`grid ${gridColsClass} px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/30 bg-field/40 border-b border-field-line`}>
      <span>{label}</span>
    </div>
  );
}

function PositionPlayerRow({ player }) {
  return (
    <div className={`grid ${POSITION_PLAYER_GRID} px-4 py-1 text-sm border-b border-field-line`}>
      <span className="text-ledger/85 truncate">
        {player.firstName} {player.lastName}
        <NationalityTag player={player} />
        <InjuryTag playerId={player.id} />
        <FatigueTag playerId={player.id} />
        <StreakTag playerId={player.id} />
      </span>
      <span className="text-right agate text-ledger/70">{player.primaryPosition}</span>
      <span className="text-right agate text-ledger/70">{getAge(player)}</span>
      <span className="text-right agate text-ledger/70">{player.bats}/{player.throws}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.contact.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.power.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.eye.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.speed.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.fielding.current}</span>
    </div>
  );
}

function PositionPlayersTable({ lineup, bench }) {
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        Position Players
      </div>
      <div className={`grid ${POSITION_PLAYER_GRID} px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line`}>
        <span>Player</span>
        <span className="text-right">Pos</span>
        <span className="text-right">Age</span>
        <span className="text-right">B/T</span>
        <span className="text-right">Con</span>
        <span className="text-right">Pow</span>
        <span className="text-right">Eye</span>
        <span className="text-right">Spd</span>
        <span className="text-right">Fld</span>
      </div>
      {lineup.map((player) => <PositionPlayerRow key={player.id} player={player} />)}
      <SectionLabelRow gridColsClass={POSITION_PLAYER_GRID} label="Bench" />
      {bench.map((player) => <PositionPlayerRow key={player.id} player={player} />)}
    </div>
  );
}

const PITCHER_GRID = 'grid-cols-[minmax(9rem,1fr)_3.5rem_2.25rem_3rem_2.25rem_2.25rem_2.25rem_2.25rem_2.25rem]';

function PitcherRow({ player, role }) {
  return (
    <div className={`grid ${PITCHER_GRID} px-4 py-1 text-sm border-b border-field-line`}>
      <span className="text-ledger/85 truncate">
        {player.firstName} {player.lastName}
        <NationalityTag player={player} />
        <InjuryTag playerId={player.id} />
      </span>
      <span className="text-right agate text-ledger/70">{role}</span>
      <span className="text-right agate text-ledger/70">{getAge(player)}</span>
      <span className="text-right agate text-ledger/70">{player.throws}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.velocity.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.control.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.movement.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.stamina.current}</span>
      <span className="text-right agate text-ledger/70">{player.ratings.pitchability.current}</span>
    </div>
  );
}

// bullpen is ordered [Long, Middle, Setup, ...4 depth arms, Closer] — see
// realLeague.js's getTeamRoster() for why Closer has to stay last.
const BULLPEN_ROLE_LABELS = ['Long', 'Middle', 'Setup', 'Depth 1', 'Depth 2', 'Depth 3', 'Depth 4', 'Closer'];

function PitchersTable({ rotation, bullpen }) {
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        Pitchers
      </div>
      <div className={`grid ${PITCHER_GRID} px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line`}>
        <span>Player</span>
        <span className="text-right">Role</span>
        <span className="text-right">Age</span>
        <span className="text-right">Throws</span>
        <span className="text-right">Vel</span>
        <span className="text-right">Ctl</span>
        <span className="text-right">Mov</span>
        <span className="text-right">Sta</span>
        <span className="text-right">Pit</span>
      </div>
      <SectionLabelRow gridColsClass={PITCHER_GRID} label="Rotation" />
      {rotation.map((player, i) => <PitcherRow key={player.id} player={player} role={`SP${i + 1}`} />)}
      <SectionLabelRow gridColsClass={PITCHER_GRID} label="Bullpen" />
      {bullpen.map((player, i) => <PitcherRow key={player.id} player={player} role={BULLPEN_ROLE_LABELS[i]} />)}
    </div>
  );
}

function SeasonResultsTable({ teamId, teamsById }) {
  const { getTeamResults } = useLeagueState();
  const teamResults = getTeamResults(teamId);
  const recent = teamResults.slice(-RECENT_RESULTS_COUNT).reverse();

  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        Season Results (most recent {recent.length} of {teamResults.length})
      </div>
      <div className="grid grid-cols-[minmax(9rem,1fr)_2.5rem_5rem_3.5rem] px-4 py-1 text-[10px] uppercase tracking-wider text-ledger/35 border-b border-field-line">
        <span>Opponent</span>
        <span className="text-right">H/A</span>
        <span className="text-right">Score</span>
        <span className="text-right">Result</span>
      </div>
      {recent.map((r) => {
        const isHome = r.homeTeamId === teamId;
        const opponent = teamsById.get(isHome ? r.awayTeamId : r.homeTeamId);
        const ownRuns = isHome ? r.homeRuns : r.awayRuns;
        const oppRuns = isHome ? r.awayRuns : r.homeRuns;
        const won = ownRuns > oppRuns;
        return (
          <div
            key={r.gameNumber}
            className="grid grid-cols-[minmax(9rem,1fr)_2.5rem_5rem_3.5rem] px-4 py-1 text-sm border-b border-field-line"
          >
            <span className="text-ledger/85 truncate">{opponent.city} {opponent.nickname}</span>
            <span className="text-right agate text-ledger/70">{isHome ? 'H' : 'A'}</span>
            <span className="text-right agate text-ledger/70">{ownRuns}-{oppRuns}</span>
            <span className={`text-right agate ${won ? 'text-brass-bright' : 'text-brick-bright'}`}>{won ? 'W' : 'L'}</span>
          </div>
        );
      })}
    </div>
  );
}

// managers.md — cosmetic display only, same as every other tag on this
// page; the manager's actual effect on gameplay lives entirely in
// engine/managerBehavior.js + the fixed-threshold call sites it feeds
// (pitchingChanges.js, stolenBases.js, bunting.js, fielding.js,
// hitterChanges.js), not here.
const MANAGER_SLIDER_LABELS = Object.freeze({
  stealAggressiveness: 'Steal Aggressiveness',
  smallBallTendency: 'Small-Ball Tendency',
  pitcherHook: 'Pitcher Hook',
  bullpenUsage: 'Bullpen Usage',
  platoonTendency: 'Platoon Tendency',
  analyticsVsFeel: 'Analytics ↔ Feel',
  defensiveManagement: 'Defensive Mgmt',
});
const MANAGER_ORIGIN_LABELS = Object.freeze({
  [MANAGER_ORIGINS.EX_PLAYER]: 'Ex-Player',
  [MANAGER_ORIGINS.OUTSIDER]: 'Outsider',
});

function ManagerAttributeTile({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ledger/35">{label}</div>
      <div className="agate text-sm text-ledger/80">{value}/100</div>
    </div>
  );
}

// managers.md's Career Lifecycle (Firing & Rehiring, engine/managerFiring.js)
// — `changes` is data/season.js's getTeamManagerChanges(), empty for the
// common case (a team whose manager was never fired this simulated season).
function formatWinPct(pct) {
  return `.${String(Math.round(pct * 1000)).padStart(3, '0')}`;
}

function ManagerCard({ manager, changes = [] }) {
  if (!manager) return null;
  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line flex items-center justify-between">
        <span>Manager</span>
        <span className="text-[10px] text-ledger/40 normal-case tracking-normal">{MANAGER_ORIGIN_LABELS[manager.origin]}</span>
      </div>
      <div className="px-4 py-3 border-b border-field-line">
        <span className="text-ledger/85 text-sm">
          {manager.firstName} {manager.lastName}
          <NationalityTag player={manager} />
        </span>
        <span className="ml-2 agate text-xs text-ledger/60">Age {getManagerAge(manager)}</span>
      </div>
      <div className="grid grid-cols-3 px-4 py-3 gap-y-3">
        {MANAGER_SLIDER_NAMES.map((name) => (
          <ManagerAttributeTile key={name} label={MANAGER_SLIDER_LABELS[name]} value={manager.sliders[name]} />
        ))}
        <ManagerAttributeTile label="Temperament" value={manager.temperament} />
        <ManagerAttributeTile label="Streak Read" value={manager.streakRead} />
      </div>
      {changes.length > 0 && (
        <div className="px-4 py-2 border-t border-field-line">
          <div className="text-[10px] uppercase tracking-wider text-ledger/35 mb-1">Manager Changes</div>
          {changes.map((change) => (
            <div key={change.gameNumber} className="text-xs text-ledger/60">
              Fired after game {change.gameNumber} ({formatWinPct(change.winPctAtFiring)})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Minor League System (engine/minorLeagues.js) — a compact organizational
// summary, same visual convention as ManagerCard. MINOR_LEAGUE_LEVELS_ORDER
// is AAA-first (closest to the majors); reversed here so display reads
// AAA-down-to-Rookie, the real-world "how close to the show" convention.
// No per-affiliate roster drill-down yet — a reasonable follow-up once a
// later phase of this arc needs it, not required to prove this phase works.
function FarmSystemCard({ teamId }) {
  const { getAffiliateClub, getAffiliateStandings } = useLeagueState();
  const levels = [...MINOR_LEAGUE_LEVELS_ORDER].reverse();

  return (
    <div className="bg-field-dark border border-field-line rounded-sm overflow-x-auto">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-brass-bright/80 border-b border-field-line">
        Farm System
      </div>
      {levels.map((level) => {
        const club = getAffiliateClub(teamId, level);
        if (!club) return null;
        const record = getAffiliateStandings(club.id);
        return (
          <div key={level} className="grid grid-cols-[3rem_1fr_4rem] px-4 py-2 text-sm border-b border-field-line last:border-b-0">
            <span className="agate text-[11px] text-ledger/40">{level}</span>
            <span className="text-ledger/85 truncate">{club.city} {club.nickname}</span>
            <span className="text-right agate text-ledger/70">{record.wins}-{record.losses}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TeamDetail() {
  const { id } = useParams();
  const { teams, getTeamRoster, getTeamRecord, getCurrentTeamManager, getTeamManagerChanges } = useLeagueState();
  const team = teams.find((t) => t.id === id);

  if (!team) {
    return (
      <div>
        <p className="text-ledger/60">Team not found.</p>
        <Link to="/teams" className="text-brass-bright text-sm">← Back to Teams</Link>
      </div>
    );
  }

  const roster = getTeamRoster(team.id);
  const record = getTeamRecord(team.id);
  const manager = getCurrentTeamManager(team.id);
  const managerChanges = getTeamManagerChanges(team.id);
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  return (
    <div>
      <Link to="/teams" className="text-xs text-ledger/40 hover:text-ledger/70 mb-4 inline-block">← Back to Teams</Link>
      <PageHeader
        eyebrow={<TierBadge tier={team.tier} />}
        title={`${team.city} ${team.nickname}`}
        description="Full 26-man active roster: lineup, rotation, bullpen (core + depth), and bench are all real generated players."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          ['Record', `${record.wins}-${record.losses}`],
          ['Market Size', `${Math.round(team.marketSize * 100)}/100`],
          ['Ownership', ownershipDisplay(team.ownership)],
        ].map(([label, value]) => (
          <div key={label} className="bg-field-dark border border-field-line rounded-sm px-4 py-3">
            <div className="text-[10px] tracking-wider uppercase text-ledger/40 mb-1">{label}</div>
            <div className="agate text-lg text-ledger">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <ManagerCard manager={manager} changes={managerChanges} />
        <FarmSystemCard teamId={team.id} />
        <PositionPlayersTable lineup={roster.lineup} bench={roster.bench} />
        <PitchersTable rotation={roster.rotation} bullpen={roster.bullpen} />
        <SeasonResultsTable teamId={team.id} teamsById={teamsById} />
      </div>
    </div>
  );
}
