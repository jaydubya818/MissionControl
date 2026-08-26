import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  COMPANY_PERMISSIONS,
  listAccessibleWorkspaces,
  requireCompanyPermission,
  requireWorkspaceAccess,
} from "./lib/companyAccess";
import {
  availableOperatingLenses,
  defaultOperatingLens,
  deliveryConfidence,
  rankAttentionItems,
  resolveDeterministicOwnership,
  validateDispatchScope,
  validateExecutorBindingPolicy,
  validateExecutorHostEligibility,
  type AttentionCandidate,
  type OperatingLens,
} from "./lib/softwareFactoryControlPlane";
import { assertAuthorizedDeliveryRecord } from "./lib/deliveryAuthorization";
import { canonicalRepositoryKey, findOverlappingScopes } from "./lib/workspaceRepositories";
import { resolveFlag, type FlagRow } from "./lib/flags";

const operatingLens = v.union(
  v.literal("MY"),
  v.literal("TEAM"),
  v.literal("WORKSPACE"),
  v.literal("COMPANY")
);

const teamRole = v.union(
  v.literal("LEAD"),
  v.literal("DEVELOPER"),
  v.literal("QA"),
  v.literal("PM"),
  v.literal("VIEWER")
);

const assignmentRole = v.union(
  v.literal("OWNER"),
  v.literal("CONTRIBUTOR"),
  v.literal("REVIEWER"),
  v.literal("STAKEHOLDER")
);

const ACTIVE_MISSION_STATES = new Set(["READY", "IN_PROGRESS", "BLOCKED", "AWAITING_VALIDATION", "AWAITING_ACCEPTANCE"]);
const ACTIVE_WORK_ORDER_STATES = new Set(["READY", "DISPATCHED", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "REOPENED"]);

function cleanOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function assertSlug(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error(`${label} must use lowercase letters, numbers, and single hyphens.`);
  }
  return normalized;
}

function displayAge(createdAt: number, now: number): string {
  const hours = Math.max(0, Math.floor((now - createdAt) / 3_600_000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function scopeError(message: string) {
  return { status: "SCOPE_ERROR" as const, message, generatedAt: Date.now() };
}

async function loadWorkspaceBundle(ctx: any, project: Doc<"projects">) {
  const [teams, repositories, codeScopes, members, missions, workOrders, runs, assignments, memberships] = await Promise.all([
    ctx.db.query("scrumTeams").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("workspaceRepositories").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("repositoryCodeScopes").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("orgMembers").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("missions").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("workOrders").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("workflowRuns").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("missionAssignments").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
    ctx.db.query("teamMemberships").withIndex("by_project", (q: any) => q.eq("projectId", project._id)).collect(),
  ]);
  return { project, teams, repositories, codeScopes, members, missions, workOrders, runs, assignments, memberships };
}

function buildAttention(bundle: Awaited<ReturnType<typeof loadWorkspaceBundle>>, now: number): AttentionCandidate[] {
  const teams = new Map<string, any>(bundle.teams.map((team: any) => [team._id, team]));
  const missions = new Map<string, any>(bundle.missions.map((mission: any) => [mission._id, mission]));
  const members = new Map<string, any>(bundle.members.map((member: any) => [member._id, member]));
  const rows: AttentionCandidate[] = [];

  for (const mission of bundle.missions) {
    if (!ACTIVE_MISSION_STATES.has(mission.state) || mission.ownerMemberId) continue;
    rows.push({
      correlationKey: `mission:${mission._id}:owner`,
      type: "NO_ACCOUNTABLE_OWNER",
      severity: "CRITICAL",
      reason: "Active Mission has no stable accountable human owner.",
      ownerLabel: "Workspace lead",
      ownerMemberId: mission.ownerMemberId,
      requiredAction: "Assign one accountable owner before dispatch.",
      createdAt: mission.updatedAt ?? mission.createdAt,
      evidenceLabel: "Mission ownership contract",
      workspaceId: bundle.project._id,
      workspaceName: bundle.project.name,
      teamId: mission.owningTeamId,
      teamName: teams.get(mission.owningTeamId)?.name,
      missionId: mission._id,
      missionTitle: mission.title,
    });
  }

  for (const workOrder of bundle.workOrders) {
    if (!ACTIVE_WORK_ORDER_STATES.has(workOrder.state)) continue;
    const mission = workOrder.missionId ? missions.get(workOrder.missionId) : undefined;
    const team = workOrder.owningTeamId ? teams.get(workOrder.owningTeamId) : undefined;
    const owner = workOrder.ownerMemberId ? members.get(workOrder.ownerMemberId) : undefined;
    const common = {
      ownerLabel: owner?.name ?? mission?.owner ?? workOrder.assignedSquad ?? "Workspace lead",
      ownerMemberId: workOrder.ownerMemberId ?? mission?.ownerMemberId,
      workspaceId: bundle.project._id as string,
      workspaceName: bundle.project.name,
      teamId: team?._id as string | undefined,
      teamName: team?.name,
      missionId: mission?._id as string | undefined,
      missionTitle: mission?.title,
      workOrderId: workOrder._id as string,
      workOrderTitle: workOrder.title,
      createdAt: workOrder.updatedAt ?? workOrder.createdAt,
    };
    if (workOrder.state === "BLOCKED") {
      rows.push({
        ...common,
        correlationKey: `work-order:${workOrder._id}:blocked`,
        type: "BLOCKED_WORK",
        severity: workOrder.riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
        reason: workOrder.blockingIssue ?? "WorkOrder is blocked.",
        requiredAction: workOrder.requiredHumanAction ?? "Name the unblock action and owner.",
        evidenceLabel: "Governed WorkOrder state",
      });
    }
    if (workOrder.state === "AWAITING_APPROVAL" || workOrder.approvalStatus === "PENDING") {
      rows.push({
        ...common,
        correlationKey: `work-order:${workOrder._id}:approval`,
        type: "APPROVAL_WAITING",
        severity: workOrder.riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
        reason: "Governed work is waiting for a human decision.",
        requiredAction: "Review the decision packet and approve, reject, or request revision.",
        evidenceLabel: "Approval decision state",
      });
    }
    if (workOrder.verificationStatus === "FAIL" || workOrder.verificationStatus === "STALE") {
      rows.push({
        ...common,
        correlationKey: `work-order:${workOrder._id}:verification`,
        type: workOrder.verificationStatus === "FAIL" ? "FAILING_EVIDENCE" : "STALE_EVIDENCE",
        severity: workOrder.verificationStatus === "FAIL" ? "CRITICAL" : "HIGH",
        reason: workOrder.verificationStatus === "FAIL" ? "Current verification evidence is failing." : "Verification evidence is stale.",
        requiredAction: "Inspect proof and run independent verification.",
        evidenceLabel: "Verification receipt projection",
      });
    }
  }

  for (const run of bundle.runs) {
    const workOrder = run.workOrderId ? bundle.workOrders.find((item: any) => item._id === run.workOrderId) : undefined;
    if (run.status === "FAILED") {
      rows.push({
        correlationKey: `run:${run._id}:failed`,
        type: "RUN_FAILED",
        severity: "HIGH",
        reason: run.failureReason ?? "Agent run failed.",
        ownerLabel: run.escalationOwner ?? "WorkOrder owner",
        ownerMemberId: workOrder?.ownerMemberId,
        requiredAction: "Inspect the last checkpoint, failure evidence, and retry policy.",
        createdAt: run.completedAt ?? run.startedAt,
        evidenceLabel: "Workflow run receipt",
        workspaceId: bundle.project._id,
        workspaceName: bundle.project.name,
        workOrderId: workOrder?._id,
        workOrderTitle: workOrder?.title,
      });
    } else if (run.status === "RUNNING" && now - (run.checkpointAt ?? run.startedAt) > 4 * 3_600_000) {
      rows.push({
        correlationKey: `run:${run._id}:checkpoint`,
        type: "MISSING_CHECKPOINT",
        severity: "HIGH",
        reason: "Long-running work has no fresh checkpoint.",
        ownerLabel: run.escalationOwner ?? "Run owner",
        ownerMemberId: workOrder?.ownerMemberId,
        requiredAction: "Checkpoint progress or pause the run safely.",
        createdAt: run.checkpointAt ?? run.startedAt,
        evidenceLabel: "Run checkpoint state",
        workspaceId: bundle.project._id,
        workspaceName: bundle.project.name,
        workOrderId: run.workOrderId,
      });
    }
  }
  return rows;
}

export const getOperatingView = query({
  args: {
    projectId: v.id("projects"),
    lens: v.optional(operatingLens),
    teamId: v.optional(v.id("scrumTeams")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    codeScopeId: v.optional(v.id("repositoryCodeScopes")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.tenantId) throw new Error("Workspace company assignment is incomplete.");
    const flagRows = (await ctx.db.query("featureFlags").collect()) as FlagRow[];
    const roleLensesEnabled = resolveFlag(flagRows, "control-plane.role-lenses", project._id).enabled;
    const companyRollupsEnabled = resolveFlag(flagRows, "control-plane.company-rollups", project._id).enabled;
    const repositoryProjectionEnabled = resolveFlag(flagRows, "control-plane.repository-projection", project._id).enabled;
    if (!roleLensesEnabled) return scopeError("The role-aware control plane is not enabled for this workspace.");
    const access: any = await requireWorkspaceAccess(ctx, project.tenantId, project._id);
    const activeMemberships: any[] = access.teamMemberships ?? [];
    const roleNames: string[] = access.roleNames ?? access.membership.roleNames;
    const memberProfiles: any[] = access.memberProfiles ?? [];
    const lenses = availableOperatingLenses({
      companyManager: access.membership.canManageCompany,
      roleNames,
      hasTeamMembership: activeMemberships.length > 0,
    }).filter((candidate) => candidate !== "COMPANY" || companyRollupsEnabled);
    const calculatedDefaultLens = defaultOperatingLens({
      companyManager: access.membership.canManageCompany,
      roleNames,
      hasTeamLeadMembership: activeMemberships.some((item: any) => item.role === "LEAD" || item.role === "PM"),
    });
    const defaultLens = lenses.includes(calculatedDefaultLens) ? calculatedDefaultLens : lenses.includes("WORKSPACE") ? "WORKSPACE" : lenses[0];
    const lens = args.lens ?? defaultLens;
    if (!lenses.includes(lens)) return scopeError(`The ${lens.toLowerCase()} lens is unavailable for your role.`);
    const workspaces = lens === "COMPANY"
      ? (await listAccessibleWorkspaces(ctx, project.tenantId)).filter((workspace) =>
          resolveFlag(flagRows, "control-plane.company-rollups", workspace._id).enabled
        )
      : [project];
    const workspaceIds = new Set(workspaces.map((workspace) => workspace._id));
    const repositoryProjectionWorkspaceIds = new Set(
      workspaces
        .filter((workspace) => resolveFlag(flagRows, "control-plane.repository-projection", workspace._id).enabled)
        .map((workspace) => workspace._id)
    );

    if (!repositoryProjectionEnabled && (args.repositoryId || args.codeScopeId)) {
      return scopeError("Repository projection is not enabled for this workspace. Reset repository filters.");
    }
    const selectedRepository = repositoryProjectionEnabled && args.repositoryId ? await ctx.db.get(args.repositoryId) : null;
    if (selectedRepository && (!workspaceIds.has(selectedRepository.projectId) || !repositoryProjectionWorkspaceIds.has(selectedRepository.projectId))) {
      return scopeError("Repository does not belong to an accessible workspace in this operating scope.");
    }
    const selectedCodeScope = repositoryProjectionEnabled && args.codeScopeId ? await ctx.db.get(args.codeScopeId) : null;
    if (selectedCodeScope && (!workspaceIds.has(selectedCodeScope.projectId) || (selectedRepository && selectedCodeScope.repositoryId !== selectedRepository._id))) {
      return scopeError("Code scope does not belong to the active workspace and repository. Reset the code-scope filter.");
    }

    const selectedTeam = args.teamId ? await ctx.db.get(args.teamId) : null;
    if (selectedTeam && selectedTeam.projectId !== project._id) return scopeError("Team does not belong to the active workspace. Choose a team from the selected workspace.");
    const broadWorkspaceAccess = access.membership.canManageCompany || roleNames.some((name: string) => /workspace lead|product manager|company|owner|admin/i.test(name));
    if (lens === "TEAM" && selectedTeam && !broadWorkspaceAccess && !activeMemberships.some((item: any) => item.teamId === selectedTeam._id)) {
      return scopeError("Team is unavailable or unauthorized for this operator.");
    }

    const bundles = await Promise.all(workspaces.map((workspace) => loadWorkspaceBundle(ctx, workspace)));
    const now = Date.now();
    const attentionStates = (await Promise.all(workspaces.map((workspace) =>
      ctx.db.query("attentionStates").withIndex("by_project", (q) => q.eq("projectId", workspace._id)).collect()
    ))).flat();
    const stateByKey = new Map(attentionStates.map((state) => [state.correlationKey, state]));
    const allAttention = rankAttentionItems(bundles.flatMap((bundle) => buildAttention(bundle, now)), now)
      .filter((item) => {
        const state = stateByKey.get(item.correlationKey);
        if (!state) return true;
        if (state.state === "RESOLVED") return false;
        return state.state !== "SNOOZED" || !state.snoozedUntil || state.snoozedUntil <= now;
      });

    const personalMemberIds = new Set(memberProfiles.map((member: any) => member._id));
    const selectedTeamId = selectedTeam?._id ?? activeMemberships[0]?.teamId ?? (lens === "TEAM" && broadWorkspaceAccess ? bundles.flatMap((bundle) => bundle.teams).find((team: any) => team.status === "ACTIVE")?._id : undefined);
    const effectiveSelectedTeam = selectedTeam ?? bundles.flatMap((bundle) => bundle.teams).find((team: any) => team._id === selectedTeamId) ?? null;
    const allAssignments = bundles.flatMap((bundle) => bundle.assignments);
    const visibleAssignments = allAssignments.filter((assignment: any) => {
      if (lens === "MY") return personalMemberIds.has(assignment.memberId);
      if (lens === "TEAM") return assignment.teamId === selectedTeamId;
      return true;
    });
    const visibleMissionIds = new Set(visibleAssignments.map((assignment: any) => assignment.missionId));
    const allMissions = bundles.flatMap((bundle) => bundle.missions);
    const visibleMissions = allMissions.filter((mission: any) => {
      if (selectedRepository && mission.repositoryId !== selectedRepository._id) return false;
      if (selectedCodeScope && !mission.codeScopeIds?.includes(selectedCodeScope._id)) return false;
      if (lens === "MY" || lens === "TEAM") return visibleMissionIds.has(mission._id) || (lens === "TEAM" && mission.owningTeamId === selectedTeamId);
      return true;
    });
    const missionIds = new Set(visibleMissions.map((mission: any) => mission._id));
    const visibleWorkOrders = bundles.flatMap((bundle) => bundle.workOrders).filter((workOrder: any) => {
      if (selectedRepository && workOrder.repositoryId !== selectedRepository._id) return false;
      if (selectedCodeScope && !workOrder.codeScopeIds?.includes(selectedCodeScope._id)) return false;
      if (lens === "MY" || lens === "TEAM") return (workOrder.missionId && missionIds.has(workOrder.missionId)) || (lens === "TEAM" && workOrder.owningTeamId === selectedTeamId);
      return true;
    });
    const visibleWorkOrderIds = new Set(visibleWorkOrders.map((workOrder: any) => workOrder._id));
    const filteredAttention = allAttention.filter((item) => {
      if (lens === "TEAM") return item.teamId === selectedTeamId;
      if (lens === "MY") {
        if (item.missionId) return missionIds.has(item.missionId as Id<"missions">);
        if (item.workOrderId) return visibleWorkOrderIds.has(item.workOrderId as Id<"workOrders">);
        return false;
      }
      if ((selectedRepository || selectedCodeScope) && item.workOrderId) return visibleWorkOrderIds.has(item.workOrderId as Id<"workOrders">);
      if ((selectedRepository || selectedCodeScope) && item.missionId) return missionIds.has(item.missionId as Id<"missions">);
      return true;
    });
    const visibleAttention = filteredAttention.slice(0, 15);

    const activeWorkOrders = visibleWorkOrders.filter((item: any) => ACTIVE_WORK_ORDER_STATES.has(item.state));
    const confidence = deliveryConfidence({
      activeWorkOrders: activeWorkOrders.length,
      blockedWorkOrders: activeWorkOrders.filter((item: any) => item.state === "BLOCKED").length,
      pendingApprovals: activeWorkOrders.filter((item: any) => item.state === "AWAITING_APPROVAL" || item.approvalStatus === "PENDING").length,
      failingEvidence: activeWorkOrders.filter((item: any) => item.verificationStatus === "FAIL").length,
      staleEvidence: activeWorkOrders.filter((item: any) => item.verificationStatus === "STALE").length,
      missingOwnership: activeWorkOrders.filter((item: any) => !item.ownerMemberId).length,
    });

    const visibleTeams = bundles.flatMap((bundle) => bundle.teams).filter((team: any) => lens !== "TEAM" || team._id === selectedTeamId);
    const visibleRuns = bundles.flatMap((bundle) => bundle.runs).filter((run: any) => !run.workOrderId || visibleWorkOrders.some((item: any) => item._id === run.workOrderId));
    const assignmentByMission = new Map<string, any[]>();
    for (const assignment of visibleAssignments) {
      const rows = assignmentByMission.get(assignment.missionId) ?? [];
      rows.push(assignment);
      assignmentByMission.set(assignment.missionId, rows);
    }
    const selectedTeamRecord = effectiveSelectedTeam
      ? bundles.flatMap((bundle) => bundle.teams).find((team: any) => team._id === effectiveSelectedTeam._id)
      : null;
    const people = selectedTeamRecord
      ? bundles
          .flatMap((bundle) => bundle.memberships)
          .filter((teamMembership: any) => teamMembership.active && teamMembership.teamId === selectedTeamRecord._id)
          .map((teamMembership: any) => {
            const member = bundles.flatMap((bundle) => bundle.members).find((candidate: any) => candidate._id === teamMembership.memberId);
            const memberAssignments = visibleAssignments.filter((assignment: any) => assignment.active && assignment.teamId === selectedTeamRecord._id && assignment.memberId === teamMembership.memberId);
            const memberMissionIds = new Set(memberAssignments.map((assignment: any) => assignment.missionId));
            const memberWorkOrders = visibleWorkOrders.filter((workOrder: any) => workOrder.ownerMemberId === teamMembership.memberId || (workOrder.missionId && memberMissionIds.has(workOrder.missionId)));
            const memberWorkOrderIds = new Set(memberWorkOrders.map((workOrder: any) => workOrder._id));
            const evidence = {
              passing: memberWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "PASS").length,
              failing: memberWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "FAIL").length,
              stale: memberWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "STALE").length,
              missing: memberWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "PENDING").length,
            };
            return {
              id: teamMembership.memberId,
              name: member?.name ?? "Unknown member",
              role: teamMembership.role,
              ownedMissions: new Set(memberAssignments.filter((assignment: any) => assignment.role === "OWNER").map((assignment: any) => assignment.missionId)).size,
              contributedMissions: new Set(memberAssignments.filter((assignment: any) => assignment.role === "CONTRIBUTOR").map((assignment: any) => assignment.missionId)).size,
              reviewMissions: new Set(memberAssignments.filter((assignment: any) => assignment.role === "REVIEWER").map((assignment: any) => assignment.missionId)).size,
              activeMissions: memberMissionIds.size,
              capacityLimit: selectedTeamRecord.capacityPolicy?.maxActiveMissionsPerMember ?? null,
              attention: filteredAttention.filter((item) => item.ownerMemberId === teamMembership.memberId).length,
              runningAgents: visibleRuns.filter((run: any) => run.workOrderId && memberWorkOrderIds.has(run.workOrderId) && run.status === "RUNNING").length,
              evidence,
            };
          })
          .sort((left: any, right: any) => left.name.localeCompare(right.name))
      : [];

    return {
      generatedAt: now,
      lens,
      defaultLens,
      availableLenses: lenses,
      scope: {
        company: { id: access.membership.tenant._id, name: access.membership.tenant.name },
        workspace: { id: project._id, name: project.name },
        team: effectiveSelectedTeam ? { id: effectiveSelectedTeam._id, name: effectiveSelectedTeam.name } : null,
        repository: selectedRepository ? { id: selectedRepository._id, name: selectedRepository.displayName } : null,
        codeScope: selectedCodeScope ? { id: selectedCodeScope._id, name: selectedCodeScope.name } : null,
      },
      allowedActions: {
        manageCompany: access.membership.canManageCompany,
        manageWorkspace: broadWorkspaceAccess,
        manageTeam: broadWorkspaceAccess || activeMemberships.some((item: any) => item.role === "LEAD" || item.role === "PM"),
        resolveAttention: lens !== "COMPANY" && (broadWorkspaceAccess || activeMemberships.some((item: any) => item.role === "LEAD" || item.role === "PM")),
        dispatch: !roleNames.some((name: string) => /viewer/i.test(name)) && !activeMemberships.some((item: any) => item.role === "VIEWER"),
      },
      summary: {
        activeMissions: visibleMissions.filter((item: any) => ACTIVE_MISSION_STATES.has(item.state)).length,
        activeWorkOrders: activeWorkOrders.length,
        attentionRequired: filteredAttention.length,
        runningAgents: visibleRuns.filter((item: any) => item.status === "RUNNING").length,
        deliveryConfidence: confidence,
        evidence: {
          passing: visibleWorkOrders.filter((item: any) => item.verificationStatus === "PASS").length,
          failing: visibleWorkOrders.filter((item: any) => item.verificationStatus === "FAIL").length,
          stale: visibleWorkOrders.filter((item: any) => item.verificationStatus === "STALE").length,
          missing: visibleWorkOrders.filter((item: any) => item.verificationStatus === "PENDING").length,
          unknown: visibleWorkOrders.length === 0 ? null : 0,
        },
        formulae: {
          deliveryConfidence: confidence.formula,
          attention: "Severity, overdue state, age, then stable correlation key; duplicate keys collapse to the highest-severity symptom.",
        },
        source: "Canonical Mission, WorkOrder, workflow run, assignment, and verification records",
        freshness: { generatedAt: now, status: "CURRENT" },
      },
      attention: visibleAttention.map((item) => ({ ...item, age: displayAge(item.createdAt, now) })),
      attentionWindow: { showing: visibleAttention.length, total: filteredAttention.length, limit: 15 },
      missions: visibleMissions.map((mission: any) => {
        const missionWorkOrders = visibleWorkOrders.filter((workOrder: any) => workOrder.missionId === mission._id);
        const missionWorkOrderIds = new Set(missionWorkOrders.map((workOrder: any) => workOrder._id));
        const missionRuns = visibleRuns.filter((run: any) => run.workOrderId && missionWorkOrderIds.has(run.workOrderId));
        const activeRun = missionRuns.find((run: any) => ["PENDING", "RUNNING", "PAUSED"].includes(run.status));
        const failingEvidence = missionWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "FAIL").length;
        const staleEvidence = missionWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "STALE").length;
        const missingEvidence = missionWorkOrders.filter((workOrder: any) => workOrder.verificationStatus === "PENDING").length;
        return {
          id: mission._id,
          title: mission.title,
          objective: mission.objective,
          state: mission.state,
          owner: mission.ownerMemberId ? bundles.flatMap((bundle) => bundle.members).find((member: any) => member._id === mission.ownerMemberId)?.name ?? mission.owner ?? "Unknown" : mission.owner ?? "Unknown",
          assignmentRoles: (assignmentByMission.get(mission._id) ?? []).map((assignment) => assignment.role),
          teamId: mission.owningTeamId,
          repositoryId: mission.repositoryId,
          codeScopeIds: mission.codeScopeIds ?? [],
          workOrders: missionWorkOrders.length,
          runningAgents: missionRuns.filter((run: any) => run.status === "RUNNING").length,
          nextAction: mission.requiredHumanAction ?? (mission.state === "BLOCKED" ? mission.blockingReason ?? "Unblock the Mission." : activeRun ? "Inspect the active run and its latest checkpoint." : "Review the next governed WorkOrder."),
          execution: activeRun ? {
            model: activeRun.model ?? null,
            environment: activeRun.executionEnvironment ?? null,
            checkpointAt: activeRun.checkpointAt ?? null,
            budgetUsd: activeRun.budgetUsd ?? null,
            spentUsd: activeRun.spentUsd ?? null,
          } : null,
          evidence: { failing: failingEvidence, stale: staleEvidence, missing: missingEvidence },
          budget: { budgetUsd: mission.budgetUsd ?? null, spentUsd: mission.spentUsd },
          updatedAt: mission.updatedAt,
        };
      }),
      teams: visibleTeams.map((team: any) => {
        const teamAssignments = allAssignments.filter((assignment: any) => assignment.teamId === team._id && assignment.active);
        const memberIds = new Set(teamAssignments.map((assignment: any) => assignment.memberId));
        return {
          id: team._id,
          name: team.name,
          status: team.status,
          members: bundles.flatMap((bundle) => bundle.members).filter((member: any) => memberIds.has(member._id)).length,
          activeMissions: new Set(teamAssignments.filter((assignment: any) => visibleMissions.some((mission: any) => mission._id === assignment.missionId)).map((assignment: any) => assignment.missionId)).size,
          attention: filteredAttention.filter((item) => item.teamId === team._id).length,
        };
      }),
      people,
      workspaces: bundles.map((bundle) => ({
        id: bundle.project._id,
        name: bundle.project.name,
        teams: bundle.teams.filter((team: any) => team.status === "ACTIVE").length,
        members: bundle.members.filter((member: any) => member.active).length,
        activeMissions: bundle.missions.filter((mission: any) => ACTIVE_MISSION_STATES.has(mission.state)).length,
        attention: filteredAttention.filter((item) => item.workspaceId === bundle.project._id).length,
        repositories: repositoryProjectionWorkspaceIds.has(bundle.project._id) ? bundle.repositories.length : 0,
      })),
      fleet: {
        humanCapacity: { members: bundles.flatMap((bundle) => bundle.members).filter((member: any) => member.active).length, activeAssignments: visibleAssignments.length },
        agentDefinitions: { value: null, status: "UNKNOWN", source: "Agent registry is not joined to operating teams yet." },
        agentInstances: { running: visibleRuns.filter((run: any) => run.status === "RUNNING").length, failed: visibleRuns.filter((run: any) => run.status === "FAILED").length },
        executorHosts: { value: null, status: "UNKNOWN", source: "Host readiness is evaluated at dispatch and executor binding." },
      },
      filters: {
        teams: bundles.flatMap((bundle) => bundle.teams).map((team: any) => ({ id: team._id, name: team.name })),
        repositories: repositoryProjectionEnabled ? bundles.filter((bundle) => repositoryProjectionWorkspaceIds.has(bundle.project._id)).flatMap((bundle) => bundle.repositories).map((repository: any) => ({ id: repository._id, name: repository.displayName })) : [],
        codeScopes: repositoryProjectionEnabled ? bundles.filter((bundle) => repositoryProjectionWorkspaceIds.has(bundle.project._id)).flatMap((bundle) => bundle.codeScopes)
          .filter((scope: any) => scope.active && (!selectedRepository || scope.repositoryId === selectedRepository._id))
          .map((scope: any) => ({ id: scope._id, name: scope.name, repositoryId: scope.repositoryId })) : [],
      },
    };
  },
});

export const listWorkspaceStructure = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.tenantId) throw new Error("Workspace company assignment is incomplete.");
    const access: any = await requireWorkspaceAccess(ctx, project.tenantId, project._id);
    const bundle = await loadWorkspaceBundle(ctx, project);
    const memberships = await ctx.db.query("teamMemberships").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect();
    const broadWorkspaceAccess = access.membership.canManageCompany || (access.roleNames ?? []).some((name: string) => /workspace lead|product manager|company|owner|admin/i.test(name));
    const accessibleTeamIds = new Set((access.teamMemberships ?? []).map((item: any) => item.teamId));
    const visibleTeams = broadWorkspaceAccess
      ? bundle.teams
      : bundle.teams.filter((team: any) => accessibleTeamIds.has(team._id));
    const visibleTeamIds = new Set(visibleTeams.map((team: any) => team._id));
    const visibleMemberships = memberships.filter((item) => visibleTeamIds.has(item.teamId));
    const visibleMemberIds = new Set(visibleMemberships.map((item) => item.memberId));
    return {
      teams: visibleTeams,
      memberships: visibleMemberships,
      members: broadWorkspaceAccess ? bundle.members : bundle.members.filter((member: any) => visibleMemberIds.has(member._id)),
      repositories: bundle.repositories,
      assignmentCount: bundle.assignments.filter((item: any) => item.active && (broadWorkspaceAccess || visibleTeamIds.has(item.teamId))).length,
      canManageTeams: access.membership.canManageCompany || (access.roleNames ?? []).some((name: string) => /workspace lead|product manager|team lead|owner|admin/i.test(name)) || (access.teamMemberships ?? []).some((item: any) => item.role === "LEAD" || item.role === "PM"),
    };
  },
});

export const createTeam = mutation({
  args: {
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    purpose: v.optional(v.string()),
    leadMemberId: v.optional(v.id("orgMembers")),
    maxActiveMissionsPerMember: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { membership, project } = await requireWorkspaceAccess(ctx, args.tenantId, args.projectId, { permission: COMPANY_PERMISSIONS.MANAGE_WORKSPACES });
    const name = args.name.trim();
    if (!name) throw new Error("Team name is required.");
    const slug = assertSlug(args.slug, "Team slug");
    const duplicate = await ctx.db.query("scrumTeams").withIndex("by_project_slug", (q) => q.eq("projectId", project._id).eq("slug", slug)).first();
    if (duplicate) return { success: false, error: "A team with this slug already exists in the workspace." };
    if (args.leadMemberId) {
      const lead = await ctx.db.get(args.leadMemberId);
      if (!lead || lead.tenantId !== args.tenantId || lead.projectId !== args.projectId || !lead.active) throw new Error("Team lead must be an active member of this workspace.");
    }
    const now = Date.now();
    const teamId = await ctx.db.insert("scrumTeams", {
      tenantId: args.tenantId,
      projectId: args.projectId,
      name,
      slug,
      purpose: cleanOptional(args.purpose),
      leadMemberId: args.leadMemberId,
      capacityPolicy: {
        maxActiveMissionsPerMember: args.maxActiveMissionsPerMember ?? 5,
        maxConcurrentRuns: 10,
        reviewReservePct: 20,
      },
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      createdBy: membership.operatorId,
      updatedBy: membership.operatorId,
    });
    await ctx.db.insert("activities", {
      tenantId: args.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: membership.operatorId,
      action: "SCRUM_TEAM_CREATED",
      description: `Team "${name}" created in workspace "${project.name}"`,
      targetType: "SCRUM_TEAM",
      targetId: teamId,
    });
    return { success: true, teamId };
  },
});

export const setTeamMembership = mutation({
  args: {
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    teamId: v.id("scrumTeams"),
    memberId: v.id("orgMembers"),
    role: teamRole,
    capacityAllocationPct: v.optional(v.number()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccess(ctx, args.tenantId, args.projectId, { permission: COMPANY_PERMISSIONS.MANAGE_TEAMS });
    const { membership } = access;
    const [team, member] = await Promise.all([ctx.db.get(args.teamId), ctx.db.get(args.memberId)]);
    if (!team || team.projectId !== args.projectId || team.tenantId !== args.tenantId) throw new Error("Team does not belong to the active workspace.");
    assertAuthorizedDeliveryRecord(access, { owningTeamId: team._id });
    if (!member || member.projectId !== args.projectId || member.tenantId !== args.tenantId) throw new Error("Member does not belong to the active workspace.");
    if (args.capacityAllocationPct !== undefined && (args.capacityAllocationPct < 0 || args.capacityAllocationPct > 100)) throw new Error("Capacity allocation must be between 0 and 100 percent.");
    const existing = await ctx.db.query("teamMemberships").withIndex("by_team_member", (q) => q.eq("teamId", args.teamId).eq("memberId", args.memberId)).first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, active: args.active, activeUntil: args.active ? undefined : now, capacityAllocationPct: args.capacityAllocationPct, updatedAt: now, updatedBy: membership.operatorId });
      return { success: true, membershipId: existing._id };
    }
    const membershipId = await ctx.db.insert("teamMemberships", {
      tenantId: args.tenantId,
      projectId: args.projectId,
      teamId: args.teamId,
      memberId: args.memberId,
      operatorId: member.operatorId,
      role: args.role,
      activeFrom: now,
      capacityAllocationPct: args.capacityAllocationPct,
      active: args.active,
      activeUntil: args.active ? undefined : now,
      createdAt: now,
      updatedAt: now,
      createdBy: membership.operatorId,
      updatedBy: membership.operatorId,
    });
    return { success: true, membershipId };
  },
});

export const assignMissionMember = mutation({
  args: {
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    memberId: v.id("orgMembers"),
    teamId: v.id("scrumTeams"),
    role: assignmentRole,
    capacityAllocationPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccess(ctx, args.tenantId, args.projectId, { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
    const { membership } = access;
    const [mission, member, team] = await Promise.all([ctx.db.get(args.missionId), ctx.db.get(args.memberId), ctx.db.get(args.teamId)]);
    if (!mission || mission.projectId !== args.projectId || mission.tenantId !== args.tenantId) throw new Error("Mission does not belong to the active workspace.");
    if (!member || member.projectId !== args.projectId || member.tenantId !== args.tenantId || !member.active) throw new Error("Mission assignee must be an active workspace member.");
    if (!team || team.projectId !== args.projectId || team.tenantId !== args.tenantId || team.status !== "ACTIVE") throw new Error("Mission team must be active in the same workspace.");
    assertAuthorizedDeliveryRecord(access, { owningTeamId: team._id });
    if (mission.owningTeamId || mission.ownerMemberId) assertAuthorizedDeliveryRecord(access, mission);
    const teamMembership = await ctx.db.query("teamMemberships").withIndex("by_team_member", (q) => q.eq("teamId", team._id).eq("memberId", member._id)).first();
    if (!teamMembership?.active) throw new Error("Mission assignee must be an active member of the selected team.");
    const now = Date.now();
    const existingAssignments = await ctx.db.query("missionAssignments").withIndex("by_mission", (q) => q.eq("missionId", mission._id)).collect();
    if (args.role === "OWNER") {
      for (const existing of existingAssignments.filter((item) => item.active && item.role === "OWNER" && item.memberId !== member._id)) {
        await ctx.db.patch(existing._id, { active: false, activeUntil: now, updatedAt: now, updatedBy: membership.operatorId });
      }
      await ctx.db.patch(mission._id, { owner: member.name, ownerMemberId: member._id, owningTeamId: team._id, updatedAt: now });
    }
    const existing = existingAssignments.find((item) => item.memberId === member._id && item.teamId === team._id && item.role === args.role);
    if (existing) {
      await ctx.db.patch(existing._id, { active: true, activeUntil: undefined, capacityAllocationPct: args.capacityAllocationPct, updatedAt: now, updatedBy: membership.operatorId });
      return { success: true, assignmentId: existing._id };
    }
    const assignmentId = await ctx.db.insert("missionAssignments", {
      tenantId: args.tenantId,
      projectId: args.projectId,
      missionId: mission._id,
      memberId: member._id,
      teamId: team._id,
      role: args.role,
      capacityAllocationPct: args.capacityAllocationPct,
      activeFrom: now,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: membership.operatorId,
      updatedBy: membership.operatorId,
    });
    return { success: true, assignmentId };
  },
});

export const setAttentionState = mutation({
  args: {
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    correlationKey: v.string(),
    state: v.union(v.literal("OPEN"), v.literal("SNOOZED"), v.literal("RESOLVED")),
    snoozedUntil: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccess(ctx, args.tenantId, args.projectId, { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
    const { membership } = access;
    const [kind, recordId] = args.correlationKey.split(":");
    let deliveryRecord: any = null;
    if (kind === "mission" && recordId) deliveryRecord = await ctx.db.get(recordId as Id<"missions">);
    if (kind === "work-order" && recordId) deliveryRecord = await ctx.db.get(recordId as Id<"workOrders">);
    if (kind === "run" && recordId) {
      const run = await ctx.db.get(recordId as Id<"workflowRuns">);
      deliveryRecord = run?.workOrderId ? await ctx.db.get(run.workOrderId) : null;
    }
    if (!deliveryRecord || deliveryRecord.projectId !== args.projectId) throw new Error("Attention item does not belong to the active workspace.");
    assertAuthorizedDeliveryRecord(access, deliveryRecord);
    if (args.state === "SNOOZED" && (!args.snoozedUntil || args.snoozedUntil <= Date.now())) throw new Error("Choose a future snooze time.");
    if (args.state === "RESOLVED" && !args.resolutionNote?.trim()) throw new Error("Resolution note is required.");
    const existing = await ctx.db.query("attentionStates").withIndex("by_project_key", (q) => q.eq("projectId", args.projectId).eq("correlationKey", args.correlationKey)).first();
    const value = { state: args.state, snoozedUntil: args.state === "SNOOZED" ? args.snoozedUntil : undefined, resolutionNote: args.state === "RESOLVED" ? args.resolutionNote?.trim() : undefined, updatedAt: Date.now(), updatedBy: membership.operatorId };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("attentionStates", { tenantId: args.tenantId, projectId: args.projectId, correlationKey: args.correlationKey, ...value });
    await ctx.db.insert("activities", { tenantId: args.tenantId, projectId: args.projectId, actorType: "HUMAN", actorId: membership.operatorId, action: "ATTENTION_STATE_CHANGED", description: `Attention item ${args.correlationKey} marked ${args.state.toLowerCase()}`, targetType: "ATTENTION_ITEM", targetId: args.correlationKey, metadata: { state: args.state } });
    return { success: true };
  },
});

export const getRepositoryParityReport = query({
  args: { tenantId: v.id("tenants"), projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const projects = args.projectId
      ? [await ctx.db.get(args.projectId)].filter((item): item is Doc<"projects"> => Boolean(item))
      : await listAccessibleWorkspaces(ctx, args.tenantId);
    const rows = [];
    for (const project of projects) {
      await requireWorkspaceAccess(ctx, args.tenantId, project._id);
      const connections = await ctx.db.query("workspaceRepositories").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect();
      const defaults = connections.filter((connection) => connection.isDefault);
      const defaultConnection = defaults[0];
      const matches = Boolean(
        (!project.githubRepo && defaults.length === 0) ||
        (project.githubRepo && defaults.length === 1 && defaultConnection && canonicalRepositoryKey(defaultConnection.repository) === canonicalRepositoryKey(project.githubRepo) && defaultConnection.defaultBranch === (project.githubBranch ?? "main"))
      );
      rows.push({ projectId: project._id, workspace: project.name, legacyRepository: project.githubRepo ?? null, defaultConnection: defaultConnection?.repository ?? null, defaultCount: defaults.length, matches });
    }
    return { generatedAt: Date.now(), total: rows.length, matching: rows.filter((row) => row.matches).length, mismatches: rows.filter((row) => !row.matches), rows };
  },
});

/**
 * Deterministic, idempotent migration for legacy string ownership. Dry-run is
 * the default. Ambiguous rows are reported for human review and never guessed.
 */
export const backfillDeliveryOwnership = mutation({
  args: {
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    apply: v.optional(v.boolean()),
    writeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.tenantId, args.projectId, { permission: COMPANY_PERMISSIONS.MANAGE_WORKSPACES });
    const writeLimit = Math.max(1, Math.min(200, Math.floor(args.writeLimit ?? 100)));
    const [members, teams, memberships, missions, workOrders, repositories, assignments] = await Promise.all([
      ctx.db.query("orgMembers").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("scrumTeams").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("teamMemberships").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("missions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("workOrders").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("workspaceRepositories").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("missionAssignments").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);
    const memberCandidates = members.map((member) => ({ id: member._id, name: member.name, email: member.email, active: member.active }));
    const teamCandidates = teams.map((team) => ({ id: team._id, name: team.name, slug: team.slug, status: team.status }));
    const membershipCandidates = memberships.map((item) => ({ memberId: item.memberId, teamId: item.teamId, active: item.active }));
    const defaultRepositories = repositories.filter((repository) => repository.isDefault && ["READY", "CONFIGURED"].includes(repository.status));
    const validRepositoryIds = new Set(repositories.map((repository) => repository._id));
    const ownerAssignmentsByMission = new Map<string, typeof assignments>();
    for (const assignment of assignments.filter((item) => item.active && item.role === "OWNER")) {
      const rows = ownerAssignmentsByMission.get(assignment.missionId) ?? [];
      rows.push(assignment);
      ownerAssignmentsByMission.set(assignment.missionId, rows);
    }
    const reviewRows: Array<{ recordType: "MISSION" | "WORK_ORDER"; recordId: string; title: string; outcome: string; reasonCodes: string[]; candidateMemberIds?: string[]; candidateTeamIds?: string[] }> = [];
    const missionScope = new Map<string, { ownerMemberId: Id<"orgMembers">; owningTeamId: Id<"scrumTeams">; repositoryId: Id<"workspaceRepositories">; codeScopeIds: Id<"repositoryCodeScopes">[] }>();
    let writeCount = 0;
    let wouldUpdate = 0;
    let updated = 0;
    let assignmentsCreated = 0;
    let alreadyScoped = 0;
    let ambiguous = 0;
    let unresolved = 0;
    let deferredByWriteLimit = 0;
    const recordReview = (row: (typeof reviewRows)[number]) => {
      if (row.outcome === "AMBIGUOUS") ambiguous += 1;
      else unresolved += 1;
      if (reviewRows.length < 100) reviewRows.push(row);
    };
    const repositoryFor = (repositoryId: Id<"workspaceRepositories"> | undefined) => {
      if (repositoryId && validRepositoryIds.has(repositoryId)) return { repositoryId, reasonCodes: [] as string[] };
      if (repositoryId) return { repositoryId: undefined, reasonCodes: ["REPOSITORY_OUTSIDE_WORKSPACE"] };
      if (defaultRepositories.length === 1) return { repositoryId: defaultRepositories[0]._id, reasonCodes: [] as string[] };
      return { repositoryId: undefined, reasonCodes: [defaultRepositories.length > 1 ? "MULTIPLE_DEFAULT_REPOSITORIES" : "DEFAULT_REPOSITORY_REQUIRED"] };
    };
    const canWrite = (operations: number) => Boolean(args.apply) && writeCount + operations <= writeLimit;

    for (const mission of missions) {
      const activeOwners = ownerAssignmentsByMission.get(mission._id) ?? [];
      if (activeOwners.length > 1 || (activeOwners.length === 1 && mission.ownerMemberId && activeOwners[0].memberId !== mission.ownerMemberId)) {
        recordReview({ recordType: "MISSION", recordId: mission._id, title: mission.title, outcome: "AMBIGUOUS", reasonCodes: ["CONFLICTING_ACTIVE_OWNER_ASSIGNMENT"], candidateMemberIds: activeOwners.map((item) => item.memberId) });
        continue;
      }
      const resolution = resolveDeterministicOwnership({
        ownerLabel: mission.owner,
        ownerMemberId: mission.ownerMemberId,
        owningTeamId: mission.owningTeamId,
        members: memberCandidates,
        teams: teamCandidates,
        memberships: membershipCandidates,
      });
      const repository = repositoryFor(mission.repositoryId);
      if (resolution.status !== "MATCHED" || !repository.repositoryId) {
        recordReview({
          recordType: "MISSION",
          recordId: mission._id,
          title: mission.title,
          outcome: resolution.status === "AMBIGUOUS" || repository.reasonCodes.includes("MULTIPLE_DEFAULT_REPOSITORIES") ? "AMBIGUOUS" : "UNRESOLVED",
          reasonCodes: [...resolution.reasonCodes, ...repository.reasonCodes],
          candidateMemberIds: "candidateMemberIds" in resolution ? resolution.candidateMemberIds : [resolution.memberId],
          candidateTeamIds: "candidateTeamIds" in resolution ? resolution.candidateTeamIds : [resolution.teamId],
        });
        continue;
      }
      const resolved = {
        ownerMemberId: resolution.memberId as Id<"orgMembers">,
        owningTeamId: resolution.teamId as Id<"scrumTeams">,
        repositoryId: repository.repositoryId,
        codeScopeIds: mission.codeScopeIds ?? [],
      };
      missionScope.set(mission._id, resolved);
      const ownerAssignment = activeOwners.find((item) => item.memberId === resolved.ownerMemberId && item.teamId === resolved.owningTeamId);
      const needsPatch = mission.ownerMemberId !== resolved.ownerMemberId || mission.owningTeamId !== resolved.owningTeamId || mission.repositoryId !== resolved.repositoryId;
      const neededOperations = Number(needsPatch) + Number(!ownerAssignment);
      if (neededOperations === 0) {
        alreadyScoped += 1;
        continue;
      }
      wouldUpdate += 1;
      if (!canWrite(neededOperations)) {
        if (args.apply) deferredByWriteLimit += 1;
        continue;
      }
      const now = Date.now();
      if (needsPatch) {
        await ctx.db.patch(mission._id, {
          owner: members.find((member) => member._id === resolved.ownerMemberId)?.name ?? mission.owner,
          ownerMemberId: resolved.ownerMemberId,
          owningTeamId: resolved.owningTeamId,
          repositoryId: resolved.repositoryId,
          updatedAt: now,
          metadata: { ...(mission.metadata && typeof mission.metadata === "object" ? mission.metadata : {}), ownershipMigrationVersion: 1, ownershipMigratedAt: now },
        });
        writeCount += 1;
      }
      if (!ownerAssignment) {
        await ctx.db.insert("missionAssignments", {
          tenantId: args.tenantId,
          projectId: args.projectId,
          missionId: mission._id,
          memberId: resolved.ownerMemberId,
          teamId: resolved.owningTeamId,
          role: "OWNER",
          activeFrom: now,
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: membership.operatorId,
          updatedBy: membership.operatorId,
        });
        assignmentsCreated += 1;
        writeCount += 1;
      }
      updated += 1;
    }

    for (const workOrder of workOrders) {
      const inherited = workOrder.missionId ? missionScope.get(workOrder.missionId) : undefined;
      const resolution = inherited
        ? { status: "MATCHED" as const, memberId: inherited.ownerMemberId, teamId: inherited.owningTeamId, reasonCodes: [] as string[] }
        : resolveDeterministicOwnership({
            ownerLabel: workOrder.requestedBy,
            squadLabel: workOrder.assignedSquad,
            ownerMemberId: workOrder.ownerMemberId,
            owningTeamId: workOrder.owningTeamId,
            members: memberCandidates,
            teams: teamCandidates,
            memberships: membershipCandidates,
          });
      const repository = repositoryFor(workOrder.repositoryId ?? inherited?.repositoryId);
      if (resolution.status !== "MATCHED" || !repository.repositoryId) {
        recordReview({
          recordType: "WORK_ORDER",
          recordId: workOrder._id,
          title: workOrder.title,
          outcome: resolution.status === "AMBIGUOUS" || repository.reasonCodes.includes("MULTIPLE_DEFAULT_REPOSITORIES") ? "AMBIGUOUS" : "UNRESOLVED",
          reasonCodes: [...resolution.reasonCodes, ...repository.reasonCodes],
          candidateMemberIds: "candidateMemberIds" in resolution ? resolution.candidateMemberIds : [resolution.memberId],
          candidateTeamIds: "candidateTeamIds" in resolution ? resolution.candidateTeamIds : [resolution.teamId],
        });
        continue;
      }
      const codeScopeIds = workOrder.codeScopeIds ?? inherited?.codeScopeIds ?? [];
      const needsPatch = workOrder.ownerMemberId !== resolution.memberId || workOrder.owningTeamId !== resolution.teamId || workOrder.repositoryId !== repository.repositoryId || workOrder.scopeEnforcementVersion !== 1 || (!workOrder.codeScopeIds && codeScopeIds.length > 0);
      if (!needsPatch) {
        alreadyScoped += 1;
        continue;
      }
      wouldUpdate += 1;
      if (!canWrite(1)) {
        if (args.apply) deferredByWriteLimit += 1;
        continue;
      }
      const now = Date.now();
      await ctx.db.patch(workOrder._id, {
        ownerMemberId: resolution.memberId as Id<"orgMembers">,
        owningTeamId: resolution.teamId as Id<"scrumTeams">,
        repositoryId: repository.repositoryId,
        codeScopeIds,
        scopeEnforcementVersion: 1,
        updatedAt: now,
        metadata: { ...(workOrder.metadata && typeof workOrder.metadata === "object" ? workOrder.metadata : {}), ownershipMigrationVersion: 1, ownershipMigratedAt: now },
      });
      writeCount += 1;
      updated += 1;
    }

    if (args.apply && writeCount > 0) {
      await ctx.db.insert("activities", {
        tenantId: args.tenantId,
        projectId: args.projectId,
        actorType: "HUMAN",
        actorId: membership.operatorId,
        action: "DELIVERY_OWNERSHIP_BACKFILLED",
        description: `Applied deterministic delivery ownership migration v1 to ${updated} records`,
        targetType: "WORKSPACE",
        targetId: args.projectId,
        metadata: { migrationVersion: 1, writeCount, assignmentsCreated, ambiguous, unresolved, deferredByWriteLimit },
      });
    }
    return {
      migrationVersion: 1,
      mode: args.apply ? "APPLY" as const : "DRY_RUN" as const,
      scanned: { missions: missions.length, workOrders: workOrders.length },
      outcomes: { alreadyScoped, wouldUpdate, updated, assignmentsCreated, ambiguous, unresolved, deferredByWriteLimit },
      writeLimit,
      writesApplied: writeCount,
      reviewRows,
      reviewRowsTruncated: ambiguous + unresolved > reviewRows.length,
    };
  },
});

const SCALE_FIXTURE_KEY = "company-control-plane-scale-v1";

export const seedScaleFixture = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const membership = await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_COMPANY);
    const existing = (await ctx.db.query("projects").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect()).filter((project) => project.metadata?.fixtureKey === SCALE_FIXTURE_KEY);
    if (existing.length > 0) return { success: true, created: false, fixtureKey: SCALE_FIXTURE_KEY, workspaces: existing.length };
    const now = Date.now();
    let teamCount = 0;
    let memberCount = 0;
    let missionCount = 0;
    let assignmentCount = 0;
    let workOrderCount = 0;
    let runCount = 0;
    let approvalCount = 0;

    for (let workspaceIndex = 1; workspaceIndex <= 2; workspaceIndex += 1) {
      const workspaceName = workspaceIndex === 1 ? "SellerFi Marketplace" : "Mission Control Factory";
      const projectId = await ctx.db.insert("projects", {
        tenantId: args.tenantId,
        name: workspaceName,
        slug: `control-plane-scale-${workspaceIndex}`,
        description: "Deterministic scale fixture for governed software-factory control plane verification.",
        purpose: "Verify role lenses, attention, ownership, and dispatch scope at target scale.",
        owner: membership.tenant.name,
        defaultPolicy: "Governed bounded execution",
        status: "ACTIVE",
        metadata: { fixtureKey: SCALE_FIXTURE_KEY, createdAt: now },
        createdAt: now,
        updatedAt: now,
        createdBy: membership.operatorId,
        updatedBy: membership.operatorId,
      });
      const repository = workspaceIndex === 1 ? "sellerfi/marketplace" : "jaydubya818/MissionControl";
      const repositoryId = await ctx.db.insert("workspaceRepositories", {
        tenantId: args.tenantId,
        projectId,
        provider: "GITHUB",
        repository,
        displayName: workspaceIndex === 1 ? "Marketplace monorepo" : "MissionControl",
        defaultBranch: "main",
        isDefault: true,
        status: "READY",
        webhookStatus: "READY",
        dataClassification: "INTERNAL",
        fixtureKey: SCALE_FIXTURE_KEY,
        createdAt: now,
        updatedAt: now,
        createdBy: membership.operatorId,
        updatedBy: membership.operatorId,
      });
      await ctx.db.patch(projectId, { githubRepo: repository, githubBranch: "main", repositoryStatus: "READY", repositoryValidatedAt: now });

      const teamIds: Id<"scrumTeams">[] = [];
      const codeScopeIdsByTeam = new Map<string, Id<"repositoryCodeScopes">>();
      for (let teamIndex = 1; teamIndex <= 5; teamIndex += 1) {
        const teamId = await ctx.db.insert("scrumTeams", {
          tenantId: args.tenantId,
          projectId,
          name: `Team ${workspaceIndex}.${teamIndex}`,
          slug: `team-${teamIndex}`,
          purpose: `Own bounded delivery stream ${teamIndex}`,
          capacityPolicy: { maxActiveMissionsPerMember: 5, maxConcurrentRuns: 10, reviewReservePct: 20 },
          status: "ACTIVE",
          fixtureKey: SCALE_FIXTURE_KEY,
          createdAt: now,
          updatedAt: now,
          createdBy: membership.operatorId,
          updatedBy: membership.operatorId,
        });
        teamIds.push(teamId);
        teamCount += 1;
        if (workspaceIndex === 1) {
          const codeScopeId = await ctx.db.insert("repositoryCodeScopes", {
            tenantId: args.tenantId,
            projectId,
            repositoryId,
            name: `Marketplace domain ${teamIndex}`,
            slug: `domain-${teamIndex}`,
            includePaths: [`apps/domain-${teamIndex}`, `packages/domain-${teamIndex}`],
            excludePaths: ["**/generated/**"],
            owningTeamId: teamId,
            owningTeam: `Team ${workspaceIndex}.${teamIndex}`,
            requiredReviewers: [`team-${teamIndex}-qa`],
            allowedEnvironments: ["LOCAL", "CLOUD"],
            verificationPolicy: "Unit, integration, browser, independent review",
            approvalPolicy: "Team lead and independent QA",
            active: true,
            fixtureKey: SCALE_FIXTURE_KEY,
            createdAt: now,
            updatedAt: now,
            createdBy: membership.operatorId,
            updatedBy: membership.operatorId,
          });
          codeScopeIdsByTeam.set(teamId, codeScopeId);
        }
      }

      for (let teamIndex = 0; teamIndex < teamIds.length; teamIndex += 1) {
        const teamId = teamIds[teamIndex];
        for (let memberIndex = 1; memberIndex <= 5; memberIndex += 1) {
          const memberId = await ctx.db.insert("orgMembers", {
            tenantId: args.tenantId,
            projectId,
            name: `Developer ${workspaceIndex}.${teamIndex + 1}.${memberIndex}`,
            email: `scale-${workspaceIndex}-${teamIndex + 1}-${memberIndex}@example.invalid`,
            role: memberIndex === 1 ? "Engineering Lead" : memberIndex === 5 ? "QA Engineer" : "Software Engineer",
            systemRole: memberIndex === 1 ? "MANAGER" : "MEMBER",
            projectAccess: [{ projectId, accessLevel: memberIndex === 1 ? "ADMIN" : "EDIT" }],
            level: memberIndex === 1 ? 1 : 2,
            active: true,
            metadata: { fixtureKey: SCALE_FIXTURE_KEY },
          });
          memberCount += 1;
          await ctx.db.insert("teamMemberships", {
            tenantId: args.tenantId,
            projectId,
            teamId,
            memberId,
            role: memberIndex === 1 ? "LEAD" : memberIndex === 5 ? "QA" : "DEVELOPER",
            activeFrom: now,
            capacityAllocationPct: 100,
            active: true,
            fixtureKey: SCALE_FIXTURE_KEY,
            createdAt: now,
            updatedAt: now,
            createdBy: membership.operatorId,
            updatedBy: membership.operatorId,
          });
          if (memberIndex === 1) await ctx.db.patch(teamId, { leadMemberId: memberId });

          for (let epicIndex = 1; epicIndex <= 5; epicIndex += 1) {
            const scenario = (teamIndex + memberIndex + epicIndex) % 5;
            const missionState = scenario === 0 ? "BLOCKED" : scenario === 1 ? "AWAITING_VALIDATION" : "IN_PROGRESS";
            const missionId = await ctx.db.insert("missions", {
              tenantId: args.tenantId,
              projectId,
              title: `Epic ${workspaceIndex}.${teamIndex + 1}.${memberIndex}.${epicIndex}`,
              objective: `Deliver governed feature ${epicIndex} with current proof and bounded agent execution.`,
              owner: `Developer ${workspaceIndex}.${teamIndex + 1}.${memberIndex}`,
              ownerMemberId: memberId,
              owningTeamId: teamId,
              repositoryId,
              codeScopeIds: codeScopeIdsByTeam.has(teamId) ? [codeScopeIdsByTeam.get(teamId)!] : [],
              executionEnvironment: epicIndex % 2 === 0 ? "CLOUD" : "LOCAL",
              state: missionState,
              executionPolicy: "SERIAL_MUTATIONS",
              maxReadOnlyConcurrency: 3,
              maxCorrectiveIterations: 2,
              correctiveIterations: 0,
              stopCondition: "All acceptance evidence passes or a governed stop condition fires.",
              budgetUsd: 100,
              spentUsd: epicIndex * 4,
              blockingReason: missionState === "BLOCKED" ? "Dependency contract needs a human decision." : undefined,
              requiredHumanAction: missionState === "BLOCKED" ? "Resolve the dependency decision." : undefined,
              createdAt: now - epicIndex * 3_600_000,
              updatedAt: now - epicIndex * 900_000,
              metadata: { fixtureKey: SCALE_FIXTURE_KEY },
            });
            missionCount += 1;
            await ctx.db.insert("missionAssignments", {
              tenantId: args.tenantId,
              projectId,
              missionId,
              memberId,
              teamId,
              role: "OWNER",
              capacityAllocationPct: 20,
              activeFrom: now,
              active: true,
              fixtureKey: SCALE_FIXTURE_KEY,
              createdAt: now,
              updatedAt: now,
              createdBy: membership.operatorId,
              updatedBy: membership.operatorId,
            });
            assignmentCount += 1;
            const verificationStatus = scenario === 2 ? "FAIL" : scenario === 3 ? "STALE" : scenario === 1 ? "PENDING" : "PASS";
            const state = missionState === "BLOCKED" ? "BLOCKED" : scenario === 4 ? "AWAITING_APPROVAL" : verificationStatus === "PENDING" ? "AWAITING_VERIFICATION" : "IN_PROGRESS";
            const workOrderId = await ctx.db.insert("workOrders", {
              tenantId: args.tenantId,
              projectId,
              missionId,
              title: `Execute Epic ${workspaceIndex}.${teamIndex + 1}.${memberIndex}.${epicIndex}`,
              desiredOutcome: "A bounded implementation with independent proof.",
              repository,
              repositoryId,
              codeScopeIds: codeScopeIdsByTeam.has(teamId) ? [codeScopeIdsByTeam.get(teamId)!] : [],
              ownerMemberId: memberId,
              owningTeamId: teamId,
              executionEnvironment: epicIndex % 2 === 0 ? "CLOUD" : "LOCAL",
              scopeEnforcementVersion: 1,
              requestedBy: membership.operatorId ?? "scale-fixture",
              requestingOperatorId: membership.operatorId,
              assignedSquad: `Team ${workspaceIndex}.${teamIndex + 1}`,
              priority: epicIndex === 1 ? 1 : 2,
              riskLevel: epicIndex === 1 ? "HIGH" : "MEDIUM",
              modelComplexity: epicIndex === 1 ? "LARGE" : "STANDARD",
              acceptanceCriteria: [{ id: "proof", title: "Independent evidence is current", verificationMethod: "TEST", status: verificationStatus }],
              state,
              verificationStatus,
              approvalStatus: scenario === 4 ? "PENDING" : "NOT_REQUIRED",
              blockingIssue: state === "BLOCKED" ? "Cross-team dependency unresolved." : undefined,
              requiredHumanAction: state === "BLOCKED" ? "Name an owner and decision deadline." : undefined,
              createdAt: now - epicIndex * 3_600_000,
              updatedAt: now - epicIndex * 900_000,
              metadata: { fixtureKey: SCALE_FIXTURE_KEY },
            });
            workOrderCount += 1;
            if (scenario === 4) {
              await ctx.db.insert("approvalDecisions", {
                tenantId: args.tenantId,
                projectId,
                workOrderId,
                idempotencyKey: `${SCALE_FIXTURE_KEY}:approval:${workspaceIndex}:${teamIndex}:${memberIndex}:${epicIndex}`,
                approvalType: "GOVERNED_DISPATCH",
                requestedAction: "Approve the bounded execution packet.",
                riskLevel: epicIndex === 1 ? "HIGH" : "MEDIUM",
                requestedBy: membership.operatorId,
                status: "PENDING",
                workOrderRevisionNumber: 1,
                createdAt: now - epicIndex * 900_000,
                metadata: { fixtureKey: SCALE_FIXTURE_KEY },
              });
              approvalCount += 1;
            }
            if (epicIndex === 1) {
              const runFailed = scenario === 2;
              await ctx.db.insert("workflowRuns", {
                tenantId: args.tenantId,
                projectId,
                missionId,
                missionRole: "WORKER",
                workOrderId,
                runId: `scale-${workspaceIndex}-${teamIndex + 1}-${memberIndex}`,
                workflowId: "governed-feature-delivery",
                workflowVersion: 1,
                status: runFailed ? "FAILED" : "RUNNING",
                currentStepIndex: runFailed ? 2 : 1,
                totalSteps: 4,
                steps: [
                  { stepId: "plan", status: "DONE", kind: "AGENT", modelTier: "POWERFUL", isolation: "READ_ONLY", failurePolicy: "BLOCK", retryCount: 0, startedAt: now - 3_600_000, completedAt: now - 3_300_000 },
                  { stepId: "execute", status: runFailed ? "FAILED" : "RUNNING", kind: "AGENT", modelTier: "BALANCED", isolation: "WORKTREE", failurePolicy: "RETRY", retryCount: runFailed ? 1 : 0, startedAt: now - 3_000_000, error: runFailed ? "Representative fixture failure requiring operator review." : undefined },
                  { stepId: "verify", status: "PENDING", kind: "VERIFY", modelTier: "FAST", isolation: "READ_ONLY", failurePolicy: "BLOCK", retryCount: 0 },
                  { stepId: "review", status: "PENDING", kind: "GATE", modelTier: "POWERFUL", isolation: "READ_ONLY", failurePolicy: "BLOCK", retryCount: 0 },
                ],
                context: { fixtureKey: SCALE_FIXTURE_KEY, scopeEnforcementVersion: 1 },
                topology: "DAG",
                maxConcurrency: 2,
                initialInput: "Execute the bounded epic and return independent evidence.",
                runtime: workspaceIndex === 1 ? "local-open-weights" : "frontier-cloud",
                model: workspaceIndex === 1 ? "local-qa" : "frontier-executor",
                executionEnvironment: workspaceIndex === 1 ? "LOCAL" : "CLOUD",
                executorHostId: workspaceIndex === 1 ? "sellerfi-dev-host" : "cloud-runner-pool",
                checkpointSummary: runFailed ? "Execution failed after the implementation checkpoint." : "Implementation is active; verification is next.",
                checkpointAt: now - 600_000,
                budgetUsd: 25,
                spentUsd: 6 + memberIndex,
                stopCondition: "Stop on failed verification, exhausted retries, or budget limit.",
                escalationOwner: `Developer ${workspaceIndex}.${teamIndex + 1}.${memberIndex}`,
                scheduledWindow: workspaceIndex === 2 ? { startsAt: now - 3_600_000, endsAt: now + 8 * 3_600_000, timezone: "America/Los_Angeles" } : undefined,
                returnHandoff: runFailed ? { summary: "Execution stopped with a reproducible failure.", changedArtifacts: [`apps/domain-${teamIndex + 1}`], failedChecks: ["fixture-integration-check"], unresolvedRisks: ["Dependency contract remains unresolved"], nextDecision: "Retry with corrected dependency or return to planning.", createdAt: now - 300_000 } : undefined,
                evidenceState: runFailed ? "FAILING" : "MISSING",
                failureReason: runFailed ? "Representative fixture execution failure." : undefined,
                startedAt: now - 3_600_000,
                completedAt: runFailed ? now - 300_000 : undefined,
                metadata: { fixtureKey: SCALE_FIXTURE_KEY },
              });
              runCount += 1;
            }
          }
        }
      }
    }
    return { success: true, created: true, fixtureKey: SCALE_FIXTURE_KEY, workspaces: 2, teams: teamCount, members: memberCount, missions: missionCount, assignments: assignmentCount, workOrders: workOrderCount, runs: runCount, approvals: approvalCount };
  },
});

export const removeScaleFixture = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_COMPANY);
    const projects = (await ctx.db.query("projects").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect()).filter((project) => project.metadata?.fixtureKey === SCALE_FIXTURE_KEY);
    let removed = 0;
    for (const project of projects) {
      const [approvals, runs, assignments, memberships, workOrders, missions, scopes, repositories, teams, members, scopeReceipts, attentionStates] = await Promise.all([
        ctx.db.query("approvalDecisions").filter((q) => q.eq(q.field("projectId"), project._id)).collect(),
        ctx.db.query("workflowRuns").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("missionAssignments").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("teamMemberships").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("workOrders").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("missions").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("repositoryCodeScopes").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("workspaceRepositories").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("scrumTeams").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("orgMembers").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("scopeEnforcementReceipts").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
        ctx.db.query("attentionStates").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect(),
      ]);
      const safeRows = [
        ...scopeReceipts,
        ...attentionStates,
        ...approvals.filter((row) => row.metadata?.fixtureKey === SCALE_FIXTURE_KEY),
        ...runs.filter((row) => row.metadata?.fixtureKey === SCALE_FIXTURE_KEY),
        ...assignments.filter((row) => row.fixtureKey === SCALE_FIXTURE_KEY),
        ...memberships.filter((row) => row.fixtureKey === SCALE_FIXTURE_KEY),
        ...workOrders.filter((row) => row.metadata?.fixtureKey === SCALE_FIXTURE_KEY),
        ...missions.filter((row) => row.metadata?.fixtureKey === SCALE_FIXTURE_KEY),
        ...scopes.filter((row) => row.fixtureKey === SCALE_FIXTURE_KEY),
        ...repositories.filter((row) => row.fixtureKey === SCALE_FIXTURE_KEY),
        ...teams.filter((row) => row.fixtureKey === SCALE_FIXTURE_KEY),
        ...members.filter((row) => row.metadata?.fixtureKey === SCALE_FIXTURE_KEY),
      ];
      for (const row of safeRows) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
      await ctx.db.delete(project._id);
      removed += 1;
    }
    return { success: true, fixtureKey: SCALE_FIXTURE_KEY, workspaces: projects.length, removed };
  },
});

export const bindExecutor = mutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    hostId: v.string(),
    executionEnvironment: v.union(v.literal("LOCAL"), v.literal("CLOUD")),
    checkpointSummary: v.string(),
    budgetUsd: v.optional(v.number()),
    stopCondition: v.string(),
    escalationOwner: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.workOrderId || !run.projectId || !run.tenantId) throw new Error("Executor binding requires a scoped WorkOrder run.");
    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found.");
    const access = await requireWorkspaceAccess(ctx, run.tenantId, run.projectId, { permission: COMPANY_PERMISSIONS.DISPATCH_WORK });
    const hasStableScope = Boolean(workOrder.scopeEnforcementVersion || workOrder.repositoryId || workOrder.owningTeamId || workOrder.ownerMemberId);
    if (!hasStableScope) {
      const receiptId = await ctx.db.insert("scopeEnforcementReceipts", {
        tenantId: run.tenantId,
        projectId: run.projectId,
        workOrderId: workOrder._id,
        workflowRunId: run._id,
        stage: "EXECUTOR_BINDING",
        mode: "LEGACY",
        outcome: "ALLOWED",
        codeScopeIds: [],
        executionEnvironment: args.executionEnvironment,
        reasonCodes: ["LEGACY_COMPATIBILITY_PATH"],
        summary: "Legacy run bound through the compatibility path; stable scope backfill remains required.",
        policyVersion: 1,
        createdAt: Date.now(),
        actorId: access.membership.operatorId,
      });
      await ctx.db.patch(run._id, { executorHostId: args.hostId, executionEnvironment: args.executionEnvironment, checkpointSummary: args.checkpointSummary.trim(), checkpointAt: Date.now(), budgetUsd: args.budgetUsd, stopCondition: args.stopCondition.trim(), escalationOwner: args.escalationOwner.trim() });
      return { success: true, receiptId, mode: "LEGACY" as const };
    }
    const [repository, team, owner, codeScopes, host, routingDecision, mission, pendingRuns, runningRuns] = await Promise.all([
      workOrder.repositoryId ? ctx.db.get(workOrder.repositoryId) : null,
      workOrder.owningTeamId ? ctx.db.get(workOrder.owningTeamId) : null,
      workOrder.ownerMemberId ? ctx.db.get(workOrder.ownerMemberId) : null,
      Promise.all((workOrder.codeScopeIds ?? []).map((scopeId) => ctx.db.get(scopeId))),
      ctx.db.query("workspaceHostBindings").withIndex("by_project_host", (q) => q.eq("projectId", run.projectId!).eq("hostId", args.hostId)).first(),
      run.routingDecisionId ? ctx.db.get(run.routingDecisionId) : null,
      workOrder.missionId ? ctx.db.get(workOrder.missionId) : null,
      ctx.db.query("workflowRuns").withIndex("by_project_status", (q) => q.eq("projectId", run.projectId!).eq("status", "PENDING")).collect(),
      ctx.db.query("workflowRuns").withIndex("by_project_status", (q) => q.eq("projectId", run.projectId!).eq("status", "RUNNING")).collect(),
    ]);
    const validation = validateDispatchScope({
      projectId: run.projectId,
      repository: repository ? { id: repository._id, projectId: repository.projectId, status: repository.status } : null,
      codeScopes: codeScopes.filter((scope): scope is NonNullable<typeof scope> => Boolean(scope)).map((scope) => ({ id: scope._id, projectId: scope.projectId, repositoryId: scope.repositoryId, active: scope.active, allowedEnvironments: scope.allowedEnvironments })),
      team: team ? { id: team._id, projectId: team.projectId, status: team.status } : null,
      owner: owner ? { id: owner._id, projectId: owner.projectId, active: owner.active } : null,
      executionEnvironment: args.executionEnvironment,
      host: host ? { status: host.status, repository: host.repository } : null,
    });
    const reasonCodes = [...validation.reasonCodes];
    reasonCodes.push(...validateExecutorHostEligibility({
      now: Date.now(),
      repositoryMatches: !repository || !host ? undefined : canonicalRepositoryKey(host.repository) === canonicalRepositoryKey(repository.repository),
      runRuntime: run.runtime,
      runModel: run.model,
      host,
    }));
    const activeRuns = [...pendingRuns, ...runningRuns];
    const activeRunWorkOrders = await Promise.all(activeRuns.filter((candidate) => candidate.workOrderId).map((candidate) => ctx.db.get(candidate.workOrderId!)));
    const activeTeamRuns = workOrder.owningTeamId
      ? activeRunWorkOrders.filter((candidate) => candidate?.owningTeamId === workOrder.owningTeamId).length
      : 0;
    reasonCodes.push(...validateExecutorBindingPolicy({
      expectedEnvironment: run.executionEnvironment ?? workOrder.executionEnvironment,
      requestedEnvironment: args.executionEnvironment,
      runtime: run.runtime,
      runModel: run.model,
      routingDecision: routingDecision ? {
        projectId: routingDecision.projectId,
        workOrderId: routingDecision.workOrderId,
        selectedModelId: routingDecision.selectedModelId,
        mode: routingDecision.mode,
      } : null,
      expectedRoutingDecision: Boolean(run.routingDecisionId || workOrder.modelRoutingDecisionId),
      projectId: run.projectId,
      workOrderId: workOrder._id,
      activeTeamRuns,
      maxConcurrentRuns: team?.capacityPolicy?.maxConcurrentRuns,
      requestedBudgetUsd: args.budgetUsd,
      missionBudgetRemainingUsd: mission?.budgetUsd === undefined ? undefined : Math.max(0, mission.budgetUsd - mission.spentUsd),
      checkpointSummary: args.checkpointSummary,
      stopCondition: args.stopCondition,
      escalationOwner: args.escalationOwner,
    }));
    const allowed = reasonCodes.length === 0;
    const scopePolicyRequirements = (workOrder.metadata && typeof workOrder.metadata === "object"
      ? (workOrder.metadata as { scopePolicyRequirements?: any }).scopePolicyRequirements
      : undefined);
    const receiptId = await ctx.db.insert("scopeEnforcementReceipts", {
      tenantId: run.tenantId,
      projectId: run.projectId,
      workOrderId: workOrder._id,
      workflowRunId: run._id,
      stage: "EXECUTOR_BINDING",
      mode: "ENFORCED",
      outcome: allowed ? "ALLOWED" : "DENIED",
      repositoryId: workOrder.repositoryId,
      codeScopeIds: workOrder.codeScopeIds ?? [],
      teamId: workOrder.owningTeamId,
      ownerMemberId: workOrder.ownerMemberId,
      executionEnvironment: args.executionEnvironment,
      policyRequirements: scopePolicyRequirements,
      reasonCodes: [...new Set(reasonCodes)],
      summary: allowed ? "Executor binding satisfies repository, scope, team, owner, environment, model, runtime, network, secret, capacity, budget, and host policy." : `Executor binding denied: ${[...new Set(reasonCodes)].join(", ")}`,
      policyVersion: 1,
      createdAt: Date.now(),
      actorId: access.membership.operatorId,
    });
    if (!allowed) return { success: false, receiptId, reasonCodes: [...new Set(reasonCodes)] };
    await ctx.db.patch(run._id, {
      executorHostId: args.hostId,
      executionEnvironment: args.executionEnvironment,
      checkpointSummary: args.checkpointSummary.trim(),
      checkpointAt: Date.now(),
      budgetUsd: args.budgetUsd,
      stopCondition: args.stopCondition.trim(),
      escalationOwner: args.escalationOwner.trim(),
    });
    return { success: true, receiptId, reasonCodes: [] };
  },
});

export const validateCodeScopeOverlap = query({
  args: { repositoryId: v.id("workspaceRepositories"), includePaths: v.array(v.string()) },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository?.tenantId) throw new Error("Repository company assignment is incomplete.");
    await requireWorkspaceAccess(ctx, repository.tenantId, repository.projectId);
    const scopes = await ctx.db.query("repositoryCodeScopes").withIndex("by_repository", (q) => q.eq("repositoryId", repository._id)).collect();
    const overlaps = findOverlappingScopes(args.includePaths, scopes.filter((scope) => scope.active));
    return { valid: overlaps.length === 0, overlaps };
  },
});
