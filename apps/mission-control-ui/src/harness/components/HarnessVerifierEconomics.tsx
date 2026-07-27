/** Verifier vs full agentic review cost economics (Dru Knox talk). */
export function HarnessVerifierEconomics(): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line bg-surface-1 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Full agentic review
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
          ~$25<span className="text-sm text-ink-muted">/PR</span>
        </div>
        <p className="mt-2 text-xs text-ink-secondary">
          Multi-lens, tireless, expensive. Use for outer loop when verifiers can't catch it.
        </p>
      </div>
      <div className="rounded-xl border border-ok/30 bg-ok/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ok">Verifiers (shift left)</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-ok">
          ~$0.30<span className="text-sm text-ink-muted">/day</span>
        </div>
        <p className="mt-2 text-xs text-ink-secondary">
          100+ targeted LLM lint rules per PR — fast, cheap, inner-loop friendly. Move checks out of
          heavy review into verifiers.
        </p>
      </div>
    </div>
  );
}
