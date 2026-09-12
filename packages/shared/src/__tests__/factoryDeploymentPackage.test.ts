import { describe, expect, it } from "vitest";
import {
  FACTORY_DEPLOYMENT_PACKAGE_SCHEMA,
  FactoryPackageContractError,
  canonicalFactoryPackageJson,
  factoryDeploymentPackageDigest,
  validateFactoryPackageRetrieval,
  type FactoryPackageRetrieval,
} from "../factoryDeploymentPackage.js";

const issuer = {
  issuer_id: "factory-engineer-production",
  issuer_type: "FDLC_FACTORY_ENGINEER" as const,
  environment: "production",
  authority_scope: "DEPLOYMENT_PACKAGE_PUBLISH" as const,
};

function validRetrieval(): FactoryPackageRetrieval {
  const approval = {
    decision_ref: {
      kind: "APPROVED_INPUT" as const,
      ref: "fe://decision/00000000-0000-4000-8000-000000000020",
      version: 1,
      sha256: `sha256:${"4".repeat(64)}`,
    },
    approved_by: "00000000-0000-4000-8000-000000000010",
    authorized_by_ref: "fe://operator/00000000-0000-4000-8000-000000000010",
    authority_basis_ref: {
      kind: "APPROVED_INPUT" as const,
      ref: "fe://authority/00000000-0000-4000-8000-000000000030",
      version: 1,
      sha256: `sha256:${"5".repeat(64)}`,
    },
    approved_at: "2026-09-04T17:55:00Z",
  };
  const packageWithoutDigest = {
    schema_version: FACTORY_DEPLOYMENT_PACKAGE_SCHEMA,
    package_id: "00000000-0000-4000-8000-000000000001",
    package_version: 1,
    status: "PUBLISHED" as const,
    issuer: { ...issuer },
    issued_at: "2026-09-04T18:00:00Z",
    approval,
    integrity: {
      canonicalization: "fdlc-canonical-json/v1" as const,
      algorithm: "sha256" as const,
      digest: "",
    },
    source: {
      engagement_id: "00000000-0000-4000-8000-000000000002",
      customer_factory_model: {
        id: "00000000-0000-4000-8000-000000000003",
        version: 2,
        digest: `sha256:${"6".repeat(64)}`,
      },
      current_workflow: {
        id: "00000000-0000-4000-8000-000000000004",
        version: 1,
        digest: `sha256:${"7".repeat(64)}`,
      },
      target_workflow: {
        id: "00000000-0000-4000-8000-000000000005",
        version: 3,
        digest: `sha256:${"8".repeat(64)}`,
      },
      readiness_assessment: {
        id: "00000000-0000-4000-8000-000000000006",
        version: 1,
        digest: `sha256:${"9".repeat(64)}`,
      },
      factory_opportunity: {
        id: "00000000-0000-4000-8000-000000000007",
        version: 1,
        digest: `sha256:${"a".repeat(64)}`,
      },
    },
    target: {
      workspace_ref: "sellerfi-production",
      repository_ref: "github:sellerfi/platform",
      requested_code_scopes: ["package.json", "pnpm-lock.yaml"],
      semantic_execution_workflow_ref: "software-change/default",
      environment_class: "POLICY_SELECTED" as const,
    },
    deployment_intent: {
      mission_title: "Modernize supported dependencies",
      mission_context:
        "Factory Engineer approved a governed dependency modernization proposal.",
      stop_condition:
        "Stop when an authority, scope, or verification gate cannot be satisfied.",
      plan_summary:
        "Prepare a governed dependency update and validate behavior independently.",
      rollback_approach:
        "Revert the isolated change before any release is authorized.",
      objective: "Modernize dependencies without changing customer behavior.",
      intent: "Prepare a governed dependency modernization change.",
      specification:
        "Update supported dependencies and preserve all verified behavior.",
      acceptance_criteria: [
        {
          key: "dependencies-current",
          statement: "Supported dependencies are current.",
          verification_method: "TEST" as const,
        },
      ],
      constraints: [
        {
          key: "no-behavior-change",
          statement: "Do not change observable behavior.",
        },
      ],
      required_capabilities: [
        {
          key: "dependency-update",
          statement: "Update supported dependencies.",
        },
      ],
      required_agents: [],
      required_skills: [],
      required_tools: [],
      model_requirements: [],
      context_requirements: [
        { key: "repository", statement: "Use the approved repository scope." },
      ],
      environment_requirements: [
        { key: "isolated", statement: "Use an isolated worktree." },
      ],
      authority_boundaries: [
        {
          key: "dependency-worker",
          subject: "dependency-worker",
          maximum_authority: "Prepare a pull request only.",
          prohibited_actions: ["merge", "deploy"],
        },
      ],
      policy_requirements: [
        {
          key: "human-plan-approval",
          statement: "Require Mission Control plan approval.",
        },
      ],
      approval_requirements: [
        {
          key: "human-review",
          statement: "Require human review before execution.",
        },
      ],
      verification_contract: [
        {
          key: "dependency-tests",
          statement: "Run dependency and regression tests.",
          evidence_required: ["test result"],
          independent: true,
        },
      ],
      evaluation_requirements: [
        { key: "regression", statement: "Evaluate behavior regressions." },
      ],
      rollback_requirements: [
        { key: "revert", statement: "Revert the isolated change." },
      ],
      observability_requirements: [
        { key: "ci", statement: "Observe required CI checks." },
      ],
      economics_baseline: {
        annual_net_benefit_cents: 1200000,
        currency: "USD",
      },
      risk_summary: [
        {
          key: "dependency-risk",
          statement: "Transitive incompatibility may block the change.",
        },
      ],
      evidence_refs: [
        {
          kind: "EVIDENCE",
          ref: "fe://evidence/evidence-1",
          sha256: `sha256:${"1".repeat(64)}`,
        },
      ],
      decision_refs: [
        {
          kind: "APPROVED_INPUT",
          ref: "fe://decision/decision-1",
          version: 1,
          sha256: `sha256:${"2".repeat(64)}`,
        },
      ],
      provenance: [
        {
          kind: "VERIFIED_CLAIM",
          ref: "fe://claim/claim-1",
          version: 2,
          sha256: `sha256:${"3".repeat(64)}`,
        },
      ],
      plan_assertions: [
        {
          assertion_id: "dependencies-current",
          title: "Dependencies are current",
          outcome: "Supported dependencies are current and tests pass.",
          verification_method: "TEST" as const,
          pass_condition:
            "The approved dependency and regression suites exit zero.",
          required_evidence:
            "Independent test output bound to the candidate revision.",
          requires_independent_validation: true,
          waiver_allowed: false,
        },
      ],
      work_order_blueprints: [
        {
          key: "update-dependencies",
          title: "Update supported dependencies",
          outcome: "A review-ready dependency update is prepared.",
          requirements: ["dependency-update"],
          acceptance_criterion_refs: ["dependencies-current"],
          constraints: ["no-behavior-change"],
          requested_code_scopes: ["package.json", "pnpm-lock.yaml"],
          capability_requirement_refs: ["dependency-update"],
          verification_requirement_refs: ["dependency-tests"],
          authority_boundary_refs: ["dependency-worker"],
          sequence: 1,
          execution_role: "WORKER" as const,
          is_mutating: true,
          priority: 2 as const,
          risk_level: "MEDIUM" as const,
          required_approvals: ["human-review"],
          dependencies: [],
          assertion_ids: ["dependencies-current"],
        },
      ],
    },
  };
  const digest = factoryDeploymentPackageDigest(packageWithoutDigest);
  return {
    package: {
      ...packageWithoutDigest,
      integrity: { ...packageWithoutDigest.integrity, digest },
    },
    attestation: {
      package_id: packageWithoutDigest.package_id,
      package_version: packageWithoutDigest.package_version,
      digest,
      current_status: "PUBLISHED",
      issuer: { ...issuer },
      approval: structuredClone(approval),
      published_at: "2026-09-04T18:00:00Z",
      retrieved_at: "2026-09-04T18:05:00Z",
      correlation_id: "00000000-0000-4000-8000-000000000008",
    },
  };
}

function validate(retrieval: unknown, expectedIssuer = issuer) {
  return validateFactoryPackageRetrieval(retrieval, expectedIssuer, {
    nowMs: Date.parse("2026-09-04T18:06:00Z"),
  });
}

function reseal(retrieval: FactoryPackageRetrieval): FactoryPackageRetrieval {
  const digest = factoryDeploymentPackageDigest(retrieval.package);
  retrieval.package.integrity.digest = digest;
  retrieval.attestation.digest = digest;
  return retrieval;
}

describe("Factory Deployment Package contract", () => {
  it("canonicalizes recursively with stable object-key order and preserved arrays", () => {
    expect(
      canonicalFactoryPackageJson({ z: 2, a: { y: 2, x: 1 }, list: [3, 1] }),
    ).toBe('{"a":{"x":1,"y":2},"list":[3,1],"z":2}');
    expect(() => canonicalFactoryPackageJson({ amount: 1.5 })).toThrow(
      /safe integers/,
    );
    expect(() =>
      canonicalFactoryPackageJson({ é: "not-an-ascii-key" }),
    ).toThrow(/non-ASCII/);
    expect(() => canonicalFactoryPackageJson("\ud800")).toThrow(
      /invalid Unicode/,
    );
  });

  it("accepts a current package from the configured issuer with a stable digest", () => {
    const retrieval = validRetrieval();
    expect(validate(retrieval)).toEqual(retrieval);
    expect(factoryDeploymentPackageDigest(retrieval.package)).toBe(
      retrieval.package.integrity.digest,
    );
  });

  it.each([
    ["REVOKED", "PACKAGE_REVOKED"],
    ["STALE", "PACKAGE_STALE"],
    ["SUPERSEDED", "PACKAGE_NOT_PUBLISHED"],
  ] as const)("rejects an authoritative %s state", (current_status, code) => {
    const retrieval = validRetrieval();
    retrieval.attestation.current_status = current_status;
    expect(() => validate(retrieval)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("requires the immutable status-at-issuance to remain PUBLISHED", () => {
    const retrieval = validRetrieval() as unknown as {
      package: { status: string };
    };
    retrieval.package.status = "REVOKED";
    expect(() => validate(retrieval)).toThrow(
      expect.objectContaining({ code: "PACKAGE_REVOKED" }),
    );
  });

  it("rejects a stale retrieval attestation even when the package remains published", () => {
    const retrieval = validRetrieval();
    expect(() =>
      validateFactoryPackageRetrieval(retrieval, issuer, {
        nowMs: Date.parse("2026-09-04T18:11:00Z"),
        maxAttestationAgeMs: 5 * 60_000,
      }),
    ).toThrow(expect.objectContaining({ code: "PACKAGE_STALE" }));
  });

  it("rejects an untrusted issuer and any identity disagreement", () => {
    const retrieval = validRetrieval();
    retrieval.attestation.issuer.issuer_id = "untrusted";
    expect(() => validate(retrieval)).toThrow(
      expect.objectContaining({ code: "ORIGIN_UNVERIFIED" }),
    );
  });

  it("rejects unsupported schema, changed content, and mismatched attestation", () => {
    const unsupported = validRetrieval() as unknown as {
      package: { schema_version: string };
    };
    unsupported.package.schema_version = "fdlc.factory-deployment-package/v2";
    expect(() => validate(unsupported)).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_CONTRACT_VERSION" }),
    );

    const changed = validRetrieval();
    changed.package.deployment_intent.objective = "Tampered";
    expect(() => validate(changed)).toThrow(
      expect.objectContaining({ code: "DIGEST_MISMATCH" }),
    );

    const mismatched = validRetrieval();
    mismatched.attestation.package_version = 2;
    expect(() => validate(mismatched)).toThrow(
      expect.objectContaining({ code: "ORIGIN_UNVERIFIED" }),
    );
  });

  it("rejects incomplete approval, assertion, authority, and blueprint graphs", () => {
    const retrieval = validRetrieval();
    retrieval.attestation.approval.authority_basis_ref.ref = "";
    expect(() => validate(retrieval)).toThrow(
      expect.objectContaining({ code: "APPROVAL_UNVERIFIED" }),
    );

    const missingAssertion = validRetrieval();
    missingAssertion.package.deployment_intent.work_order_blueprints[0].assertion_ids =
      ["missing"];
    missingAssertion.package.integrity.digest = factoryDeploymentPackageDigest(
      missingAssertion.package,
    );
    missingAssertion.attestation.digest =
      missingAssertion.package.integrity.digest;
    expect(() => validate(missingAssertion)).toThrow(
      expect.objectContaining({ code: "INVALID_PACKAGE" }),
    );
  });

  it("requires the attestation to repeat the exact immutable approval binding", () => {
    const retrieval = validRetrieval();
    retrieval.attestation.approval.authorized_by_ref =
      "fe://operator/another-authorizer";
    expect(() => validate(retrieval)).toThrow(
      expect.objectContaining({ code: "APPROVAL_UNVERIFIED" }),
    );
  });

  it("independently rejects approval, duplicate-reference, and dependency-order graph drift", () => {
    const unknownApproval = validRetrieval();
    unknownApproval.package.deployment_intent.work_order_blueprints[0].required_approvals =
      ["missing"];
    expect(() => validate(reseal(unknownApproval))).toThrow(
      expect.objectContaining({ code: "INVALID_PACKAGE" }),
    );

    const duplicateReference = validRetrieval();
    duplicateReference.package.deployment_intent.work_order_blueprints[0].assertion_ids.push(
      "dependencies-current",
    );
    expect(() => validate(reseal(duplicateReference))).toThrow(
      expect.objectContaining({ code: "INVALID_PACKAGE" }),
    );

    const laterDependency = validRetrieval();
    const first =
      laterDependency.package.deployment_intent.work_order_blueprints[0];
    const later = structuredClone(first);
    later.key = "later-blueprint";
    later.sequence = 2;
    later.dependencies = [];
    first.dependencies = [later.key];
    laterDependency.package.deployment_intent.work_order_blueprints.push(later);
    expect(() => validate(reseal(laterDependency))).toThrow(
      expect.objectContaining({ code: "INVALID_PACKAGE" }),
    );
  });

  it("rejects approved acceptance intent that no blueprint carries forward", () => {
    const retrieval = validRetrieval();
    retrieval.package.deployment_intent.acceptance_criteria.push({
      key: "uncovered-criterion",
      statement:
        "A distinct approved criterion must remain visible in the Plan.",
      verification_method: "Inspect the criterion lineage in the Plan.",
    });
    expect(() => validate(reseal(retrieval))).toThrow(
      expect.objectContaining({ code: "INVALID_PACKAGE" }),
    );
  });

  it("enforces the shared 50-scope receiver limit", () => {
    const retrieval = validRetrieval();
    const scopes = Array.from(
      { length: 51 },
      (_, index) => `packages/scope-${index}`,
    );
    retrieval.package.target.requested_code_scopes = scopes;
    retrieval.package.deployment_intent.work_order_blueprints[0].requested_code_scopes =
      scopes;
    expect(() => validate(reseal(retrieval))).toThrow(
      expect.objectContaining({ code: "INVALID_PACKAGE" }),
    );
  });

  it("uses stable contract errors", () => {
    const error = new FactoryPackageContractError("DIGEST_MISMATCH", "changed");
    expect(error).toMatchObject({
      name: "FactoryPackageContractError",
      code: "DIGEST_MISMATCH",
    });
  });
});
