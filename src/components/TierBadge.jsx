export default function TierBadge({ tier }) {
  // 'MLB' is mockData.js's placeholder tier string; 'MLB1' is the real
  // TIERS.MLB1 value from the real 50-team seed — both mean "top tier."
  const isMLB = tier === 'MLB' || tier === 'MLB1';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] tracking-wider font-medium agate ${
        isMLB ? 'bg-brass/20 text-brass-bright' : 'bg-navy/30 text-navy-bright'
      }`}
    >
      {tier}
    </span>
  );
}
