import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ actorId: "operator-a", tenantId: "tenant-a" as string | undefined }));

vi.mock("../lib/companyAccess", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/companyAccess")>(),
  requireWorkspacePermission: vi.fn(async () => ({
    actorId: access.actorId,
    project: { tenantId: access.tenantId },
  })),
}));

import { getProfile, markProactiveReviewed, saveProfile } from "../fabChat";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function profileDatabase() {
  const rows: any[] = [];
  return {
    rows,
    db: {
      query: (table: string) => ({
        withIndex: (_index: string, apply: (q: any) => any) => {
          const filters: Record<string, unknown> = {};
          const q = { eq: (field: string, value: unknown) => { filters[field] = value; return q; } };
          apply(q);
          return {
            unique: async () => table === "fabOperatorProfiles"
              ? rows.find((row) => row.tenantId === filters.tenantId && row.actorId === filters.actorId) ?? null
              : null,
          };
        },
      }),
      insert: async (_table: string, value: any) => {
        rows.push({ _id: `profile-${rows.length + 1}`, ...value });
        return rows.at(-1)._id;
      },
      patch: async (id: string, value: any) => Object.assign(rows.find((row) => row._id === id), value),
    },
  };
}

const profileInput = {
  projectId: "project-a",
  communicationStyle: "DETAILED" as const,
  proactiveEnabled: true,
  notifyCritical: true,
  notifyFailures: false,
  costThresholdUsd: 12.5,
  preferences: "Prioritize launch blockers",
  memory: "The operator owns reliability",
};

describe("Fab operator profiles", () => {
  beforeEach(() => {
    access.actorId = "operator-a";
    access.tenantId = "tenant-a";
  });

  it("keeps saved preferences and review state private to the authenticated operator", async () => {
    const state = profileDatabase();
    await functionHandler<any>(saveProfile)({ db: state.db }, profileInput);
    await functionHandler<any>(markProactiveReviewed)({ db: state.db }, { projectId: "project-a" });

    expect(await functionHandler<any>(getProfile)({ db: state.db }, { projectId: "project-a" })).toMatchObject({
      communicationStyle: "DETAILED",
      preferences: "Prioritize launch blockers",
      memory: "The operator owns reliability",
    });
    expect(state.rows[0].lastReviewedAt).toEqual(expect.any(Number));

    access.actorId = "operator-b";
    expect(await functionHandler<any>(getProfile)({ db: state.db }, { projectId: "project-a" })).toMatchObject({
      communicationStyle: "CONCISE",
      preferences: "",
      memory: "",
    });
  });

  it("fails closed when a workspace has no tenant identity", async () => {
    const state = profileDatabase();
    access.tenantId = undefined;

    await expect(functionHandler<any>(saveProfile)({ db: state.db }, profileInput)).rejects.toThrow(/tenant-scoped workspace/);
    expect(state.rows).toEqual([]);
  });
});
