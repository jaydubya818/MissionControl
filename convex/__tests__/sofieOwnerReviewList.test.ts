import { beforeEach, expect, it, vi } from "vitest";
import { list } from "../sofieOwnerReview";
import { requireWorkspaceAccess } from "../lib/companyAccess";

// These handler tests cover bounded response semantics. Canonical authorization
// is exercised separately against the real database.
vi.mock("../lib/missionScopedFunctions", () => ({
  mutation: (definition: any) => definition,
  query: (definition: any) => definition,
}));
vi.mock("../sofieEnterprise", () => ({ projectMission: vi.fn() }));
vi.mock("../missions", () => ({ acceptMission: vi.fn() }));
vi.mock("../lib/sofieEnterpriseResult", () => ({
  projectEnterpriseResult: vi.fn(),
  resultMissionScope: vi.fn(),
}));
vi.mock("../lib/sofieEnterpriseAuthority", () => ({
  currentConnection: vi.fn(),
}));
vi.mock("../lib/companyAccess", () => ({
  COMPANY_PERMISSIONS: { APPROVE_DELIVERY: "approve" },
  requireWorkspaceAccess: vi.fn(),
}));
const access = vi.mocked(requireWorkspaceAccess);
beforeEach(() => {
  vi.resetAllMocks();
  access.mockResolvedValue({
    membership: { mode: "AUTHENTICATED", operatorId: "owner" },
  } as any);
});
function fixture(connectionCount: number, proposalCounts: number[]) {
  const connections = Array.from({ length: connectionCount }, (_, i) => ({
    _id: `connection-${i}`,
    ownerId: "owner",
    projectId: "project",
    tenantId: "tenant",
    expiresAt: Date.now() + 60000,
  }));
  const proposals = connections.map((connection, i) =>
    Array.from({ length: proposalCounts[i] ?? 0 }, (_, j) => ({
      _id: `proposal-${i}-${j}`,
      ownerId: "owner",
      projectId: "project",
      tenantId: "tenant",
      connectionId: connection._id,
      digest: `digest-${i}-${j}`,
      proposal: { title: `Proposal ${i}-${j}` },
      missionId: null,
    })),
  );
  const takes: number[] = [];
  const ctx = {
    db: {
      get: async () => ({ tenantId: "tenant" }),
      query: (table: string) => ({
        withIndex: (_name: string, bind: (q: any) => void) => {
          let value: string;
          bind({
            eq: (_field: string, input: string) => {
              value = input;
            },
          });
          return {
            take: async (limit: number) => {
              takes.push(limit);
              const rows =
                table === "enterpriseAppConnections"
                  ? connections.filter((c) => c.ownerId === value)
                  : (proposals[connections.findIndex((c) => c._id === value)] ??
                    []);
              return rows.slice(0, limit);
            },
          };
        },
      }),
    },
  };
  return {
    connections,
    proposals,
    takes,
    run: () => (list as any).handler(ctx, { projectId: "project" }),
  };
}
it("returns a complete list at the per-connection and total boundaries", async () => {
  const f = fixture(2, [50, 50]);
  const output = await f.run();
  expect(output.truncated).toBe(false);
  expect(output.proposals).toHaveLength(100);
  expect(output.proposals[99]).toEqual({
    id: "proposal-1-49",
    digest: "digest-1-49",
    title: "Proposal 1-49",
    missionId: null,
  });
  expect(f.takes).toEqual([51, 51, 51]);
});
it("reports proposal overflow and returns only the first 50 per connection", async () => {
  const f = fixture(1, [51]);
  const output = await f.run();
  expect(output.truncated).toBe(true);
  expect(output.proposals).toHaveLength(50);
  expect(output.proposals.some((p: any) => p.id === "proposal-0-50")).toBe(
    false,
  );
});
it("reports total overflow without returning more than 100 proposals", async () => {
  const f = fixture(3, [50, 50, 1]);
  const output = await f.run();
  expect(output.truncated).toBe(true);
  expect(output.proposals).toHaveLength(100);
});
it("distinguishes the exact connection boundary from an incomplete scan", async () => {
  expect(await fixture(50, []).run()).toEqual({
    proposals: [],
    truncated: false,
  });
  const f = fixture(51, []);
  f.connections[0].projectId = "other-project";
  expect(await f.run()).toEqual({ proposals: [], truncated: true });
  expect(f.takes).toHaveLength(50); // One connection is filtered before its proposal scan.
});
it("preserves live connection and owner, project, and tenant filters", async () => {
  const f = fixture(5, [4, 1, 1, 1, 1]);
  f.proposals[0][0].ownerId = "foreign";
  f.proposals[0][1].projectId = "foreign";
  f.proposals[0][2].tenantId = "foreign";
  f.connections[1].expiresAt = 0;
  Object.assign(f.connections[2], { revokedAt: 1 });
  f.connections[3].projectId = "foreign";
  f.connections[4].tenantId = "foreign";
  expect(await f.run()).toEqual({
    proposals: [
      {
        id: "proposal-0-3",
        digest: "digest-0-3",
        title: "Proposal 0-3",
        missionId: null,
      },
    ],
    truncated: false,
  });
});
it("returns the explicit empty contract without an authenticated operator", async () => {
  const f = fixture(1, [1]);
  access.mockResolvedValue({ membership: { mode: "AUTHENTICATED" } } as any);
  expect(await f.run()).toEqual({ proposals: [], truncated: false });
  expect(f.takes).toEqual([]);
});
