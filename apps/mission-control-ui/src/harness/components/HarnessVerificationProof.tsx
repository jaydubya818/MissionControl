import { MonitorPlay, MousePointerClick } from "lucide-react";

/** Computer-use / Playwright verification proof — Eric's cloud agent recordings. */
export function HarnessVerificationProof({ className }: { className?: string }): JSX.Element {
  return (
    <section className={className}>
      <div className="registry-top-card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-registry-accent" aria-hidden />
            <span className="text-[14px] font-semibold text-ink">Verification recording</span>
          </div>
          <span className="registry-delta">Computer use · ~$1/run</span>
        </div>
        <div className="relative aspect-video bg-[#0b0b0d]">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="rounded-lg border border-registry-accent/30 bg-registry-accent-soft px-4 py-2 text-[13px] text-ink">
              Agent navigates UI with keyboard — highlighted row, click paths, login flows
            </div>
            <p className="max-w-md text-[12px] text-ink-muted">
              Eric merges without reading code when recording + Playwright pass. UAT: screenshot every docs instance of a changed term.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Playwright e2e", "DOM click paths", "Screen recording", "Wrong-password flow"].map((t) => (
                <span key={t} className="registry-contains-pill text-[11px]">
                  <MousePointerClick className="h-3 w-3" aria-hidden />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-lg border border-line bg-surface-1/90 px-3 py-2 text-[11px] text-ink-secondary backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-registry-accent" />
            Simulated cloud agent session — connect Cursor worker for live feed
          </div>
        </div>
      </div>
    </section>
  );
}
