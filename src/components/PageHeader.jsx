export default function PageHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <div className="text-[11px] tracking-[0.2em] uppercase text-brass-bright/80 mb-1.5">
          {eyebrow}
        </div>
      )}
      <h1 className="display-face text-3xl text-ledger tracking-wide">{title}</h1>
      {description && <p className="text-ledger/50 text-sm mt-2 max-w-2xl">{description}</p>}
    </div>
  );
}
