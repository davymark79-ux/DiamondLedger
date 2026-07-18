// Placeholder data only — no simulation logic lives here yet.
// Shapes are meant to hint at the eventual schema (see Build Sequencing step 1
// in the design doc) without committing to it.

const MLB_CITIES = [
  'Boston', 'New York', 'Baltimore', 'Toronto', 'Tampa Bay', 'Cleveland',
  'Detroit', 'Chicago', 'Minneapolis', 'Kansas City', 'Houston', 'Seattle',
  'Anaheim', 'Arlington', 'Oakland', 'Atlanta', 'Miami', 'Philadelphia',
  'Washington', 'New York', 'Milwaukee', 'St. Louis', 'Chicago', 'Cincinnati',
  'Pittsburgh', 'Los Angeles', 'San Diego', 'San Francisco', 'Denver', 'Phoenix',
];

const MLB2_CITIES = [
  'Portland', 'Sacramento', 'Nashville', 'Charlotte', 'Indianapolis',
  'Columbus', 'Louisville', 'Memphis', 'Oklahoma City', 'San Antonio',
  'Salt Lake City', 'Albuquerque', 'Omaha', 'Buffalo', 'Providence',
  'Richmond', 'Raleigh', 'Jacksonville', 'New Orleans', 'Honolulu',
];

const NICKNAMES = [
  'Miners', 'Anchors', 'Foundry', 'Rail Riders', 'Timberwolves', 'Voyagers',
  'Ironclads', 'Grain', 'Watermen', 'Prospectors', 'Highlanders', 'Drifters',
  'Cardinals', 'Comets', 'Harvesters', 'Tide', 'Smokestacks', 'Wardens',
  'Granite', 'Pioneers', 'Vaqueros', 'Meridians', 'Slate', 'Redwings',
  'Basin', 'Steamers', 'Yardbirds', 'Frontier', 'Beacons', 'Longhorns',
];

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function makeTeams(cities, tier, startSeed) {
  const rand = seededRandom(startSeed);
  return cities.map((city, i) => {
    const wins = Math.floor(40 + rand() * 60);
    const losses = 100 - wins + Math.floor(rand() * 62) - 31;
    const marketSize = Math.round((0.3 + rand() * 0.7) * 100) / 100; // 0-1 scale
    const ownerWealth = Math.round((0.2 + rand() * 0.8) * 100) / 100;
    return {
      id: `${tier}-${i}`,
      tier,
      city,
      nickname: NICKNAMES[(i + startSeed) % NICKNAMES.length],
      wins: Math.max(20, wins),
      losses: Math.max(20, Math.min(80, 100 - wins)),
      marketSize,
      ownerWealth,
      payroll: Math.round(marketSize * 180 + ownerWealth * 60), // $M, rough placeholder
      chemistry: Math.round(rand() * 100),
      ownerPatience: Math.round(rand() * 100),
    };
  });
}

export const mlbTeams = makeTeams(MLB_CITIES, 'MLB', 7);
export const mlb2Teams = makeTeams(MLB2_CITIES, 'MLB2', 19);

function withStandings(teams) {
  return [...teams]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

export const mlbStandings = withStandings(mlbTeams);
export const mlb2Standings = withStandings(mlb2Teams);

// Promotion/relegation zone sizes — placeholder counts, flagged as an
// open question in the design doc.
export const RELEGATION_COUNT = 3; // bottom N of MLB
export const PROMOTION_COUNT = 3;  // top N of MLB2

export const allTeams = [...mlbTeams, ...mlb2Teams];

export const scriptedEvents = [
  { id: 1, type: 'injury', severity: 'season-ending', team: 'Cleveland Rail Riders', detail: 'SP placed on 60-day IL with elbow inflammation.', date: 'Jul 3' },
  { id: 2, type: 'firing', team: 'Oakland Drifters', detail: 'Manager dismissed after 14-32 stretch; bench coach named interim.', date: 'Jun 29' },
  { id: 3, type: 'financial', team: 'Miami Watermen', detail: 'Ownership group flagged for luxury-tax overage; debt service review triggered.', date: 'Jun 24' },
  { id: 4, type: 'expansion', team: 'League Office', detail: 'Ownership group in Salt Lake City submitted a formal expansion petition.', date: 'Jun 18' },
  { id: 5, type: 'stadium', team: 'Nashville Foundry', detail: 'New ballpark construction timer started — est. 3 seasons to completion.', date: 'Jun 10' },
  { id: 6, type: 'cba', team: 'League Office', detail: 'CBA negotiation window opened; owner-side proposing arbitration timeline changes.', date: 'Jun 2' },
];

export const upcomingFixtures = [
  { id: 1, home: 'Boston Anchors', away: 'New York Comets', date: 'Jul 11', tier: 'MLB' },
  { id: 2, home: 'Houston Ironclads', away: 'Seattle Voyagers', date: 'Jul 11', tier: 'MLB' },
  { id: 3, home: 'Chicago Smokestacks', away: 'Detroit Foundry', date: 'Jul 11', tier: 'MLB' },
  { id: 4, home: 'Portland Pioneers', away: 'Sacramento Meridians', date: 'Jul 11', tier: 'MLB2' },
  { id: 5, home: 'Nashville Foundry', away: 'Charlotte Highlanders', date: 'Jul 12', tier: 'MLB2' },
];

export const cupRounds = [
  { round: 'Round of 64', status: 'complete' },
  { round: 'Round of 32', status: 'complete' },
  { round: 'Round of 16', status: 'in progress' },
  { round: 'Quarterfinal', status: 'upcoming' },
  { round: 'Semifinal', status: 'upcoming' },
  { round: 'Final', status: 'upcoming' },
];
