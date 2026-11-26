export type GithubPermissionAccess = "none" | "read" | "write" | "admin";

export interface GithubPermissionGrant {
  name: string;
  access: GithubPermissionAccess;
}

export const REQUIRED_GITHUB_APP_PERMISSIONS = [
  { name: "metadata", access: "read" },
  { name: "contents", access: "write" },
  { name: "pull_requests", access: "write" },
  { name: "checks", access: "read" },
] as const;

export const REQUIRED_GITHUB_WEBHOOK_EVENTS = [
  "check_run",
  "pull_request",
  "pull_request_review",
] as const;

// GitHub delivers these lifecycle events to every GitHub App and does not
// expose them as selectable subscriptions. They remain part of the inbound
// contract, but must not be expected in the installation `events` response.
export const AUTOMATIC_GITHUB_WEBHOOK_EVENTS = [
  "installation",
  "installation_repositories",
] as const;

const ACCESS_RANK: Record<GithubPermissionAccess, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

export function evaluateGithubAppCapabilities(input: {
  permissions: GithubPermissionGrant[];
  subscribedEvents: string[];
  issueIntakeEnabled?: boolean;
}) {
  const grants = new Map(input.permissions.map((item) => [item.name, item.access]));
  const requiredNames = new Set<string>(REQUIRED_GITHUB_APP_PERMISSIONS.map((item) => item.name));
  const missingPermissions = REQUIRED_GITHUB_APP_PERMISSIONS.flatMap((required) => {
    const actual = grants.get(required.name) ?? "none";
    return ACCESS_RANK[actual] < ACCESS_RANK[required.access]
      ? [`${required.name}:${required.access}`]
      : [];
  });
  const excessivePermissions = input.permissions
    .filter((item) => item.access !== "none")
    .filter((item) => {
      const required = REQUIRED_GITHUB_APP_PERMISSIONS.find(
        (candidate) => candidate.name === item.name
      );
      if (input.issueIntakeEnabled && item.name === "issues" && item.access === "read") return false;
      return !required || ACCESS_RANK[item.access] > ACCESS_RANK[required.access];
    })
    .map((item) => `${item.name}:${item.access}`)
    .sort();
  const subscribed = new Set(input.subscribedEvents);
  const missingEvents: string[] = REQUIRED_GITHUB_WEBHOOK_EVENTS.filter(
    (event) => !subscribed.has(event)
  );
  if (input.issueIntakeEnabled) {
    requiredNames.add("issues");
    if (grants.get("issues") !== "read") missingPermissions.push("issues:read");
    if (!subscribed.has("issues")) missingEvents.push("issues");
  }

  return {
    ready:
      missingPermissions.length === 0 &&
      excessivePermissions.length === 0 &&
      missingEvents.length === 0,
    missingPermissions,
    excessivePermissions,
    missingEvents,
    requiredPermissionNames: [...requiredNames],
  };
}

export function githubInstallationIsStale(
  verifiedAt: number | undefined,
  now = Date.now(),
  maximumAgeMs = 24 * 60 * 60 * 1_000
): boolean {
  return verifiedAt == null || now - verifiedAt > maximumAgeMs;
}
