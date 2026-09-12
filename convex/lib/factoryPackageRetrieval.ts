import {
  FACTORY_DEPLOYMENT_PACKAGE_MAX_BYTES,
  FactoryPackageContractError,
  assertFactoryPackagePayloadSize,
  validateFactoryPackageRetrieval,
  type FactoryPackageIssuer,
  type FactoryPackageRetrieval,
} from "@mission-control/shared";

export const FACTORY_PACKAGE_MEDIA_TYPE =
  "application/vnd.fdlc.factory-deployment-package+json;version=1";
export const FACTORY_PACKAGE_DEFAULT_TIMEOUT_MS = 10_000;
export const FACTORY_PACKAGE_MAX_TIMEOUT_MS = 30_000;

export interface FactoryPackageRetrievalConfig {
  baseUrl: string;
  bearerToken: string;
  issuer: FactoryPackageIssuer;
  maxAttestationAgeMs?: number;
  timeoutMs?: number;
}

export interface RetrievedFactoryPackage {
  retrieval: FactoryPackageRetrieval;
  packageReferenceUrl: string;
}

export type FactoryPackageFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function factoryPackageReferenceUrl(
  baseUrl: string,
  packageId: string,
  packageVersion: number,
): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      packageId,
    ) ||
    !Number.isSafeInteger(packageVersion) ||
    packageVersion < 1
  ) {
    throw new FactoryPackageContractError(
      "INVALID_PACKAGE",
      "Factory package reference is invalid.",
    );
  }
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer retrieval is not configured.",
    );
  }
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer retrieval is not securely configured.",
    );
  }
  const prefix = base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}/api/deployment-packages/${encodeURIComponent(packageId)}/versions/${packageVersion}`;
  return base.toString();
}

export async function retrieveFactoryPackage(input: {
  packageId: string;
  packageVersion: number;
  config: FactoryPackageRetrievalConfig;
  correlationId: string;
  fetcher?: FactoryPackageFetch;
  nowMs?: number;
}): Promise<RetrievedFactoryPackage> {
  const packageReferenceUrl = factoryPackageReferenceUrl(
    input.config.baseUrl,
    input.packageId,
    input.packageVersion,
  );
  if (!input.config.bearerToken.trim()) {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer retrieval is not configured.",
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.correlationId,
    )
  ) {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer correlation is not configured.",
    );
  }
  const timeoutMs =
    input.config.timeoutMs ?? FACTORY_PACKAGE_DEFAULT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > FACTORY_PACKAGE_MAX_TIMEOUT_MS
  ) {
    throw new FactoryPackageContractError(
      "TEMPORARY_UNAVAILABLE",
      "Factory Engineer retrieval timeout is not configured.",
    );
  }
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await (input.fetcher ?? fetch)(packageReferenceUrl, {
        method: "GET",
        headers: {
          accept: FACTORY_PACKAGE_MEDIA_TYPE,
          authorization: `Bearer ${input.config.bearerToken}`,
          "x-correlation-id": input.correlationId,
        },
        redirect: "error",
        signal: abortController.signal,
      });
    } catch {
      throw new FactoryPackageContractError(
        "TEMPORARY_UNAVAILABLE",
        "Factory Engineer retrieval is temporarily unavailable.",
      );
    }
    if (response.status === 404) {
      throw new FactoryPackageContractError(
        "PACKAGE_NOT_FOUND",
        "Factory deployment package was not found.",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new FactoryPackageContractError(
        "ORIGIN_UNVERIFIED",
        "Factory Engineer did not authenticate the retrieval request.",
      );
    }
    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      throw new FactoryPackageContractError(
        "TEMPORARY_UNAVAILABLE",
        "Factory Engineer retrieval is temporarily unavailable.",
      );
    }
    if (response.status === 409) {
      throw new FactoryPackageContractError(
        "PACKAGE_NOT_PUBLISHED",
        "Factory deployment package is not published.",
      );
    }
    if (response.status === 410) {
      throw await factoryPackageGoneError(response);
    }
    if (!response.ok) {
      throw new FactoryPackageContractError(
        "INVALID_PACKAGE",
        "Factory Engineer rejected the package request.",
      );
    }
    assertFactoryPackageContentType(response.headers.get("content-type"));
    const payload = await readBoundedFactoryPackageResponse(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new FactoryPackageContractError(
        "INVALID_PACKAGE",
        "Factory Engineer returned invalid JSON.",
      );
    }
    const retrieval = validateFactoryPackageRetrieval(
      parsed,
      input.config.issuer,
      {
        nowMs: input.nowMs,
        maxAttestationAgeMs: input.config.maxAttestationAgeMs,
      },
    );
    if (
      retrieval.package.package_id !== input.packageId ||
      retrieval.package.package_version !== input.packageVersion ||
      retrieval.attestation.correlation_id !== input.correlationId
    ) {
      throw new FactoryPackageContractError(
        "ORIGIN_UNVERIFIED",
        "Factory Engineer returned a package outside the requested immutable identity or correlation.",
      );
    }
    return { retrieval, packageReferenceUrl };
  } finally {
    clearTimeout(timeout);
  }
}

async function factoryPackageGoneError(
  response: Response,
): Promise<FactoryPackageContractError> {
  try {
    const payload = JSON.parse(
      await readBoundedFactoryPackageResponse(response),
    ) as unknown;
    const code =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "code" in payload.error &&
      typeof payload.error.code === "string"
        ? payload.error.code
        : null;
    if (code === "PACKAGE_STALE") {
      return new FactoryPackageContractError(
        "PACKAGE_STALE",
        "Factory deployment package is stale.",
      );
    }
    if (code === "PACKAGE_REVOKED") {
      return new FactoryPackageContractError(
        "PACKAGE_REVOKED",
        "Factory deployment package is revoked.",
      );
    }
  } catch (error) {
    if (error instanceof FactoryPackageContractError) return error;
  }
  return new FactoryPackageContractError(
    "INVALID_PACKAGE",
    "Factory Engineer returned an unrecognized package withdrawal response.",
  );
}

export function assertFactoryPackageContentType(
  contentType: string | null,
): void {
  if (
    !contentType ||
    !/^application\/vnd\.fdlc\.factory-deployment-package\+json\s*;\s*version=1(?:\s*;\s*charset=utf-8)?$/i.test(
      contentType,
    )
  ) {
    throw new FactoryPackageContractError(
      "UNSUPPORTED_CONTRACT_VERSION",
      "Factory Engineer returned an unsupported package media type.",
    );
  }
}

export async function readBoundedFactoryPackageResponse(
  response: Response,
): Promise<string> {
  const length = response.headers.get("content-length");
  if (
    length &&
    /^\d+$/.test(length) &&
    Number(length) > FACTORY_DEPLOYMENT_PACKAGE_MAX_BYTES
  ) {
    throw new FactoryPackageContractError(
      "PAYLOAD_TOO_LARGE",
      "Factory package response exceeds 256,000 UTF-8 bytes.",
    );
  }
  if (!response.body) {
    const payload = await response.text();
    assertFactoryPackagePayloadSize(payload);
    return payload;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > FACTORY_DEPLOYMENT_PACKAGE_MAX_BYTES) {
      await reader.cancel();
      throw new FactoryPackageContractError(
        "PAYLOAD_TOO_LARGE",
        "Factory package response exceeds 256,000 UTF-8 bytes.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let payload: string;
  try {
    payload = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FactoryPackageContractError(
      "INVALID_PACKAGE",
      "Factory Engineer returned invalid UTF-8 JSON.",
    );
  }
  assertFactoryPackagePayloadSize(payload);
  return payload;
}
