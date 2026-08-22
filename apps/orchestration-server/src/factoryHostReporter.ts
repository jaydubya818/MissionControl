import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ConvexHttpClient } from "convex/browser";
import { ConvexMutations } from "./convexCalls.js";
import { canonicalGithubRepositoryFromRemote } from "./factoryRepositoryIdentity.js";
import type { HarnessCapabilityManifest } from "@mission-control/workflow-engine";

const execFileAsync = promisify(execFile);

export interface FactoryHostReporterConfig {
  projectId: string;
  repositoryId: string;
  hostId: string;
  sessionId: string;
  checkoutRoot: string;
  maxConcurrentRuns: number;
  getCurrentRuns: () => number;
  approvedModelIds?: string[];
  networkPolicyStatus?: "READY" | "BLOCKED" | "UNKNOWN";
  secretPolicyStatus?: "READY" | "BLOCKED" | "UNKNOWN";
  hostRuntimeType: string;
  executionBackends: string[];
  supportedExecutors: Array<{
    adapter: string;
    version: string;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    capabilityManifest: HarnessCapabilityManifest;
    supportsCancel: boolean;
    supportsResume: boolean;
    isolationModes: Array<"READ_ONLY" | "WORKSPACE_WRITE">;
  }>;
  sandboxCapabilities: string[];
  factoryVersionBindings?: Array<{
    factoryDefinitionVersionId: string;
    factoryConfigurationDigest: string;
    adapter: string;
    version: string;
    provider: string;
    model: string;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    executionBackend: string;
    modelRouteDigest: string;
    sandboxProfileDigest?: string;
    repositoryId: string;
  }>;
  readiness?: "STARTING" | "READY" | "DRAINING" | "BLOCKED";
  draining?: boolean;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

export interface FactoryCheckoutObservation {
  repository: string;
  checkoutRoot: string;
  observedBranch?: string;
  observedCommit: string;
  baseBranch: string;
  baseCommit: string;
  dirty: boolean;
}

export class FactoryHostReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private reporting = false;

  constructor(
    private readonly client: ConvexHttpClient,
    private readonly config: FactoryHostReporterConfig,
  ) {}

  async start() {
    if (this.timer) return;
    const intervalMs = Math.max(30_000, this.config.intervalMs ?? 60_000);
    const report = () => void this.report().catch((error) => this.config.onError?.(error));
    this.timer = setInterval(report, intervalMs);
    try {
      await this.report();
    } catch (error) {
      this.config.onError?.(error);
      throw error;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async report() {
    if (this.reporting) return;
    this.reporting = true;
    try {
      const observation = await inspectFactoryCheckout(this.config.checkoutRoot);
      const now = Date.now();
      await this.client.mutation(ConvexMutations.workspaceHostBindings.report as any, {
        projectId: this.config.projectId,
        repositoryId: this.config.repositoryId,
        hostId: this.config.hostId,
        repository: observation.repository,
        checkoutRoot: observation.checkoutRoot,
        observedBranch: observation.observedBranch,
        observedCommit: observation.observedCommit,
        baseBranch: observation.baseBranch,
        baseCommit: observation.baseCommit,
        dirty: observation.dirty,
        runtime: `node ${process.version} ${process.platform}/${process.arch}`,
        approvedModelIds: this.config.approvedModelIds,
        networkPolicyStatus: this.config.networkPolicyStatus,
        secretPolicyStatus: this.config.secretPolicyStatus,
        maxConcurrentRuns: this.config.maxConcurrentRuns,
        currentRuns: this.config.getCurrentRuns(),
        workerRuntime: {
          sessionId: this.config.sessionId,
          hostRuntimeType: this.config.hostRuntimeType,
          executionBackends: this.config.executionBackends,
          supportedExecutors: this.config.supportedExecutors.map((executor) => ({
            adapter: executor.adapter,
            version: executor.version,
            capabilityManifestSha256: executor.capabilityManifestSha256,
            effectiveConfigSha256: executor.effectiveConfigSha256,
            capabilityManifest: executor.capabilityManifest,
            supportsCancel: executor.supportsCancel,
            supportsResume: executor.supportsResume,
            isolationModes: executor.isolationModes,
          })),
          sandboxCapabilities: this.config.sandboxCapabilities,
          repositoryAccess: [{ repositoryId: this.config.repositoryId, access: "READ_WRITE" }],
          ...(this.config.factoryVersionBindings
            ? { factoryVersionBindings: this.config.factoryVersionBindings }
            : {}),
          readiness: this.config.readiness ?? "READY",
          draining: this.config.draining ?? false,
        },
        attestedAt: now,
        status: observation.dirty ? "DIRTY" : "READY",
        checkedAt: now,
      });
    } finally {
      this.reporting = false;
    }
  }
}

export async function inspectFactoryCheckout(cwd: string): Promise<FactoryCheckoutObservation> {
  const [checkoutRoot, remoteUrl, branch, commit, status, remoteHead] = await Promise.all([
    git(cwd, ["rev-parse", "--show-toplevel"]),
    git(cwd, ["remote", "get-url", "origin"]),
    git(cwd, ["branch", "--show-current"]),
    git(cwd, ["rev-parse", "HEAD"]),
    git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]),
    gitOptional(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]),
  ]);
  const baseBranch = remoteHead?.replace(/^origin\//, "") || branch;
  if (!baseBranch) throw new Error("Factory checkout cannot resolve its default branch");
  const baseCommit = remoteHead
    ? await git(cwd, ["rev-parse", `refs/remotes/${remoteHead}`])
    : commit;
  return {
    repository: canonicalRepositoryFromRemote(remoteUrl),
    checkoutRoot,
    observedBranch: branch || undefined,
    observedCommit: commit,
    baseBranch,
    baseCommit,
    dirty: Boolean(status),
  };
}

async function gitOptional(cwd: string, args: string[]) {
  try {
    return await git(cwd, args);
  } catch {
    return undefined;
  }
}

export const canonicalRepositoryFromRemote = canonicalGithubRepositoryFromRemote;

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, {
    cwd,
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
  });
  return result.stdout.trim();
}
