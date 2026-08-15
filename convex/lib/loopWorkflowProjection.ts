import { classifyFreshness, normalizeSourceUrl } from "./loopEngineering";

type Confidence = "LOW" | "MEDIUM" | "HIGH";
type SourceDecision = "PENDING" | "ACCEPTED" | "REJECTED";

export interface ProjectedLoopSource {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  publishedAt?: number;
  retrievedAt: number;
  sourceType: "PRIMARY" | "OFFICIAL_DOCS" | "RESEARCH" | "NEWS" | "VENDOR" | "COMMUNITY" | "OTHER";
  vendorClaim: boolean;
  canonicalUrl: string;
  freshness: "CURRENT" | "RECENT" | "RELEVANT" | "FOUNDATIONAL" | "STALE" | "UNKNOWN";
  decision: SourceDecision;
  decisionReason?: string;
  verifiedBy?: string;
  verifiedAt?: number;
}

export interface ProjectedLoopClaim {
  id: string;
  statement: string;
  supportingSourceIds: string[];
  contradictorySourceIds: string[];
  unsupported: boolean;
  confidence: Confidence;
  createdAt: number;
  createdBy: string;
}

export interface ProjectedLoopRecommendation {
  id: string;
  title: string;
  rationale: string;
  evidenceSourceIds: string[];
  confidence: Confidence;
  status: "PROPOSED";
}

export interface LoopWorkflowProjection {
  sources: ProjectedLoopSource[];
  claims: ProjectedLoopClaim[];
  recommendations: ProjectedLoopRecommendation[];
  conflicts: string[];
  limitations: string[];
  measurementSnapshots: unknown[];
  stopCondition?: string;
  approved: boolean;
  approvalId?: string;
  approvalEvidenceDigest?: string;
  cleanStop: boolean;
  targetPhase?: "VERIFY" | "RECOMMEND" | "AWAITING_APPROVAL" | "READY_FOR_NEXT_CYCLE";
}

const LANES = [
  ["researchLandscapeOutput", "verifyLandscapeOutput"],
  ["researchArchitectureOutput", "verifyArchitectureOutput"],
  ["researchGovernanceOutput", "verifyGovernanceOutput"],
] as const;

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return array(value)
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseDate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function canonicalSourceUrl(url: string): string {
  try {
    return normalizeSourceUrl(url);
  } catch {
    return `repo:${url.trim().toLowerCase().replace(/\\/g, "/")}`;
  }
}

function confidence(value: unknown, fallback: Confidence = "MEDIUM"): Confidence {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH"
    ? normalized
    : fallback;
}

function sourceType(value: unknown): ProjectedLoopSource["sourceType"] {
  const normalized = String(value ?? "").toUpperCase().replace(/\s+/g, "_");
  return ["PRIMARY", "OFFICIAL_DOCS", "RESEARCH", "NEWS", "VENDOR", "COMMUNITY", "OTHER"].includes(normalized)
    ? normalized as ProjectedLoopSource["sourceType"]
    : "OTHER";
}

function decisionForSource(
  source: Record<string, any>,
  decisions: Array<Record<string, any>>,
): { decision: SourceDecision; reason?: string } {
  const candidates = [source.title, source.url, source.URL]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().toLowerCase());
  const match = decisions.find((item) => {
    const reference = String(item.source ?? item.title ?? item.url ?? item.URL ?? "")
      .trim()
      .toLowerCase();
    return reference && candidates.some((candidate) =>
      candidate === reference || candidate.includes(reference) || reference.includes(candidate)
    );
  }) ?? (decisions.length === 1 ? decisions[0] : undefined);

  const raw = String(match?.decision ?? "").toUpperCase();
  if (raw.startsWith("ACCEPT")) return { decision: "ACCEPTED", reason: match?.reason };
  if (raw.startsWith("REJECT")) return { decision: "REJECTED", reason: match?.reason };
  return { decision: "PENDING" };
}

function collectTextFields(output: Record<string, any>, field: "conflicts" | "limitations"): string[] {
  return stringArray(output[field]);
}

function claimStatement(value: unknown): { statement: string; confidence: Confidence } | null {
  if (typeof value === "string" && value.trim()) {
    return { statement: value.trim(), confidence: "MEDIUM" };
  }
  const item = record(value);
  const statement = String(item.claim ?? item.statement ?? item.finding ?? "").trim();
  return statement ? { statement, confidence: confidence(item.confidence) } : null;
}

export function projectLoopWorkflowContext(
  contextValue: unknown,
  options: { workflowRunId: string; now?: number },
): LoopWorkflowProjection {
  const context = record(contextValue);
  const now = options.now ?? Date.now();
  const sources: ProjectedLoopSource[] = [];
  const claims: ProjectedLoopClaim[] = [];
  const conflicts = new Set<string>();
  const limitations = new Set<string>();

  for (const [researchKey, verifyKey] of LANES) {
    const research = record(context[researchKey]);
    const verify = record(context[verifyKey]);
    const decisions = array(verify.sourceDecisions).map(record);
    const laneSources: ProjectedLoopSource[] = [];

    for (const sourceValue of array(research.sourceLedger)) {
      const source = record(sourceValue);
      const title = String(source.title ?? source.name ?? "Untitled source").trim();
      const url = String(source.url ?? source.URL ?? source.location ?? "").trim();
      if (!url) continue;
      const canonicalUrl = canonicalSourceUrl(url);
      const sourceDecision = decisionForSource({ ...source, title, url }, decisions);
      const publishedAt = parseDate(source.publishedAt ?? source.publicationDate);
      const retrievedAt = parseDate(source.retrievedAt ?? source.retrievalDate) ?? now;
      const projected: ProjectedLoopSource = {
        id: `source-workflow-${stableHash(canonicalUrl)}`,
        title,
        url,
        publisher: typeof source.publisher === "string" ? source.publisher.trim() || undefined : undefined,
        publishedAt,
        retrievedAt,
        sourceType: sourceType(source.sourceType),
        vendorClaim: source.vendorClaim === true,
        canonicalUrl,
        freshness: classifyFreshness(publishedAt, now),
        decision: sourceDecision.decision,
        decisionReason: sourceDecision.reason,
        verifiedBy: sourceDecision.decision === "PENDING" ? undefined : "workflow-evidence-verifier",
        verifiedAt: sourceDecision.decision === "PENDING" ? undefined : now,
      };
      laneSources.push(projected);
      if (!sources.some((item) => item.canonicalUrl === canonicalUrl)) sources.push(projected);
      for (const conflict of stringArray(source.conflicts)) conflicts.add(conflict);
      for (const limitation of stringArray(source.limitations)) limitations.add(limitation);
    }

    const acceptedSourceIds = laneSources
      .filter((source) => source.decision === "ACCEPTED")
      .map((source) => source.id);

    for (const claimValue of array(verify.acceptedClaims)) {
      const parsed = claimStatement(claimValue);
      if (!parsed) continue;
      claims.push({
        id: `claim-workflow-${stableHash(`${verifyKey}:accepted:${parsed.statement}`)}`,
        statement: parsed.statement,
        supportingSourceIds: acceptedSourceIds,
        contradictorySourceIds: [],
        unsupported: acceptedSourceIds.length === 0,
        confidence: parsed.confidence,
        createdAt: now,
        createdBy: "workflow-evidence-verifier",
      });
    }
    for (const claimValue of array(verify.rejectedClaims)) {
      const parsed = claimStatement(claimValue);
      if (!parsed) continue;
      claims.push({
        id: `claim-workflow-${stableHash(`${verifyKey}:rejected:${parsed.statement}`)}`,
        statement: parsed.statement,
        supportingSourceIds: [],
        contradictorySourceIds: acceptedSourceIds,
        unsupported: true,
        confidence: "LOW",
        createdAt: now,
        createdBy: "workflow-evidence-verifier",
      });
    }

    for (const value of [...collectTextFields(research, "conflicts"), ...collectTextFields(verify, "conflicts")]) conflicts.add(value);
    for (const value of [...collectTextFields(research, "limitations"), ...collectTextFields(verify, "limitations")]) limitations.add(value);
  }

  const synthesis = record(context.synthesizeOutput);
  for (const value of collectTextFields(synthesis, "conflicts")) conflicts.add(value);
  for (const value of collectTextFields(synthesis, "limitations")) limitations.add(value);

  const acceptedSourceIds = sources
    .filter((source) => source.decision === "ACCEPTED")
    .map((source) => source.id);
  const recommendations: ProjectedLoopRecommendation[] = array(synthesis.recommendations)
    .map((value, index) => {
      const item = record(value);
      const title = typeof value === "string"
        ? value.trim()
        : String(item.title ?? item.recommendation ?? item.name ?? "").trim();
      if (!title) return null;
      return {
        id: `recommendation-workflow-${stableHash(`${index}:${title}`)}`,
        title,
        rationale: String(item.rationale ?? item.reason ?? item.description ?? title).trim(),
        evidenceSourceIds: acceptedSourceIds,
        confidence: confidence(item.confidence),
        status: "PROPOSED" as const,
      };
    })
    .filter((item): item is ProjectedLoopRecommendation => item !== null);

  const approved = String(context.approvalOutput ?? "").toUpperCase() === "APPROVED"
    && typeof context.approvalId === "string";

  return {
    sources,
    claims,
    recommendations,
    conflicts: [...conflicts],
    limitations: [...limitations],
    measurementSnapshots: array(synthesis.measurements),
    stopCondition: typeof synthesis.stopCondition === "string" ? synthesis.stopCondition : undefined,
    approved,
    approvalId: typeof context.approvalId === "string" ? context.approvalId : undefined,
    approvalEvidenceDigest: typeof context.approvalEvidenceDigest === "string"
      ? context.approvalEvidenceDigest
      : undefined,
    cleanStop: approved && recommendations.length === 0,
  };
}
