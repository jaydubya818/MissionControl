import { describe, expect, it } from "vitest";
import {
  FACTORY_PACKAGE_MEDIA_TYPE,
  assertFactoryPackageContentType,
  factoryPackageReferenceUrl,
  readBoundedFactoryPackageResponse,
  retrieveFactoryPackage,
} from "../lib/factoryPackageRetrieval";

const packageId = "00000000-0000-4000-8000-000000000001";
const correlationId = "00000000-0000-4000-8000-000000000099";
const config = {
  baseUrl: "https://factory.example/root/",
  bearerToken: "secret-not-logged",
  issuer: {
    issuer_id: "factory-engineer-production",
    issuer_type: "FDLC_FACTORY_ENGINEER" as const,
    environment: "production",
    authority_scope: "DEPLOYMENT_PACKAGE_PUBLISH" as const,
  },
};

describe("Factory package authenticated retrieval", () => {
  it("constructs only a configured HTTPS package endpoint", () => {
    expect(factoryPackageReferenceUrl(config.baseUrl, packageId, 2)).toBe(
      `https://factory.example/root/api/deployment-packages/${packageId}/versions/2`,
    );
    expect(() =>
      factoryPackageReferenceUrl("http://factory.example", packageId, 2),
    ).toThrow(/securely configured/);
    expect(() =>
      factoryPackageReferenceUrl(
        "https://user:pass@factory.example",
        packageId,
        2,
      ),
    ).toThrow(/securely configured/);
  });

  it("requires the versioned vendor media type", () => {
    expect(() =>
      assertFactoryPackageContentType(FACTORY_PACKAGE_MEDIA_TYPE),
    ).not.toThrow();
    expect(() =>
      assertFactoryPackageContentType(
        `${FACTORY_PACKAGE_MEDIA_TYPE}; charset=utf-8`,
      ),
    ).not.toThrow();
    expect(() => assertFactoryPackageContentType("application/json")).toThrow(
      /unsupported package media type/,
    );
  });

  it("bounds the response before parsing", async () => {
    const response = new Response("{}", {
      headers: { "content-length": "256001" },
    });
    await expect(
      readBoundedFactoryPackageResponse(response),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it.each([
    [404, "PACKAGE_NOT_FOUND"],
    [401, "ORIGIN_UNVERIFIED"],
    [409, "PACKAGE_NOT_PUBLISHED"],
    [429, "TEMPORARY_UNAVAILABLE"],
    [503, "TEMPORARY_UNAVAILABLE"],
  ] as const)(
    "maps HTTP %s to %s without consuming an error body",
    async (status, code) => {
      await expect(
        retrieveFactoryPackage({
          packageId,
          packageVersion: 1,
          correlationId,
          config,
          fetcher: async () =>
            new Response("sensitive upstream detail", { status }),
        }),
      ).rejects.toMatchObject({ code });
    },
  );

  it("uses the configured bearer credential without placing it in the URL", async () => {
    let observedUrl = "";
    let observedAuthorization = "";
    let observedCorrelation = "";
    await expect(
      retrieveFactoryPackage({
        packageId,
        packageVersion: 1,
        correlationId,
        config,
        fetcher: async (request, init) => {
          observedUrl = String(request);
          observedAuthorization =
            new Headers(init?.headers).get("authorization") ?? "";
          observedCorrelation =
            new Headers(init?.headers).get("x-correlation-id") ?? "";
          return new Response(null, { status: 404 });
        },
      }),
    ).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    expect(observedUrl).not.toContain(config.bearerToken);
    expect(observedAuthorization).toBe(`Bearer ${config.bearerToken}`);
    expect(observedCorrelation).toBe(correlationId);
  });

  it("aborts a retrieval that exceeds its explicit timeout", async () => {
    await expect(
      retrieveFactoryPackage({
        packageId,
        packageVersion: 1,
        correlationId,
        config: { ...config, timeoutMs: 5 },
        fetcher: async (_request, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      }),
    ).rejects.toMatchObject({ code: "TEMPORARY_UNAVAILABLE" });
  });

  it.each([
    ["PACKAGE_STALE", "PACKAGE_STALE"],
    ["PACKAGE_REVOKED", "PACKAGE_REVOKED"],
    ["UNKNOWN", "INVALID_PACKAGE"],
  ] as const)(
    "maps only a bounded withdrawal code %s",
    async (upstreamCode, expectedCode) => {
      await expect(
        retrieveFactoryPackage({
          packageId,
          packageVersion: 1,
          correlationId,
          config,
          fetcher: async () =>
            new Response(
              JSON.stringify({
                error: {
                  code: upstreamCode,
                  message: "ignored upstream text",
                  correlation_id: "00000000-0000-4000-8000-000000000001",
                },
              }),
              { status: 410 },
            ),
        }),
      ).rejects.toMatchObject({ code: expectedCode });
    },
  );
});
