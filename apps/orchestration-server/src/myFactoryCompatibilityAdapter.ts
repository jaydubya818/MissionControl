import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { canonicalJson, canonicalDigest, factoryDelegationBindingDigest, parseFactoryDelegationBinding,
  type FactoryDelegationBinding } from "@mission-control/shared";

export const COMPATIBILITY_PROTOCOL = "MISSIONCONTROL_MYFACTORY_FIXTURE_V1";
export const MYFACTORY_COMPATIBILITY_SHA = "fa48a820ba185eb9b891130c78166463b61cba74";
type Operation = "ADMIT" | "STATUS" | "CANCEL" | "RESULT";
export interface FixtureKey {
  id: string; secret: Uint8Array; tenantId: string; projectId: string; factoryId: string;
  validUntil: number; revoked: boolean;
}
export interface FixtureEnvelope {
  protocol: typeof COMPATIBILITY_PROTOCOL; keyId: string; tenantId: string; projectId: string;
  factoryId: string; bindingDigest: string; operation: Operation; nonce: string;
  expiresAt: number; payload: unknown; requestDigest: string | null;
}
export interface SignedFixtureEnvelope { envelope: FixtureEnvelope; signature: string }
const fail = () => new Error("FACTORY_COMPATIBILITY_DENIED");
export function signFixtureEnvelope(envelope: FixtureEnvelope, key: FixtureKey, direction: "REQUEST" | "RESPONSE"): SignedFixtureEnvelope {
  if (key.secret.byteLength < 32) throw fail();
  return { envelope, signature: createHmac("sha256", key.secret)
    .update(`${COMPATIBILITY_PROTOCOL}:${direction}\0${canonicalJson(envelope)}`).digest("hex") };
}
export function verifyFixtureEnvelope(input: unknown, key: FixtureKey, direction: "REQUEST" | "RESPONSE",
  expected: { bindingDigest: string; operation: Operation; requestDigest: string | null }, now: number): FixtureEnvelope {
  try {
    if (Buffer.byteLength(JSON.stringify(input)) > 16 * 1024 * 1024) throw fail();
    if (!input || typeof input !== "object" || Object.keys(input).sort().join() !== "envelope,signature") throw fail();
    const { envelope: e, signature } = input as SignedFixtureEnvelope;
    if (!e || Object.keys(e).sort().join() !== "bindingDigest,expiresAt,factoryId,keyId,nonce,operation,payload,projectId,protocol,requestDigest,tenantId"
      || e.protocol !== COMPATIBILITY_PROTOCOL || e.keyId !== key.id || key.revoked || key.validUntil <= now
      || e.tenantId !== key.tenantId || e.projectId !== key.projectId || e.factoryId !== key.factoryId
      || e.bindingDigest !== expected.bindingDigest || e.operation !== expected.operation || e.requestDigest !== expected.requestDigest
      || !Number.isSafeInteger(e.expiresAt) || e.expiresAt <= now || e.expiresAt > now + 60_000 || e.expiresAt > key.validUntil
      || typeof e.nonce !== "string" || !/^[a-f0-9-]{36}$/.test(e.nonce)
      || typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) throw fail();
    const computed = signFixtureEnvelope(e, key, direction).signature;
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"))) throw fail();
    return e;
  } catch { throw fail(); }
}
export interface TrialObservation {
  revision: number; state: "PREPARED" | "RUNNING" | "STOPPING" | "COMPLETED" | "FAILED" | "CANCELLED" | "UNKNOWN";
  partnerWorkOrderId: string; partnerRunId: string; receiptDigest: string;
  settlement?: { actualMicrousd: number; cleanupConfirmed: true };
}
export interface CompatibilityTrialStore {
  read(): Promise<{ binding: unknown; partnerWorkOrderId?: string; partnerRunId?: string; closed: boolean; cancelRequested: boolean }>;
  claim(): Promise<boolean>;
  cancel(): Promise<void>;
  observe(observation: TrialObservation): Promise<void>;
}
export interface VerifiedPartnerManifest {
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  execution: { requestDigest: string; inputCommit: string; inputTree?: string; configurationDigest: string;
    configuration: { model: string; cloud?: { verificationPolicySha256: string } } };
  candidate: { commit: string; tree: string; base: string } | null;
  evidenceDigest: string; artifactDigest: string;
  verification?: { outcome: "PASS" | "FAIL" | "UNKNOWN"; workId: string; workGeneration: number; policySha256: string };
}
export interface PartnerCompatibilityContract {
  sourceSha: typeof MYFACTORY_COMPATIBILITY_SHA;
  parsePrepare(input: unknown, binding: FactoryDelegationBinding, now: number): unknown;
  requestDigest(input: unknown): string;
  verifyResult(input: unknown, expected: { factoryId: string; factoryVersion: string; requestId: string;
    workOrderId: string; runId: string; now: number }): { manifest: VerifiedPartnerManifest; keyValidForCurrentUse: boolean };
}
export interface EnterpriseResultProjection {
  producerOutcome: VerifiedPartnerManifest["status"];
  candidate: VerifiedPartnerManifest["candidate"];
  independentVerification: "PASS" | "FAIL" | "UNKNOWN" | "NOT_RUN";
  factoryResult: "AUTHENTICATED";
  evidenceDigest: string; artifactDigest: string;
  enterpriseQualityGate: "NOT_EVALUATED"; humanAcceptance: "PENDING"; publication: "NOT_AUTHORIZED";
}
export function mapPartnerResult(input: unknown, binding: FactoryDelegationBinding,
  partner: PartnerCompatibilityContract, identity: { workOrderId: string; runId: string }, now: number): EnterpriseResultProjection {
  if (partner.sourceSha !== MYFACTORY_COMPATIBILITY_SHA) throw fail();
  const { manifest: m, keyValidForCurrentUse } = partner.verifyResult(input, { ...identity, factoryId: binding.factoryId,
    factoryVersion: binding.factoryVersion, requestId: binding.partnerRequestId, now });
  if (!keyValidForCurrentUse || m.execution.requestDigest !== binding.partnerRequestDigest
    || m.execution.inputCommit !== binding.baseCommit || m.execution.inputTree !== binding.baseTree
    || `sha256:${m.execution.configurationDigest}` !== binding.executionProfileDigest
    || canonicalDigest("factory-fixture-model/v1", { model: m.execution.configuration.model, evidenceClass: "DETERMINISTIC" }) !== binding.modelPolicyDigest
    || `sha256:${m.execution.configuration.cloud?.verificationPolicySha256}` !== binding.verificationPolicyDigest
    || (m.verification && (m.verification.workId !== binding.partnerWorkId || m.verification.workGeneration !== binding.partnerWorkGeneration
      || `sha256:${m.verification.policySha256}` !== binding.verificationPolicyDigest))) throw fail();
  return { producerOutcome: m.status, candidate: m.candidate, independentVerification: m.verification?.outcome ?? "NOT_RUN",
    factoryResult: "AUTHENTICATED", evidenceDigest: m.evidenceDigest, artifactDigest: m.artifactDigest,
    enterpriseQualityGate: "NOT_EVALUATED", humanAcceptance: "PENDING", publication: "NOT_AUTHORIZED" };
}
function observation(value: unknown): TrialObservation {
  if (!value || typeof value !== "object") throw fail();
  const r = value as TrialObservation;
  const keys = Object.keys(value).sort().join();
  if (keys !== "partnerRunId,partnerWorkOrderId,revision,state" && keys !== "partnerRunId,partnerWorkOrderId,revision,settlement,state") throw fail();
  if (!Number.isSafeInteger(r.revision) || r.revision < 1
    || !["PREPARED", "RUNNING", "STOPPING", "COMPLETED", "FAILED", "CANCELLED", "UNKNOWN"].includes(r.state)
    || !/^[A-Za-z0-9_-]{1,200}$/.test(r.partnerRunId) || !/^[A-Za-z0-9_-]{1,200}$/.test(r.partnerWorkOrderId)) throw fail();
  if (r.settlement && (Object.keys(r.settlement).sort().join() !== "actualMicrousd,cleanupConfirmed"
    || !Number.isSafeInteger(r.settlement.actualMicrousd) || r.settlement.actualMicrousd < 0 || r.settlement.cleanupConfirmed !== true
    || !["COMPLETED", "FAILED", "CANCELLED"].includes(r.state))) throw fail();
  return { ...r, receiptDigest: canonicalDigest("factory-fixture-receipt/v1", value) };
}
export async function callFixtureTransport(options: { endpoint: string; requestKey: FixtureKey; responseKey: FixtureKey; now: () => number },
  operation: Operation, binding: FactoryDelegationBinding, payload: unknown) {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash || endpoint.pathname !== "/compatibility"
    || options.requestKey.secret.byteLength < 32 || options.responseKey.secret.byteLength < 32
    || ["tenantId", "projectId", "factoryId"].some(field => options.requestKey[field as "tenantId" | "projectId" | "factoryId"] !== options.responseKey[field as "tenantId" | "projectId" | "factoryId"])
    || Buffer.from(options.requestKey.secret).equals(Buffer.from(options.responseKey.secret))) throw fail();
    const now = options.now(), k = options.requestKey;
    if (k.revoked || k.validUntil <= now || k.tenantId !== binding.tenantId || k.projectId !== binding.projectId || k.factoryId !== binding.factoryId) throw fail();
    const envelope: FixtureEnvelope = { protocol: COMPATIBILITY_PROTOCOL, keyId: k.id, tenantId: binding.tenantId,
      projectId: binding.projectId, factoryId: binding.factoryId, bindingDigest: factoryDelegationBindingDigest(binding),
      operation, nonce: randomUUID(), expiresAt: Math.min(now + 30_000, k.validUntil), payload, requestDigest: null };
    const signed = signFixtureEnvelope(envelope, k, "REQUEST");
    const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "content-type": "application/json" }, body: JSON.stringify(signed) });
    if (!response.ok || !response.body) throw fail();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 16 * 1024 * 1024) throw fail(); chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = verifyFixtureEnvelope(raw, options.responseKey, "RESPONSE",
      { bindingDigest: envelope.bindingDigest, operation, requestDigest: canonicalDigest("factory-fixture-request/v1", signed) }, options.now());
    return { payload: result.payload, authenticatedResponse: raw };
}

export class MyFactoryCompatibilityAdapter {
  private readonly endpoint: URL;
  constructor(private readonly options: { endpoint: string; requestKey: FixtureKey; responseKey: FixtureKey;
    store: CompatibilityTrialStore; partner: PartnerCompatibilityContract; now?: () => number }) {
    const url = new URL(options.endpoint);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password
      || url.search || url.hash || url.pathname !== "/compatibility" || options.partner.sourceSha !== MYFACTORY_COMPATIBILITY_SHA
      || options.requestKey.secret.byteLength < 32 || options.responseKey.secret.byteLength < 32
      || ["tenantId", "projectId", "factoryId"].some(field => options.requestKey[field as "tenantId" | "projectId" | "factoryId"] !== options.responseKey[field as "tenantId" | "projectId" | "factoryId"])
      || Buffer.from(options.requestKey.secret).equals(Buffer.from(options.responseKey.secret))) throw fail();
    this.endpoint = url;
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private async call(operation: Operation, binding: FactoryDelegationBinding, payload: unknown): Promise<unknown> {
    return (await callFixtureTransport({ ...this.options, endpoint: this.endpoint.toString(), now: () => this.now() }, operation, binding, payload)).payload;
  }

  async admit(request: unknown): Promise<"OBSERVED" | "ALREADY_CLAIMED" | "UNKNOWN"> {
    const t = await this.options.store.read(), b = parseFactoryDelegationBinding(t.binding);
    if (this.now() < b.issuedAt || this.now() >= b.expiresAt || t.closed || t.cancelRequested) throw fail();
    const parsed = this.options.partner.parsePrepare(request, b, this.now());
    if (this.options.partner.requestDigest(parsed) !== b.partnerRequestDigest) throw fail();
    if (!await this.options.store.claim()) return "ALREADY_CLAIMED";
    try { await this.options.store.observe(observation(await this.call("ADMIT", b, parsed))); return "OBSERVED"; }
    catch { return "UNKNOWN"; }
  }
  async status(): Promise<"OBSERVED" | "UNKNOWN"> {
    const t = await this.options.store.read(), b = parseFactoryDelegationBinding(t.binding);
    try { await this.options.store.observe(observation(await this.call("STATUS", b, { requestId: b.partnerRequestId }))); return "OBSERVED"; }
    catch { return "UNKNOWN"; }
  }
  async cancel(): Promise<"OBSERVED" | "UNKNOWN" | "CLOSED"> {
    await this.options.store.cancel();
    const t = await this.options.store.read(); if (t.closed) return "CLOSED";
    const b = parseFactoryDelegationBinding(t.binding);
    try { await this.options.store.observe(observation(await this.call("CANCEL", b, { requestId: b.partnerRequestId }))); return "OBSERVED"; }
    catch { return "UNKNOWN"; }
  }
  async result(): Promise<EnterpriseResultProjection> {
    const t = await this.options.store.read(), b = parseFactoryDelegationBinding(t.binding);
    if (!t.partnerRunId || !t.partnerWorkOrderId) throw fail();
    return mapPartnerResult(await this.call("RESULT", b, { requestId: b.partnerRequestId }), b, this.options.partner,
      { workOrderId: t.partnerWorkOrderId, runId: t.partnerRunId }, this.now());
  }
}
