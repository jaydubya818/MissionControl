import { readFileSync } from "node:fs";
import {
  factoryDeploymentPackageDigest,
  validateFactoryPackageRetrieval,
  type FactoryDeploymentPackage,
  type FactoryPackageRetrieval,
} from "@mission-control/shared";
import { describe, expect, it } from "vitest";
import {
  FACTORY_PACKAGE_MEDIA_TYPE,
  retrieveFactoryPackage,
} from "../lib/factoryPackageRetrieval";
import { mapFactoryPackageToDrafts } from "../lib/factoryPackageImport";

const packageDocument = JSON.parse(
  readFileSync(
    new URL(
      "../../fixtures/contracts/factory-deployment-package-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as FactoryDeploymentPackage;
const expectedDigest = readFileSync(
  new URL(
    "../../fixtures/contracts/factory-deployment-package-v1.sha256",
    import.meta.url,
  ),
  "utf8",
).trim();
const retrievedAt = packageDocument.issued_at;
const correlationId = "90000000-0000-4000-8000-000000000001";

function retrievalEnvelope(): FactoryPackageRetrieval {
  return {
    package: structuredClone(packageDocument),
    attestation: {
      package_id: packageDocument.package_id,
      package_version: packageDocument.package_version,
      digest: packageDocument.integrity.digest,
      current_status: "PUBLISHED",
      issuer: structuredClone(packageDocument.issuer),
      approval: structuredClone(packageDocument.approval),
      published_at: packageDocument.issued_at,
      retrieved_at: retrievedAt,
      correlation_id: correlationId,
    },
  };
}

describe("Factory Engineer / Mission Control golden contract", () => {
  it("recomputes the exact Python-produced immutable package digest", () => {
    expect(packageDocument.integrity.digest).toBe(expectedDigest);
    expect(factoryDeploymentPackageDigest(packageDocument)).toBe(
      expectedDigest,
    );
  });

  it("validates the golden package inside an authoritative fresh attestation", () => {
    const envelope = retrievalEnvelope();
    expect(
      validateFactoryPackageRetrieval(envelope, packageDocument.issuer, {
        nowMs: Date.parse(retrievedAt),
      }),
    ).toEqual(envelope);
  });

  it("accepts the golden envelope through the authenticated HTTP adapter", async () => {
    const result = await retrieveFactoryPackage({
      packageId: packageDocument.package_id,
      packageVersion: packageDocument.package_version,
      correlationId,
      config: {
        baseUrl: "https://factory-engineer.example",
        bearerToken: "fixture-only-token",
        issuer: packageDocument.issuer,
      },
      fetcher: async () =>
        new Response(JSON.stringify(retrievalEnvelope()), {
          status: 200,
          headers: { "content-type": FACTORY_PACKAGE_MEDIA_TYPE },
        }),
      nowMs: Date.parse(retrievedAt),
    });
    expect(result.retrieval.package.integrity.digest).toBe(expectedDigest);
    expect(result.retrieval.package.target).toMatchObject({
      repository_ref: "github.com/sellerfi/marketplace",
      environment_class: "ISOLATED_NON_PRODUCTION",
    });
  });

  it("requires Factory Engineer to echo the exact request correlation ID", async () => {
    await expect(
      retrieveFactoryPackage({
        packageId: packageDocument.package_id,
        packageVersion: packageDocument.package_version,
        correlationId: "90000000-0000-4000-8000-000000000002",
        config: {
          baseUrl: "https://factory-engineer.example",
          bearerToken: "fixture-only-token",
          issuer: packageDocument.issuer,
        },
        fetcher: async () =>
          new Response(JSON.stringify(retrievalEnvelope()), {
            status: 200,
            headers: { "content-type": FACTORY_PACKAGE_MEDIA_TYPE },
          }),
        nowMs: Date.parse(retrievedAt),
      }),
    ).rejects.toMatchObject({ code: "ORIGIN_UNVERIFIED" });
  });

  it("maps the golden package only into the existing Mission and Plan draft shapes", () => {
    const mapped = mapFactoryPackageToDrafts({
      retrieval: retrievalEnvelope(),
      packageReferenceUrl: `https://factory-engineer.example/api/deployment-packages/${packageDocument.package_id}/versions/1`,
      target: {
        projectId: "project-1",
        repositoryId: "repository-1",
        ownerMemberId: "member-1",
        owningTeamId: "team-1",
        codeScopeMappings: [
          {
            requestedCodeScope: "apps/marketplace/**",
            codeScopeId: "scope-1",
          },
        ],
        workflowId: "software-change/verified-pr",
        workflowVersion: 7,
        executionEnvironment: "POLICY_SELECTED",
        repository: "sellerfi/marketplace",
        repositoryBranch: "main",
      },
    });
    expect(mapped.mission).toMatchObject({
      title: "Harden buyer diligence document verification",
      codeScopeIds: ["scope-1"],
      executionEnvironment: "POLICY_SELECTED",
    });
    expect(mapped.mission.context).toContain("Factory deployment intent:");
    expect(mapped.mission.context).toContain(
      packageDocument.deployment_intent.intent,
    );
    expect(mapped.plan.summary).toContain("Factory deployment specification:");
    expect(mapped.plan.summary).toContain(
      packageDocument.deployment_intent.specification,
    );
    expect(mapped.plan.assertions).toHaveLength(1);
    expect(mapped.plan.assertions[0]).toMatchObject({
      assertionId: "assertion_verifier_behavior",
      sourceAcceptanceExpectationIds: ["criterion_verified"],
    });
    expect(mapped.plan.workOrderBlueprints).toEqual([
      expect.objectContaining({
        id: "implement_verifier",
        workflowId: "software-change/verified-pr",
        workflowVersion: 7,
        isMutating: true,
        constraints: expect.arrayContaining([
          "Acceptance criterion criterion_verified (Run the focused deterministic test suite.): The verifier rejects malformed documents and accepts the supported valid fixture.",
        ]),
      }),
    ]);
    expect(mapped).not.toHaveProperty("workOrders");
  });
});
