import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Sparkles, Pencil, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface MissionBannerProps {
  projectId: Id<"projects"> | null;
  onEditClick: () => void;
  onReversePromptClick: () => void;
}

export function MissionBanner({ projectId, onEditClick, onReversePromptClick }: MissionBannerProps) {
  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});

  if (!missionData) {
    return null;
  }

  const hasMission = !!missionData.missionStatement;

  return (
    <Card className="mb-6">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="shrink-0">
              <div className="rounded-lg bg-muted p-2.5 border border-border">
                <Target className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {hasMission ? (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Mission Statement
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    &ldquo;{missionData.missionStatement}&rdquo;
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    No Mission Statement
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Set your mission statement to guide your autonomous agents
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasMission && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReversePromptClick}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                Reverse Prompt
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={onEditClick}
              className="h-8 w-8 text-muted-foreground"
              title={hasMission ? "Edit mission statement" : "Set mission statement"}
            >
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
