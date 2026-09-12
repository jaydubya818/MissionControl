import type { FactoryPackageImportErrorCode } from "@mission-control/shared";

export const FACTORY_PACKAGE_INGESTION_TELEMETRY_SCHEMA =
  "fdlc.mission-control-ingestion-telemetry/v1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/i;

export interface FactoryPackageIngestionTelemetryInput {
  outcome: "FAILED" | "SUCCEEDED";
  stage: "PREVIEW" | "CONFIRM";
  projectId: string;
  packageId: string;
  packageVersion: number;
  correlationId: string;
  packageDigest?: string;
  mappingDigest?: string;
  failureCode?: FactoryPackageImportErrorCode;
  draftRecordsCreated?: boolean;
}

export function factoryPackageIngestionTelemetry(
  input: FactoryPackageIngestionTelemetryInput,
) {
  const event =
    input.outcome === "SUCCEEDED"
      ? "mission_control.ingestion_succeeded"
      : "mission_control.ingestion_failed";
  return {
    schema: FACTORY_PACKAGE_INGESTION_TELEMETRY_SCHEMA,
    event,
    stage: input.stage,
    project_id: safeOpaqueId(input.projectId),
    package_id: safeUuid(input.packageId),
    package_version:
      Number.isSafeInteger(input.packageVersion) && input.packageVersion > 0
        ? input.packageVersion
        : null,
    correlation_id: safeUuid(input.correlationId),
    package_digest_prefix: safeDigestPrefix(input.packageDigest),
    mapping_digest_prefix: safeDigestPrefix(input.mappingDigest),
    failure_code:
      input.outcome === "FAILED"
        ? (input.failureCode ?? "TEMPORARY_UNAVAILABLE")
        : null,
    draft_records_created:
      input.outcome === "SUCCEEDED"
        ? (input.draftRecordsCreated ?? false)
        : false,
  } as const;
}

function safeUuid(value: string): string {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : "invalid";
}

function safeOpaqueId(value: string): string {
  return OPAQUE_ID_PATTERN.test(value) ? value : "invalid";
}

function safeDigestPrefix(value: string | undefined): string | null {
  const match = value?.match(DIGEST_PATTERN);
  return match ? `sha256:${match[1].slice(0, 12).toLowerCase()}` : null;
}
