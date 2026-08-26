import { internal } from "../_generated/api";

const AUTHORIZATION_DENIAL_PATTERNS = [
  "authenticated operator",
  "authorized workspace",
  "company account is unavailable or unauthorized",
  "company role does not permit",
  "company administrator access is required",
  "delivery record is unavailable or unauthorized",
  "workspace company assignment is incomplete",
  "workspace does not belong",
  "workspace is unavailable or unauthorized",
  "workspace role does not permit",
];

function isAuthorizationDenial(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return AUTHORIZATION_DENIAL_PATTERNS.some((pattern) => message.includes(pattern));
}

export type HumanActionScope = {
  projectId?: any;
  taskId?: any;
  workOrderId?: any;
  approvalId?: any;
  alertId?: any;
  documentId?: any;
  agentId?: any;
  workflowRunId?: any;
  runArtifactId?: any;
};

export async function runAuditedHumanMutation(
  ctx: any,
  mutationReference: any,
  args: unknown,
  operation: string,
  scopeInput: HumanActionScope,
): Promise<any> {
  let scope: { projectId?: any; tenantId?: any } = {};
  try {
    scope = await ctx.runQuery(internal.humanActionAudit.resolveScope, scopeInput);
  } catch {
    // Scope resolution is best-effort and must not change domain behavior.
  }

  try {
    return await ctx.runMutation(mutationReference, args);
  } catch (error) {
    if (isAuthorizationDenial(error)) {
      const identity = await ctx.auth.getUserIdentity();
      try {
        await ctx.runMutation(internal.humanActionAudit.recordDenied, {
          projectId: scope.projectId,
          tenantId: scope.tenantId,
          operation,
          identitySubject: identity?.subject,
        });
      } catch (auditError) {
        console.error("Failed to persist authorization denial audit", auditError);
      }
    }
    throw error;
  }
}
