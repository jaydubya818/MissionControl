import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  EvidenceAuthorityBadge,
  authorityKindForObservation,
  authorityKindForProducer,
  verificationIsGreen,
} from "./EvidenceAuthorityBadge";

afterEach(cleanup);

describe("evidence authority is shown truthfully", () => {
  it("does not read a missing definitionAuthority as independent", () => {
    // Omission must never be the optimistic case: evidence predating the axis
    // is unknown, not independent.
    expect(authorityKindForProducer({ independent: true })).toBe("UNKNOWN");
    expect(authorityKindForProducer(undefined)).toBe("UNKNOWN");
  });

  it("distinguishes a candidate-defined pass from an independent one", () => {
    expect(
      authorityKindForProducer({ independent: true, definitionAuthority: "CANDIDATE_DEPENDENT" }),
    ).toBe("CANDIDATE_DEPENDENT");
    expect(
      authorityKindForProducer({ independent: true, definitionAuthority: "INDEPENDENT" }),
    ).toBe("INDEPENDENT");
  });

  it("shows a self-reported CI status as self-reported, not as external CI", () => {
    expect(authorityKindForObservation("EXECUTION_CLAIM")).toBe("EXECUTION_CLAIM");
    expect(authorityKindForObservation("EXTERNAL_CI_ATTESTATION")).toBe("EXTERNAL_OBSERVED");
    expect(authorityKindForObservation(undefined)).toBe("UNKNOWN");
  });

  it("surfaces the server's specific reason rather than a generic label", () => {
    render(
      <EvidenceAuthorityBadge
        kind="CANDIDATE_DEPENDENT"
        reason="pnpm is defined by PACKAGE_MANIFEST, and this candidate modified PACKAGE_MANIFEST."
      />,
    );
    const badge = screen.getByText("Candidate-dependent");
    expect(badge.getAttribute("title")).toContain("this candidate modified PACKAGE_MANIFEST");
  });

  it("falls back to an explanatory summary when no reason is supplied", () => {
    render(<EvidenceAuthorityBadge kind="EXECUTION_CLAIM" />);
    expect(screen.getByText("Self-reported").getAttribute("title")).toMatch(
      /only thing asserting it succeeded/,
    );
  });

  it("only calls a verification green when the verdict is actually VERIFIED", () => {
    expect(verificationIsGreen("VERIFIED")).toBe(true);
    for (const verdict of ["NOT_VERIFIED", "BLOCKED", "REQUIRES_HUMAN_REVIEW", undefined]) {
      expect(verificationIsGreen(verdict)).toBe(false);
    }
  });
});
