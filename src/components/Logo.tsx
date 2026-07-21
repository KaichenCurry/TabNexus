export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="TabNexus">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      {!compact && (
        <span className="brand-name">
          Tab<span>Nexus</span>
        </span>
      )}
    </div>
  );
}
