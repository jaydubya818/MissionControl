import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Save, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface MissionModalProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function MissionModal({ projectId, onClose }: MissionModalProps) {
  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});
  const setMission = useMutation(api.mission.setMission);

  const [missionText, setMissionText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (missionData?.missionStatement) {
      setMissionText(missionData.missionStatement);
    }
  }, [missionData]);

  const handleSave = async () => {
    if (!missionText.trim()) {
      setError("Mission statement cannot be empty");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await setMission({
        missionStatement: missionText.trim(),
        projectId: projectId ?? undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mission statement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2 border border-border">
              <Target className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <DialogTitle>Mission Statement</DialogTitle>
              <DialogDescription>
                Define the north star that guides your autonomous agents
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="mission-textarea" className="block text-sm font-medium text-foreground mb-2">
              Your Mission
            </label>
            <textarea
              id="mission-textarea"
              value={missionText}
              onChange={(e) => setMissionText(e.target.value)}
              placeholder="e.g., Build an autonomous organization of AI agents that does work for me and produces value 24/7"
              className="w-full h-32 px-4 py-3 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              This mission statement will be included in every agent's context and used for reverse prompting.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="bg-muted/50 border border-border rounded-md p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Tips for a Great Mission</h3>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>Be specific about the outcomes you want to achieve</li>
              <li>Focus on value creation, not just task completion</li>
              <li>Make it measurable where possible (e.g., "24/7", "10x productivity")</li>
              <li>Keep it concise but inspiring (1-2 sentences ideal)</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <p className="text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-xs">Esc</kbd> to cancel
            {" · "}
            <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-xs">⌘ Enter</kbd> to save
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !missionText.trim()}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" strokeWidth={1.5} />
              {isSaving ? "Saving..." : "Save Mission"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
