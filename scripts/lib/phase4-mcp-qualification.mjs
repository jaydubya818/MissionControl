import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTEXT7_SERVER_VERSION = "4.0.5";

export function pinnedMcpSdkVersion(repositoryRoot = REPO_ROOT) {
  const pkg = JSON.parse(readFileSync(path.join(repositoryRoot, "apps/orchestration-server/package.json"), "utf8"));
  const version = pkg.dependencies["@modelcontextprotocol/sdk"];
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Pinned MCP SDK version is unavailable.");
  }
  return version;
}

export function phase4Context7ToolVersionRegistrationKey(repositoryId, sdkVersion = pinnedMcpSdkVersion()) {
  return `phase4-context7-v${CONTEXT7_SERVER_VERSION}-sdk-${sdkVersion}:${repositoryId}`;
}

export function phase4Context7GrantRegistrationKey(repositoryId, sdkVersion = pinnedMcpSdkVersion()) {
  return `phase4-context7-grant-sdk-${sdkVersion}:${repositoryId}`;
}

export function phase4Context7ProfileRegistrationKey(repositoryId, sdkVersion = pinnedMcpSdkVersion()) {
  return `phase4-context7-profile-sdk-${sdkVersion}:${repositoryId}`;
}

export function phase4Context7ProfileQualificationKey(repositoryId, sdkVersion = pinnedMcpSdkVersion()) {
  return `phase4-context7-profile-qualification-sdk-${sdkVersion}:${repositoryId}`;
}
