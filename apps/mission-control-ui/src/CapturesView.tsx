import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Camera } from "lucide-react";

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
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">Captures</h1>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Captures</h1>
        <p className="text-sm text-muted-foreground">Visual artifacts and deliverables gallery</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={filterType === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
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
    </main>
  );
}

function CaptureCard({ capture }: { capture: Doc<"captures"> }) {
  const thumbnailUrl = getRenderableThumbnailUrl(capture.thumbnailUrl);

  const typeEmoji: Record<string, string> = {
    SCREENSHOT: "📷",
    DIAGRAM: "📊",
    MOCKUP: "🎨",
    CHART: "📈",
    VIDEO: "🎥",
    OTHER: "📄",
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden hover:border-muted-foreground/30 transition-colors cursor-pointer">
      <div
        className="w-full h-[180px] flex items-center justify-center bg-muted"
        style={thumbnailUrl ? { background: `url(${thumbnailUrl}) center/cover` } : undefined}
      >
        {!thumbnailUrl && (
          <span className="text-5xl">{typeEmoji[capture.type] || "📄"}</span>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1.5 truncate">
          {capture.title}
        </h3>
        {capture.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
            {capture.description}
          </p>
        )}
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="default" className="text-xs">
            {capture.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(capture.capturedAt).toLocaleDateString()}
          </span>
        </div>
        {capture.tags && capture.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {capture.tags.map((tag, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {tag}
              </Badge>
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
