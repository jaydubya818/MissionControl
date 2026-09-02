import { describe, expect, it } from "vitest";
import {
  beginWebhookDelivery,
  markInstallationChanged,
  upsertInstallation,
} from "../githubAppConnections";

type Row = Record<string, any> & { _id: string };

function fakeContext(initial: Record<string, Row[]>) {
  const records = Object.fromEntries(
    Object.entries(initial).map(([table, rows]) => [
      table,
      rows.map((row) => ({ ...row })),
    ]),
  ) as Record<string, Row[]>;
  let nextId = 1;

  const db = {
    get: async (id: string) =>
      Object.values(records)
        .flat()
        .find((row) => row._id === id) ?? null,
    insert: async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${nextId++}`;
      records[table] ??= [];
      records[table].push({ _id: id, ...value });
      return id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = Object.values(records)
        .flat()
        .find((candidate) => candidate._id === id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, value);
    },
    query: (table: string) => {
      let rows = [...(records[table] ?? [])];
      const query = {
        withIndex: (_name: string, apply: (builder: any) => any) => {
          const filter = apply({
            eq: (field: string, value: unknown) => ({ field, value }),
          });
          rows = rows.filter((row) => row[filter.field] === filter.value);
          return query;
        },
        collect: async () => rows,
        first: async () => rows[0] ?? null,
        order: () => query,
        take: async (limit: number) => rows.slice(0, limit),
      };
      return query;
    },
  };

  return { ctx: { db } as any, records };
}

const permissions = [
  { name: "metadata", access: "read" as const },
  { name: "contents", access: "write" as const },
  { name: "pull_requests", access: "write" as const },
  { name: "checks", access: "read" as const },
];
const subscribedEvents = ["check_run", "pull_request", "pull_request_review"];

function repository(id: string, name: string, providerRepositoryId: string) {
  return {
    _id: id,
    tenantId: "tenant-1",
    projectId: "project-1",
    repository: name,
    providerRepositoryId,
    webhookStatus: "READY",
  };
}

function installation(id: string, repositoryId: string) {
  return {
    _id: id,
    tenantId: "tenant-1",
    projectId: "project-1",
    repositoryId,
    installationId: "installation-1",
    appId: "app-1",
    accountLogin: "example",
    repositorySelection: "SELECTED",
    permissions,
    subscribedEvents,
    status: "CONNECTED",
    installedAt: 1,
    verifiedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("GitHub App multi-repository installations", () => {
  it("binds one installation to multiple selected repositories", async () => {
    const firstRepository = repository("repository-1", "example/first", "101");
    const secondRepository = repository(
      "repository-2",
      "example/second",
      "202",
    );
    const { ctx, records } = fakeContext({
      workspaceRepositories: [firstRepository, secondRepository],
      githubAppInstallations: [installation("binding-1", firstRepository._id)],
    });

    const result = await (upsertInstallation as any)._handler(ctx, {
      repositoryId: secondRepository._id,
      providerRepositoryId: secondRepository.providerRepositoryId,
      installationId: "installation-1",
      appId: "app-1",
      accountLogin: "example",
      repositorySelection: "SELECTED",
      permissions,
      subscribedEvents,
      status: "CONNECTED",
      installedAt: 1,
      verifiedAt: Date.now(),
    });

    expect(result.ready).toBe(true);
    expect(records.githubAppInstallations).toHaveLength(2);
    expect(
      records.githubAppInstallations.map((row) => row.installationId),
    ).toEqual(["installation-1", "installation-1"]);
  });

  it("routes repository webhooks to the matching binding", async () => {
    const firstRepository = repository("repository-1", "example/first", "101");
    const secondRepository = repository(
      "repository-2",
      "example/second",
      "202",
    );
    const { ctx, records } = fakeContext({
      workspaceRepositories: [firstRepository, secondRepository],
      githubAppInstallations: [
        installation("binding-1", firstRepository._id),
        installation("binding-2", secondRepository._id),
      ],
      githubWebhookDeliveries: [],
    });

    const result = await (beginWebhookDelivery as any)._handler(ctx, {
      deliveryId: "delivery-1",
      event: "check_run",
      repository: secondRepository.repository,
      providerRepositoryId: secondRepository.providerRepositoryId,
      installationId: "installation-1",
      signatureStatus: "VALID",
    });

    expect(result.accepted).toBe(true);
    expect(result.repositoryId).toBe(secondRepository._id);
    expect(records.githubWebhookDeliveries[0].repositoryId).toBe(
      secondRepository._id,
    );
  });

  it("revokes only a repository removed from a shared installation", async () => {
    const firstRepository = repository("repository-1", "example/first", "101");
    const secondRepository = repository(
      "repository-2",
      "example/second",
      "202",
    );
    const firstBinding = installation("binding-1", firstRepository._id);
    const secondBinding = installation("binding-2", secondRepository._id);
    const { ctx, records } = fakeContext({
      workspaceRepositories: [firstRepository, secondRepository],
      githubAppInstallations: [firstBinding, secondBinding],
    });

    const result = await (markInstallationChanged as any)._handler(ctx, {
      installationId: "installation-1",
      action: "removed",
      removedProviderRepositoryIds: [secondRepository.providerRepositoryId],
    });

    expect(result).toMatchObject({
      updated: true,
      updatedCount: 2,
      revokedCount: 1,
    });
    expect(records.githubAppInstallations[0].status).toBe("DEGRADED");
    expect(records.githubAppInstallations[1].status).toBe("REVOKED");
    expect(records.workspaceRepositories[0].webhookStatus).toBe("READY");
    expect(records.workspaceRepositories[1].webhookStatus).toBe("ERROR");
  });
});
