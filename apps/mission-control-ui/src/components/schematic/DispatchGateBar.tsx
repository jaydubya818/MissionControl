import { SchematicSectionTitle } from "./SchematicSectionTitle";

interface DispatchGateBarProps {
  autoRouted: number;
  gated: number;
  emptyCaption?: string;
}

function GateSegment({
  className,
  widthPct,
  count,
  label,
}: {
  className: string;
  widthPct: number;
  count: number;
  label: string;
}): JSX.Element | null {
  if (widthPct <= 0) return null;
  const showLabel = widthPct >= 14;
  return (
    <div
      className={className}
      style={{ width: `${widthPct}%` }}
      title={`${count} ${label}`}
    >
      {showLabel ? `${count} ${label}` : null}
    </div>
  );
}

/**
 * Hero decision bar — adapted from waku-agent retrieval gate (gateSplit).
 * Shows auto-routed (green path) vs gated (policy/approval) turns.
 */
export function DispatchGateBar({
  autoRouted,
  gated,
  emptyCaption = "no runs yet — dispatch starts when agents claim work",
}: DispatchGateBarProps): JSX.Element {
  const total = autoRouted + gated;
  const autoPct = total > 0 ? Math.round((autoRouted / total) * 100) : 100;
  const gatedPct = total > 0 ? 100 - autoPct : 0;

  return (
    <section aria-label="Dispatch gate">
      <SchematicSectionTitle>Dispatch gate — the hero decision</SchematicSectionTitle>
      <div className="flex h-[26px] overflow-hidden rounded-md border border-line">
        {total === 0 ? (
          <div className="w-full bg-schematic-accent opacity-35" />
        ) : (
          <>
            <GateSegment
              className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap bg-schematic-accent text-[11px] font-semibold text-white"
              widthPct={autoPct}
              count={autoRouted}
              label="auto"
            />
            <GateSegment
              className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap bg-schematic-gate-retrieve text-[11px] font-semibold text-white"
              widthPct={gatedPct}
              count={gated}
              label="gated"
            />
          </>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] tabular-nums text-ink-muted">
        {total === 0
          ? emptyCaption
          : `the dispatch gate auto-routed ${autoPct}% of turns — policy only when risk demands it`}
      </p>
    </section>
  );
}
