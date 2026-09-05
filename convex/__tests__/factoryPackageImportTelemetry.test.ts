import { describe, expect, it } from "vitest";
import {
  FACTORY_PACKAGE_INGESTION_TELEMETRY_SCHEMA,
  factoryPackageIngestionTelemetry,
} from "../lib/factoryPackageImportTelemetry";

const packageId = "12345678-1234-4234-9234-123456789abc";
const correlationId = "87654321-4321-4321-8321-cba987654321";

describe("Factory package ingestion telemetry", () => {
  it("emits the bounded Mission Control success contract", () => {
    expect(
      factoryPackageIngestionTelemetry({
        outcome: "SUCCEEDED",
        stage: "CONFIRM",
        projectId: "project_a-1",
        packageId,
        packageVersion: 4,
        correlationId,
        packageDigest: `sha256:${"a".repeat(64)}`,
        mappingDigest: `sha256:${"b".repeat(64)}`,
        draftRecordsCreated: true,
      }),
    ).toEqual({
      schema: FACTORY_PACKAGE_INGESTION_TELEMETRY_SCHEMA,
      event: "mission_control.ingestion_succeeded",
      stage: "CONFIRM",
      project_id: "project_a-1",
      package_id: packageId,
      package_version: 4,
      correlation_id: correlationId,
      package_digest_prefix: `sha256:${"a".repeat(12)}`,
      mapping_digest_prefix: `sha256:${"b".repeat(12)}`,
      failure_code: null,
      draft_records_created: true,
    });
  });

  it("emits only a failure code and sanitized bounded identifiers", () => {
    const telemetry = factoryPackageIngestionTelemetry({
      outcome: "FAILED",
      stage: "PREVIEW",
      projectId: "project?token=server-secret",
      packageId: "Bearer browser-secret",
      packageVersion: Number.NaN,
      correlationId: "customer-authored-correlation",
      packageDigest: "sha256:not-a-digest",
      mappingDigest: "mapping-user-content",
      failureCode: "ORIGIN_UNVERIFIED",
    });
    const serialized = JSON.stringify(telemetry);

    expect(telemetry).toMatchObject({
      event: "mission_control.ingestion_failed",
      stage: "PREVIEW",
      project_id: "invalid",
      package_id: "invalid",
      package_version: null,
      correlation_id: "invalid",
      package_digest_prefix: null,
      mapping_digest_prefix: null,
      failure_code: "ORIGIN_UNVERIFIED",
      draft_records_created: false,
    });
    expect(serialized).not.toContain("server-secret");
    expect(serialized).not.toContain("browser-secret");
    expect(serialized).not.toContain("customer-authored");
    expect(serialized).not.toContain("mapping-user-content");
  });
});
