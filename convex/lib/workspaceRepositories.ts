import { isValidRepositorySlug } from "./workspaceBindings";

export interface CodeScopeInput {
  name: string;
  slug: string;
  includePaths: string[];
  excludePaths: string[];
  approvalPolicy?: string;
  approvalPolicyDescription?: string;
}

export const CODE_SCOPE_APPROVAL_POLICIES = ["HUMAN_REVIEW", "RISK_REVIEW"] as const;

export function isCodeScopeApprovalPolicy(value: string): value is (typeof CODE_SCOPE_APPROVAL_POLICIES)[number] {
  return CODE_SCOPE_APPROVAL_POLICIES.includes(value as (typeof CODE_SCOPE_APPROVAL_POLICIES)[number]);
}

export interface ExistingCodeScope {
  name: string;
  includePaths: string[];
}

export function canonicalRepositoryKey(repository: string): string {
  return repository.trim().toLowerCase();
}

export function repositoryDisplayName(repository: string): string {
  const segments = repository.trim().split("/");
  return segments[segments.length - 1] ?? repository.trim();
}

export function resolveMissionRepositoryBinding(input: {
  projectId: string;
  missionRepository?: {
    projectId: string;
    repository: string;
    defaultBranch: string;
  } | null;
  legacyRepository?: string;
  legacyDefaultBranch?: string;
}): { repository: string; defaultBranch: string; source: "MISSION" | "LEGACY" } {
  if (input.missionRepository) {
    if (input.missionRepository.projectId !== input.projectId) {
      throw new Error("Mission repository does not belong to the selected workspace");
    }
    return {
      repository: input.missionRepository.repository,
      defaultBranch: input.missionRepository.defaultBranch,
      source: "MISSION",
    };
  }
  if (!input.legacyRepository) {
    throw new Error("Mission repository configuration is missing");
  }
  return {
    repository: input.legacyRepository,
    defaultBranch: input.legacyDefaultBranch ?? "main",
    source: "LEGACY",
  };
}

export function normalizeCodePath(path: string): string {
  const normalized = path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");

  if (!normalized || normalized === ".") return "";
  if (normalized.split("/").some((segment) => segment === "..")) return "";
  return normalized;
}

export function normalizeCodePaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeCodePath).filter(Boolean))].sort();
}

export function validateRepositoryInput(input: {
  repository: string;
  defaultBranch: string;
}): string | null {
  if (!isValidRepositorySlug(input.repository)) {
    return "Use the repository format owner/repository.";
  }
  if (!input.defaultBranch.trim()) return "Default branch is required.";
  return null;
}

export function validateCodeScopeInput(input: CodeScopeInput): string | null {
  if (!input.name.trim()) return "Code scope name is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug.trim())) {
    return "Code scope slug must use lowercase letters, numbers, and single hyphens.";
  }

  const includePaths = normalizeCodePaths(input.includePaths);
  if (includePaths.length === 0) return "Add at least one repository-relative include path.";
  if (input.includePaths.some((path) => !normalizeCodePath(path))) {
    return "Code scope paths must be repository-relative and cannot contain '..'.";
  }
  if (input.excludePaths.some((path) => !normalizeCodePath(path))) {
    return "Excluded paths must be repository-relative and cannot contain '..'.";
  }
  if (input.approvalPolicy && !isCodeScopeApprovalPolicy(input.approvalPolicy)) {
    return "Select a supported code-scope approval gate.";
  }
  return null;
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function findOverlappingScopes(
  includePaths: string[],
  existingScopes: ExistingCodeScope[]
): string[] {
  const normalized = normalizeCodePaths(includePaths);
  return existingScopes
    .filter((scope) =>
      normalizeCodePaths(scope.includePaths).some((existingPath) =>
        normalized.some((candidate) => pathsOverlap(candidate, existingPath))
      )
    )
    .map((scope) => scope.name);
}
