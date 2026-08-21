import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareToBaseline,
  scanConvexAuthorization,
  toIdentifiers,
} from "./convex-authorization-scan.mjs";

const created = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), "mc-authz-scan-"));
  created.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(root, "convex", relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  return root;
}

describe("convex authorization scan", () => {
  it("flags a public function whose own body resolves no authority", () => {
    const root = fixture({
      "revenue.ts": `
        export const record = mutation({
          args: {},
          handler: async (ctx) => { await ctx.db.insert("revenueEvents", {}); },
        });
      `,
    });
    const scan = scanConvexAuthorization(root);
    expect(toIdentifiers(scan.unauthorized)).toEqual(["revenue:record"]);
  });

  it("does not let a neighbouring authorized function launder an unauthorized one", () => {
    // The whole point of isolating each function body: a file-wide grep would
    // see `requireWorkspaceAccess` and pass both.
    const root = fixture({
      "mixed.ts": `
        export const guarded = query({
          args: {},
          handler: async (ctx, args) => {
            await requireWorkspaceAccess(ctx, args.tenantId, args.projectId, {});
            return [];
          },
        });
        export const open = mutation({
          args: {},
          handler: async (ctx) => { await ctx.db.insert("tasks", {}); },
        });
      `,
    });
    expect(toIdentifiers(scanConvexAuthorization(root).unauthorized)).toEqual(["mixed:open"]);
  });

  it("follows one level of module-local authorization helpers", () => {
    const root = fixture({
      "webhooks.ts": `
        async function requireWebhookWorkspace(ctx, projectId) {
          return await requireWorkspaceAccess(ctx, "t", projectId, {});
        }
        export const list = query({
          args: {},
          handler: async (ctx, args) => {
            await requireWebhookWorkspace(ctx, args.projectId);
            return [];
          },
        });
      `,
    });
    expect(scanConvexAuthorization(root).unauthorized).toEqual([]);
  });

  it("treats internal functions as out of scope entirely", () => {
    const root = fixture({
      "seed.ts": `
        export const seedV0 = internalMutation({
          args: {},
          handler: async (ctx) => { await ctx.db.insert("agents", {}); },
        });
      `,
    });
    const scan = scanConvexAuthorization(root);
    expect(scan.total).toBe(0);
    expect(scan.unauthorized).toEqual([]);
  });

  it("counts authorizing wrappers as authorized and publicQuery as declared-public", () => {
    const root = fixture({
      "health.ts": `
        export const check = publicQuery({
          args: {},
          reason: "Load-balancer liveness probe; returns no tenant data.",
          handler: async () => ({ ok: true }),
        });
        export const listForWorkspace = workspaceQuery({
          args: {},
          permission: "factory.read",
          handler: async () => [],
        });
      `,
    });
    const scan = scanConvexAuthorization(root);
    expect(scan.authorizedCount).toBe(1);
    expect(scan.declaredPublicCount).toBe(1);
    expect(scan.unauthorized).toEqual([]);
  });

  it("ratchets: additions fail, removals are reported as progress", () => {
    const baseline = ["a:one", "a:two"];
    expect(compareToBaseline(["a:one", "a:two", "a:three"], baseline)).toEqual({
      added: ["a:three"],
      removed: [],
    });
    expect(compareToBaseline(["a:one"], baseline)).toEqual({
      added: [],
      removed: ["a:two"],
    });
  });
});
