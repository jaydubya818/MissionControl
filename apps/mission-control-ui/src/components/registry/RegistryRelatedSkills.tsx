import type { RegistryEntry } from "../../RegistryView";
import { RegistryScoreHex } from "./RegistryScoreHex";
import { impactMultiplier } from "@/lib/registryCategories";

export interface RegistryRelatedSkillsProps {
  entries: RegistryEntry[];
  currentId: string;
  onSelect: (entry: RegistryEntry) => void;
}

/** Tessl-style related skills sidebar cards. */
export function RegistryRelatedSkills({
  entries,
  currentId,
  onSelect,
}: RegistryRelatedSkillsProps): JSX.Element {
  const related = entries
    .filter((e) => e._id !== currentId && e.qualityScore !== null)
    .slice(0, 3);

  if (related.length === 0) return <></>;

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="text-[12px] font-semibold text-ink">Related skills and plugins</div>
      <div className="mt-3 space-y-2">
        {related.map((entry) => {
          const score = entry.qualityScore ?? 0;
          const delta = impactMultiplier(
            entry.qualityScore,
            entry.impactScore,
            entry.baselineScore,
            entry.candidateScore
          );
          return (
            <button
              key={entry._id}
              type="button"
              onClick={() => onSelect(entry)}
              className="registry-related-card w-full text-left"
            >
              <div className="flex items-start gap-3">
                <RegistryScoreHex score={score} size="sm" delta={delta} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-ink">
                    {entry.owner}/{entry.name}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
                    {entry.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
