import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FactoryContextRunCard } from "./FactoryContextRunCard";

describe("FactoryContextRunCard", () => {
  it("shows the exact frozen sources without granting acceptance authority", () => {
    render(
      <FactoryContextRunCard
        enabled
        detail={{
          contextPackage: {
            contentHash: "sha256:context-0042",
            estimatedTokens: 420,
            generatedAt: Date.UTC(2026, 7, 15, 12, 0, 0),
            items: [
              {
                chunkId: "chunk-1",
                sourceId: "ADR-004",
                sourceType: "adr",
                reason: "Governs the orders authorization boundary.",
                priority: "required",
                estimatedTokens: 42,
                provenance: { revision: "fixture-sha-0042" },
              },
            ],
          },
          verificationPlan: {
            advisoryOnly: true,
            checks: [
              {
                id: "orders-auth",
                name: "Orders endpoints reject anonymous access",
                evidenceRequired: true,
              },
            ],
          },
          evaluations: [{ _id: "eval-1", passed: true }],
        }}
      />,
    );

    expect(screen.getByText("Frozen Factory context")).toBeInTheDocument();
    expect(screen.getByText("ADR-004")).toBeInTheDocument();
    expect(screen.getByText("fixture-sha-0042")).toBeInTheDocument();
    expect(
      screen.getByText(/do not satisfy acceptance criteria/i),
    ).toBeInTheDocument();
  });

  it("explains compatibility when the phase is disabled", () => {
    render(<FactoryContextRunCard enabled={false} detail={undefined} />);

    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(
      screen.getByText(/execution and verification authority is unchanged/i),
    ).toBeInTheDocument();
  });
});
