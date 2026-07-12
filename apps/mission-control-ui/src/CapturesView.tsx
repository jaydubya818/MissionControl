import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "./components/factory/badges";
import { PageHeader } from "./components/PageHeader";
import {
  BarChart3,
  Camera,
  File,
  PenTool,
  Video,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CapturesViewProps {
  projectId: Id<"projects"> | null;
}

type CaptureType = "all" | "SCREENSHOT" | "DIAGRAM" | "MOCKUP" | "CHART" | "VIDEO" | "OTHER";

const FILTER_OPTIONS: { value: CaptureType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "SCREENSHOT", label: "Screenshots" },
  { value: "DIAGRAM", label: "Diagrams" },
  { value: "MOCKUP", label: "Mockups" },
  { value: "CHART", label: "Charts" },
  { value: "VIDEO", label: "Videos" },
  { value: "OTHER", label: "Other" },
];

export function CapturesView({ projectId }: CapturesViewProps) {
  const [filterType, setFilterType] = useState<CaptureType>("all");
  const captures = useQuery(api.captures.list, {
    projectId: projectId ?? undefined,
    type: filterType === "all" ? undefined : filterType,
  });

  if (captures === undefined) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Captures"
          description="Visual artifacts and deliverables gallery"
        />
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface-1 p-4">
                <div className="h-[140px] animate-pulse rounded-lg bg-surface-2" />
                <div className="mt-4 h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Captures"
        description="Visual artifacts and deliverables gallery"
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap">
          <div className="flex flex-wrap rounded-lg border border-line p-0.5" role="tablist">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={filterType === opt.value}
                onClick={() => setFilterType(opt.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12.5px] transition-colors duration-150",
                  filterType === opt.value
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:text-ink-secondary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {captures?.map((capture) => (
            <CaptureCard key={capture._id} capture={capture} />
          ))}
        </div>

        {captures?.length === 0 && (
          <EmptyState
            icon={Camera}
            title="No captures yet"
            description="Visual artifacts will appear here as agents complete tasks"
          />
        )}
      </div>
    </main>
  );
}

function CaptureCard({ capture }: { capture: Doc<"captures"> }) {
  const thumbnailUrl = getRenderableThumbnailUrl(capture.thumbnailUrl);

  const typeIcons: Record<string, LucideIcon> = {
    SCREENSHOT: Camera,
    DIAGRAM: Workflow,
    MOCKUP: PenTool,
    CHART: BarChart3,
    VIDEO: Video,
    OTHER: File,
  };
  const TypeIcon = typeIcons[capture.type] ?? File;

  return (
    <div className="cursor-pointer overflow-hidden rounded-xl border border-line bg-surface-1 transition-colors duration-150 hover:border-line-strong">
      <div
        className="flex h-[180px] w-full items-center justify-center bg-surface-2"
        style={thumbnailUrl ? { background: `url(${thumbnailUrl}) center/cover` } : undefined}
      >
        {!thumbnailUrl && (
          <TypeIcon size={24} strokeWidth={1.6} className="text-ink-muted" aria-hidden />
        )}
      </div>

      <div className="p-4">
        <h3 className="mb-1.5 truncate text-[15px] font-semibold text-ink">
          {capture.title}
        </h3>
        {capture.description && (
          <p className="mb-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">
            {capture.description}
          </p>
        )}
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge tone="neutral">{capture.type}</StatusBadge>
          <span className="text-[12.5px] text-ink-muted">
            {new Date(capture.capturedAt).toLocaleDateString()}
          </span>
        </div>
        {capture.tags && capture.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {capture.tags.map((tag, i) => (
              <StatusBadge key={i} tone="neutral">
                {tag}
              </StatusBadge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getRenderableThumbnailUrl(thumbnailUrl: string | undefined) {
  if (!thumbnailUrl) return null;
  try {
    const parsed = new URL(thumbnailUrl, window.location.origin);
    if (parsed.hostname === "example.com") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
