import { describe, expect, it } from "vitest";
import {
  assertFactoryPackageLocalProjectBinding,
  assertFactoryPackageTargetBinding,
  FACTORY_PACKAGE_QUALIFICATION_FLAG,
  factoryPackageImportKey,
  factoryPackageGovernanceBlockers,
  factoryPackageQualificationEnabled,
  mapFactoryPackageToDrafts,
  resolveFactoryPackageImportRetry,
} from "../lib/factoryPackageImport";
import type { FactoryPackageRetrieval } from "@mission-control/shared";

const packageDigest = `sha256:${"a".repeat(64)}`;

function retrieval(): FactoryPackageRetrieval {
  return {
    package: {
      schema_version: "fdlc.factory-deployment-package/v1",
      package_id: "00000000-0000-4000-8000-000000000001",
      package_version: 3,
      status: "PUBLISHED",
      issuer: {
        issuer_id: "factory-engineer-production",
        issuer_type: "FDLC_FACTORY_ENGINEER",
        environment: "production",
        authority_scope: "DEPLOYMENT_PACKAGE_PUBLISH",
      },
      issued_at: "2026-09-04T18:00:00Z",
      approval: {} as never,
      integrity: {
        canonicalization: "fdlc-canonical-json/v1",
        algorithm: "sha256",
        digest: packageDigest,
      },
      source: {} as never,
      target: {
        workspace_ref: "sellerfi-production",
        repository_ref: "github.com/sellerfi/platform",
        requested_code_scopes: ["apps/api", "packages/contracts"],
        semantic_execution_workflow_ref: "software-change/default",
        environment_class: "ISOLATED_NON_PRODUCTION",
      },
      deployment_intent: {
        mission_title: "Import the approved factory change",
        mission_context:
          "A current Factory Engineer package is ready for governed planning.",
        stop_condition:
          "Stop when any authority or verification gate cannot be satisfied.",
        plan_summary:
          "Create an editable Mission Control plan from the approved proposal.",
        rollback_approach: "Revert the isolated change before release.",
        objective: "Prepare the approved change without releasing it.",
        intent: "Prepare only.",
        specification: "Bounded spec.",
        acceptance_criteria: [
          {
            key: "assertion-1",
            statement: "All approved acceptance intent survives draft mapping.",
            verification_method: "Inspect the mapped Plan draft.",
          },
        ],
        constraints: [
          { key: "no-release", statement: "Do not release automatically." },
        ],
        required_capabilities: [
          {
            key: "implementation",
            statement: "Prepare a bounded code change.",
          },
        ],
        required_agents: [],
        required_skills: [],
        required_tools: [],
        model_requirements: [],
        context_requirements: [
          { key: "repository", statement: "Use only the selected repository." },
        ],
        environment_requirements: [
          { key: "isolation", statement: "Use an isolated checkout." },
        ],
        authority_boundaries: [
          {
            key: "worker",
            subject: "implementation worker",
            maximum_authority: "Prepare a review-ready change.",
            prohibited_actions: ["merge", "deploy"],
          },
        ],
        policy_requirements: [
          { key: "governed", statement: "Apply Mission Control policy." },
        ],
        approval_requirements: [
          { key: "human", statement: "Require human approval." },
        ],
        verification_contract: [
          {
            key: "test",
            statement: "Run the regression suite.",
            evidence_required: ["test output"],
            independent: true,
          },
        ],
        evaluation_requirements: [
          { key: "regression", statement: "Evaluate regressions." },
        ],
        rollback_requirements: [
          { key: "revert", statement: "Revert the isolated change." },
        ],
        observability_requirements: [
          { key: "checks", statement: "Observe required checks." },
        ],
        economics_baseline: {},
        risk_summary: [
          {
            key: "compatibility",
            statement: "Compatibility may block completion.",
          },
        ],
        evidence_refs: [
          {
            kind: "EVIDENCE",
            ref: "fe://evidence/1",
            sha256: `sha256:${"1".repeat(64)}`,
          },
        ],
        decision_refs: [
          {
            kind: "APPROVED_INPUT",
            ref: "fe://decision/1",
            version: 1,
            sha256: `sha256:${"2".repeat(64)}`,
          },
        ],
        provenance: [
          {
            kind: "VERIFIED_CLAIM",
            ref: "fe://claim/1",
            version: 1,
            sha256: `sha256:${"3".repeat(64)}`,
          },
        ],
        plan_assertions: [
          {
            assertion_id: "assertion-1",
            title: "Contract preserved",
            outcome: "The approved behavior is preserved.",
            verification_method: "TEST",
            pass_condition: "Tests pass.",
            required_evidence: "Independent test output.",
            requires_independent_validation: true,
            waiver_allowed: false,
          },
        ],
        work_order_blueprints: [
          {
            key: "prepare-change",
            title: "Prepare change",
            outcome: "Review-ready change.",
            requirements: ["change"],
            acceptance_criterion_refs: ["assertion-1"],
            constraints: ["no-release"],
            requested_code_scopes: ["apps/api", "packages/contracts"],
            capability_requirement_refs: ["implementation"],
            verification_requirement_refs: ["test"],
            authority_boundary_refs: ["worker"],
            sequence: 1,
            execution_role: "WORKER",
            is_mutating: true,
            priority: 2,
            risk_level: "MEDIUM",
            required_approvals: ["human"],
            dependencies: [],
            assertion_ids: ["assertion-1"],
          },
        ],
      },
    },
    attestation: {} as never,
  };
}

const target = {
  projectId: "project-1",
  repositoryId: "repository-1",
  ownerMemberId: "member-1",
  owningTeamId: "team-1",
  codeScopeMappings: [
    { requestedCodeScope: "apps/api", codeScopeId: "scope-1" },
    { requestedCodeScope: "packages/contracts", codeScopeId: "scope-2" },
  ],
  workflowId: "software-delivery",
  workflowVersion: 4,
  executionEnvironment: "POLICY_SELECTED" as const,
  repository: "sellerfi/platform",
  repositoryBranch: "main",
};

describe("Factory package Mission/Plan mapping", () => {
  it("maps only into draft-shaped Mission and Plan fields", () => {
    const mapped = mapFactoryPackageToDrafts({
      retrieval: retrieval(),
      target,
      packageReferenceUrl:
        "https://factory.example/api/deployment-packages/id/versions/3",
    });
    expect(mapped.mission).toMatchObject({
      title: "Import the approved factory change",
      codeScopeIds: ["scope-1", "scope-2"],
      executionEnvironment: "POLICY_SELECTED",
    });
    expect(mapped.mission.context).toContain(
      "Factory deployment intent:\nPrepare only.",
    );
    expect(mapped.plan).toMatchObject({
      workOrderBlueprints: [
        {
          id: "prepare-change",
          workflowId: "software-delivery",
          workflowVersion: 4,
          isMutating: true,
        },
      ],
    });
    expect(mapped.plan.summary).toContain(
      "Create an editable Mission Control plan from the approved proposal.",
    );
    expect(mapped.plan.summary).toContain(
      "Factory deployment specification:\nBounded spec.",
    );
    expect(mapped.plan.workOrderBlueprints[0].constraints).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /Acceptance criterion assertion-1.*All approved acceptance intent survives/,
        ),
        expect.stringMatching(
          /Authority boundary worker.*Prepare a review-ready change/,
        ),
        expect.stringMatching(
          /Verification requirement: Run the regression suite/,
        ),
      ]),
    );
    expect(mapped.plan.assertions[0]).toMatchObject({
      sourceRequirementIds: ["implementation"],
      sourceAcceptanceExpectationIds: ["assertion-1"],
      sourceVerificationExpectationIds: ["test"],
    });
    expect(mapped).not.toHaveProperty("workOrders");
    expect(
      mapped.warnings.some((warning) =>
        /remain draft blueprints/.test(warning),
      ),
    ).toBe(true);
  });

  it("requires exact scopes while keeping FE environment requirements separate from MC runtime selection", () => {
    expect(() =>
      mapFactoryPackageToDrafts({
        retrieval: retrieval(),
        target: {
          ...target,
          codeScopeMappings: target.codeScopeMappings.slice(0, 1),
        },
        packageReferenceUrl: "https://factory.example/package",
      }),
    ).toThrow(/exact one-to-one/);
    expect(() =>
      mapFactoryPackageToDrafts({
        retrieval: retrieval(),
        target: { ...target, executionEnvironment: "LOCAL" },
        packageReferenceUrl: "https://factory.example/package",
      }),
    ).not.toThrow();

    const narrowedBlueprint = retrieval();
    narrowedBlueprint.package.deployment_intent.work_order_blueprints[0].requested_code_scopes =
      ["apps/api"];
    expect(() =>
      mapFactoryPackageToDrafts({
        retrieval: narrowedBlueprint,
        target,
        packageReferenceUrl: "https://factory.example/package",
      }),
    ).toThrow(/blueprint.*code scopes.*exact one-to-one/i);
  });

  it("binds the semantic package target to the configured workspace and GitHub repository", () => {
    expect(() =>
      assertFactoryPackageTargetBinding(
        retrieval(),
        "sellerfi-production",
        "SellerFi/Platform",
      ),
    ).not.toThrow();
    expect(() =>
      assertFactoryPackageTargetBinding(
        retrieval(),
        "another-workspace",
        "sellerfi/platform",
      ),
    ).toThrow(expect.objectContaining({ code: "TARGET_NOT_FOUND" }));
    expect(() =>
      assertFactoryPackageTargetBinding(
        retrieval(),
        "sellerfi-production",
        "sellerfi/another-repository",
      ),
    ).toThrow(expect.objectContaining({ code: "TARGET_NOT_FOUND" }));
  });

  it("binds the configured Factory Engineer channel to one local Mission Control project", () => {
    expect(() =>
      assertFactoryPackageLocalProjectBinding("project-1", "project-1"),
    ).not.toThrow();
    expect(() =>
      assertFactoryPackageLocalProjectBinding("project-1", "project-2"),
    ).toThrow(expect.objectContaining({ code: "TARGET_UNAUTHORIZED" }));
  });

  it("uses issuer, package ID, and version as the stable idempotency identity", () => {
    expect(factoryPackageImportKey("issuer", "package", 3)).toBe(
      "factory-package:issuer:package:3",
    );
    const candidate = {
      packageDigest,
      targetFingerprint: `sha256:${"b".repeat(64)}`,
    };
    expect(resolveFactoryPackageImportRetry(null, candidate)).toBe("CREATE");
    expect(resolveFactoryPackageImportRetry(candidate, candidate)).toBe(
      "RETURN_EXISTING",
    );
    expect(
      resolveFactoryPackageImportRetry(candidate, {
        ...candidate,
        packageDigest: `sha256:${"c".repeat(64)}`,
      }),
    ).toBe("CONFLICT");
    expect(
      resolveFactoryPackageImportRetry(candidate, {
        ...candidate,
        targetFingerprint: `sha256:${"d".repeat(64)}`,
      }),
    ).toBe("CONFLICT");
  });

  it("fails draft creation closed at existing Mission governance gates", () => {
    expect(
      factoryPackageGovernanceBlockers({
        planReleaseEnabled: false,
        specIntakeEnabled: false,
      }),
    ).toEqual(["PLAN_RELEASE_DISABLED"]);
    expect(
      factoryPackageGovernanceBlockers({
        planReleaseEnabled: true,
        specIntakeEnabled: true,
      }),
    ).toEqual(["SPEC_INTAKE_REQUIRED"]);
    expect(
      factoryPackageGovernanceBlockers({
        planReleaseEnabled: true,
        specIntakeEnabled: false,
      }),
    ).toEqual([]);
  });

  it("enables qualification only from the exact project-scoped rollout row", () => {
    expect(FACTORY_PACKAGE_QUALIFICATION_FLAG).toBe(
      "factory-engineer.package-import-v1",
    );
    expect(
      factoryPackageQualificationEnabled(
        [
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: true,
          },
        ],
        "project-1",
      ),
    ).toBe(false);
    expect(
      factoryPackageQualificationEnabled(
        [
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: true,
            projectId: "project-2",
          },
        ],
        "project-1",
      ),
    ).toBe(false);
    expect(
      factoryPackageQualificationEnabled(
        [
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: true,
          },
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: false,
            projectId: "project-1",
          },
        ],
        "project-1",
      ),
    ).toBe(false);
    expect(
      factoryPackageQualificationEnabled(
        [
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: true,
            projectId: "project-1",
          },
        ],
        "project-1",
      ),
    ).toBe(true);
    expect(
      factoryPackageQualificationEnabled(
        [
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: true,
            projectId: "project-1",
          },
          {
            key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
            enabled: true,
            projectId: "project-1",
          },
        ],
        "project-1",
      ),
    ).toBe(false);
  });
});
