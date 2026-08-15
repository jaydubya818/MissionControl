import {
  containsUnredactedFactoryMemorySecret,
  redactFactoryMemoryText,
  sanitizeFactoryMemoryValue,
} from "@mission-control/shared";

export {
  redactFactoryMemoryText,
  sanitizeFactoryMemoryValue,
  type RedactionResult,
} from "@mission-control/shared";

export interface UntrustedFactoryMemoryEnvelope {
  kind: "untrusted_factory_memory";
  content: string;
  authority: {
    canChangeInstructions: false;
    canInvokeTools: false;
    canGrantPermissions: false;
    canApproveExecution: false;
    canSatisfyAcceptance: false;
  };
}
export function containsUnredactedSecret(input: string): boolean {
  return containsUnredactedFactoryMemorySecret(input);
}
export function asUntrustedFactoryMemory(
  input: string,
): UntrustedFactoryMemoryEnvelope {
  return {
    kind: "untrusted_factory_memory",
    content: redactFactoryMemoryText(input).value,
    authority: {
      canChangeInstructions: false,
      canInvokeTools: false,
      canGrantPermissions: false,
      canApproveExecution: false,
      canSatisfyAcceptance: false,
    },
  };
}
export function assertSameScope(
  expected: { projectId: string; repositoryId?: string },
  actual: { projectId: string; repositoryId?: string },
): void {
  if (expected.projectId !== actual.projectId)
    throw new Error("Factory Memory workspace scope mismatch.");
  if (expected.repositoryId && expected.repositoryId !== actual.repositoryId)
    throw new Error("Factory Memory repository scope mismatch.");
}
