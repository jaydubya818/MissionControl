import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { context7ToolVersionSnapshot } from "../../convex/lib/governedMcp.ts";
import {
  phase4Context7GrantRegistrationKey,
  phase4Context7ProfileQualificationKey,
  phase4Context7ProfileRegistrationKey,
  phase4Context7ToolVersionRegistrationKey,
  pinnedMcpSdkVersion,
} from "./phase4-mcp-qualification.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const repositoryId = "repo-phase4";
const previousSdk = "1.31.0";

describe("Phase 4 MCP qualification identity keys", () => {
  it("includes the pinned SDK version so a re-run after a bump does not collide with the previous identity", () => {
    const sdkVersion = pinnedMcpSdkVersion();
    const snapshot = context7ToolVersionSnapshot();
    const key = phase4Context7ToolVersionRegistrationKey(repositoryId);

    expect(sdkVersion).toBe("1.32.2");
    expect(snapshot.sdk.version).toBe(sdkVersion);
    expect(key).toBe(`phase4-context7-v4.0.5-sdk-${sdkVersion}:${repositoryId}`);
    expect(key).toContain(snapshot.sdk.version);
    expect(key).not.toBe(`phase4-context7-v4.0.5:${repositoryId}`);
    expect(phase4Context7ToolVersionRegistrationKey(repositoryId, previousSdk)).not.toBe(key);
    expect(phase4Context7GrantRegistrationKey(repositoryId)).toBe(
      `phase4-context7-grant-sdk-${sdkVersion}:${repositoryId}`,
    );
    expect(phase4Context7ProfileRegistrationKey(repositoryId)).toBe(
      `phase4-context7-profile-sdk-${sdkVersion}:${repositoryId}`,
    );
    expect(phase4Context7ProfileQualificationKey(repositoryId)).toBe(
      `phase4-context7-profile-qualification-sdk-${sdkVersion}:${repositoryId}`,
    );
    expect(phase4Context7GrantRegistrationKey(repositoryId, previousSdk))
      .not.toBe(phase4Context7GrantRegistrationKey(repositoryId));
    expect(phase4Context7ProfileRegistrationKey(repositoryId, previousSdk))
      .not.toBe(phase4Context7ProfileRegistrationKey(repositoryId));
    expect(phase4Context7ProfileQualificationKey(repositoryId, previousSdk))
      .not.toBe(phase4Context7ProfileQualificationKey(repositoryId));
  });

  it("refuses a non-qualification Convex URL before any client work", () => {
    const sdkVersion = pinnedMcpSdkVersion();
    expect(phase4Context7ToolVersionRegistrationKey(repositoryId)).toBe(
      `phase4-context7-v4.0.5-sdk-${sdkVersion}:${repositoryId}`,
    );
    expect(phase4Context7GrantRegistrationKey(repositoryId)).toBe(
      `phase4-context7-grant-sdk-${sdkVersion}:${repositoryId}`,
    );
    expect(phase4Context7ProfileRegistrationKey(repositoryId)).toBe(
      `phase4-context7-profile-sdk-${sdkVersion}:${repositoryId}`,
    );
    expect(phase4Context7ProfileQualificationKey(repositoryId)).toBe(
      `phase4-context7-profile-qualification-sdk-${sdkVersion}:${repositoryId}`,
    );

    const result = spawnSync(process.execPath, ["scripts/prepare-phase4-mcp-qualification.mjs"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, CONVEX_URL: "https://example.convex.cloud" },
    });
    const output = `${result.stderr}\n${result.stdout}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain("Refusing non-qualification Convex URL: https://example.convex.cloud");
  });
});
