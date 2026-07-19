import { NavLink } from 'react-router-dom';
import { LayoutGrid, ListOrdered, Users, CalendarDays, Landmark, ScrollText, Trophy, PlayCircle, Award } from 'lucide-react';

const links = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/standings', label: 'Standings', icon: ListOrdered },
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/box-score', label: 'Box Score', icon: PlayCircle },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: Award },
  { to: '/cup', label: 'Cup', icon: Trophy },
  { to: '/financials', label: 'Financials', icon: Landmark },
  { to: '/events', label: 'League Wire', icon: ScrollText },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-field-dark border-r border-field-line flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-field-line">
        <div className="display-face text-ledger text-xl tracking-wide leading-none">DIAMOND</div>
        <div className="display-face text-brass-bright text-xl tracking-wide leading-none">LEDGER</div>
        <div className="text-[10px] text-ledger/40 mt-2 tracking-[0.2em] uppercase">Season Office</div>
      </div>

      <nav className="flex-1 py-3">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm border-l-2 transition-colors ${
                isActive
                  ? 'border-brass-bright bg-field text-ledger'
                  : 'border-transparent text-ledger/55 hover:text-ledger hover:bg-field/60'
              }`
            }
          >
            <Icon size={15} strokeWidth={2} />
            <span className="tracking-wide">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Tier ladder rungs — visual echo of the pyramid structure */}
      <div className="px-5 py-4 border-t border-field-line text-[10px] text-ledger/40">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-brass-bright inline-block" />
          <span className="tracking-[0.15em]">TIER 1 · MLB · 30</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-navy-bright inline-block" />
          <span className="tracking-[0.15em]">TIER 2 · MLB2 · 20</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ledger/30 inline-block" />
          <span className="tracking-[0.15em]">MINORS · FARM</span>
        </div>
      </div>
    </aside>
  );
}
