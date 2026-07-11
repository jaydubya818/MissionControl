type LegacyTaskLike = {
  _id: string;
  identifier?: string;
  title: string;
  description?: string;
  priority: 1 | 2 | 3 | 4;
  assigneeIds: string[];
  createdBy?: string;
  createdByRef?: string;
  source?: string;
  sourceRef?: string;
};

function inferRepository(task: LegacyTaskLike): string | undefined {
  if (task.source === "GITHUB" && task.sourceRef?.includes("/")) {
    return task.sourceRef.split("#")[0];
  }
  return undefined;
}

export function buildWorkOrderDraftFromTask(task: LegacyTaskLike) {
  return {
    legacyTaskId: task._id,
    title: task.title,
    desiredOutcome: task.description || task.title,
    context: task.identifier ? `Imported from legacy task ${task.identifier}` : "Imported from legacy task",
    repository: inferRepository(task),
    priority: task.priority,
    requestedBy: task.createdByRef ?? task.createdBy,
    assignedAgent: task.assigneeIds[0],
    acceptanceCriteria: [
      {
        id: "legacy-ac-1",
        title: "Legacy task outcome has explicit verification evidence",
        verificationMethod: "MANUAL" as const,
        status: "PENDING" as const,
      },
    ],
    sourceOfTruthRefs: task.sourceRef
      ? [
          {
            kind: task.source === "GITHUB" ? ("ISSUE" as const) : ("URL" as const),
            label: task.source ?? "Legacy source",
            location: task.sourceRef,
          },
        ]
      : undefined,
  };
}
