import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RegistryInstallCliProps {
  slug: string;
  version?: string | null;
  sourceRepo?: string | null;
  commitSha?: string | null;
  skillName?: string;
  className?: string;
}

function buildInstallCommand({
  slug,
  version,
  sourceRepo,
  commitSha,
  skillName,
}: RegistryInstallCliProps): string {
  if (sourceRepo && commitSha) {
    const repo = sourceRepo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    const shortSha = commitSha.slice(0, 7);
    const skill = skillName ?? slug.split("/").pop() ?? slug;
    return `npx mc context install github:${repo}@${shortSha} --skill ${skill}`;
  }
  if (version) {
    return `npx mc context install ${slug}@${version}`;
  }
  return `npx mc context install ${slug}`;
}

/** Install-with-CLI widget (Tessl npx tessl i pattern). */
export function RegistryInstallCli({
  slug,
  version,
  sourceRepo,
  commitSha,
  skillName,
  className,
}: RegistryInstallCliProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const cmd = buildInstallCommand({ slug, version, sourceRepo, commitSha, skillName });

  const copy = async () => {
    await navigator.clipboard.writeText(cmd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("registry-install rounded-xl border border-line bg-surface-1 p-4", className)}>
      <div className="text-[12px] font-medium text-ink-secondary">Install with Mission Control CLI</div>
      <div className="mt-2 flex items-stretch gap-2">
        <code className="registry-cli-box min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 font-mono text-[11.5px] text-ink-secondary">
          {cmd}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface-2 px-3 text-[12px] text-ink-secondary hover:text-ink"
          title="Copy command"
        >
          {copied ? <Check size={14} className="text-registry-accent" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-ink-muted">
          npm
        </span>
        <span className="text-[11px] text-ink-muted">Resolves from registry snapshot</span>
      </div>
    </div>
  );
}
