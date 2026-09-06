export interface WorkflowDefinitionSnapshot {
  contractVersion?: "factory-workflow-contract/v2";
  workflowId: string;
  name: string;
  description: string;
  topology: "LINEAR" | "DAG";
  maxConcurrency: number;
  convergence?: {
    maxIterations: number;
    stopCondition: string;
  };
  agents: unknown[];
  steps: unknown[];
  active: boolean;
  version: number;
}

/**
 * Capture only executable workflow fields so a run remains deterministic even
 * when the installed definition changes after dispatch.
 */
export function snapshotWorkflowDefinition(
  workflow: any
): WorkflowDefinitionSnapshot {
  return {
    ...(workflow.contractVersion === "factory-workflow-contract/v2" ? { contractVersion: workflow.contractVersion as "factory-workflow-contract/v2" } : {}),
    workflowId: workflow.workflowId,
    name: workflow.name,
    description: workflow.description,
    topology: workflow.topology ?? "LINEAR",
    maxConcurrency: workflow.maxConcurrency ?? 1,
    ...(workflow.convergence
      ? {
          convergence: {
            maxIterations: workflow.convergence.maxIterations,
            stopCondition: workflow.convergence.stopCondition,
          },
        }
      : {}),
    agents: workflow.agents.map((agent: unknown) => ({ ...(agent as object) })),
    steps: workflow.steps.map((step: unknown) => ({ ...(step as object) })),
    active: workflow.active,
    version: workflow.version,
  };
}

export function executableWorkflowFingerprint(workflow: any): string {
  return JSON.stringify({
    ...(workflow.contractVersion === "factory-workflow-contract/v2" ? { contractVersion: workflow.contractVersion } : {}),
    workflowId: workflow.workflowId,
    name: workflow.name,
    description: workflow.description,
    topology: workflow.topology,
    maxConcurrency: workflow.maxConcurrency,
    convergence: workflow.convergence,
    agents: workflow.agents,
    steps: workflow.steps,
    active: workflow.active,
  });
}

export function workflowDefinitionChanged(existing: any, next: any): boolean {
  return executableWorkflowFingerprint(existing) !== executableWorkflowFingerprint(next);
}
