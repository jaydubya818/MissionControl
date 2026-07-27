import { Sparkles } from "lucide-react";

export interface RegistryFixBannerProps {
  skillPath: string;
}

/** Tessl-style “Fix and improve this skill” banner. */
export function RegistryFixBanner({ skillPath }: RegistryFixBannerProps): JSX.Element {
  const cmd = `node scripts/skill-lint.mjs --fix ${skillPath}`;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3">
      <Sparkles size={16} className="shrink-0 text-registry-accent" aria-hidden />
      <span className="text-[13px] font-medium text-ink">Fix and improve this skill with Mission Control</span>
      <code className="registry-cli-box ml-auto max-w-full truncate rounded-lg px-3 py-1.5 font-mono text-[11.5px]">
        {cmd}
      </code>
    </div>
  );
}
