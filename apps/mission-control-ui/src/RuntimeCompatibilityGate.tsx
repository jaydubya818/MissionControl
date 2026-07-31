import { useEffect, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { RUNTIME_CONTRACT_VERSION } from "../../../convex/lib/runtimeContract";
import { Button } from "@/components/ui/button";
import { evaluateRuntimeCompatibility } from "@/lib/runtimeCompatibility";

export function RuntimeCompatibilityNotice({
  clientVersion,
  serverVersion,
  technicalDetails,
  eyebrow = "Client and backend are out of sync",
  title = "Mission Control needs to reload",
  description = "A newer runtime contract is available. Your persisted work is safe. Reload before continuing so actions and validation use the same contract.",
}: {
  clientVersion?: number;
  serverVersion?: number;
  technicalDetails?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
      <section
        role="alert"
        aria-labelledby="runtime-update-title"
        className="w-full max-w-xl rounded-xl border border-warn/45 bg-surface-1 p-6 shadow-xl"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-warn/35 bg-warn/10 text-warn">
          <ShieldCheck size={20} aria-hidden />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-warn">
          {eyebrow}
        </p>
        <h1 id="runtime-update-title" className="mt-2 text-xl font-semibold">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {description}
        </p>
        {clientVersion !== undefined && serverVersion !== undefined ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface-2 p-3 text-xs">
            <div>
              <dt className="text-ink-muted">Loaded client</dt>
              <dd className="mt-1 font-mono font-semibold text-ink">v{clientVersion}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Active backend</dt>
              <dd className="mt-1 font-mono font-semibold text-ink">v{serverVersion}</dd>
            </div>
          </dl>
        ) : null}
        {technicalDetails ? (
          <details className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink-secondary">
            <summary className="cursor-pointer font-medium text-ink">Technical details</summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-err">
              {technicalDetails}
            </pre>
          </details>
        ) : null}
        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 min-h-11 gap-2"
        >
          <RefreshCw size={16} aria-hidden />
          Reload Mission Control
        </Button>
      </section>
    </main>
  );
}

export function RuntimeCompatibilityGate({ children }: { children: ReactNode }) {
  const convex = useConvex();
  const [serverVersion, setServerVersion] = useState<number>();
  const [checkError, setCheckError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    const check = async () => {
      try {
        const result = await convex.query(api.runtimeCompatibility.get, {});
        if (cancelled) return;
        consecutiveFailures = 0;
        setServerVersion(result.contractVersion);
        setCheckError(undefined);
        timer = setTimeout(check, 10_000);
      } catch (error) {
        if (cancelled) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setCheckError(
            error instanceof Error ? error.message : "Runtime compatibility check failed",
          );
        }
        timer = setTimeout(check, consecutiveFailures >= 3 ? 5_000 : 1_000);
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [convex]);

  const simulateMismatch =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("simulateRuntimeMismatch") === "1";
  const clientVersion = simulateMismatch
    ? RUNTIME_CONTRACT_VERSION - 1
    : RUNTIME_CONTRACT_VERSION;
  const compatibility = evaluateRuntimeCompatibility(
    clientVersion,
    serverVersion,
  );

  if (checkError && serverVersion === undefined) {
    return (
      <RuntimeCompatibilityNotice
        eyebrow="Runtime check unavailable"
        title="Mission Control is waiting for the backend"
        description="The compatibility endpoint is not ready yet. Your persisted work is safe. Mission Control will keep checking automatically, or you can reload after the backend finishes starting."
        technicalDetails={checkError}
      />
    );
  }

  if (compatibility.status === "CHECKING") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app text-sm text-ink-muted">
        Checking runtime compatibility…
      </main>
    );
  }

  if (compatibility.status === "RELOAD_REQUIRED") {
    return (
      <RuntimeCompatibilityNotice
        clientVersion={compatibility.clientVersion}
        serverVersion={compatibility.serverVersion}
      />
    );
  }

  return children;
}
