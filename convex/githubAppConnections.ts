import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { assertRepositoryPublicationAllowed } from "./lib/localRepositoryAdmission";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "./lib/companyAccess";
import {
  evaluateGithubAppCapabilities,
  githubInstallationIsStale,
} from "./lib/githubAppReadiness";
import { canonicalRepositoryKey } from "./lib/workspaceRepositories";
import { sha256Hex, verifyGithubInstallationAccess } from "./lib/githubAppAuth";

const permissionAccess = v.union(
  v.literal("none"),
  v.literal("read"),
  v.literal("write"),
  v.literal("admin"),
);

const permissions = v.array(
  v.object({ name: v.string(), access: permissionAccess }),
);

export const beginInstallation = action({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; installUrl: string } | { ok: false; code: "NOT_CONFIGURED" }
  > => {
    const repository = await ctx.runQuery(
      internal.githubAppConnections.getRepositoryForSetup,
      {
        repositoryId: args.repositoryId,
      },
    );
    const access = await ctx.runQuery(
      internal.companyContext.authorizeFactoryAction,
      {
        projectId: repository.projectId,
        permission: FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
      },
    );
    const appSlug = process.env.GITHUB_APP_SLUG;
    if (!appSlug) return { ok: false, code: "NOT_CONFIGURED" };
    const state = crypto.randomUUID();
    await ctx.runMutation(internal.githubAppConnections.createSetupSession, {
      repositoryId: repository._id,
      actorId: access.actorId,
      stateHash: await sha256Hex(state),
    });
    return {
      ok: true,
      installUrl: `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new?state=${encodeURIComponent(state)}`,
    };
  },
});

export const getRepositoryForSetup = internalQuery({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) throw new Error("Repository connection not found");
    assertRepositoryPublicationAllowed(repository);
    return repository;
  },
});

export const getInstallationForVerification = internalQuery({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) throw new Error("Repository connection not found");
    assertRepositoryPublicationAllowed(repository);
    const installation = await ctx.db
      .query("githubAppInstallations")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
      .first();
    return { repository, installation };
  },
});

export const verifyInstallation = action({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        code: "MISSING_INSTALLATION" | "NOT_CONFIGURED" | "VERIFICATION_FAILED";
      }
  > => {
    const setup = await ctx.runQuery(
      internal.githubAppConnections.getInstallationForVerification,
      {
        repositoryId: args.repositoryId,
      },
    );
    await ctx.runQuery(internal.companyContext.authorizeFactoryAction, {
      projectId: setup.repository.projectId,
      permission: FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    });
    if (!setup.installation) return { ok: false, code: "MISSING_INSTALLATION" };

    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!appId || !privateKey) return { ok: false, code: "NOT_CONFIGURED" };

    try {
      const verified = await verifyGithubInstallationAccess({
        installationId: setup.installation.installationId,
        repository: setup.repository.repository,
        appId,
        privateKey,
      });
      await ctx.runMutation(internal.githubAppConnections.upsertInstallation, {
        repositoryId: setup.repository._id,
        providerRepositoryId: verified.providerRepositoryId,
        installationId: verified.installationId,
        appId,
        accountLogin: verified.accountLogin,
        accountType: verified.accountType,
        repositorySelection: verified.repositorySelection,
        permissions: verified.permissions,
        subscribedEvents: verified.subscribedEvents,
        status: "CONNECTED",
        installedAt: verified.installedAt,
        verifiedAt: verified.verifiedAt,
        lastTokenIssuedAt: verified.lastTokenIssuedAt,
      });
      return { ok: true };
    } catch (error) {
      console.error(
        "GitHub App installation verification failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      return { ok: false, code: "VERIFICATION_FAILED" };
    }
  },
});

export const bindExistingInstallation = action({
  args: {
    repositoryId: v.id("workspaceRepositories"),
    installationId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true } | { ok: false; code: "NOT_CONFIGURED" | "VERIFICATION_FAILED" }
  > => {
    const repository = await ctx.runQuery(
      internal.githubAppConnections.getRepositoryForSetup,
      {
        repositoryId: args.repositoryId,
      },
    );
    await ctx.runQuery(internal.companyContext.authorizeFactoryAction, {
      projectId: repository.projectId,
      permission: FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    });
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!appId || !privateKey) return { ok: false, code: "NOT_CONFIGURED" };
    const installationId = args.installationId.trim();
    if (!/^\d+$/.test(installationId))
      return { ok: false, code: "VERIFICATION_FAILED" };

    try {
      const verified = await verifyGithubInstallationAccess({
        installationId,
        repository: repository.repository,
        appId,
        privateKey,
      });
      await ctx.runMutation(internal.githubAppConnections.upsertInstallation, {
        repositoryId: repository._id,
        providerRepositoryId: verified.providerRepositoryId,
        installationId: verified.installationId,
        appId,
        accountLogin: verified.accountLogin,
        accountType: verified.accountType,
        repositorySelection: verified.repositorySelection,
        permissions: verified.permissions,
        subscribedEvents: verified.subscribedEvents,
        status: "CONNECTED",
        installedAt: verified.installedAt,
        verifiedAt: verified.verifiedAt,
        lastTokenIssuedAt: verified.lastTokenIssuedAt,
      });
      return { ok: true };
    } catch (error) {
      console.error(
        "GitHub App installation binding failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      return { ok: false, code: "VERIFICATION_FAILED" };
    }
  },
});

export const createSetupSession = internalMutation({
  args: {
    repositoryId: v.id("workspaceRepositories"),
    actorId: v.string(),
    stateHash: v.string(),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) throw new Error("Repository connection not found");
    assertRepositoryPublicationAllowed(repository);
    const now = Date.now();
    return await ctx.db.insert("githubAppSetupSessions", {
      tenantId: repository.tenantId,
      projectId: repository.projectId,
      repositoryId: repository._id,
      actorId: args.actorId,
      stateHash: args.stateHash,
      status: "PENDING",
      createdAt: now,
      expiresAt: now + 15 * 60 * 1_000,
    });
  },
});

export const resolveSetupSession = internalQuery({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("githubAppSetupSessions")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .first();
    if (
      !session ||
      session.status !== "PENDING" ||
      session.expiresAt <= Date.now()
    ) {
      throw new Error("GitHub App setup session is invalid or expired");
    }
    const repository = await ctx.db.get(session.repositoryId);
    if (!repository) throw new Error("Repository connection not found");
    assertRepositoryPublicationAllowed(repository);
    return { session, repository };
  },
});

export const completeSetupSession = internalMutation({
  args: {
    setupSessionId: v.id("githubAppSetupSessions"),
    status: v.union(
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("EXPIRED"),
    ),
    installationId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.setupSessionId);
    if (!session || session.status !== "PENDING") return { updated: false };
    await ctx.db.patch(session._id, {
      status: args.status,
      installationId: args.installationId,
      error: args.error,
      completedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const getRepositoryReadiness = query({
  args: { repositoryId: v.id("workspaceRepositories") },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository)
      throw new Error("Repository connection is unavailable or unauthorized.");
    await requireWorkspacePermission(
      ctx,
      repository.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    const installation = await ctx.db
      .query("githubAppInstallations")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
      .first();
    if (!installation) {
      return {
        overall: "MISSING" as const,
        installation: null,
        checks: [
          {
            id: "installation",
            status: "MISSING" as const,
            label: "GitHub App installation",
            detail: "No GitHub App installation is bound to this repository.",
            remediation:
              "Install the Mission Control GitHub App for this repository, then refresh verification.",
          },
        ],
      };
    }

    const capability = evaluateGithubAppCapabilities(installation);
    const stale = githubInstallationIsStale(installation.verifiedAt);
    const checks = [
      {
        id: "installation",
        status:
          installation.status === "CONNECTED"
            ? ("VERIFIED" as const)
            : ("BLOCKED" as const),
        label: "Installation identity",
        detail: `${installation.accountLogin} installation ${installation.installationId}`,
        remediation:
          installation.status === "CONNECTED"
            ? undefined
            : "Repair or reinstall the GitHub App connection.",
      },
      {
        id: "permissions",
        status:
          capability.missingPermissions.length ||
          capability.excessivePermissions.length
            ? ("BLOCKED" as const)
            : ("VERIFIED" as const),
        label: "Least-privilege permissions",
        detail: capability.missingPermissions.length
          ? `Missing ${capability.missingPermissions.join(", ")}`
          : capability.excessivePermissions.length
            ? `Excessive ${capability.excessivePermissions.join(", ")}`
            : "Contents and pull requests are write-scoped; checks and metadata are read-scoped.",
        remediation:
          capability.missingPermissions.length ||
          capability.excessivePermissions.length
            ? "Update the GitHub App permission grant to the documented V1 envelope."
            : undefined,
      },
      {
        id: "events",
        status: capability.missingEvents.length
          ? ("BLOCKED" as const)
          : ("VERIFIED" as const),
        label: "Webhook subscriptions",
        detail: capability.missingEvents.length
          ? `Missing ${capability.missingEvents.join(", ")}`
          : "Required PR, review, and check events are subscribed; installation lifecycle events are automatic.",
        remediation: capability.missingEvents.length
          ? "Subscribe the GitHub App webhook to every configurable V1 event."
          : undefined,
      },
      {
        id: "freshness",
        status: stale ? ("STALE" as const) : ("VERIFIED" as const),
        label: "Connection verification",
        detail: installation.verifiedAt
          ? `Last verified ${new Date(installation.verifiedAt).toISOString()}`
          : "The installation has not been verified.",
        remediation: stale
          ? "Run installation verification again before dispatch."
          : undefined,
      },
    ];
    const overall = checks.some((check) => check.status === "BLOCKED")
      ? ("BLOCKED" as const)
      : checks.some((check) => check.status === "STALE")
        ? ("STALE" as const)
        : ("VERIFIED" as const);
    return {
      overall,
      installation: {
        installationId: installation.installationId,
        appId: installation.appId,
        accountLogin: installation.accountLogin,
        repositorySelection: installation.repositorySelection,
        status: installation.status,
        verifiedAt: installation.verifiedAt,
        updatedAt: installation.updatedAt,
      },
      checks,
    };
  },
});

export const listDeliveries = query({
  args: { repositoryId: v.id("workspaceRepositories"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository)
      throw new Error("Repository connection is unavailable or unauthorized.");
    await requireWorkspacePermission(
      ctx,
      repository.projectId,
      FACTORY_PERMISSIONS.VIEW,
    );
    return await ctx.db
      .query("githubWebhookDeliveries")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
      .order("desc")
      .take(Math.min(args.limit ?? 20, 100));
  },
});

export const upsertInstallation = internalMutation({
  args: {
    repositoryId: v.id("workspaceRepositories"),
    providerRepositoryId: v.optional(v.string()),
    installationId: v.string(),
    appId: v.string(),
    accountLogin: v.string(),
    accountType: v.optional(v.string()),
    repositorySelection: v.union(v.literal("ALL"), v.literal("SELECTED")),
    permissions,
    subscribedEvents: v.array(v.string()),
    status: v.union(
      v.literal("CONNECTED"),
      v.literal("DEGRADED"),
      v.literal("REVOKED"),
    ),
    installedAt: v.number(),
    verifiedAt: v.optional(v.number()),
    lastTokenIssuedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) throw new Error("Repository connection not found");
    assertRepositoryPublicationAllowed(repository);
    const now = Date.now();
    const existingByRepository = await ctx.db
      .query("githubAppInstallations")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
      .first();
    const {
      repositoryId: _repositoryId,
      providerRepositoryId: _providerRepositoryId,
      ...installationInput
    } = args;
    const value = {
      tenantId: repository.tenantId,
      projectId: repository.projectId,
      repositoryId: repository._id,
      ...installationInput,
      updatedAt: now,
    };
    const installationRecordId =
      existingByRepository?._id ??
      (await ctx.db.insert("githubAppInstallations", value));
    if (existingByRepository)
      await ctx.db.patch(existingByRepository._id, value);
    const capability = evaluateGithubAppCapabilities(args);
    const ready =
      args.status === "CONNECTED" &&
      capability.ready &&
      !githubInstallationIsStale(args.verifiedAt, now);
    await ctx.db.patch(repository._id, {
      providerRepositoryId:
        args.providerRepositoryId ?? repository.providerRepositoryId,
      status: ready ? "READY" : "DEGRADED",
      webhookStatus: capability.missingEvents.length === 0 ? "READY" : "ERROR",
      validatedAt: args.verifiedAt,
      validationError: ready
        ? undefined
        : "GitHub App installation is missing, stale, or outside the least-privilege V1 envelope.",
      updatedAt: now,
    });
    return { installationRecordId, ready, capability };
  },
});

export const beginWebhookDelivery = internalMutation({
  args: {
    deliveryId: v.string(),
    event: v.string(),
    action: v.optional(v.string()),
    repository: v.optional(v.string()),
    providerRepositoryId: v.optional(v.string()),
    installationId: v.optional(v.string()),
    signatureStatus: v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING"),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubWebhookDeliveries")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        replayState: "DUPLICATE",
        attemptCount: existing.attemptCount + 1,
        lastAttemptAt: now,
      });
      return {
        deliveryRecordId: existing._id,
        duplicate: true,
        accepted: false,
        projectId: existing.projectId,
        repositoryId: existing.repositoryId,
      };
    }

    const installations = args.installationId
      ? await ctx.db
          .query("githubAppInstallations")
          .withIndex("by_installation", (q) =>
            q.eq("installationId", args.installationId!),
          )
          .collect()
      : [];
    const bindings = await Promise.all(
      installations.map(async (installation) => ({
        installation,
        repository: await ctx.db.get(installation.repositoryId),
      })),
    );
    const installationScopedEvent =
      args.event === "installation" ||
      args.event === "installation_repositories";
    const binding = installationScopedEvent
      ? (bindings.find(
          (candidate) => candidate.installation.status === "CONNECTED",
        ) ?? bindings[0])
      : bindings.find(({ repository }) =>
          Boolean(
            repository &&
            args.repository &&
            canonicalRepositoryKey(repository.repository) ===
              canonicalRepositoryKey(args.repository) &&
            (!repository.providerRepositoryId ||
              repository.providerRepositoryId === args.providerRepositoryId),
          ),
        );
    const installation = binding?.installation ?? installations[0] ?? null;
    const repository = binding?.repository ?? null;
    const repositoryMatches = Boolean(
      binding && (installationScopedEvent || repository),
    );
    const accepted =
      args.signatureStatus === "VALID" &&
      installation?.status === "CONNECTED" &&
      repositoryMatches;
    const error = accepted
      ? undefined
      : args.signatureStatus !== "VALID"
        ? "Webhook signature is missing or invalid."
        : installations.length === 0
          ? "Webhook installation is not registered."
          : !repositoryMatches
            ? "Webhook repository does not match the registered installation."
            : "Webhook installation is not connected.";
    const deliveryRecordId = await ctx.db.insert("githubWebhookDeliveries", {
      tenantId: repository?.tenantId,
      projectId: repository?.projectId,
      repositoryId: repository?._id,
      ...args,
      status: accepted ? "RECEIVED" : "FAILED",
      replayState: "ORIGINAL",
      attemptCount: 1,
      receivedAt: now,
      lastAttemptAt: now,
      completedAt: accepted ? undefined : now,
      result: accepted
        ? "Accepted for processing."
        : "Rejected before processing.",
      error,
    });
    return {
      deliveryRecordId,
      duplicate: false,
      accepted,
      error,
      projectId: repository?.projectId,
      repositoryId: repository?._id,
    };
  },
});

export const markInstallationChanged = internalMutation({
  args: {
    installationId: v.string(),
    action: v.string(),
    removedProviderRepositoryIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const installations = await ctx.db
      .query("githubAppInstallations")
      .withIndex("by_installation", (q) =>
        q.eq("installationId", args.installationId),
      )
      .collect();
    if (installations.length === 0)
      return { updated: false, updatedCount: 0, revokedCount: 0 };
    const now = Date.now();
    let revokedCount = 0;
    for (const installation of installations) {
      const repository = await ctx.db.get(installation.repositoryId);
      const targetRepositoryRemoved = Boolean(
        repository?.providerRepositoryId &&
        args.removedProviderRepositoryIds?.includes(
          repository.providerRepositoryId,
        ),
      );
      const revoked =
        args.action === "deleted" ||
        args.action === "suspend" ||
        targetRepositoryRemoved;
      if (revoked) revokedCount += 1;
      await ctx.db.patch(installation._id, {
        status: revoked ? "REVOKED" : "DEGRADED",
        verifiedAt: undefined,
        lastError: revoked
          ? `GitHub reported installation change: ${args.action}.`
          : "GitHub installation changed and requires re-verification.",
        updatedAt: now,
      });
      if (repository) {
        await ctx.db.patch(repository._id, {
          status: "DEGRADED",
          webhookStatus: revoked ? "ERROR" : repository.webhookStatus,
          validatedAt: undefined,
          validationError: revoked
            ? "GitHub App access was revoked or removed for this repository."
            : "GitHub App installation changed and must be verified again.",
          updatedAt: now,
        });
      }
    }
    return {
      updated: true,
      updatedCount: installations.length,
      revoked: revokedCount > 0,
      revokedCount,
    };
  },
});

export const completeWebhookDelivery = internalMutation({
  args: {
    deliveryRecordId: v.id("githubWebhookDeliveries"),
    status: v.union(
      v.literal("PROCESSED"),
      v.literal("IGNORED"),
      v.literal("FAILED"),
    ),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryRecordId);
    if (!delivery) throw new Error("GitHub delivery record not found");
    if (delivery.status !== "RECEIVED") return { updated: false };
    await ctx.db.patch(delivery._id, {
      status: args.status,
      result: args.result,
      error: args.error,
      completedAt: Date.now(),
    });
    return { updated: true };
  },
});
