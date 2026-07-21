import PageHeader from '../components/PageHeader';

export default function Cup() {
  return (
    <div>
      <PageHeader
        eyebrow="FA Cup-Style"
        title="The Ledger Cup"
        description="A cross-tier, season-spanning knockout tournament, open to every club regardless of league or tier — not built yet."
      />

      <div className="bg-field-dark border border-field-line rounded-sm px-6 py-8 max-w-md text-center">
        <p className="text-ledger/60 text-sm leading-relaxed">
          No Cup tournament exists in the engine yet — there's no bracket, no cross-tier scheduling, and no real results to show.
          The season simulation only plays each club's own regular-season schedule right now (see Schedule/Standings).
        </p>
        <p className="text-ledger/35 text-xs mt-4">
          Building this needs real cross-tier match scheduling against the regular-season calendar, which doesn't exist either — a bigger, separate piece of future work.
        </p>
      </div>
    </div>
  );
}
