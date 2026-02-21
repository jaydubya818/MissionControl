export type ArmDecision = "ALLOW" | "DENY" | "NEEDS_APPROVAL";

export function parseEnvelopeDecision(
  envelopeRules: any,
  toolName?: string,
  risk?: "GREEN" | "YELLOW" | "RED"
): ArmDecision | null {
  if (!envelopeRules) return null;

  if (toolName && envelopeRules.toolPolicies && typeof envelopeRules.toolPolicies === "object") {
    const rule = envelopeRules.toolPolicies[toolName];
    if (rule === "ALLOW" || rule === "DENY" || rule === "NEEDS_APPROVAL") {
      return rule;
    }
  }

  if (Array.isArray(envelopeRules.requireApprovalOnRisk) && risk) {
    if (envelopeRules.requireApprovalOnRisk.includes(risk)) {
      return "NEEDS_APPROVAL";
    }
  }

  if (
    envelopeRules.defaultDecision === "ALLOW" ||
    envelopeRules.defaultDecision === "DENY" ||
    envelopeRules.defaultDecision === "NEEDS_APPROVAL"
  ) {
    return envelopeRules.defaultDecision;
  }

  return null;
}

export async function evaluatePolicyEnvelopes(
  db: any,
  args: {
    tenantId?: any;
    projectId?: any;
    versionId?: any;
    toolName?: string;
    riskLevel: "GREEN" | "YELLOW" | "RED";
  }
): Promise<{ decision: ArmDecision; reason: string; source: "version" | "project" | "tenant"; envelope: any } | null> {
  const candidates: Array<{ source: "version" | "project" | "tenant"; rows: any[] }> = [];

  if (args.versionId) {
    const rows = await db
      .query("policyEnvelopes")
      .withIndex("by_version", (q: any) => q.eq("versionId", args.versionId))
      .collect();
    candidates.push({ source: "version", rows });
  }

  if (args.projectId) {
    const rows = await db
      .query("policyEnvelopes")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
    candidates.push({ source: "project", rows });
  }

  if (args.tenantId) {
    const rows = await db
      .query("policyEnvelopes")
      .withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId))
      .collect();
    candidates.push({ source: "tenant", rows });
  }

  for (const scope of candidates) {
    const active = scope.rows
      .filter((row) => row.active)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const envelope of active) {
      const decision = parseEnvelopeDecision(
        envelope.rules,
        args.toolName,
        args.riskLevel
      );
      if (decision) {
        return {
          decision,
          reason: `Policy envelope '${envelope.name}' (${scope.source}) returned ${decision}`,
          source: scope.source,
          envelope,
        };
      }
    }
  }

  return null;
}
