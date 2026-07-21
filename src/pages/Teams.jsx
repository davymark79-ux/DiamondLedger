import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import TierBadge from '../components/TierBadge';
import { teams as allTeams } from '../data/realLeague';
import { useLeagueState } from '../state/LeagueStateContext.jsx';
import { TIERS } from '../models/constants';

const TIER_FILTERS = ['ALL', TIERS.MLB1, TIERS.MLB2];

export default function Teams() {
  const [tier, setTier] = useState('ALL');
  const { getTeamRecord } = useLeagueState();
  const filtered = tier === 'ALL' ? allTeams : allTeams.filter((t) => t.tier === tier);

  return (
    <div>
      <PageHeader
        eyebrow="Franchise Directory"
        title="Teams"
        description="The real 50-team league — click through for each club's full 26-man roster."
      />

      <div className="flex gap-1 mb-5">
        {TIER_FILTERS.map((t) => (
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

      <div className="grid grid-cols-3 gap-3">
        {filtered.map((t) => {
          const record = getTeamRecord(t.id);
          return (
            <Link
              key={t.id}
              to={`/teams/${t.id}`}
              className="bg-field-dark border border-field-line rounded-sm px-4 py-3 hover:border-brass-bright/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <TierBadge tier={t.tier} />
                <span className="agate text-xs text-ledger/40">{record.wins}-{record.losses}</span>
              </div>
              <div className="text-ledger text-sm">{t.city} {t.nickname}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
