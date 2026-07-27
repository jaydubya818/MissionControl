/** Uppercase section label — waku h2 pattern. */
export function SchematicSectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <h2
      className={
        className ??
        "mt-7 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-secondary"
      }
    >
      {children}
    </h2>
  );
}
