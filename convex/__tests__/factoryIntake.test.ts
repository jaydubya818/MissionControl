import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { getFunctionName } from "convex/server";
import * as intake from "../factory/intake";
import * as github from "../githubAppConnections";
import http from "../http";
import { evaluateGithubAppCapabilities } from "../lib/githubAppReadiness";
import { sha256Hex } from "../lib/githubAppAuth";
import { normalizeGithubIssue, normalizeProductError, productErrorSigningInput, readIntakeBody, verifyProductErrorSignature } from "../lib/factoryIntake";

type Row = Record<string, any> & { _id: string };
const now = 1_795_715_000_000;
const digest = `sha256=${"a".repeat(64)}`;
const basePermissions = [{ name: "metadata", access: "read" }, { name: "contents", access: "write" }, { name: "pull_requests", access: "write" }, { name: "checks", access: "read" }];
const baseEvents = ["check_run", "pull_request", "pull_request_review"];
const config = {
  projectId: "project-a", repositoryId: "repository-a", enabled: true,
  githubEnabled: true, githubRequiredLabel: "factory-ready", githubActorIds: ["17"],
  productErrorsEnabled: true, productConnectionKey: "monitor-a", productSecretEnv: "MC_PRODUCT_ERROR_WEBHOOK_TEST",
  productActorIds: ["monitor-a"], application: "todo-app", environmentId: "environment-a",
  ownerMemberId: "member-a", owningTeamId: "team-a", codeScopeIds: ["scope-a"],
  budgetUsd: 10, maxCorrectiveIterations: 2, maxMissionsPerHour: 2,
};
const policy = { _id: "policy-a", ...config, tenantId: "tenant-a", version: 1, githubInstallationId: "123", authorizedBy: "operator-a", createdAt: now, updatedAt: now };

function handler(fn: any) { return fn._handler as (ctx: any, args: any) => Promise<any>; }
function githubPayload(overrides: Record<string, unknown> = {}) {
  return { action: "opened", repository: { id: 101, full_name: "example/repo" }, installation: { id: 123 },
    sender: { id: 17, login: "operator", type: "User" },
    issue: { number: 7, title: "Fix task storage", body: "Storage fails", html_url: "https://github.com/example/repo/issues/7", user: { type: "User" }, labels: [{ name: "factory-ready" }] }, ...overrides };
}
function productPayload(overrides: Record<string, unknown> = {}) {
  return { action: "detected", actorId: "monitor-a", application: "todo-app", environmentId: "environment-a", releaseId: "release-a",
    fingerprint: "storage-error", severity: "SEV2", title: "Storage failure", summary: "Task state was not saved",
    sourceUrl: "https://monitor.example/issues/7", diagnosticUrls: ["https://monitor.example/events/7?token=secret"], occurredAt: now, ...overrides };
}

function fixture(options: { authenticated?: boolean; role?: string; projectAccess?: string[]; configured?: boolean } = {}) {
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(Date, "now").mockReturnValue(now);
  const tables: Record<string, Row[]> = {
    tenants: [{ _id: "tenant-a", active: true }],
    projects: [{ _id: "project-a", tenantId: "tenant-a" }, { _id: "project-b", tenantId: "tenant-a" }],
    operators: [{ _id: "operator-a", tenantId: "tenant-a", authId: "user-a", active: true }],
    roles: [{ _id: "role-a", tenantId: "tenant-a", name: options.role ?? "Owner", permissions: [] }],
    roleAssignments: (options.projectAccess ?? ["project-a"]).map(id => ({ _id: `grant-${id}`, operatorId: "operator-a", roleId: "role-a", scope: { type: "project", id } })),
    orgMembers: [{ _id: "member-a", tenantId: "tenant-a", projectId: "project-a", operatorId: "owner-operator", active: true, name: "Owner" }],
    scrumTeams: [{ _id: "team-a", tenantId: "tenant-a", projectId: "project-a", status: "ACTIVE" }],
    teamMemberships: [{ _id: "team-member-a", tenantId: "tenant-a", projectId: "project-a", teamId: "team-a", memberId: "member-a", operatorId: "owner-operator", role: "LEAD", active: true }],
    workspaceRepositories: [{ _id: "repository-a", tenantId: "tenant-a", projectId: "project-a", repository: "example/repo", providerRepositoryId: "101", status: "READY" }],
    repositoryCodeScopes: [{ _id: "scope-a", projectId: "project-a", repositoryId: "repository-a", active: true }],
    environments: [{ _id: "environment-a", tenantId: "tenant-a" }],
    githubAppInstallations: [{ _id: "installation-a", projectId: "project-a", repositoryId: "repository-a", installationId: "123", status: "CONNECTED", verifiedAt: now,
      permissions: [...basePermissions, { name: "issues", access: "read" }], subscribedEvents: [...baseEvents, "issues"], issueIntakeEnabled: true }],
    factoryIntakePolicies: options.configured === false ? [] : [structuredClone(policy)],
    factoryIntakeDeliveries: [], githubWebhookDeliveries: [], missions: [], missionAssignments: [], missionEvents: [], workOrders: [], missionPlans: [],
    factoryIncidents: [], factoryIncidentTransitions: [], activities: [], verificationReceipts: [],
    factoryReleases: [{ _id: "release-a", projectId: "project-a", repositoryId: "repository-a", environmentId: "environment-a", deployedAt: now - 60_000, state: "DEPLOYED" }],
  };
  const scheduled: Array<{ name: string; args: any; delay: number }> = [];
  const calls: Array<{ name: string; args: any }> = [];
  let nextId = 0;
  const ctx: any = {
    auth: { getUserIdentity: vi.fn(async () => options.authenticated === false ? null : { subject: "user-a", issuer: "fixture", tokenIdentifier: "fixture|user-a" }) },
    db: {
      get: vi.fn(async (id: string) => Object.values(tables).flat().find(row => row._id === id) ?? null),
      insert: vi.fn(async (table: string, value: any) => { const row = { _id: `${table}-${++nextId}`, ...value }; (tables[table] ??= []).push(row); return row._id; }),
      patch: vi.fn(async (id: string, value: any) => { const row = Object.values(tables).flat().find(row => row._id === id); if (!row) throw new Error("Missing fixture row"); Object.assign(row, value); }),
      query: (table: string) => {
        let rows = [...tables[table] ?? []];
        let orderFields: string[] = [];
        const query: any = {
          withIndex: (name: string, apply: (q: any) => unknown) => {
            const conditions: Array<[string, string, any]> = [];
            const q: any = { eq: (field: string, value: any) => { conditions.push(["eq", field, value]); return q; }, gte: (field: string, value: any) => { conditions.push(["gte", field, value]); return q; } };
            apply(q);
            rows = rows.filter(row => conditions.every(([kind, field, value]) => kind === "eq" ? row[field] === value : row[field] >= value));
            orderFields = name.includes("processed") ? ["processedAt"] : name.includes("source") || name.includes("received") ? ["receivedAt"] : [];
            return query;
          },
          collect: async () => rows, first: async () => rows[0] ?? null, take: async (count: number) => rows.slice(0, count),
          filter: (apply: (q: any) => { field: string; value: any }) => {
            const condition = apply({ field: (field: string) => field, eq: (field: string, value: any) => ({ field, value }) });
            rows = rows.filter(row => row[condition.field] === condition.value); return query;
          },
          order: (direction: string) => { if (orderFields.length) rows.sort((a, b) => (a[orderFields[0]] - b[orderFields[0]]) * (direction === "desc" ? -1 : 1)); return query; },
        };
        return query;
      },
    },
    scheduler: { runAfter: vi.fn(async (delay: number, ref: any, args: any) => { scheduled.push({ delay, name: getFunctionName(ref), args }); }) },
    runQuery: async (ref: any, args: any) => {
      const name = getFunctionName(ref); calls.push({ name, args });
      if (name.startsWith("factory/intake:")) return handler((intake as any)[name.split(":")[1]])(ctx, args);
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (ref: any, args: any) => {
      const name = getFunctionName(ref); calls.push({ name, args });
      if (name === "missionPlanning:request") return { reachedCanonicalPlanning: true, args };
      const snapshot = structuredClone(tables);
      try {
        if (name.startsWith("factory/intake:")) return await handler((intake as any)[name.split(":")[1]])(ctx, args);
        if (name.startsWith("githubAppConnections:")) return await handler((github as any)[name.split(":")[1]])(ctx, args);
        throw new Error(`Unexpected mutation ${name}`);
      } catch (error) {
        for (const key of Object.keys(tables)) delete tables[key];
        Object.assign(tables, snapshot);
        throw error;
      }
    },
  };
  return { ctx, tables, scheduled, calls };
}

async function receiveProduct(f: ReturnType<typeof fixture>, deliveryId = "delivery-1", overrides: Record<string, unknown> = {}) {
  return handler(intake.receive)(f.ctx, { policyId: "policy-a", deliveryId, payloadDigest: digest, source: normalizeProductError(productPayload(overrides), now) });
}

async function receiveIssue(f: ReturnType<typeof fixture>, deliveryId = "delivery-1", overrides: Record<string, unknown> = {}) {
  const payload = githubPayload(overrides);
  const start = await handler(github.beginWebhookDelivery)(f.ctx, { deliveryId, event: "issues", action: payload.action,
    repository: "example/repo", providerRepositoryId: "101", installationId: "123", signatureStatus: "VALID", payloadDigest: digest });
  return handler(intake.receive)(f.ctx, { githubDeliveryId: start.deliveryRecordId, deliveryId, payloadDigest: digest, source: normalizeGithubIssue(payload, now) });
}

async function signature(body: string, secret = "test-only-secret") {
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${Buffer.from(bytes).toString("hex")}`;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("external source normalization and signatures", () => {
  it("bounds and scrubs diagnostics without storing raw provider payloads", () => {
    const source = normalizeProductError(productPayload({ summary: "password=hello token=abc", diagnosticUrls: ["https://monitor.example/event?token=secret#stack"] }), now);
    expect(source.summary).toBe("password=[redacted] token=[redacted]");
    expect(source.diagnosticUrls).toEqual(["https://monitor.example/event"]);
    expect(source).not.toHaveProperty("rawPayload");
  });
  it("requires exact issue repository and item URLs", () => {
    expect(() => normalizeGithubIssue(githubPayload({ issue: { ...githubPayload().issue, html_url: "https://attacker.example/issue" } }), now)).toThrow("ISSUE_URL");
  });
  it.each(["http://monitor.example/event", "https://user:secret@monitor.example/event"])("rejects unsafe diagnostic URL %s", url => {
    expect(() => normalizeProductError(productPayload({ diagnosticUrls: [url] }), now)).toThrow();
  });
  it.each([NaN, Infinity, now + 300_001, now - 7 * 86_400_000 - 1])("rejects invalid occurrence time %s", occurredAt => {
    expect(() => normalizeProductError(productPayload({ occurredAt }), now)).toThrow("OCCURRENCE");
  });
  it("binds timestamp and exact body in the HMAC", async () => {
    fixture();
    const timestamp = String(Math.floor(now / 1_000));
    const body = JSON.stringify(productPayload());
    const signed = await signature(productErrorSigningInput(timestamp, "monitor-a", "delivery-1", body));
    const input = { body, timestamp, signature: signed, secret: "test-only-secret", now, connectionKey: "monitor-a", deliveryId: "delivery-1" };
    await expect(verifyProductErrorSignature(input)).resolves.toBe(true);
    await expect(verifyProductErrorSignature({ ...input, body: `${body} ` })).resolves.toBe(false);
    await expect(verifyProductErrorSignature({ ...input, now: now + 300_001 })).resolves.toBe(false);
    await expect(verifyProductErrorSignature({ ...input, deliveryId: "delivery-2" })).resolves.toBe(false);
    await expect(verifyProductErrorSignature({ ...input, connectionKey: "monitor-b" })).resolves.toBe(false);
  });
  it("rejects an oversized request before parsing", async () => {
    await expect(readIntakeBody(new Request("https://test", { method: "POST", body: "a".repeat(65_537) }))).rejects.toThrow("TOO_LARGE");
  });
});

describe("scoped intake policy authority", () => {
  it("requires authentication even when anonymous demonstration context is enabled", async () => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const f = fixture({ authenticated: false, configured: false });
    await expect(handler(intake.configure)(f.ctx, config)).rejects.toThrow("Authenticated");
    expect(f.ctx.db.insert).not.toHaveBeenCalled();
  });
  it.each(["Viewer", "Developer"])("denies policy configuration for %s", role => {
    const f = fixture({ role, configured: false });
    return expect(handler(intake.configure)(f.ctx, config)).rejects.toThrow(/permit/);
  });
  it("rejects project scope mismatch before writes", async () => {
    const f = fixture({ configured: false, projectAccess: ["project-b"] });
    await expect(handler(intake.configure)(f.ctx, config)).rejects.toThrow(/unauthorized/);
    expect(f.ctx.db.insert).not.toHaveBeenCalled();
  });
  it.each(["member", "team", "scope"])("rejects mismatched %s delivery scope", async part => {
    const f = fixture({ configured: false });
    const table = { member: "orgMembers", team: "scrumTeams", scope: "repositoryCodeScopes" }[part]!;
    f.tables[table][0].projectId = "project-b";
    await expect(handler(intake.configure)(f.ctx, config)).rejects.toThrow("SCOPE");
    expect(f.ctx.db.insert).not.toHaveBeenCalled();
  });
  it.each([0, Infinity, -1, 1_001])("rejects invalid per-Mission budget %s", async budgetUsd => {
    const f = fixture({ configured: false });
    await expect(handler(intake.configure)(f.ctx, { ...config, budgetUsd })).rejects.toThrow("BUDGET");
  });
  it("records exact policy scope and explicit issue capability opt-in", async () => {
    const f = fixture({ configured: false });
    f.tables.githubAppInstallations[0].issueIntakeEnabled = false;
    const result = await handler(intake.configure)(f.ctx, config);
    expect(result).toMatchObject({ version: 1, installationReverificationRequired: true });
    expect(f.tables.factoryIntakePolicies[0]).toMatchObject({ githubInstallationId: "123", authorizedBy: "operator-a", budgetUsd: 10 });
    expect(f.tables.githubAppInstallations[0].issueIntakeEnabled).toBe(true);
    expect(f.tables.activities[0].action).toBe("FACTORY_INTAKE_POLICY_CONFIGURED");
  });
  it("bootstraps issue intake from a clean verified installation without treating pending readiness as live", async () => {
    const f = fixture({ configured: false });
    f.tables.githubAppInstallations = [];
    f.tables.workspaceRepositories[0].provider = "GITHUB";
    const verified = { repositoryId: "repository-a", providerRepositoryId: "101", installationId: "123", appId: "456",
      accountLogin: "example", repositorySelection: "SELECTED", permissions: [...basePermissions, { name: "issues", access: "read" }],
      subscribedEvents: [...baseEvents, "issues"], status: "CONNECTED", installedAt: now - 60_000, verifiedAt: now };
    const initial = await handler(github.upsertInstallation)(f.ctx, verified);
    expect(initial.ready).toBe(false);
    expect(initial.capability.excessivePermissions).toContain("issues:read");
    expect(f.tables.githubAppInstallations[0]).toMatchObject({ status: "CONNECTED" });
    expect(f.tables.githubAppInstallations[0].issueIntakeEnabled).toBeUndefined();
    const configured = await handler(intake.configure)(f.ctx, config);
    expect(configured.githubProcessingReady).toBe(false);
    expect((await handler(intake.getPolicy)(f.ctx, { repositoryId: "repository-a" })).githubProcessingReady).toBe(false);
    await expect(receiveIssue(f)).rejects.toThrow("GITHUB_BINDING");
    expect(f.tables.missions).toHaveLength(0);
    expect((await handler(github.upsertInstallation)(f.ctx, verified)).ready).toBe(true);
    expect((await handler(intake.getPolicy)(f.ctx, { repositoryId: "repository-a" })).githubProcessingReady).toBe(true);
    const received = await receiveIssue(f, "delivery-2");
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: received.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
  });
  it("rejects an expired owner membership", async () => {
    const f = fixture({ configured: false }); f.tables.teamMemberships[0].activeUntil = now - 1;
    await expect(handler(intake.configure)(f.ctx, config)).rejects.toThrow("SCOPE");
  });
  it("can disable a policy when its former owner or repository binding is unavailable", async () => {
    const f = fixture(); f.tables.orgMembers[0].active = false; f.tables.githubAppInstallations[0].status = "REVOKED";
    await handler(intake.disablePolicy)(f.ctx, { policyId: "policy-a" });
    expect(f.tables.factoryIntakePolicies[0].enabled).toBe(false);
    expect(f.tables.githubAppInstallations[0].issueIntakeEnabled).toBe(false);
  });
  it("requires read-only issue permission and the issues subscription", async () => {
    const f = fixture({ configured: false }); f.tables.githubAppInstallations[0].subscribedEvents = baseEvents;
    await expect(handler(intake.configure)(f.ctx, config)).rejects.toThrow("GITHUB_BINDING");
  });
  it.each(["write", "admin"])("never accepts excessive issues/%s authority", access => {
    expect(evaluateGithubAppCapabilities({ permissions: [...basePermissions, { name: "issues", access }] as any, subscribedEvents: [...baseEvents, "issues"], issueIntakeEnabled: true }).ready).toBe(false);
  });
  it("keeps the prior capability contract when issue intake is disabled", () => {
    const input = { permissions: [...basePermissions, { name: "issues", access: "read" }] as any, subscribedEvents: [...baseEvents, "issues"] };
    expect(evaluateGithubAppCapabilities(input).ready).toBe(false);
    expect(evaluateGithubAppCapabilities({ ...input, issueIntakeEnabled: true }).ready).toBe(true);
    expect(evaluateGithubAppCapabilities({ ...input, issueIntakeEnabled: true, subscribedEvents: baseEvents }).ready).toBe(false);
  });
});

describe("durable canonical intake", () => {
  it("creates a scoped Mission draft and does not dispatch or approve it", async () => {
    const f = fixture(); const received = await receiveIssue(f);
    expect(f.tables.missions).toHaveLength(0);
    expect(f.scheduled).toHaveLength(1);
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: received.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
    expect(f.tables.missions[0]).toMatchObject({ state: "DRAFT", projectId: "project-a", repositoryId: "repository-a", codeScopeIds: ["scope-a"], budgetUsd: 10, maxCorrectiveIterations: 2 });
    expect(f.tables.missionEvents).toHaveLength(1);
    expect(f.tables.missionAssignments).toHaveLength(1);
    expect(f.tables.workOrders).toEqual([]);
  });
  it("deduplicates retries and correlates another event for active work", async () => {
    const f = fixture(); const first = await receiveIssue(f);
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    const later = await receiveIssue(f, "delivery-2", { action: "labeled" });
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: later.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
    expect(f.tables.factoryIntakeDeliveries[1]).toMatchObject({ outcome: "CORRELATED", missionId: f.tables.missions[0]._id });
  });
  it("does not enqueue repeated copies while a delivery is scheduled", async () => {
    const f = fixture(); await receiveProduct(f); await receiveProduct(f); await receiveProduct(f);
    expect(f.scheduled).toHaveLength(1);
    expect(f.tables.factoryIntakeDeliveries).toHaveLength(1);
  });
  it("recovers a received delivery through authorized replay after the scheduling window", async () => {
    const f = fixture(); const result = await receiveProduct(f);
    await expect(handler(intake.retryDelivery)(f.ctx, { deliveryId: result.deliveryId })).rejects.toThrow("ALREADY_SCHEDULED");
    vi.mocked(Date.now).mockReturnValue(now + 300_001);
    await handler(intake.retryDelivery)(f.ctx, { deliveryId: result.deliveryId });
    expect(f.scheduled).toHaveLength(2);
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: result.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
  });
  it("rejects a delivery ID reused with changed content", async () => {
    const f = fixture(); await receiveProduct(f);
    await expect(handler(intake.receive)(f.ctx, { policyId: "policy-a", deliveryId: "delivery-1", payloadDigest: `sha256=${"b".repeat(64)}`, source: normalizeProductError(productPayload(), now) })).rejects.toThrow("CONFLICT");
    expect(f.tables.factoryIntakeDeliveries).toHaveLength(1);
  });
  it.each([
    [{ sender: { id: 18, login: "outsider", type: "User" } }, "ACTOR_NOT_ALLOWED"],
    [{ sender: { id: 17, login: "bot[bot]", type: "Bot" } }, "FACTORY_OR_BOT"],
    [{ issue: { ...githubPayload().issue, labels: [] } }, "LABEL_REQUIRED"],
    [{ issue: { ...githubPayload().issue, body: "<!-- mission-control:factory-generated -->" } }, "FACTORY_OR_BOT"],
    [{ action: "closed" }, "ACTION_IGNORED"],
  ])("records ineligible issue evidence without creating work", async (changes, reason) => {
    const f = fixture(); const result = await receiveIssue(f, "delivery-1", changes);
    expect(result.status).toBe("IGNORED"); expect(result.reason).toContain(reason);
    expect(f.scheduled).toEqual([]); expect(f.tables.missions).toEqual([]);
  });
  it("honors policy revocation after receipt and before processing", async () => {
    const f = fixture(); const result = await receiveProduct(f); await handler(intake.disablePolicy)(f.ctx, { policyId: "policy-a" });
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: result.deliveryId });
    expect(f.tables.factoryIntakeDeliveries[0]).toMatchObject({ status: "IGNORED", reason: "INTAKE_DISABLED" });
    expect(f.tables.missions).toEqual([]);
  });
  it("stops new work when the policy authorizer is no longer active", async () => {
    const f = fixture(); const result = await receiveProduct(f); f.tables.operators[0].active = false;
    await expect(handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: result.deliveryId })).rejects.toThrow("AUTHORIZER_UNAVAILABLE");
    expect(f.tables.missions).toEqual([]);
  });
  it("rejects a release belonging to another repository before any Mission write", async () => {
    const f = fixture(); const result = await receiveProduct(f); f.tables.factoryReleases[0].repositoryId = "repository-b";
    await expect(handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: result.deliveryId })).rejects.toThrow("RELEASE_SCOPE");
    expect(f.tables.missions).toEqual([]); expect(f.tables.factoryIncidents).toEqual([]);
  });
  it("creates an incident with affected-release lineage and no restored authority", async () => {
    const f = fixture(); const result = await receiveProduct(f);
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: result.deliveryId });
    expect(f.tables.factoryIncidents[0]).toMatchObject({ phase: "CLARIFY", authorityRestored: false, status: "OPEN" });
    expect(f.tables.factoryIncidentTransitions[0].evidenceRefs).toEqual(expect.arrayContaining([{ kind: "RELEASE", recordId: "release-a", relationship: "affected-release" }]));
    expect(f.tables.missions[0].constraints.join(" ")).toContain("product-error:storage-error");
  });
  it("treats provider resolution as source evidence only", async () => {
    const f = fixture(); const result = await receiveProduct(f, "resolved-1", { action: "resolved" });
    expect(result).toMatchObject({ status: "IGNORED", reason: "INTAKE_PROVIDER_RESOLUTION_ONLY" });
    expect(f.tables.missions).toEqual([]); expect(f.tables.factoryIncidents).toEqual([]);
  });
  it("correlates recurrence while work is active and creates bounded follow-up after completion", async () => {
    const f = fixture(); const first = await receiveProduct(f); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    const second = await receiveProduct(f, "delivery-2", { action: "recurring" }); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: second.deliveryId });
    expect(f.tables.factoryIntakeDeliveries[1].outcome).toBe("RECURRENCE");
    f.tables.missions[0].state = "DONE"; f.tables.missions[0].updatedAt = now - 1;
    const third = await receiveProduct(f, "delivery-3", { action: "recurring" }); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: third.deliveryId });
    expect(f.tables.factoryIntakeDeliveries[2].outcome).toBe("REGRESSION");
    expect(f.tables.missions).toHaveLength(2); expect(f.tables.factoryIncidents).toHaveLength(2);
  });
  it("does not call a delayed historical error a new regression", async () => {
    const f = fixture(); const first = await receiveProduct(f); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    f.tables.missions[0].state = "DONE";
    const second = await receiveProduct(f, "delivery-2", { occurredAt: now - 1 }); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: second.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
    expect(f.tables.factoryIntakeDeliveries[1].reason).toBe("INTAKE_HISTORICAL_OCCURRENCE");
  });
  it("exposes a severity increase without creating duplicate repair work", async () => {
    const f = fixture(); const first = await receiveProduct(f); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    const next = await receiveProduct(f, "delivery-2", { severity: "SEV1" }); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: next.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
    expect(f.tables.factoryIntakeDeliveries[1].reason).toBe("INTAKE_SEVERITY_INCREASED");
  });
  it("enforces a bounded count of new Missions while permitting correlation", async () => {
    const f = fixture(); f.tables.factoryIntakePolicies[0].maxMissionsPerHour = 1;
    const first = await receiveProduct(f); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    const next = await receiveProduct(f, "delivery-2", { fingerprint: "another-error" });
    await expect(handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: next.deliveryId })).rejects.toThrow("HOURLY_MISSION_LIMIT");
    expect(f.tables.missions).toHaveLength(1);
  });
  it("counts delayed processing against the current creation window", async () => {
    const f = fixture(); f.tables.factoryIntakePolicies[0].maxMissionsPerHour = 1;
    const first = await receiveProduct(f); f.tables.factoryIntakeDeliveries[0].receivedAt = now - 7_200_000;
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: first.deliveryId });
    const second = await receiveProduct(f, "delivery-2", { fingerprint: "another-error" });
    await expect(handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: second.deliveryId })).rejects.toThrow("HOURLY_MISSION_LIMIT");
  });
  it("preserves failed processing and recovers without duplicate canonical records", async () => {
    const f = fixture(); const received = await receiveProduct(f); const insert = f.ctx.db.insert.getMockImplementation();
    let fail = true;
    f.ctx.db.insert.mockImplementation(async (table: string, args: any) => { if (table === "missionAssignments" && fail) throw new Error("fixture write interrupted"); return insert(table, args); });
    await handler(intake.processDelivery)(f.ctx, { deliveryId: received.deliveryId });
    expect(f.tables.missions).toEqual([]);
    expect(f.tables.factoryIntakeDeliveries[0]).toMatchObject({ status: "FAILED", attempts: 1 });
    fail = false; await handler(intake.processDelivery)(f.ctx, { deliveryId: received.deliveryId });
    expect(f.tables.missions).toHaveLength(1);
    expect(f.tables.factoryIntakeDeliveries[0]).toMatchObject({ status: "PROCESSED", attempts: 2, failures: [{ attempt: 1, code: "INTAKE_PROCESSING_FAILED", at: now }] });
  });
  it("stops retries at the attempt bound and preserves every failure", async () => {
    const f = fixture(); const received = await receiveProduct(f); f.tables.orgMembers[0].active = false;
    for (let i = 0; i < 5; i++) await handler(intake.processDelivery)(f.ctx, { deliveryId: received.deliveryId });
    expect(f.tables.factoryIntakeDeliveries[0].attempts).toBe(3);
    expect(f.tables.factoryIntakeDeliveries[0].failures).toHaveLength(3);
    await expect(handler(intake.retryDelivery)(f.ctx, { deliveryId: received.deliveryId })).rejects.toThrow("NOT_RETRYABLE");
  });
  it("routes operator planning through the existing canonical entry point", async () => {
    const f = fixture(); const received = await receiveIssue(f); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: received.deliveryId });
    const value = await handler(intake.requestPlanning)(f.ctx, { deliveryId: received.deliveryId });
    expect(value.reachedCanonicalPlanning).toBe(true);
    expect(value.args).toMatchObject({ projectId: "project-a", missionId: f.tables.missions[0]._id });
    expect(f.tables.missions[0].state).toBe("DRAFT");
    const status = await handler(intake.getDelivery)(f.ctx, { deliveryId: received.deliveryId });
    expect(status).toMatchObject({ executionStarted: false, acceptanceEstablished: false });
  });
  it("preserves delivery record visibility when projecting canonical Mission details", async () => {
    const f = fixture(); const received = await receiveIssue(f); await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: received.deliveryId });
    f.tables.roles[0].name = "Viewer";
    await expect(handler(intake.getDelivery)(f.ctx, { deliveryId: received.deliveryId })).rejects.toThrow(/unauthorized/);
    await expect(handler(intake.requestPlanning)(f.ctx, { deliveryId: received.deliveryId })).rejects.toThrow(/unauthorized/);
    expect(await handler(intake.listDeliveries)(f.ctx, { projectId: "project-a" })).toEqual([]);
    expect(f.calls.some(call => call.name === "missionPlanning:request")).toBe(false);
  });
  it("exposes pending source snapshots only to scoped policy operators", async () => {
    const f = fixture(); const received = await receiveProduct(f);
    f.tables.roles[0].name = "Viewer";
    expect(await handler(intake.listDeliveries)(f.ctx, { projectId: "project-a" })).toEqual([]);
    await expect(handler(intake.getDelivery)(f.ctx, { deliveryId: received.deliveryId })).rejects.toThrow(/permit/);
    f.tables.roles[0].permissions = ["factory.automation.manage"];
    expect(await handler(intake.listDeliveries)(f.ctx, { projectId: "project-a" })).toHaveLength(1);
    expect(await handler(intake.getDelivery)(f.ctx, { deliveryId: received.deliveryId })).toMatchObject({ mission: null, executionStarted: false });
  });
  it("does not expose another workspace's intake through identifiers", async () => {
    const f = fixture(); const received = await receiveProduct(f); f.tables.factoryIntakeDeliveries[0].projectId = "project-b";
    await expect(handler(intake.getDelivery)(f.ctx, { deliveryId: received.deliveryId })).rejects.toThrow(/unauthorized/);
    await expect(handler(intake.retryDelivery)(f.ctx, { deliveryId: received.deliveryId })).rejects.toThrow(/unauthorized/);
  });
});

describe("application restoration evidence", () => {
  async function restoredFixture() {
    const f = fixture(); const received = await receiveProduct(f);
    await handler(intake.processDeliveryAtomic)(f.ctx, { deliveryId: received.deliveryId });
    f.tables.workOrders.push({ _id: "repair-work", projectId: "project-a", missionId: f.tables.missions[0]._id,
      currentRevisionNumber: 2, acceptanceCriteria: [{ id: "product-error:storage-error" }] });
    f.tables.factoryReleases.push({ _id: "repair-release", projectId: "project-a", repositoryId: "repository-a", environmentId: "environment-a",
      state: "VERIFIED", workOrderId: "repair-work", workflowRunId: "repair-run", sourceHeadSha: "source-head", mergeCommitSha: "deployed-commit",
      deployedAt: now, verifiedAt: now });
    f.tables.verificationReceipts.push({ _id: "repair-receipt", projectId: "project-a", workOrderId: "repair-work", workflowRunId: "repair-run",
      status: "PASSED", independenceValid: true, verificationMethod: "BROWSER", candidateRevision: "deployed-commit", validUntil: now + 60_000,
      recordedAt: now, workOrderRevisionNumber: 2, acceptanceCriterionId: "product-error:storage-error" });
    return { ...f, args: { deliveryId: received.deliveryId, releaseId: "repair-release", receiptId: "repair-receipt" } };
  }
  it("links exact post-deployment regression evidence without restoring incident authority", async () => {
    const f = await restoredFixture();
    expect(await handler(intake.recordRestoration)(f.ctx, f.args)).toEqual({ recorded: true, incidentAuthorityChanged: false });
    expect(f.tables.factoryIntakeDeliveries[0]).toMatchObject({ restoredReleaseId: "repair-release", restorationReceiptId: "repair-receipt", restorationObservedAt: now });
    expect(f.tables.factoryIncidents[0]).toMatchObject({ phase: "CLARIFY", authorityRestored: false });
    expect(await handler(intake.recordRestoration)(f.ctx, f.args)).toEqual({ recorded: false });
  });
  it.each([
    ["status", "FAILED"], ["independenceValid", false], ["verificationMethod", "COMMAND"],
    ["candidateRevision", "source-head"], ["validUntil", now - 1], ["recordedAt", now - 1],
    ["recordedAt", now + 1], ["workOrderRevisionNumber", 1], ["acceptanceCriterionId", "unrelated-check"],
    ["projectId", "project-b"], ["workflowRunId", "other-run"],
  ])("rejects unsuitable receipt %s=%s", async (field, value) => {
    const f = await restoredFixture(); f.tables.verificationReceipts[0][field] = value;
    await expect(handler(intake.recordRestoration)(f.ctx, f.args)).rejects.toThrow("RESTORATION_EVIDENCE_INVALID");
    expect(f.tables.factoryIntakeDeliveries[0].restoredReleaseId).toBeUndefined();
  });
  it.each(["project", "repository", "mission", "environment", "state"])("rejects a different %s release binding", async field => {
    const f = await restoredFixture();
    if (field === "mission") f.tables.workOrders[0].missionId = "other-mission";
    else if (field === "state") f.tables.factoryReleases[1].state = "ROLLED_BACK";
    else f.tables.factoryReleases[1][`${field}Id`] = `other-${field}`;
    await expect(handler(intake.recordRestoration)(f.ctx, f.args)).rejects.toThrow("RESTORATION_EVIDENCE_INVALID");
  });
  it("requires an approver even for valid repair evidence", async () => {
    const f = await restoredFixture(); f.tables.roles[0].name = "Viewer";
    await expect(handler(intake.recordRestoration)(f.ctx, f.args)).rejects.toThrow("permit");
  });
  it("preserves Mission visibility for a factory approver outside its team", async () => {
    const f = await restoredFixture(); f.tables.roles[0].name = "Reviewer";
    f.tables.roles[0].permissions = ["factory.approve"];
    await expect(handler(intake.recordRestoration)(f.ctx, f.args)).rejects.toThrow(/unauthorized/);
    expect(f.tables.factoryIntakeDeliveries[0].restoredReleaseId).toBeUndefined();
  });
});

describe("GitHub delivery recovery", () => {
  const args = { deliveryId: "delivery-1", event: "issues", action: "opened", repository: "example/repo", providerRepositoryId: "101", installationId: "123", signatureStatus: "VALID", payloadDigest: digest };
  it("retries failed processing of the same signed payload", async () => {
    const f = fixture(); const first = await handler(github.beginWebhookDelivery)(f.ctx, args);
    await handler(github.completeWebhookDelivery)(f.ctx, { deliveryRecordId: first.deliveryRecordId, processingAttempt: 1, status: "FAILED" });
    const second = await handler(github.beginWebhookDelivery)(f.ctx, args);
    expect(second).toMatchObject({ accepted: true, duplicate: false, processingAttempt: 2 });
    expect(f.tables.githubWebhookDeliveries).toHaveLength(1);
    expect(f.tables.githubWebhookDeliveries[0].failureHistory).toMatchObject([{ attempt: 1, reason: "Processing failed." }]);
  });
  it("recovers received work only after its processing lease expires", async () => {
    const f = fixture(); await handler(github.beginWebhookDelivery)(f.ctx, args);
    expect(await handler(github.beginWebhookDelivery)(f.ctx, args)).toMatchObject({ accepted: false, inFlight: true });
    vi.mocked(Date.now).mockReturnValue(now + 300_001);
    expect(await handler(github.beginWebhookDelivery)(f.ctx, args)).toMatchObject({ accepted: true, processingAttempt: 2 });
    expect(f.tables.githubWebhookDeliveries[0].failureHistory[0].reason).toContain("lease expired");
  });
  it("fences a late completion from an older processing attempt", async () => {
    const f = fixture(); const first = await handler(github.beginWebhookDelivery)(f.ctx, args);
    f.tables.githubWebhookDeliveries[0].status = "FAILED";
    await handler(github.beginWebhookDelivery)(f.ctx, args);
    expect(await handler(github.completeWebhookDelivery)(f.ctx, { deliveryRecordId: first.deliveryRecordId, processingAttempt: 1, status: "PROCESSED" })).toEqual({ updated: false });
    expect(f.tables.githubWebhookDeliveries[0].status).toBe("RECEIVED");
  });
  it("rejects changed payload, identity, or revoked binding during redelivery", async () => {
    const f = fixture(); await handler(github.beginWebhookDelivery)(f.ctx, args); f.tables.githubWebhookDeliveries[0].status = "FAILED";
    expect(await handler(github.beginWebhookDelivery)(f.ctx, { ...args, payloadDigest: `sha256=${"b".repeat(64)}` })).toMatchObject({ accepted: false, duplicate: false });
    expect(await handler(github.beginWebhookDelivery)(f.ctx, { ...args, action: "closed" })).toMatchObject({ accepted: false, duplicate: false });
    f.tables.githubAppInstallations[0].status = "REVOKED";
    expect(await handler(github.beginWebhookDelivery)(f.ctx, args)).toMatchObject({ accepted: false });
  });
  it("acknowledges completed duplicates without spending another processing attempt", async () => {
    const f = fixture(); const first = await handler(github.beginWebhookDelivery)(f.ctx, args);
    await handler(github.completeWebhookDelivery)(f.ctx, { deliveryRecordId: first.deliveryRecordId, processingAttempt: 1, status: "PROCESSED" });
    expect(await handler(github.beginWebhookDelivery)(f.ctx, args)).toMatchObject({ duplicate: true });
    expect(f.tables.githubWebhookDeliveries[0].attemptCount).toBe(1);
  });
  it("enforces the attempt bound for an existing PR event family", async () => {
    const f = fixture();
    for (let i = 1; i <= 3; i++) {
      const started = await handler(github.beginWebhookDelivery)(f.ctx, { ...args, event: "pull_request", action: "synchronize" });
      expect(started.accepted).toBe(true);
      await handler(github.completeWebhookDelivery)(f.ctx, { deliveryRecordId: started.deliveryRecordId, processingAttempt: i, status: "FAILED", error: `failure ${i}` });
    }
    const stopped = await handler(github.beginWebhookDelivery)(f.ctx, { ...args, event: "pull_request", action: "synchronize" });
    expect(stopped).toMatchObject({ accepted: false });
    expect(stopped.error).toContain("exhausted");
    expect(f.tables.githubWebhookDeliveries[0].failureHistory).toHaveLength(3);
  });
});

describe("signed HTTP ingress", () => {
  function endpoint(path: string) { return handler(http.lookup(path, "POST")![0]); }
  it("does not let rejected signatures reserve GitHub delivery IDs", async () => {
    const f = fixture(); vi.stubEnv("GITHUB_WEBHOOK_SECRET", "test-only-secret");
    const response = await endpoint("/github/webhook")(f.ctx, new Request("https://factory/github/webhook", { method: "POST", body: JSON.stringify(githubPayload()), headers: { "x-github-delivery": "delivery-1", "x-github-event": "issues", "x-hub-signature-256": "sha256=bad" } }));
    expect(response.status).toBe(401); expect(f.tables.githubWebhookDeliveries).toEqual([]); expect(f.calls).toEqual([]);
  });
  it("accepts a signed issue through the installation ledger and queues canonical intake", async () => {
    const f = fixture(); vi.stubEnv("GITHUB_WEBHOOK_SECRET", "test-only-secret"); const body = JSON.stringify(githubPayload());
    const response = await endpoint("/github/webhook")(f.ctx, new Request("https://factory/github/webhook", { method: "POST", body, headers: { "x-github-delivery": "delivery-1", "x-github-event": "issues", "x-hub-signature-256": await signature(body) } }));
    expect(response.status).toBe(202); expect(f.tables.factoryIntakeDeliveries).toHaveLength(1);
    expect(f.tables.githubWebhookDeliveries[0]).toMatchObject({ status: "PROCESSED", payloadDigest: `sha256=${await sha256Hex(body)}` });
    expect(f.tables.missions).toEqual([]);
  });
  it("accepts only a configured signed application-error envelope", async () => {
    const f = fixture(); vi.stubEnv("MC_PRODUCT_ERROR_WEBHOOK_TEST", "test-only-secret");
    const body = JSON.stringify(productPayload()); const timestamp = String(now / 1_000);
    const headers = { "x-mc-connection": "monitor-a", "x-mc-delivery": "delivery-1", "x-mc-timestamp": timestamp, "x-mc-signature": await signature(productErrorSigningInput(timestamp, "monitor-a", "delivery-1", body)) };
    const response = await endpoint("/factory/product-errors")(f.ctx, new Request("https://factory/factory/product-errors", { method: "POST", body, headers }));
    expect(response.status).toBe(202); expect(f.tables.factoryIntakeDeliveries).toHaveLength(1);
    expect(JSON.stringify(f.tables.factoryIntakeDeliveries)).not.toContain("token=secret");
    const rejected = await endpoint("/factory/product-errors")(f.ctx, new Request("https://factory/factory/product-errors", { method: "POST", body: `${body} `, headers }));
    expect(rejected.status).toBe(401); expect(f.tables.factoryIntakeDeliveries).toHaveLength(1);
  });
});
