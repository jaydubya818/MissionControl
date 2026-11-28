import { v } from "convex/values";
import { verifyGithubWebhookSignature } from "./githubCiIngest";

export const INTAKE_PROCESS_ATTEMPTS = 3;
export const INTAKE_BODY_LIMIT = 65_536;

export const intakeSourceValidator = v.object({
  kind: v.union(v.literal("GITHUB_ISSUE"), v.literal("PRODUCT_ERROR")),
  sourceKey: v.string(),
  action: v.string(),
  actorId: v.string(),
  actorLogin: v.string(),
  bot: v.boolean(),
  title: v.string(),
  summary: v.string(),
  sourceUrl: v.string(),
  labels: v.array(v.string()),
  occurredAt: v.number(),
  releaseId: v.optional(v.id("factoryReleases")),
  application: v.optional(v.string()),
  environmentId: v.optional(v.id("environments")),
  fingerprint: v.optional(v.string()),
  severity: v.optional(v.union(v.literal("SEV1"), v.literal("SEV2"), v.literal("SEV3"), v.literal("SEV4"))),
  diagnosticUrls: v.array(v.string()),
});

export interface IntakeSource {
  kind: "GITHUB_ISSUE" | "PRODUCT_ERROR";
  sourceKey: string;
  action: string;
  actorId: string;
  actorLogin: string;
  bot: boolean;
  title: string;
  summary: string;
  sourceUrl: string;
  labels: string[];
  occurredAt: number;
  releaseId?: string;
  application?: string;
  environmentId?: string;
  fingerprint?: string;
  severity?: "SEV1" | "SEV2" | "SEV3" | "SEV4";
  diagnosticUrls: string[];
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`INTAKE_INVALID_${field}`);
  return value as Record<string, unknown>;
}

export function intakeText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`INTAKE_INVALID_${field}`);
  return value.trim();
}

export function intakeIdentifier(value: unknown, field: string): string {
  const text = intakeText(value, field, 200);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/.test(text)) throw new Error(`INTAKE_INVALID_${field}`);
  return text;
}

export function scrubIntakeText(value: string): string {
  return value
    .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/g, "[redacted private key]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g, "[redacted credential]")
    .replace(/\b(authorization|password|secret|token|api[_-]?key)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi, "$1=[redacted]");
}

export function intakeUrl(value: unknown, field: string): string {
  const url = new URL(intakeText(value, field, 2_000));
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`INTAKE_INVALID_${field}`);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function normalizeGithubIssue(payload: unknown, now: number): IntakeSource {
  const input = record(payload, "BODY");
  const issue = record(input.issue, "ISSUE");
  const sender = record(input.sender, "SENDER");
  const repository = record(input.repository, "REPOSITORY");
  const author = record(issue.user, "ISSUE_AUTHOR");
  if (issue.pull_request || !Number.isSafeInteger(issue.number) || Number(issue.number) < 1
    || !Number.isSafeInteger(sender.id) || Number(sender.id) < 1
    || !Number.isSafeInteger(repository.id) || Number(repository.id) < 1) throw new Error("INTAKE_INVALID_ISSUE_IDENTITY");
  const repoName = intakeText(repository.full_name, "REPOSITORY", 200);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)) throw new Error("INTAKE_INVALID_REPOSITORY");
  const sourceUrl = intakeUrl(issue.html_url, "ISSUE_URL");
  if (sourceUrl.toLowerCase() !== `https://github.com/${repoName}/issues/${issue.number}`.toLowerCase()) throw new Error("INTAKE_INVALID_ISSUE_URL");
  if (!Array.isArray(issue.labels) || issue.labels.length > 100) throw new Error("INTAKE_INVALID_LABELS");
  const labels = issue.labels.map((label) => intakeText(typeof label === "string" ? label : record(label, "LABEL").name, "LABEL", 100).toLowerCase());
  if (issue.body !== null && issue.body !== undefined && typeof issue.body !== "string") throw new Error("INTAKE_INVALID_BODY");
  const body = typeof issue.body === "string" ? issue.body : "";
  if (body.length > 32_000) throw new Error("INTAKE_INVALID_BODY");
  const login = intakeText(sender.login, "ACTOR", 100);
  return {
    kind: "GITHUB_ISSUE", sourceKey: `github:${repository.id}:issue:${issue.number}`,
    action: intakeText(input.action, "ACTION", 40), actorId: String(sender.id), actorLogin: login,
    bot: sender.type === "Bot" || author.type === "Bot" || login.endsWith("[bot]")
      || /<!--\s*mission-control:factory-generated\s*-->/.test(body),
    title: scrubIntakeText(intakeText(issue.title, "TITLE", 256)).slice(0, 160),
    summary: scrubIntakeText(body).slice(0, 4_000), sourceUrl, labels,
    occurredAt: now, diagnosticUrls: [],
  };
}

export function normalizeProductError(payload: unknown, now: number): IntakeSource {
  const input = record(payload, "BODY");
  const occurredAt = input.occurredAt;
  if (typeof occurredAt !== "number" || !Number.isFinite(occurredAt)
    || occurredAt > now + 300_000 || occurredAt < now - 7 * 86_400_000) throw new Error("INTAKE_INVALID_OCCURRENCE");
  const application = intakeIdentifier(input.application, "APPLICATION");
  const environmentId = intakeIdentifier(input.environmentId, "ENVIRONMENT");
  const fingerprint = intakeIdentifier(input.fingerprint, "FINGERPRINT");
  const action = intakeText(input.action, "ACTION", 40);
  if (!["detected", "recurring", "resolved"].includes(action)) throw new Error("INTAKE_INVALID_ACTION");
  const severity = intakeText(input.severity, "SEVERITY", 4) as IntakeSource["severity"];
  if (!["SEV1", "SEV2", "SEV3", "SEV4"].includes(severity!)) throw new Error("INTAKE_INVALID_SEVERITY");
  if (!Array.isArray(input.diagnosticUrls) || input.diagnosticUrls.length > 10) throw new Error("INTAKE_INVALID_DIAGNOSTICS");
  return {
    kind: "PRODUCT_ERROR", sourceKey: `product:${JSON.stringify([application, environmentId, fingerprint])}`,
    action, actorId: intakeIdentifier(input.actorId, "ACTOR"), actorLogin: "product-monitor",
    bot: input.factoryGenerated === true,
    title: scrubIntakeText(intakeText(input.title, "TITLE", 160)),
    summary: scrubIntakeText(intakeText(input.summary, "SUMMARY", 4_000)),
    sourceUrl: intakeUrl(input.sourceUrl, "SOURCE_URL"), labels: [], occurredAt,
    releaseId: intakeIdentifier(input.releaseId, "RELEASE"), application, environmentId, fingerprint, severity,
    diagnosticUrls: input.diagnosticUrls.map(url => intakeUrl(url, "DIAGNOSTIC_URL")),
  };
}

export function intakeEligibility(policy: {
  enabled: boolean; githubEnabled: boolean; productErrorsEnabled: boolean;
  githubRequiredLabel: string; githubActorIds: string[]; productActorIds: string[];
  application?: string; environmentId?: string;
}, source: IntakeSource): string | undefined {
  if (!policy.enabled) return "INTAKE_DISABLED";
  if (source.bot) return "INTAKE_FACTORY_OR_BOT_EVENT";
  if (source.kind === "GITHUB_ISSUE") {
    if (!policy.githubEnabled) return "INTAKE_GITHUB_DISABLED";
    if (!["opened", "reopened", "labeled"].includes(source.action)) return "INTAKE_ACTION_IGNORED";
    if (!policy.githubActorIds.includes(source.actorId)) return "INTAKE_ACTOR_NOT_ALLOWED";
    if (!source.labels.includes(policy.githubRequiredLabel.toLowerCase())) return "INTAKE_LABEL_REQUIRED";
  } else {
    if (!policy.productErrorsEnabled) return "INTAKE_PRODUCT_ERRORS_DISABLED";
    if (!policy.productActorIds.includes(source.actorId)) return "INTAKE_ACTOR_NOT_ALLOWED";
    if (source.application !== policy.application || source.environmentId !== policy.environmentId) return "INTAKE_APPLICATION_SCOPE_MISMATCH";
    if (source.action === "resolved") return "INTAKE_PROVIDER_RESOLUTION_ONLY";
  }
  return undefined;
}

export function productErrorSigningInput(timestamp: string, connectionKey: string, deliveryId: string, body: string) {
  return JSON.stringify([timestamp, connectionKey, deliveryId, body]);
}

export async function verifyProductErrorSignature(input: {
  body: string; timestamp: string | null; signature: string | null; secret: string; now: number;
  connectionKey: string; deliveryId: string;
}): Promise<boolean> {
  if (!input.timestamp || !/^\d{10}$/.test(input.timestamp) || !input.secret
    || Math.abs(input.now - Number(input.timestamp) * 1_000) > 300_000) return false;
  return verifyGithubWebhookSignature(productErrorSigningInput(input.timestamp, input.connectionKey, input.deliveryId, input.body), input.signature, input.secret);
}

export async function readIntakeBody(request: Request, maximum = INTAKE_BODY_LIMIT): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INTAKE_BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > maximum) throw new Error("INTAKE_BODY_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
