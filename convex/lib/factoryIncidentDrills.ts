export const FACTORY_INCIDENT_DRILLS = [
  {
    id: "prompt-goal-injection",
    threat: "Prompt or goal injection and malicious repository content",
    owasp: ["ASI01", "ASI06"],
    nist: ["MAP", "MANAGE"],
    containment: ["PAUSE_REPOSITORY_DISPATCH", "HOLD_PUBLICATION"],
    evidence: ["TRACE", "ATTEMPT", "AUDIT"],
  },
  {
    id: "secret-exfiltration-network",
    threat: "Secret exfiltration and unauthorized network access",
    owasp: ["ASI02", "ASI05"],
    nist: ["GOVERN", "MANAGE"],
    containment: ["REVOKE_ATTEMPT_CREDENTIALS", "CANCEL_ATTEMPT"],
    evidence: ["TOOL_CALL", "SANDBOX", "AUDIT"],
  },
  {
    id: "tool-mcp-poisoning",
    threat: "Tool misuse, MCP poisoning, and unexpected code execution",
    owasp: ["ASI02", "ASI04"],
    nist: ["MAP", "MEASURE", "MANAGE"],
    containment: ["QUARANTINE_TOOL", "CANCEL_ATTEMPT"],
    evidence: ["TOOL_CALL", "EVIDENCE", "ATTEMPT"],
  },
  {
    id: "identity-approval-bypass",
    threat: "Identity or privilege abuse and human-approval bypass",
    owasp: ["ASI03", "ASI09"],
    nist: ["GOVERN", "MANAGE"],
    containment: ["PAUSE_WORKSPACE_DISPATCH", "HOLD_PUBLICATION"],
    evidence: ["AUDIT", "WORK_ORDER", "ATTEMPT"],
  },
  {
    id: "sandbox-policy-mutation",
    threat: "Sandbox escape or containment-policy mutation",
    owasp: ["ASI05", "ASI08"],
    nist: ["MEASURE", "MANAGE"],
    containment: ["QUARANTINE_WORKER", "PAUSE_REPOSITORY_DISPATCH"],
    evidence: ["SANDBOX", "TRACE", "AUDIT"],
  },
  {
    id: "candidate-evidence-substitution",
    threat: "Candidate, evidence, verifier, or publication substitution",
    owasp: ["ASI06", "ASI07"],
    nist: ["MAP", "MEASURE", "MANAGE"],
    containment: ["HOLD_PUBLICATION", "QUARANTINE_FACTORY_VERSION"],
    evidence: ["EVIDENCE", "PULL_REQUEST", "FACTORY_VERSION"],
  },
  {
    id: "supply-chain-compromise",
    threat: "Agent, tool, model, or supply-chain compromise",
    owasp: ["ASI04", "ASI08"],
    nist: ["GOVERN", "MAP", "MANAGE"],
    containment: ["QUARANTINE_HARNESS", "QUARANTINE_MODEL_ROUTE", "QUARANTINE_TOOL"],
    evidence: ["MODEL_ROUTE", "FACTORY_VERSION", "AUDIT"],
  },
  {
    id: "cross-company-leakage",
    threat: "Cross-company data or authority leakage",
    owasp: ["ASI03", "ASI09"],
    nist: ["GOVERN", "MEASURE", "MANAGE"],
    containment: ["PAUSE_WORKSPACE_DISPATCH", "REVOKE_ATTEMPT_CREDENTIALS"],
    evidence: ["AUDIT", "TRACE", "EVIDENCE"],
  },
  {
    id: "rogue-agent-cascade",
    threat: "Rogue agents, insecure inter-agent messages, and cascading failures",
    owasp: ["ASI07", "ASI10"],
    nist: ["MAP", "MEASURE", "MANAGE"],
    containment: ["QUARANTINE_WORKER", "PAUSE_WORKSPACE_DISPATCH"],
    evidence: ["TRACE", "AUDIT", "ATTEMPT"],
  },
  {
    id: "runaway-cost-provider",
    threat: "Runaway loops, token or cost explosion, and provider outage",
    owasp: ["ASI10"],
    nist: ["MEASURE", "MANAGE"],
    containment: ["CANCEL_ATTEMPT", "DISABLE_GUARDED_AUTO", "QUARANTINE_MODEL_ROUTE"],
    evidence: ["MODEL_ROUTE", "ATTEMPT", "TRACE"],
  },
  {
    id: "production-regression",
    threat: "Failed deployment or production regression",
    owasp: ["ASI06", "ASI10"],
    nist: ["MEASURE", "MANAGE"],
    containment: ["HOLD_RELEASE", "PAUSE_REPOSITORY_DISPATCH"],
    evidence: ["RELEASE", "PULL_REQUEST", "EVIDENCE"],
  },
  {
    id: "evaluation-regression",
    threat: "Evaluation regression or confidence invalidation",
    owasp: ["ASI06", "ASI08"],
    nist: ["GOVERN", "MEASURE", "MANAGE"],
    containment: ["HOLD_PUBLICATION", "QUARANTINE_FACTORY_VERSION"],
    evidence: ["EVIDENCE", "FACTORY_VERSION", "AUDIT"],
  },
] as const;

export function validateFactoryIncidentDrillCatalog() {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const drill of FACTORY_INCIDENT_DRILLS) {
    if (ids.has(drill.id)) errors.push(`duplicate:${drill.id}`);
    ids.add(drill.id);
    if ((drill.owasp as readonly string[]).length === 0) errors.push(`missing-owasp:${drill.id}`);
    if (!drill.nist.includes("MANAGE")) errors.push(`missing-manage:${drill.id}`);
    if ((drill.containment as readonly string[]).length === 0) errors.push(`missing-containment:${drill.id}`);
    if ((drill.evidence as readonly string[]).length === 0) errors.push(`missing-evidence:${drill.id}`);
  }
  return { valid: errors.length === 0, errors, drillCount: FACTORY_INCIDENT_DRILLS.length };
}
