import { useAction } from "convex/react";
import { useState } from "react";
import { Check, Copy, Github, Globe, Laptop, Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { RegistryEvalBuckets } from "./RegistryEvalBuckets";
import { RegistryModelBenchmark } from "./RegistryModelBenchmark";
import { cn } from "@/lib/utils";

/** Tessl-style “Evaluate a skill” dual-card layout. */
export function RegistryEvaluateSkill({
  projectId,
}: {
  projectId?: Id<"projects"> | null;
}): JSX.Element {
  const [repoUrl, setRepoUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    imported?: Array<{ name: string; score: number }>;
  } | null>(null);

  const analyze = useAction(api.context.analyzeGithubRepo.analyzeRepository);
  const cliCmd = "node scripts/skill-lint.mjs --review ./<path-to-SKILL.md-folder>";

  const copyCli = async () => {
    await navigator.clipboard.writeText(cliCmd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const runAnalyze = async () => {
    const url = repoUrl.trim();
    if (!url || analyzing) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await analyze({
        repoUrl: url,
        projectId: projectId ?? undefined,
        actorId: "registry-evaluate-ui",
      });
      if (!res.success) {
        setResult({
          ok: false,
          message: res.error ?? "No skills imported",
        });
      } else {
        setResult({
          ok: true,
          message: `Imported ${res.imported.length} of ${res.scanned} SKILL.md files`,
          imported: res.imported.map((i) => ({ name: i.name, score: i.score })),
        });
      }
      if (res.errors?.length) {
        setResult((prev) =>
          prev
            ? {
                ...prev,
                message: `${prev.message}. ${res.errors!.length} file(s) skipped.`,
              }
            : prev
        );
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Analyze failed",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <RegistryEvalBuckets />

      <div>
        <nav className="mb-2 font-mono text-[12px] text-ink-muted">Registry / Skills / Evaluate a skill</nav>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Evaluate a skill</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-secondary">
          Bad skills burn tokens, produce wrong output, and send you back to square one. Catching those
          problems early saves you time and compute. Evaluate via a GitHub URL, or run it locally from
          your machine.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="registry-eval-card">
          <div className="registry-kicker">Via GitHub</div>
          <h2 className="mt-2 text-[17px] font-semibold text-ink">Analyze a repository</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
            Mission Control scans public repo URLs, lints each SKILL.md, and imports evaluated skills
            into the registry.
          </p>
          <p className="mt-3 text-[13px] text-ink-secondary">
            <strong className="text-ink">Best for:</strong> Evaluating a public skill authored by
            someone else on GitHub.
          </p>
          <label className="mt-5 block text-[13px] font-medium text-ink" htmlFor="repo-url">
            Repository URL
          </label>
          <div className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Github
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <input
                id="repo-url"
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted"
              />
            </div>
            <button
              type="button"
              disabled={!repoUrl.trim() || analyzing}
              onClick={() => void runAnalyze()}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-colors",
                repoUrl.trim() && !analyzing
                  ? "bg-ink text-app hover:opacity-90"
                  : "cursor-not-allowed bg-surface-3 text-ink-muted"
              )}
            >
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : null}
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          {result ? (
            <div
              className={cn(
                "mt-4 rounded-lg border px-3 py-2 text-[13px]",
                result.ok ? "border-ok/30 bg-ok/10 text-ink" : "border-warn/30 bg-warn/10 text-ink"
              )}
            >
              <p>{result.message}</p>
              {result.imported && result.imported.length > 0 ? (
                <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-ink-secondary">
                  {result.imported.map((i) => (
                    <li key={i.name}>
                      {i.name} — score {i.score}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="registry-eval-footnote mt-5">
            <Globe size={14} aria-hidden />
            <span>
              <strong className="text-ink">Adds to the public registry</strong> where other developers
              can find, install, and build on evaluated skills.
            </span>
          </p>
        </article>

        <article className="registry-eval-card">
          <div className="registry-kicker">Via CLI</div>
          <h2 className="mt-2 text-[17px] font-semibold text-ink">Review locally from your machine</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
            Run reviews directly in your terminal. Works for local skills, private repos, or
            work-in-progress skills you are not ready to publish yet.
          </p>
          <p className="mt-3 text-[13px] text-ink-secondary">
            <strong className="text-ink">Best for:</strong> Local skills, private repos, or drafts.
          </p>
          <div className="mt-5 text-[13px] font-medium text-ink">Run in your terminal</div>
          <div className="mt-2 flex items-stretch gap-2">
            <code className="registry-cli-box min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 font-mono text-[11.5px]">
              {cliCmd}
            </code>
            <button
              type="button"
              onClick={() => void copyCli()}
              className="flex shrink-0 items-center rounded-lg border border-line bg-surface-2 px-3 text-ink-secondary hover:text-ink"
              title="Copy command"
            >
              {copied ? <Check size={14} className="text-registry-accent" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="registry-eval-footnote mt-5">
            <Laptop size={14} aria-hidden />
            <span>
              <strong className="text-ink">Stays local.</strong> Results are only visible to you until
              you publish to the registry.
            </span>
          </p>
        </article>
      </div>

      <RegistryModelBenchmark />
    </div>
  );
}
