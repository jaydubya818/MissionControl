import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";
import { UserPlus, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { SkeletonCard } from "@/components/ui/skeleton-card";

interface CrmViewProps {
  projectId: Id<"projects"> | null;
}

const CRM_COLUMNS = [
  { id: "prospect", label: "Prospect", color: "border-t-zinc-500" },
  { id: "contacted", label: "Contacted", color: "border-t-blue-500" },
  { id: "meeting", label: "Meeting", color: "border-t-blue-500" },
  { id: "proposal", label: "Proposal", color: "border-t-amber-500" },
  { id: "active", label: "Active", color: "border-t-emerald-500" },
];

export function CrmView({ projectId }: CrmViewProps) {
  // Use org members as CRM contacts for now
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const isLoading = !agents;

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <SkeletonCard lines={2} />
            </div>
          ))}
        </div>
      </main>
    );
  }

  // Map agents by status into CRM-like columns
  const columnItems: Record<string, typeof agents> = {
    prospect: agents.filter((a) => a.status === "IDLE"),
    contacted: agents.filter((a) => a.status === "ASSIGNED"),
    meeting: agents.filter((a) => a.status === "PAUSED"),
    proposal: agents.filter((a) => a.status === "QUARANTINED"),
    active: agents.filter((a) => a.status === "ACTIVE"),
  };

  return (
    <main className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            CRM Pipeline
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage contacts and relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 border border-white/5 transition-colors">
            <Filter className="h-3 w-3" />
            Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-colors">
            <UserPlus className="h-3 w-3" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Pipeline Columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 min-w-max h-full">
          {CRM_COLUMNS.map((col, colIdx) => (
            <motion.div
              key={col.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: colIdx * 0.08 }}
              className="w-64 flex flex-col"
            >
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 mb-3 rounded-lg bg-white/5 border border-white/5 border-t-2 ${col.color}`}>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </span>
                <span className="text-[0.65rem] font-medium text-muted-foreground/60 bg-white/5 px-1.5 py-0.5 rounded">
                  {columnItems[col.id]?.length ?? 0}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {(columnItems[col.id] ?? []).map((agent, itemIdx) => (
                  <Card
                    key={agent._id}
                    className="p-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-xs font-medium text-foreground/80 shrink-0">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground/90 truncate">
                          {agent.name}
                        </p>
                        <p className="text-[0.6rem] text-muted-foreground/60 truncate">
                          {agent.role}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusDot
                        variant={agent.status === "ACTIVE" ? "active" : "offline"}
                        size="sm"
                      />
                      <span className="text-[0.6rem] text-muted-foreground/60 uppercase tracking-wider">
                        {agent.status}
                      </span>
                    </div>
                  </Card>
                ))}

                {(columnItems[col.id]?.length ?? 0) === 0 && (
                  <div className="py-8 text-center text-[0.65rem] text-muted-foreground/40 uppercase tracking-wider">
                    Empty
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}
