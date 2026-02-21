import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ActivityFeedProps {
  projectId: Id<"projects"> | null;
  limit?: number;
}

export function ActivityFeed({ projectId, limit = 50 }: ActivityFeedProps) {
  const activities = useQuery(
    api.activities.listRecent,
    projectId ? { projectId, limit } : { limit }
  );
  
  if (!activities) {
    return (
      <div className="p-5 text-muted-foreground">
        Loading activities...
      </div>
    );
  }
  
  const getActivityIcon = (action: string) => {
    if (action.includes("CREATED")) return "✨";
    if (action.includes("UPDATED")) return "✏️";
    if (action.includes("DELETED")) return "🗑️";
    if (action.includes("APPROVED")) return "✅";
    if (action.includes("DENIED")) return "❌";
    if (action.includes("ASSIGNED")) return "👤";
    if (action.includes("COMPLETED")) return "🎉";
    if (action.includes("BLOCKED")) return "🚫";
    if (action.includes("REVIEW")) return "👀";
    if (action.includes("COMMENT")) return "💬";
    return "📝";
  };
  
  const getActivityBorderClass = (action: string) => {
    if (action.includes("CREATED")) return "border-l-emerald-500";
    if (action.includes("COMPLETED")) return "border-l-emerald-500";
    if (action.includes("APPROVED")) return "border-l-emerald-500";
    if (action.includes("DENIED")) return "border-l-red-500";
    if (action.includes("BLOCKED")) return "border-l-red-500";
    if (action.includes("DELETED")) return "border-l-red-500";
    if (action.includes("REVIEW")) return "border-l-blue-500";
    if (action.includes("ASSIGNED")) return "border-l-blue-500";
    return "border-l-slate-400";
  };
  
  return (
    <div className="bg-background rounded-lg p-4 max-h-[600px] overflow-auto">
      <h3 className="mb-4 text-base font-semibold">
        📊 Recent Activity
      </h3>
      
      <AnimatePresence>
        {activities.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-base">No activity yet</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activities.map((activity, idx) => (
              <motion.div
                key={activity._id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "p-3 bg-card rounded-md border-l-[3px]",
                  getActivityBorderClass(activity.action)
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-lg shrink-0">
                    {getActivityIcon(activity.action)}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] text-foreground mb-1">
                      {activity.description}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex gap-2">
                      <span>{activity.actorType}</span>
                      <span>·</span>
                      <span>{new Date(activity._creationTime).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActivityFeedModal({ projectId, onClose }: { projectId: Id<"projects"> | null; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-5"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl max-w-[800px] w-full max-h-[80vh] overflow-hidden text-card-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            📊 Activity Feed
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer px-2 hover:text-foreground transition-colors"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 overflow-auto max-h-[calc(80vh-80px)]">
          <ActivityFeed projectId={projectId} limit={100} />
        </div>
      </div>
    </div>
  );
}
