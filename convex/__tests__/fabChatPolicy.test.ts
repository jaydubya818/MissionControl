import { describe, expect, it } from "vitest";
import { buildOperatorPersonalization, buildProactiveItems, redactFabContextText, reserveProviderBudget, selectFabRoute } from "../fabChat";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

describe("Fab chat policy", () => {
  it("uses the architect route for design and fix work while keeping routine status reads inexpensive", () => {
    expect(selectFabRoute("What is the current status?")).toBe("ROUTINE");
    expect(selectFabRoute("Suggest fixes for repeated failed attempts across the stack")).toBe("ARCHITECT");
    expect(selectFabRoute("Design the target architecture and implementation plan")).toBe("ARCHITECT");
  });

  it("removes common credentials and personal identifiers from provider context", () => {
    const source = "owner@example.com token=github_pat_1234567890 /Users/jaywest/private Bearer sk-secret123456";
    const result = redactFabContextText(source, 500);

    expect(result).toContain("[redacted-email]");
    expect(result).toContain("token=[redacted]");
    expect(result).toContain("/Users/[redacted]/private");
    expect(result).toContain("Bearer [redacted]");
    expect(result).not.toContain("owner@example.com");
    expect(result).not.toContain("github_pat_1234567890");
    expect(result).not.toContain("jaywest");
    expect(result).not.toContain("sk-secret123456");
  });

  it("minimizes and redacts saved operator personalization before provider use", () => {
    const operator = buildOperatorPersonalization({
      communicationStyle: "EXECUTIVE",
      preferences: "Email owner@example.com and use token=github_pat_1234567890",
      memory: `Keep releases calm. Bearer sk-secret123456 ${"x".repeat(3_000)}`,
    });

    expect(operator).toMatchObject({ responseStyle: "EXECUTIVE" });
    expect(operator?.preferences).toContain("[redacted-email]");
    expect(operator?.preferences).toContain("token=[redacted]");
    expect(operator?.memory).toContain("Bearer [redacted]");
    expect(operator?.memory.length).toBeLessThanOrEqual(2_500);
    expect(JSON.stringify(operator)).not.toContain("owner@example.com");
    expect(JSON.stringify(operator)).not.toContain("github_pat_1234567890");
    expect(JSON.stringify(operator)).not.toContain("sk-secret123456");
  });

  it("redacts a credential before truncating personalized context", () => {
    const result = redactFabContextText(`${"a".repeat(30)} token=github_pat_1234567890`, 45);

    expect(result).toContain("token=[redact");
    expect(result).not.toContain("github_pat");
  });

  it("applies each operator's proactive categories and cost threshold without a provider call", () => {
    const state = {
      openAlerts: [{ severity: "CRITICAL", title: "Production queue stalled", _creationTime: 10 }],
      failedTraces: [{ name: "release verification", _creationTime: 20 }],
      openIncidents: [],
      openSuggestions: [{ title: "Add queue saturation guard", impact: "HIGH", _creationTime: 30 }],
      executionCostUsd: 7.5,
      latestCostAt: 40,
    };
    const profile = { communicationStyle: "CONCISE" as const, proactiveEnabled: true, notifyCritical: false, notifyFailures: true, costThresholdUsd: 5, preferences: "", memory: "" };

    expect(buildProactiveItems(state, profile).map((item) => item.kind)).toEqual([
      "COST_THRESHOLD",
      "FIX_PROPOSAL",
      "FAILED_TRACE",
    ]);
    expect(buildProactiveItems(state, { ...profile, proactiveEnabled: false })).toEqual([]);
  });

  it("enforces one deployment-wide liability ceiling across route classes", async () => {
    const budgets: any[] = [];
    const receipts: any[] = [];
    const db = {
      query: (table: string) => ({
        withIndex: (_index: string, apply: (q: any) => any) => {
          const filters: Record<string, unknown> = {};
          const q = { eq: (field: string, value: unknown) => { filters[field] = value; return q; } };
          apply(q);
          return {
            unique: async () => table === "fabChatBudgets"
              ? budgets[0] ?? null
              : receipts.find((row) => row.projectId === filters.projectId && row.idempotencyKey === filters.idempotencyKey) ?? null,
          };
        },
      }),
      insert: async (table: string, value: any) => {
        if (table === "fabChatBudgets") {
          budgets.push({ _id: "budget-1", ...value });
          return "budget-1";
        }
        receipts.push({ _id: `receipt-${receipts.length + 1}`, ...value });
        return receipts.at(-1)._id;
      },
      patch: async (id: string, value: any) => {
        const row = [...budgets, ...receipts].find((candidate) => candidate._id === id);
        Object.assign(row, value);
      },
    };
    const handler = functionHandler<(ctx: any, args: any) => Promise<any>>(reserveProviderBudget);
    const args = { projectId: "project-1", tenantId: "tenant-1", hardLimitNanoUsd: 1_940_000_000, routeClass: "ARCHITECT", contextDigest: "sha256:test", contextClasses: ["operations"] };

    for (let count = 0; count < 19; count += 1) await handler({ db }, { ...args, idempotencyKey: `architect-${count}` });
    await handler({ db }, { ...args, routeClass: "ROUTINE", idempotencyKey: "routine-1" });
    await handler({ db }, { ...args, routeClass: "ROUTINE", idempotencyKey: "routine-2" });

    expect(budgets[0].scopeKey).toBe("deployment");
    expect(budgets[0].reservedNanoUsd).toBe(1_940_000_000);
    await expect(handler({ db }, { ...args, routeClass: "ROUTINE", idempotencyKey: "routine-over-limit" })).rejects.toThrow(/lifetime spend ceiling/);

    const duplicate = await handler({ db }, { ...args, routeClass: "ROUTINE", idempotencyKey: "routine-2" });
    expect(duplicate.reserved).toBe(false);
    expect(budgets[0].reservedNanoUsd).toBe(1_940_000_000);
  });
});
