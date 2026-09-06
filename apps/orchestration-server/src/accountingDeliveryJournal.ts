import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, link, unlink, rename, opendir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { liabilityDigest } from "../../../convex/lib/providerLiability.js";
import type { BedrockSettlementPayload } from "./bedrockInferenceBridge.js";

export const ACCOUNTING_CAPTURE_CAPACITY = 4096;
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/=-]{0,255}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const subjectSchema = z.strictObject({ reservationId: identity, workflowRunId: identity, leaseId: identity, generation: integer.min(1) });
const usageSchema = z.strictObject({ requestId: identity, requestDigest: digest, provider: identity, model: identity,
  providerRequestId: identity, usageId: identity, inputTokens: integer, outputTokens: integer,
  classification: z.literal("ACTUAL"), expectedReceiptRevision: integer });
const payloadSchema = subjectSchema.extend({ usage: usageSchema });
const scopeSchema = z.strictObject({ backendUrl: z.string().url(), projectId: identity, repositoryId: identity });
const metadataSchema = z.strictObject({ schema: z.literal("factory-accounting-journal/v1"), journalId: z.string().uuid(), scope: scopeSchema });
const intentSchema = z.strictObject({ schema: z.literal("factory-accounting-capture-intent/v1"), journalId: z.string().uuid(),
  projectId: identity, repositoryId: identity, createdAt: integer, subject: subjectSchema, requestId: identity,
  requestDigest: digest, evidenceClass: z.enum(["OFFLINE_FIXTURE", "APPROVED_QUALIFICATION"]), digest });
const observationSchema = z.strictObject({ schema: z.literal("factory-accounting-observation/v1"), journalId: z.string().uuid(),
  projectId: identity, repositoryId: identity, capturedAt: integer, intentDigest: digest,
  evidenceClass: z.enum(["OFFLINE_FIXTURE", "APPROVED_QUALIFICATION"]), payload: payloadSchema, digest });
const ackSchema = z.strictObject({ schema: z.literal("factory-accounting-delivery-ack/v1"), observationDigest: digest,
  payloadDigest: digest, acknowledgedAt: integer, duplicate: z.boolean(), incident: z.boolean() });
const statusSchema = z.strictObject({ schema: z.literal("factory-accounting-delivery-status/v1"), observationDigest: digest,
  state: z.enum(["PENDING", "BLOCKED_REVIEW", "SUSPENDED"]), attempts: integer,
  lastAttemptAt: integer, nextAttemptAt: integer, errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/) });
export type AccountingScope = z.infer<typeof scopeSchema>;
export type AccountingObservation = z.infer<typeof observationSchema>;
export type AccountingAcknowledgment = Pick<z.infer<typeof ackSchema>, "duplicate" | "incident">;
export type AccountingDeliveryStatus = z.infer<typeof statusSchema>;
export type AccountingCaptureIntent = Pick<z.infer<typeof intentSchema>, "subject" | "requestId" | "requestDigest" | "evidenceClass">;
export interface AccountingTicket { journalId: string; slot: string; intentDigest: string }
export interface AccountingReference { journalId: string; slot: string; observationDigest: string; state: "PENDING" | "ACKNOWLEDGED" }
export type AccountingSlot = { state: "EMPTY" | "INCOMPLETE" } | { state: "ACKNOWLEDGED" | "PENDING" | "BLOCKED_REVIEW" | "SUSPENDED";
  observation: AccountingObservation; reference: AccountingReference; delivery?: AccountingDeliveryStatus; acknowledgment?: AccountingAcknowledgment };
export type AccountingStorageBoundary = "DIRECTORY_SYNC" | "FILE_SYNC" | "PUBLISH" | "ACK_SYNC";

function fail(code: string): never { throw new Error(code); }
async function validateOriginalAncestors(directory: string, allowTemporaryFixture: boolean) {
  const root = path.parse(directory).root;
  let current = root;
  const directories = [root, ...directory.slice(root.length).split(path.sep).filter(Boolean).map((part) => { current = path.join(current, part); return current; })];
  for (const ancestor of directories) {
    const stat = await lstat(ancestor);
    if (stat.uid !== 0 && stat.uid !== process.getuid?.()) fail("ACCOUNTING_DIRECTORY_UNSAFE");
    if (stat.isSymbolicLink()) {
      // Every original parent has already passed before resolving this alias.
      await validateOriginalAncestors(await realpath(ancestor), allowTemporaryFixture);
    } else if (!stat.isDirectory() || ((stat.mode & 0o022) && !(allowTemporaryFixture && (stat.mode & 0o1000)))) fail("ACCOUNTING_DIRECTORY_UNSAFE");
  }
}
function assertDigest(value: { digest: string }) {
  const { digest: expected, ...body } = value;
  if (liabilityDigest(body) !== expected) fail("ACCOUNTING_DIGEST_MISMATCH");
}
export function accountingPayloadDigest(payload: BedrockSettlementPayload) { return liabilityDigest(payloadSchema.parse(payload)); }
export function normalizeAccountingScope(input: AccountingScope): AccountingScope {
  const scope = scopeSchema.parse(input), url = new URL(scope.backendUrl);
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) fail("ACCOUNTING_SCOPE_INVALID");
  return { ...scope, backendUrl: url.toString().replace(/\/$/, "") };
}

/** Host retention only. No provider or financial authority exists in this module. */
export class AccountingDeliveryJournal {
  private readonly temporaryFiles = new Map<string, string>();
  private constructor(readonly directory: string, readonly scope: AccountingScope, readonly journalId: string,
    private readonly rootIdentity: { dev: number; ino: number },
    private readonly now: () => number,
    private readonly boundary?: (point: AccountingStorageBoundary, file: string) => Promise<void>) {}

  static async open(options: { directory: string; scope: AccountingScope; excludedDirectories?: string[];
    /** Explicit fixture injection only; runtime configuration never sets this. */
    allowTemporaryFixture?: boolean; now?: () => number;
    onBoundary?: (point: AccountingStorageBoundary, file: string) => Promise<void> }) {
    if (!options.directory || !path.isAbsolute(options.directory)) fail("ACCOUNTING_DIRECTORY_REQUIRED");
    const scope = normalizeAccountingScope(options.scope);
    const requested = path.resolve(options.directory);
    await validateOriginalAncestors(path.dirname(requested), Boolean(options.allowTemporaryFixture));
    const parent = await realpath(path.dirname(requested));
    const directory = path.join(parent, path.basename(requested));
    const exclusions = [process.cwd(), ...(options.excludedDirectories ?? []),
      ...(!options.allowTemporaryFixture ? [await realpath(os.tmpdir()), "/tmp", "/private/tmp"] : [])];
    for (const excluded of exclusions) {
      const base = path.resolve(excluded);
      if (directory === base || directory.startsWith(base + path.sep)) fail("ACCOUNTING_DIRECTORY_UNSAFE");
    }
    for (let ancestor = parent; ; ancestor = path.dirname(ancestor)) {
      const stat = await lstat(ancestor);
      const uid = process.getuid?.();
      if (!stat.isDirectory() || (stat.uid !== 0 && stat.uid !== uid)
        || ((stat.mode & 0o022) !== 0 && !(options.allowTemporaryFixture && (stat.mode & 0o1000)))) fail("ACCOUNTING_DIRECTORY_UNSAFE");
      if (ancestor === path.dirname(ancestor)) break;
    }
    await mkdir(directory, { mode: 0o700 }).catch((e) => { if (e.code !== "EEXIST") throw e; });
    const root = await lstat(directory);
    if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid?.() || (root.mode & 0o077)) fail("ACCOUNTING_DIRECTORY_UNSAFE");
    const provisional = new AccountingDeliveryJournal(directory, scope, randomUUID(), { dev: root.dev, ino: root.ino }, options.now ?? Date.now, options.onBoundary);
    await provisional.syncDirectory(parent);
    await provisional.ensureDirectory(path.join(directory, "entries"));
    const proposed = { schema: "factory-accounting-journal/v1" as const, journalId: provisional.journalId, scope };
    await provisional.publish(path.join(directory, "journal.json"), proposed, 8192, false);
    const metadata = metadataSchema.parse(await provisional.read(path.join(directory, "journal.json"), 8192));
    if (liabilityDigest(metadata.scope) !== liabilityDigest(scope)) fail("ACCOUNTING_SCOPE_MISMATCH");
    return new AccountingDeliveryJournal(directory, scope, metadata.journalId, { dev: root.dev, ino: root.ino }, options.now ?? Date.now, options.onBoundary);
  }

  async prepare(input: AccountingCaptureIntent): Promise<AccountingTicket> {
    await this.assertRoot();
    const body = { schema: "factory-accounting-capture-intent/v1" as const, journalId: this.journalId,
      projectId: this.scope.projectId, repositoryId: this.scope.repositoryId, createdAt: this.now(), ...structuredClone(input) };
    const intent = intentSchema.parse({ ...body, digest: liabilityDigest(body) });
    for (let index = 0; index < ACCOUNTING_CAPTURE_CAPACITY; index++) {
      const slot = String(index).padStart(4, "0"), directory = this.slotPath(slot);
      try { await mkdir(directory, { mode: 0o700 }); } catch (error: any) { if (error.code === "EEXIST") continue; throw error; }
      await this.syncDirectory(path.dirname(directory));
      await this.publish(path.join(directory, "intent.json"), intent, 8192);
      return { journalId: this.journalId, slot, intentDigest: intent.digest };
    }
    return fail("ACCOUNTING_CAPACITY_EXHAUSTED");
  }

  async capture(ticket: AccountingTicket, input: BedrockSettlementPayload): Promise<AccountingReference> {
    await this.assertRoot();
    const intent = await this.intent(ticket.slot);
    if (ticket.journalId !== this.journalId || ticket.intentDigest !== intent.digest) fail("ACCOUNTING_INTENT_MISMATCH");
    const payload = payloadSchema.parse(structuredClone(input));
    this.assertPayload(intent, payload);
    const body = { schema: "factory-accounting-observation/v1" as const, journalId: this.journalId,
      projectId: this.scope.projectId, repositoryId: this.scope.repositoryId, capturedAt: this.now(),
      intentDigest: intent.digest, evidenceClass: intent.evidenceClass, payload };
    const observation = observationSchema.parse({ ...body, digest: liabilityDigest(body) });
    await this.publish(path.join(this.slotPath(ticket.slot), "observation.json"), observation, 65536);
    return { journalId: this.journalId, slot: ticket.slot, observationDigest: observation.digest, state: "PENDING" };
  }

  async inspect(slot: string): Promise<AccountingSlot> {
    await this.assertRoot();
    const directory = this.slotPath(slot);
    try { await this.assertDirectory(directory); } catch (e: any) { if (e.code === "ENOENT") return { state: "EMPTY" }; throw e; }
    let intent;
    try { intent = await this.intent(slot); } catch (e: any) { if (e.code === "ENOENT") return { state: "INCOMPLETE" }; throw e; }
    let raw = await this.optionalRead(path.join(directory, "observation.json"), 65536);
    if (!raw) {
      const pending = await this.pendingFiles(directory, "observation.json");
      if (pending.length > 1) fail("ACCOUNTING_CAPTURE_CONFLICT");
      if (pending.length === 1) {
        raw = await this.read(pending[0], 65536);
        this.validateObservation(raw, intent);
        const handle = await open(pending[0], constants.O_RDONLY | constants.O_NOFOLLOW);
        try { await handle.sync(); } finally { await handle.close(); }
        await this.publish(path.join(directory, "observation.json"), raw, 65536);
      } else return { state: "INCOMPLETE" };
    }
    const observation = this.validateObservation(raw, intent);
    const reference: AccountingReference = { journalId: this.journalId, slot, observationDigest: observation.digest, state: "PENDING" };
    const ackRaw = await this.optionalRead(path.join(directory, "ack.json"), 8192);
    if (ackRaw) {
      const ack = ackSchema.parse(ackRaw);
      if (ack.observationDigest !== observation.digest || ack.payloadDigest !== accountingPayloadDigest(observation.payload)) fail("ACCOUNTING_ACK_MISMATCH");
      // A visible final name may come from a failed/interrupted directory sync.
      // Establish durability before treating it as an acknowledgment.
      const ackHandle = await open(path.join(directory, "ack.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { await ackHandle.sync(); } finally { await ackHandle.close(); }
      await this.syncDirectory(directory);
      return { state: "ACKNOWLEDGED", observation, reference: { ...reference, state: "ACKNOWLEDGED" }, acknowledgment: { duplicate: ack.duplicate, incident: ack.incident } };
    }
    const deliveryRaw = await this.optionalRead(path.join(directory, "delivery.json"), 4096);
    const delivery = deliveryRaw ? statusSchema.parse(deliveryRaw) : undefined;
    if (delivery && delivery.observationDigest !== observation.digest) fail("ACCOUNTING_STATUS_MISMATCH");
    return { state: delivery?.state ?? "PENDING", observation, reference, delivery };
  }

  async acknowledge(reference: AccountingReference, result: AccountingAcknowledgment) {
    const current = await this.boundObservation(reference);
    if (current.state === "ACKNOWLEDGED") return;
    const ack = ackSchema.parse({ schema: "factory-accounting-delivery-ack/v1", observationDigest: current.observation.digest,
      payloadDigest: accountingPayloadDigest(current.observation.payload), acknowledgedAt: this.now(), ...result });
    await this.publish(path.join(this.slotPath(reference.slot), "ack.json"), ack, 8192, false);
    const verified = await this.inspect(reference.slot);
    if (verified.state !== "ACKNOWLEDGED") fail("ACCOUNTING_ACK_MISMATCH");
  }

  async recordFailure(reference: AccountingReference, state: AccountingDeliveryStatus["state"], errorCode: string) {
    const current = await this.boundObservation(reference);
    if (current.state === "ACKNOWLEDGED") return;
    const attempts = Math.min(Number.MAX_SAFE_INTEGER, (current.delivery?.attempts ?? 0) + 1), now = this.now();
    const delay = [30000, 60000, 120000, 300000][Math.min(attempts - 1, 3)];
    const delivery = statusSchema.parse({ schema: "factory-accounting-delivery-status/v1", observationDigest: reference.observationDigest,
      state, attempts, lastAttemptAt: now, nextAttemptAt: now + delay, errorCode });
    const target = path.join(this.slotPath(reference.slot), "delivery.json");
    await this.publish(target, delivery, 4096, true, true);
  }

  async boundObservation(reference: AccountingReference) {
    if (reference.journalId !== this.journalId) fail("ACCOUNTING_SCOPE_MISMATCH");
    const current = await this.inspect(reference.slot);
    if (!("observation" in current) || current.observation.digest !== reference.observationDigest) fail("ACCOUNTING_OBSERVATION_MISMATCH");
    return current;
  }

  private assertPayload(intent: z.infer<typeof intentSchema>, payload: BedrockSettlementPayload) {
    const { usage, ...subject } = payload;
    if (liabilityDigest(subject) !== liabilityDigest(intent.subject) || usage.requestId !== intent.requestId
      || usage.requestDigest !== intent.requestDigest) fail("ACCOUNTING_INTENT_MISMATCH");
  }
  private validateObservation(raw: unknown, intent: z.infer<typeof intentSchema>) {
    const observation = observationSchema.parse(raw); assertDigest(observation);
    if (observation.journalId !== this.journalId || observation.projectId !== this.scope.projectId
      || observation.repositoryId !== this.scope.repositoryId || observation.intentDigest !== intent.digest
      || observation.evidenceClass !== intent.evidenceClass) fail("ACCOUNTING_SCOPE_MISMATCH");
    this.assertPayload(intent, observation.payload);
    return observation;
  }
  private async intent(slot: string) {
    const value = intentSchema.parse(await this.read(path.join(this.slotPath(slot), "intent.json"), 8192)); assertDigest(value);
    if (value.journalId !== this.journalId || value.projectId !== this.scope.projectId || value.repositoryId !== this.scope.repositoryId) fail("ACCOUNTING_SCOPE_MISMATCH");
    return value;
  }
  private slotPath(slot: string) {
    if (!/^\d{4}$/.test(slot) || Number(slot) >= ACCOUNTING_CAPTURE_CAPACITY) fail("ACCOUNTING_SLOT_INVALID");
    return path.join(this.directory, "entries", slot);
  }
  private async assertDirectory(directory: string) {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) fail("ACCOUNTING_DIRECTORY_UNSAFE");
    return stat;
  }
  private async assertRoot() {
    const stat = await this.assertDirectory(this.directory);
    if (stat.dev !== this.rootIdentity.dev || stat.ino !== this.rootIdentity.ino) fail("ACCOUNTING_ROOT_CHANGED");
    await this.assertDirectory(path.join(this.directory, "entries"));
  }
  private async ensureDirectory(directory: string) {
    await mkdir(directory, { mode: 0o700 }).catch((e) => { if (e.code !== "EEXIST") throw e; });
    await this.assertDirectory(directory); await this.syncDirectory(path.dirname(directory));
  }
  private async syncDirectory(directory: string) {
    const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await handle.sync(); await this.boundary?.("DIRECTORY_SYNC", directory); } finally { await handle.close(); }
  }
  private async pendingFiles(directory: string, name: string) {
    const result: string[] = [], entries = await opendir(directory); let count = 0;
    for await (const entry of entries) {
      if (++count > 32) fail("ACCOUNTING_DIRECTORY_CONTENT_INVALID");
      if (entry.name.startsWith(`.${name}.`) && entry.name.endsWith(".tmp")) result.push(path.join(directory, entry.name));
    }
    return result;
  }
  private async read(file: string, maximum: number): Promise<any> {
    await this.assertDirectory(path.dirname(file));
    // Nonblocking open lets fstat reject FIFOs/devices before any read can hang.
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.size > maximum || stat.size < 2) fail("ACCOUNTING_FILE_INVALID");
      if (stat.nlink !== 1) {
        const candidates = await this.pendingFiles(path.dirname(file), path.basename(file));
        const paired = await Promise.all(candidates.map(async (candidate) => { const other = await lstat(candidate); return other.isFile() && other.ino === stat.ino && other.dev === stat.dev; }));
        if (stat.nlink !== 2 || paired.filter(Boolean).length !== 1) fail("ACCOUNTING_FILE_LINKED");
      }
      return JSON.parse(await handle.readFile("utf8"));
    } finally { await handle.close(); }
  }
  private async optionalRead(file: string, maximum: number) { try { return await this.read(file, maximum); } catch (e: any) { if (e.code === "ENOENT") return undefined; throw e; } }
  private async publish(target: string, value: unknown, maximum: number, exactExisting = true, replace = false) {
    const bytes = Buffer.from(JSON.stringify(value)); if (bytes.length > maximum) fail("ACCOUNTING_FILE_TOO_LARGE");
    const directory = path.dirname(target); await this.assertDirectory(directory);
    // A writer retains its failed temporary; retries cannot create more files.
    // Four exclusive names also bound retention across concurrent/restarted writers.
    if (this.temporaryFiles.has(target)) fail("ACCOUNTING_TEMPORARY_RETAINED");
    let temporary: string | undefined;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    for (let slot = 0; slot < 4; slot++) {
      const candidate = path.join(directory, `.${path.basename(target)}.${slot}.tmp`);
      try { handle = await open(candidate, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); temporary = candidate; break; }
      catch (error: any) { if (error.code !== "EEXIST") throw error; }
    }
    if (!handle || !temporary) fail("ACCOUNTING_TEMPORARY_CAPACITY_EXHAUSTED");
    this.temporaryFiles.set(target, temporary);
    let completed = false;
    try {
      await handle.writeFile(bytes); await handle.sync(); await this.boundary?.("FILE_SYNC", target);
    } finally { await handle.close(); }
    try {
      if (replace) await rename(temporary, target);
      else await link(temporary, target).catch(async (e) => {
        if (e.code !== "EEXIST") throw e;
        const previous = await this.read(target, maximum);
        if (exactExisting && JSON.stringify(previous) !== bytes.toString("utf8")) fail("ACCOUNTING_CAPTURE_CONFLICT");
      });
      await this.boundary?.("PUBLISH", target);
      await this.syncDirectory(directory);
      if (path.basename(target) === "ack.json") await this.boundary?.("ACK_SYNC", target);
      completed = true;
    } finally {
      if (completed) { await unlink(temporary).catch((e) => { if (e.code !== "ENOENT") throw e; }); await this.syncDirectory(directory); this.temporaryFiles.delete(target); }
    }
  }
}
