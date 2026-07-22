import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LeagueStateProvider } from './state/LeagueStateContext.jsx';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Standings from './pages/Standings';
import Playoffs from './pages/Playoffs';
import Teams from './pages/Teams';
import TeamDetail from './pages/TeamDetail';
import Schedule from './pages/Schedule';
import Cup from './pages/Cup';
import Financials from './pages/Financials';
import Events from './pages/Events';
import BoxScore from './pages/BoxScore';
import HallOfFame from './pages/HallOfFame';
import Draft from './pages/Draft';

export default function App() {
  return (
    <BrowserRouter>
      <LeagueStateProvider>
        <div className="flex min-h-screen bg-field">
          <Sidebar />
          <main className="flex-1 px-10 py-8 max-w-6xl">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/standings" element={<Standings />} />
              <Route path="/playoffs" element={<Playoffs />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/teams/:id" element={<TeamDetail />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/cup" element={<Cup />} />
              <Route path="/financials" element={<Financials />} />
              <Route path="/events" element={<Events />} />
              <Route path="/box-score" element={<BoxScore />} />
              <Route path="/hall-of-fame" element={<HallOfFame />} />
              <Route path="/draft" element={<Draft />} />
            </Routes>
          </main>
        </div>
      </LeagueStateProvider>
    </BrowserRouter>
  );
}
