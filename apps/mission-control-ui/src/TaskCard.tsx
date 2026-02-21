import type { Doc } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";
import { useState } from "react";
import { QuickEditModal } from "./QuickEditModal";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Doc<"tasks">;
  agents?: Doc<"agents">[];
  onClick: () => void;
  isDragging?: boolean;
  onUpdate?: () => void;
}

const PRIORITY_CLASSES: Record<number, { card: string }> = {
  1: { card: "bg-orange-900 border-orange-600" },
  2: { card: "bg-orange-900 border-orange-500" },
  3: { card: "bg-slate-800 border-slate-600" },
  4: { card: "bg-slate-900 border-slate-700" },
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  INBOX: "bg-gray-500",
  ASSIGNED: "bg-blue-500",
  IN_PROGRESS: "bg-amber-500",
  REVIEW: "bg-blue-500",
  NEEDS_APPROVAL: "bg-red-500",
  BLOCKED: "bg-red-600",
  DONE: "bg-emerald-500",
  CANCELED: "bg-slate-500",
};

export function TaskCard({ task, agents, onClick, isDragging, onUpdate }: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const assignedAgent = agents?.find(a => task.assigneeIds?.includes(a._id));
  
  const priorityClass = PRIORITY_CLASSES[task.priority as number] || PRIORITY_CLASSES[3];
  
  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setShowQuickEdit(true);
        }}
        className={cn(
          "border rounded-lg p-3 mb-2 cursor-pointer transition-all",
          priorityClass.card,
          isDragging && "opacity-50"
        )}
    >
      <div className="flex justify-between mb-2">
        <div className="flex gap-1.5 items-center">
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded text-white font-semibold",
            STATUS_BADGE_CLASSES[task.status] || "bg-slate-500"
          )}>
            {task.status}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-muted-foreground">
            P{task.priority}
          </span>
        </div>
        <div className="flex gap-1 items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickEdit(true);
            }}
            className="bg-transparent border-none text-muted-foreground text-sm cursor-pointer px-1 py-0.5 hover:text-foreground transition-colors"
            title="Edit task (or double-click card)"
          >
            ✏️
          </button>
          <span className="text-[10px] text-muted-foreground">
            {task._id.slice(-6)}
          </span>
        </div>
      </div>

      <div className="text-sm font-medium text-foreground mb-2 leading-snug">
        {task.title}
      </div>

      {task.description && (
        <div className="text-xs text-muted-foreground mb-2 overflow-hidden line-clamp-2">
          {task.description}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex gap-1.5 items-center">
          <span className="text-[11px] text-muted-foreground">
            {task.type}
          </span>
          {task.actualCost > 0 && (
            <span className="text-[11px] text-emerald-500">
              ${task.actualCost.toFixed(2)}
            </span>
          )}
        </div>
        {assignedAgent && (
          <div className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-foreground">
            {assignedAgent.emoji || "🤖"} {assignedAgent.name}
          </div>
        )}
      </div>
    </motion.div>
    
    {showQuickEdit && (
      <QuickEditModal
        task={task}
        onClose={() => setShowQuickEdit(false)}
        onSave={() => {
          if (onUpdate) onUpdate();
        }}
      />
    )}
    </>
  );
}
