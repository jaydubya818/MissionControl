export const RESEARCH_LAB_DOCKER_PROFILE =
  "factory/docker-bedrock-research-lab/v1";
export const RESEARCH_LAB_DOCKER_IMAGE_ID =
  "sha256:7a36977d9b1449d2dae436e4b184326f0ef48b5873019c583911f6d95d9afda8";
export const RESEARCH_LAB_DOCKER_IMAGE = `mission-control/local-large-repository@${RESEARCH_LAB_DOCKER_IMAGE_ID}`;
export const RESEARCH_LAB_PROJECT_ID = "sn71gskbdemgf4z1trt9zdmm5h8bde69";
export const RESEARCH_LAB_TENANT_ID = "wx7ajfqrhbjn1rxfz4tc32mekx8b639n";

export function isResearchLabDocker(snapshot: any): boolean {
  return snapshot?.providerProfile === RESEARCH_LAB_DOCKER_PROFILE;
}

export function researchLabDockerScopeIssues(
  snapshot: any,
  now = Date.now(),
): string[] {
  if (!isResearchLabDocker(snapshot)) return [];
  const scope = snapshot.dockerQualification?.localScope;
  const errors: string[] = [];
  if (
    process.env.CONVEX_CLOUD_URL !== "http://127.0.0.1:3214" ||
    process.env.CONVEX_SITE_URL !== "http://127.0.0.1:3215"
  )
    errors.push("research-lab-local-backend-required");
  if (
    snapshot.machine?.image !== RESEARCH_LAB_DOCKER_IMAGE ||
    scope?.schema !== "research-lab-docker-scope/v1" ||
    scope.projectId !== RESEARCH_LAB_PROJECT_ID ||
    scope.tenantId !== RESEARCH_LAB_TENANT_ID ||
    scope.environment !== "LOCAL_RESEARCH_LAB" ||
    scope.production !== "DENIED" ||
    scope.publication !== "DENIED"
  )
    errors.push("research-lab-scope-invalid");
  if (
    !Number.isSafeInteger(scope?.reviewedAt) ||
    scope.reviewedAt > now ||
    !Number.isSafeInteger(scope?.validUntil) ||
    scope.validUntil <= now ||
    scope.validUntil <= scope.reviewedAt ||
    scope.validUntil - scope.reviewedAt > 86_400_000
  )
    errors.push("research-lab-evidence-expired-or-invalid");
  return errors;
}

export function assertResearchLabDockerTarget(
  snapshot: any,
  target: { projectId: string; tenantId?: string },
  now = Date.now(),
) {
  if (!isResearchLabDocker(snapshot)) return;
  if (
    researchLabDockerScopeIssues(snapshot, now).length ||
    String(target.projectId) !== RESEARCH_LAB_PROJECT_ID ||
    String(target.tenantId) !== RESEARCH_LAB_TENANT_ID
  )
    throw new Error("RESEARCH_LAB_DOCKER_SCOPE_MISMATCH");
}
