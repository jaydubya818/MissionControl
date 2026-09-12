import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/factory/badges";
import { useFactoryExperienceLevel } from "@/factoryExperience/useFactoryExperienceLevel";
import { CheckCircle2, Cpu, Factory, Server, ShieldAlert, SlidersHorizontal } from "lucide-react";

export function FactoryConfigurationPanel({
  projectId,
  repositoryId,
  repositoryDataClassification,
}: {
  projectId: Id<"projects">;
  repositoryId: Id<"workspaceRepositories">;
  repositoryDataClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "UNCLASSIFIED";
}) {
  const definitions = useQuery(api["factory/configuration"].list, { projectId });
  const governedTools = useQuery(api["factory/governedMcp"].list, { projectId });
  const createFactory = useMutation(api["factory/configuration"].create);
  const [pendingPurpose, setPendingPurpose] = useState<"SOFTWARE" | "VERIFICATION" | "">("");
  const [error, setError] = useState("");
  const repositoryDefinitions = definitions?.filter((item) =>
    item.repositoryId === repositoryId && item.status !== "ARCHIVED"
  ) ?? [];
  const softwareFactory = repositoryDefinitions.find((item) => (item.purpose ?? "SOFTWARE") === "SOFTWARE");
  const verificationFactory = repositoryDefinitions.find((item) => item.purpose === "VERIFICATION");

  const create = async (purpose: "SOFTWARE" | "VERIFICATION") => {
    setPendingPurpose(purpose);
    setError("");
    try {
      await createFactory({
        repositoryId,
        name: purpose === "SOFTWARE" ? "Software Factory" : "Verification Factory",
        purpose,
      });
    } catch {
      setError("The Factory could not be created. Confirm workspace automation authority and try again.");
    } finally {
      setPendingPurpose("");
    }
  };

  if (definitions === undefined) {
    return <div className="mt-5 h-24 animate-pulse rounded-lg bg-surface-2" aria-label="Loading Factory configuration" />;
  }

  return (
    <section className="@container mt-5 border-t border-line pt-5" aria-labelledby="factory-configuration-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div id="factory-configuration-title" className="flex items-center gap-2 text-[12.5px] font-medium text-ink-secondary">
            <Factory size={14} aria-hidden /> Factory configuration
          </div>
          <div className="mt-1 text-[12px] text-ink-muted">
            Freeze the repository, workflow, qualified execution profile, policy, budget, verifiers, and recovery boundary before activation.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!softwareFactory ? (
            <Button variant="outline" size="sm" disabled={Boolean(pendingPurpose)} onClick={() => void create("SOFTWARE")}>
              {pendingPurpose === "SOFTWARE" ? "Creating…" : "Create Software Factory"}
            </Button>
          ) : null}
          {!verificationFactory ? (
            <Button variant="outline" size="sm" disabled={Boolean(pendingPurpose)} onClick={() => void create("VERIFICATION")}>
              {pendingPurpose === "VERIFICATION" ? "Creating…" : "Create Verification Factory"}
            </Button>
          ) : null}
        </div>
      </div>
      {governedTools && governedTools.grants.length > 0 ? (
        <section className="mt-3 rounded-lg border border-line bg-surface-2 p-3" aria-label="Governed tool grants">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-medium text-ink">Governed tool grants</div>
              <div className="mt-0.5 text-[10.5px] text-ink-muted">Exact read-only grants. Discovery and tool output never create authority.</div>
            </div>
            <StatusBadge tone={governedTools.maturity === "QUALIFIED_ONE_REAL_READ_ONLY_SERVICE" ? "success" : "warning"}>{governedTools.maturity === "QUALIFIED_ONE_REAL_READ_ONLY_SERVICE" ? "one real service" : "qualification fixture"}</StatusBadge>
          </div>
          <ul className="mt-2 space-y-2" aria-label="Tool Grant history">
            {governedTools.grants
              .slice()
              .sort((left, right) => right.version - left.version)
              .map((grant) => {
                const snapshot = grant.immutableSnapshot as Record<string, any>;
                const tool = snapshot.toolVersionSnapshot as Record<string, any>;
                const state = grant.current ? "qualified" : grant.state === "REVOKED" ? "revoked" : "stale";
                return (
                  <li key={grant._id} className="rounded-md border border-line bg-surface-1 p-2.5 text-[11px] text-ink-secondary">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">{grant.grantKey} · v{grant.version}</span>
                      <StatusBadge tone={grant.current ? "success" : "warning"}>{state}</StatusBadge>
                    </div>
                    <div className="mt-1 break-all font-mono text-[10px] text-ink-muted">{grant.grantDigest} · tool {grant.toolVersionDigest}</div>
                    <div className="mt-1">{snapshot.operation} · read-only · {String(snapshot.destination).toLowerCase().replace(/_/g, " ")} · credential {String(snapshot.credentialClass).toLowerCase()}</div>
                    <div className="mt-1 text-ink-muted">{tool?.server?.key} · {tool?.transport?.kind?.toLowerCase().replace(/_/g, " ")} · {tool?.dataClassification?.toLowerCase()} · {grant.current ? "service contract current" : "service contract unavailable"}</div>
                    {grant.state === "REVOKED" ? (
                      <div className="mt-1 text-warning">Revoked: {grant.revocationReason ?? "new calls are denied"}. Create a new exact grant and Execution Profile; history remains immutable.</div>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}
      {error ? <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div> : null}
      {repositoryDefinitions.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-4 text-[12.5px] text-ink-secondary">
          No Factory exists for this repository. Creating one does not activate or dispatch work.
        </div>
      ) : (
        <div className="space-y-4">
          {repositoryDefinitions.map((definition) => {
            const purpose = definition.purpose ?? "SOFTWARE";
            return (
              <section key={definition._id} aria-label={`${purpose === "VERIFICATION" ? "Verification" : "Software"} Factory`} className="mt-3 rounded-lg border border-line bg-surface-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-medium text-ink">{definition.name}</div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="neutral">{purpose.toLowerCase()}</StatusBadge>
                    <StatusBadge tone={definition.status === "ACTIVE" ? "success" : "neutral"}>{definition.status.toLowerCase()}</StatusBadge>
                  </div>
                </div>
                <FactoryVersionEditor
                  factoryDefinitionId={definition._id}
                  projectId={projectId}
                  repositoryId={repositoryId}
                  repositoryDataClassification={repositoryDataClassification}
                />
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FactoryVersionEditor({
  factoryDefinitionId,
  projectId,
  repositoryId,
  repositoryDataClassification,
}: {
  factoryDefinitionId: Id<"factoryDefinitions">;
  projectId: Id<"projects">;
  repositoryId: Id<"workspaceRepositories">;
  repositoryDataClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "UNCLASSIFIED";
}) {
  const detail = useQuery(api["factory/configuration"].getDetail, { factoryDefinitionId });
  const workflows = useQuery(api.workflows.list, { activeOnly: true });
  const policies = useQuery(api["governance/policyEnvelopes"].listPolicyEnvelopes, { projectId, activeOnly: true });
  const verifiers = useQuery(api["context/verifiers"].list, { projectId, activeOnly: true });
  const agentTemplates = useQuery(api["registry/agentTemplates"].listTemplates, { projectId, activeOnly: true });
  const versionOptions = useQuery(api["factory/configuration"].getVersionOptions, { projectId, repositoryId });
  const createVersion = useMutation(api["factory/configuration"].createVersion);
  const createSandboxProfile = useMutation(api["factory/configuration"].createSandboxProfile);
  const assess = useMutation(api["factory/configuration"].assessReadiness);
  const activate = useMutation(api["factory/configuration"].activate);
  const createPolicy = useMutation(api["governance/policyEnvelopes"].createPolicyEnvelope);
  const createVerifier = useMutation(api["context/verifiers"].create);
  const createAgentTemplate = useMutation(api["registry/agentTemplates"].createTemplate);
  const createAgentVersion = useMutation(api["registry/agentVersions"].createVersion);
  const registerProductionWorkflow = useMutation(api.workflows.registerProduction);
  const [workflowId, setWorkflowId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [verifierIds, setVerifierIds] = useState<string[]>([]);
  const [codeScopeIds, setCodeScopeIds] = useState<string[]>([]);
  const [agentBindings, setAgentBindings] = useState<Record<string, string>>({});
  const [maxCostUsd, setMaxCostUsd] = useState("100");
  const [maxRuntimeMinutes, setMaxRuntimeMinutes] = useState("120");
  const [maxAttempts, setMaxAttempts] = useState("2");
  const [risk, setRisk] = useState<"GREEN" | "YELLOW" | "RED">("YELLOW");
  const [experienceLevel] = useFactoryExperienceLevel();
  const [executionBackend, setExecutionBackend] = useState<"persistent-worker" | "remote-sandbox">("persistent-worker");
  const [harnessKey, setHarnessKey] = useState("codex\0v1");
  const [modelCatalogId, setModelCatalogId] = useState("");
  const [sandboxProfileId, setSandboxProfileId] = useState("");
  const [executionProfileId, setExecutionProfileId] = useState("");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const createVerificationPolicy = async () => {
    setPending("policy");
    setError("");
    setMessage("");
    try {
      const policy = await createPolicy({
        projectId,
        name: "Verification-First V1 Factory Envelope",
        priority: 100,
        rules: {
          defaultDecision: "ALLOW",
          autonomyTier: 2,
          requireApprovalOnRisk: ["YELLOW", "RED"],
          toolPolicies: {
            shell: "ALLOW",
            exec: "ALLOW",
            write_file: "ALLOW",
            delete_file: "DENY",
            git_push: "NEEDS_APPROVAL",
            github_pull_request: "NEEDS_APPROVAL",
          },
        },
        metadata: { source: "factory-configuration", profile: "verification-first-v1" },
      });
      if (policy?._id) setPolicyId(policy._id);
      setMessage("Verification-First V1 policy envelope created and selected.");
    } catch {
      setError("The policy envelope could not be created. Confirm governance authority and try again.");
    } finally {
      setPending("");
    }
  };

  const createIndependentVerifier = async () => {
    setPending("verifier");
    setError("");
    setMessage("");
    try {
      const verifierId = await createVerifier({
        projectId,
        label: "Verification-First Independent Validator",
        invariant: "The candidate revision must satisfy every mandatory quality-contract assertion through execution independent from the implementation agent.",
        globPatterns: ["**/*"],
        idempotencyKey: `verification-first-v1-${projectId}`,
      });
      setVerifierIds([verifierId]);
      setMessage("Independent verifier created and selected.");
    } catch {
      setError("The independent verifier could not be created. Confirm Factory improvement authority and try again.");
    } finally {
      setPending("");
    }
  };

  const createApprovedAgentVersion = async () => {
    const workflow = workflows?.find((item) => item._id === workflowId);
    if (!workflow) return;
    setPending("agent");
    setError("");
    setMessage("");
    try {
      const template = agentTemplates.find((item) => item.slug === "verification-first-delivery-agent") ?? await createAgentTemplate({
          projectId,
          name: "Verification-First Delivery Agent",
          slug: "verification-first-delivery-agent",
          description: "Approved bounded implementation agent for the Verification-First V1 Factory profile.",
          metadata: { source: "factory-configuration", profile: "verification-first-v1" },
        });
      if (!template?._id) throw new Error("Agent template was not created");
      const now = Date.now();
      const version = await createAgentVersion({
        projectId,
        templateId: template._id,
        status: "APPROVED",
        genome: {
          modelConfig: { provider: "openai", modelId: "gpt-5.6-sol", temperature: 0 },
          promptBundleHash: "verification-first-v1-prompt-bundle",
          toolManifestHash: "verification-first-v1-bounded-tools",
          provenance: { createdBy: "operator", source: "factory-configuration", createdAt: now },
        },
        notes: "Approved explicitly for the governed Verification-First V1 delivery profile.",
        metadata: { profile: "verification-first-v1" },
      });
      if (!version?._id) throw new Error("Agent version was not created");
      setAgentBindings(Object.fromEntries(workflow.agents.map((agent) => [agent.id, version._id])));
      setMessage("Approved V1 agent version created and bound to the selected workflow.");
    } catch {
      setError("The approved agent version could not be created. Confirm registry authority and unique template scope.");
    } finally {
      setPending("");
    }
  };

  const createVerificationWorkflow = async () => {
    setPending("workflow");
    setError("");
    setMessage("");
    try {
      const objectSchema = (properties: Record<string, unknown>, required: string[]) => ({
        type: "object",
        properties: { status: { type: "string" }, ...properties },
        required: ["status", ...required],
        additionalProperties: false,
      });
      const id = await registerProductionWorkflow({
        projectId,
        workflowId: `verification-first-v1-${projectId}`,
        name: "Verification-First V1 Delivery",
        description: "Structured planning, bounded implementation, independent verification, and policy gating for governed V1 delivery.",
        topology: "LINEAR",
        maxConcurrency: 1,
        agents: [
          { id: "builder", persona: "Bounded implementation agent" },
          { id: "independent-verifier", persona: "Independent validation agent" },
        ],
        steps: [
          {
            id: "plan",
            agent: "builder",
            input: "Produce a bounded implementation plan that maps every acceptance criterion to a deterministic check.",
            expects: "A schema-valid plan and explicit status.",
            retryLimit: 1,
            timeoutMinutes: 10,
            kind: "AGENT",
            isolation: "READ_ONLY",
            failurePolicy: "BLOCK",
            outputSchema: objectSchema({ plan: { type: "array", items: { type: "string" } } }, ["plan"]),
          },
          {
            id: "implement",
            agent: "builder",
            input: "Implement only the approved plan inside the frozen repository scope and report the exact candidate revision.",
            expects: "A schema-valid candidate revision and explicit status.",
            retryLimit: 1,
            timeoutMinutes: 60,
            dependsOn: ["plan"],
            kind: "AGENT",
            isolation: "WORKTREE",
            failurePolicy: "BLOCK",
            outputSchema: objectSchema({ candidateRevision: { type: "string" } }, ["candidateRevision"]),
          },
          {
            id: "verify",
            agent: "independent-verifier",
            input: "Validate the exact candidate revision independently and produce requirement-linked receipts.",
            expects: "Schema-valid verification receipts bound to the candidate revision.",
            retryLimit: 1,
            timeoutMinutes: 30,
            dependsOn: ["implement"],
            kind: "VERIFY",
            isolation: "READ_ONLY",
            failurePolicy: "BLOCK",
            outputSchema: objectSchema({ candidateRevision: { type: "string" }, receipts: { type: "array", items: { type: "object" } } }, ["candidateRevision", "receipts"]),
          },
          {
            id: "gate",
            agent: "independent-verifier",
            input: "Evaluate immutable verification receipts against the frozen policy envelope and report the governed decision.",
            expects: "A policy-derived gate decision; publication remains separately authorized.",
            retryLimit: 0,
            timeoutMinutes: 5,
            dependsOn: ["verify"],
            kind: "GATE",
            isolation: "READ_ONLY",
            failurePolicy: "BLOCK",
          },
        ],
        active: true,
      });
      setWorkflowId(id);
      setMessage("Structured Verification-First V1 workflow created and selected.");
    } catch {
      setError("The Verification-First workflow could not be created. Confirm automation authority and try again.");
    } finally {
      setPending("");
    }
  };

  const latestVersion = detail?.versions[0];
  const latestAssessment = useMemo(
    () => latestVersion
      ? detail?.assessments.find((item) => item.factoryDefinitionVersionId === latestVersion._id)
      : undefined,
    [detail, latestVersion]
  );
  const selectedWorkflow = workflows?.find((item) => item._id === workflowId);
  const selectedHarness = versionOptions?.harnesses.find((item) =>
    `${item.manifest.identity.adapterId}\0${item.manifest.identity.adapterVersion}` === harnessKey
  ) ?? versionOptions?.harnesses[0];
  const defaultAgentVersionId = versionOptions?.agentVersions[0]?._id;
  const selectedWorkflowAgentKey = selectedWorkflow?.agents.map((agent) => agent.id).join(":") ?? "";
  const primaryWorkflowAgentId = selectedWorkflow?.steps?.[0]?.agent ?? selectedWorkflow?.agents[0]?.id;
  const primaryAgentVersion = versionOptions?.agentVersions.find((version) =>
    version._id === agentBindings[primaryWorkflowAgentId ?? ""]
  );
  const compatibleModelRoutes = (versionOptions?.modelRoutes ?? []).filter((route) =>
    route.provider === primaryAgentVersion?.modelConfig?.provider?.trim().toLowerCase()
    && route.modelId === primaryAgentVersion?.modelConfig?.modelId
  );
  const compatibleModelRouteKey = compatibleModelRoutes.map((route) => route._id).join(":");
  const requiredIsolationMode = detail?.definition.purpose === "VERIFICATION" ? "READ_ONLY" : "WORKSPACE_WRITE";
  const compatibleExecutionProfiles = (versionOptions?.executionProfiles ?? []).filter((profile) =>
    profile.isolationModes.includes(requiredIsolationMode)
    && compatibleModelRoutes.some((route) => route._id === profile.modelCatalogId)
  );
  const compatibleExecutionProfileKey = compatibleExecutionProfiles.map((profile) => profile._id).join(":");
  const selectedExecutionProfile = compatibleExecutionProfiles.find((profile) => profile._id === executionProfileId);

  useEffect(() => {
    if (!selectedWorkflow || !defaultAgentVersionId || selectedWorkflow.agents.length === 0) return;
    setAgentBindings((current) => {
      let changed = false;
      const next = { ...current };
      for (const agent of selectedWorkflow.agents) {
        if (!next[agent.id]) {
          next[agent.id] = defaultAgentVersionId;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [defaultAgentVersionId, selectedWorkflowAgentKey]);

  useEffect(() => {
    if (compatibleModelRoutes.some((route) => route._id === modelCatalogId)) return;
    setModelCatalogId(compatibleModelRoutes[0]?._id ?? "");
  }, [compatibleModelRouteKey, modelCatalogId]);

  useEffect(() => {
    if (compatibleExecutionProfiles.some((profile) => profile._id === executionProfileId)) return;
    setExecutionProfileId(compatibleExecutionProfiles[0]?._id ?? "");
  }, [compatibleExecutionProfileKey, executionProfileId]);

  useEffect(() => {
    if (!selectedExecutionProfile) return;
    setHarnessKey(`${selectedExecutionProfile.executor.adapter}\0${selectedExecutionProfile.executor.version}`);
    setModelCatalogId(selectedExecutionProfile.modelCatalogId);
    setExecutionBackend(selectedExecutionProfile.executionBackend);
    setSandboxProfileId(selectedExecutionProfile.sandboxProfileId ?? "");
  }, [selectedExecutionProfile?._id]);

  useEffect(() => {
    if (!workflowId && workflows?.[0]?._id) setWorkflowId(workflows[0]._id);
    if (!policyId && policies?.[0]?._id) setPolicyId(policies[0]._id);
    if (verifierIds.length === 0 && verifiers?.[0]?._id) setVerifierIds([verifiers[0]._id]);
    if (codeScopeIds.length === 0 && versionOptions?.codeScopes?.[0]?._id) setCodeScopeIds([versionOptions.codeScopes[0]._id]);
    if (!sandboxProfileId) {
      const dispatchableProfile = versionOptions?.sandboxProfiles?.find((profile) => profile.readinessState !== "BLOCKED");
      if (dispatchableProfile?._id) setSandboxProfileId(dispatchableProfile._id);
    }
  }, [workflows, policies, verifiers, versionOptions, workflowId, policyId, verifierIds.length, codeScopeIds.length, sandboxProfileId]);

  const providerEgressProfileAvailable = Boolean(versionOptions?.sandboxProfiles?.some((profile) =>
    profile.readinessState !== "BLOCKED" && profile.providerEgressEnforcementProven === true
  ));
  const remoteSandboxEligible = repositoryDataClassification === "PUBLIC" || providerEgressProfileAvailable;

  useEffect(() => {
    if (!remoteSandboxEligible && executionBackend === "remote-sandbox") {
      setExecutionBackend("persistent-worker");
    }
  }, [executionBackend, remoteSandboxEligible]);

  if (!detail || !workflows || !policies || !verifiers || !agentTemplates || !versionOptions) {
    return <div className="mt-3 h-28 animate-pulse rounded-lg bg-surface-2" aria-label="Loading Factory version editor" />;
  }

  const createLocalGovernanceBaseline = async () => {
    setPending("baseline");
    setError("");
    setMessage("");
    try {
      let nextPolicyId = policies.find((item) => item.name === "Local human-review Factory baseline")?._id;
      if (!nextPolicyId) {
        const policy = await createPolicy({
          projectId,
          name: "Local human-review Factory baseline",
          priority: 100,
          rules: {
            defaultDecision: "NEEDS_APPROVAL",
            requireApprovalOnRisk: ["GREEN", "YELLOW", "RED"],
            toolPolicies: {
              shell: "NEEDS_APPROVAL",
              exec: "NEEDS_APPROVAL",
              write_file: "NEEDS_APPROVAL",
              delete_file: "DENY",
            },
            autonomyTier: 1,
            executionEnvironments: ["LOCAL"],
          },
          metadata: { source: "factory.configuration.browser-baseline" },
        });
        nextPolicyId = policy?._id;
      }

      let nextVerifierId = verifiers.find((item) => item.label === "Factory path and verification guard")?._id;
      if (!nextVerifierId) {
        nextVerifierId = await createVerifier({
          projectId,
          label: "Factory path and verification guard",
          invariant: "Changes remain inside the approved repository scope and satisfy every declared verification command before publication.",
          globPatterns: versionOptions.codeScopes.flatMap((scope) => scope.includePaths),
          idempotencyKey: `factory-browser-baseline:${repositoryId}`,
        });
      }

      if (!nextPolicyId || !nextVerifierId) {
        throw new Error("The governance baseline did not return complete records.");
      }
      let nextAgentVersionId = versionOptions.agentVersions.find((version) => version.template.slug === "factory-local-codex-runner")?._id;
      if (!nextAgentVersionId) {
        let template = agentTemplates.find((item) => item.slug === "factory-local-codex-runner");
        if (!template) {
          template = await createAgentTemplate({
            projectId,
            name: "Factory local Codex runner",
            slug: "factory-local-codex-runner",
            description: "LOCAL-only agent version for browser-governed Factory WorkOrders.",
            metadata: { source: "factory.configuration.browser-baseline" },
          });
        }
        if (!template) throw new Error("The local runner template was not created.");
        const version = await createAgentVersion({
          projectId,
          templateId: template._id,
          status: "APPROVED",
          notes: "Authorized through the browser-governed local Factory baseline.",
          genome: {
            modelConfig: { provider: "openai", modelId: "gpt-5.6-sol" },
            promptBundleHash: "factory-local-human-review-v1",
            toolManifestHash: "factory-local-bounded-tools-v1",
            provenance: {
              createdBy: "browser-governed-factory-setup",
              source: "factory.configuration.browser-baseline",
              createdAt: Date.now(),
            },
          },
          metadata: { executionEnvironments: ["LOCAL"], requireHumanReview: true },
        });
        nextAgentVersionId = version?._id;
      }
      if (!nextAgentVersionId) throw new Error("The local runner version was not created.");
      if (selectedWorkflow) {
        setAgentBindings(Object.fromEntries(selectedWorkflow.agents.map((agent) => [agent.id, nextAgentVersionId])));
      }
      setPolicyId(nextPolicyId);
      setVerifierIds([nextVerifierId]);
      setMessage("Local human-review policy, path-bound verifier, and approved LOCAL runner are ready. Review them before creating the immutable Factory version.");
    } catch {
      setError("The local governance baseline could not be created. Confirm Factory improvement authority and try again.");
    } finally {
      setPending("");
    }
  };

  const save = async () => {
    setError("");
    setMessage("");
    const workflow = workflows.find((item) => item._id === workflowId);
    if (!workflowId || !policyId || verifierIds.length === 0 || codeScopeIds.length === 0 || !executionProfileId) {
      setError("Select an active workflow, qualified Execution Profile, policy, code scope, and at least one independent verifier.");
      return;
    }
    if (!workflow || workflow.agents.some((agent) => !agentBindings[agent.id])) {
      setError("Bind every workflow agent to an approved agent version.");
      return;
    }
    if (executionBackend === "remote-sandbox" && !sandboxProfileId) {
      setError("Select a dispatchable Sandbox Profile before creating an isolated Factory version.");
      return;
    }
    if (executionBackend === "remote-sandbox" && !remoteSandboxEligible) {
      setError("Remote Sandbox requires provider-enforced egress evidence for this repository classification.");
      return;
    }
    if (executionBackend === "remote-sandbox" && risk === "RED") {
      setError("Remote sandbox execution is limited to GREEN and YELLOW risk boundaries in N=1.");
      return;
    }
    if (!selectedHarness?.available) {
      setError("The selected harness is not currently advertised by an eligible canonical worker.");
      return;
    }
    if (!selectedHarness.manifest.admission.executionBackends.includes(executionBackend)) {
      setError("The selected harness does not support this execution backend.");
      return;
    }
    setPending("save");
    try {
      await createVersion({
        factoryDefinitionId,
        workflowId: workflowId as Id<"workflows">,
        executionProfileId: executionProfileId as Id<"factoryExecutionProfiles">,
        codeScopeIds: codeScopeIds as Id<"repositoryCodeScopes">[],
        agentBindings: workflow.agents.map((agent) => ({
          workflowAgentId: agent.id,
          agentVersionId: agentBindings[agent.id] as Id<"agentVersions">,
        })),
        policyEnvelopeId: policyId as Id<"policyEnvelopes">,
        budget: {
          maxCostUsd: Number(maxCostUsd),
          maxRuntimeMinutes: Number(maxRuntimeMinutes),
          maxAttempts: Number(maxAttempts),
        },
        verifierIds: verifierIds as Id<"contextVerifiers">[],
        riskBoundary: risk,
        recovery: { pause: false, cancel: true, retry: true, resume: false },
      });
      setMessage("Immutable Factory version created. Run readiness before activation.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Factory version could not be created. Check record scope and numeric limits.");
    } finally {
      setPending("");
    }
  };

  const runAssessment = async () => {
    if (!latestVersion) return;
    setPending("assess");
    setError("");
    try {
      await assess({ factoryDefinitionVersionId: latestVersion._id });
      setMessage("Readiness assessment recorded for this exact version.");
    } catch {
      setError("Readiness could not be assessed. Resolve the record scope and try again.");
    } finally {
      setPending("");
    }
  };

  const activateVersion = async () => {
    if (!latestVersion) return;
    setPending("activate");
    setError("");
    try {
      await activate({ factoryDefinitionVersionId: latestVersion._id });
      setMessage(`Factory version ${latestVersion.version} activated.`);
    } catch {
      setError("Activation requires a current passing assessment for this exact Factory version.");
    } finally {
      setPending("");
    }
  };

  const selectedSandboxProfile = (versionOptions.sandboxProfiles ?? []).find((profile) => profile._id === sandboxProfileId);
  const saveButton = <Button size="sm" disabled={Boolean(pending) || !selectedExecutionProfile} onClick={save}>{pending === "save" ? "Saving…" : "Create configuration version"}</Button>;

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-line bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-line bg-surface-1 p-2 text-ink-secondary"><Server size={16} aria-hidden /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink">
              Execution boundary
              <StatusBadge tone="neutral">{experienceLevel}</StatusBadge>
              {executionBackend === "remote-sandbox" ? <StatusBadge tone="warning">Preview · Not Live Certified</StatusBadge> : null}
            </div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">The Factory experience level selected in the operator shell controls disclosure here. Acceptance, independent verification, publication, and merge authority stay outside the execution backend.</div>
          </div>
        </div>
        <label className="mt-3 block text-[11.5px] text-ink-muted">Qualified Execution Profile
          <select
            aria-label="Qualified Execution Profile"
            className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink"
            value={executionProfileId}
            onChange={(event) => setExecutionProfileId(event.target.value)}
            disabled={compatibleExecutionProfiles.length === 0}
          >
            <option value="">{compatibleExecutionProfiles.length === 0 ? "No compatible qualified profile" : "Select exact profile"}</option>
            {compatibleExecutionProfiles.map((profile) => (
              <option key={profile._id} value={profile._id}>
                {profile.profileKey} · v{profile.version} · {profile.executor.adapter}/{profile.executor.version} · {profile.executionBackend}
              </option>
            ))}
          </select>
          {selectedExecutionProfile ? (
            <span className="mt-2 block rounded-md border border-line bg-surface-1 p-3">
              <span className="block font-mono text-[10.5px] text-ink-muted">{selectedExecutionProfile.profileDigest} · qualification {selectedExecutionProfile.qualificationDigest}</span>
              {selectedExecutionProfile.toolGrant ? (
                <span className="mt-2 block text-[11.5px] leading-relaxed text-ink-secondary">
                  <span className="font-medium text-ink">{selectedExecutionProfile.toolGrant.admission === "QUALIFIED_REAL_READ_ONLY_SERVICE" ? "Qualified real read-only service" : "Qualified fixture tool"}</span> · {selectedExecutionProfile.toolGrant.key} v{selectedExecutionProfile.toolGrant.version} · <span className="font-mono">{selectedExecutionProfile.toolGrant.operation}</span><br />
                  Host broker only · read-only · credential {selectedExecutionProfile.toolGrant.credentialClass.toLowerCase()} · expires {new Date(selectedExecutionProfile.toolGrant.expiresAt).toLocaleString()}<br />
                  <span className={selectedExecutionProfile.toolGrant.admission === "QUALIFIED_REAL_READ_ONLY_SERVICE" ? "text-success" : "text-warning"}>{selectedExecutionProfile.toolGrant.admission === "QUALIFIED_REAL_READ_ONLY_SERVICE" ? "One exact real service operation is admitted. Tool output remains untrusted; harness MCP remains unsupported." : "Qualification fixture — no real MCP service is admitted. Harness MCP remains unsupported."}</span>
                </span>
              ) : (
                <span className="mt-2 block text-[11.5px] text-ink-muted">No tool capability. Historical profiles do not inherit MCP authority.</span>
              )}
            </span>
          ) : (
            <span className="mt-1 block text-warning">Register and qualify an exact profile for this workflow route and {requiredIsolationMode.toLowerCase().replace(/_/g, " ")} boundary.</span>
          )}
        </label>
        <ExecutionBackendSelector
          backend={executionBackend}
          onBackendChange={setExecutionBackend}
          profiles={versionOptions.sandboxProfiles ?? []}
          profileId={sandboxProfileId}
          onProfileChange={setSandboxProfileId}
          showProfileDetails={experienceLevel !== "basic"}
          remoteEligible={remoteSandboxEligible}
          remoteBlockReason={remoteSandboxEligible
            ? undefined
            : `${repositoryDataClassification.toLowerCase()} repository: no eligible profile proves provider-enforced egress.`}
          locked
        />
        {experienceLevel === "basic" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="text-[11.5px] text-ink-muted">
              {executionBackend === "persistent-worker"
                ? "Local · canonical worker worktree · governed execution · independent verification"
                : selectedSandboxProfile
                  ? `${selectedSandboxProfile.profileKey} v${selectedSandboxProfile.version} · ${selectedSandboxProfile.readinessState.toLowerCase()} · mandatory teardown`
                  : "A current Sandbox Profile is required. Advanced exposes evidence-backed profile creation."}
            </div>
            {saveButton}
          </div>
        ) : null}
      </div>

      {experienceLevel === "intermediate" ? (
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
          <div className="grid gap-3 @md:grid-cols-2 @xl:grid-cols-4">
            <label className="text-[11.5px] text-ink-muted">Attempt cost cap (USD)<Input className="mt-1" type="number" value={maxCostUsd} onChange={(event) => setMaxCostUsd(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Attempt timeout (minutes)<Input className="mt-1" type="number" value={maxRuntimeMinutes} onChange={(event) => setMaxRuntimeMinutes(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Maximum attempts<Input className="mt-1" type="number" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Risk boundary
              <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)}>
                <option value="GREEN">Green</option><option value="YELLOW">Yellow</option><option value="RED" disabled={executionBackend === "remote-sandbox"}>Red</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 rounded-md border border-line bg-surface-1 p-3 text-[11.5px] @md:grid-cols-2 @xl:grid-cols-4">
            <ProfileMeta label="Harness strategy" value={`${executionBackend === "remote-sandbox" ? selectedSandboxProfile?.provider ?? "Profile required" : "Local host"} · ${selectedHarness?.manifest.identity.harnessId ?? "Approved harness"}`} />
            <ProfileMeta label="Workflow / model" value={`${selectedWorkflow?.name ?? "Default workflow"} · ${versionOptions.agentVersions[0]?.modelConfig?.modelId ?? "Approved route required"}`} />
            <ProfileMeta label="Verification / retry" value={`${verifiers.length} independent verifier${verifiers.length === 1 ? "" : "s"} · ${maxAttempts} attempts`} />
            <ProfileMeta label="Preview / teardown" value={executionBackend === "remote-sandbox" ? `${selectedSandboxProfile?.previewMode?.toLowerCase().replaceAll("_", " ") ?? "profile required"} · mandatory teardown` : "No sandbox preview · host lifecycle"} />
          </div>
          <div className="flex justify-end border-t border-line pt-3">{saveButton}</div>
        </div>
      ) : null}

      {experienceLevel === "advanced" ? (
      <div className="grid gap-3 rounded-lg border border-line bg-surface-2 p-3 @md:grid-cols-2">
        {policies.length === 0 || verifiers.length === 0 || versionOptions.agentVersions.length === 0 ? (
          <div className="@md:col-span-2 flex flex-wrap items-start justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-3">
            <div className="max-w-2xl">
              <div className="text-[12.5px] font-medium text-ink">Governance records required</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Create a LOCAL-only, human-review-first policy, a verifier bound to the repository scopes below, and an approved bounded Codex runner. This action does not activate the Factory or dispatch work.
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={Boolean(pending)} onClick={createLocalGovernanceBaseline}>
              {pending === "baseline" ? "Creating baseline…" : "Create local governance baseline"}
            </Button>
          </div>
        ) : null}
        <div className="@md:col-span-2 text-[11.5px] text-ink-muted">
          <label htmlFor="factory-harness-executor">Harness executor</label>
          <select
            id="factory-harness-executor"
            className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink"
            value={harnessKey}
            onChange={(event) => {
              setHarnessKey(event.target.value);
              const next = versionOptions.harnesses.find((item) => `${item.manifest.identity.adapterId}\0${item.manifest.identity.adapterVersion}` === event.target.value);
              if (next && !next.manifest.admission.executionBackends.includes("remote-sandbox")) setExecutionBackend("persistent-worker");
            }}
            disabled
          >
            {versionOptions.harnesses.map((item) => {
              const identity = item.manifest.identity;
              return <option key={`${identity.adapterId}:${identity.adapterVersion}`} value={`${identity.adapterId}\0${identity.adapterVersion}`} disabled={!item.available}>
                {identity.harnessId} {identity.harnessVersion} · {identity.adapterId}/{identity.adapterVersion}{item.available ? "" : " · worker prerequisite missing"}
              </option>;
            })}
          </select>
          {selectedHarness ? (
            <span className="mt-2 block rounded-md border border-line bg-surface-1 p-3 leading-relaxed">
              <span className="block font-medium text-ink">{selectedHarness.manifest.admission.maturity.toLowerCase()} · {selectedHarness.manifest.identity.harnessCommit.slice(0, 12)}</span>
              <span className="mt-1 block">Backends: {selectedHarness.manifest.admission.executionBackends.join(", ")} · cancellation: {selectedHarness.manifest.cancellation.mode.toLowerCase().replaceAll("_", " ")} · cost telemetry: {selectedHarness.manifest.telemetry.cost.toLowerCase()}</span>
              <span className="mt-1 block">{selectedHarness.manifest.limitations[0]}</span>
            </span>
          ) : null}
        </div>
        <label className="text-[11.5px] text-ink-muted">Workflow
          <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
            <option value="">Select workflow</option>
            {workflows.map((item) => <option key={item._id} value={item._id}>{item.name} · v{item.version}</option>)}
          </select>
          <Button className="mt-2" type="button" variant="outline" size="sm" disabled={Boolean(pending)} onClick={createVerificationWorkflow}>
            {pending === "workflow" ? "Creating workflow…" : "Create Verification-First workflow"}
          </Button>
        </label>
        <label className="text-[11.5px] text-ink-muted">Qualified model route
          <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={modelCatalogId} onChange={(event) => setModelCatalogId(event.target.value)} disabled>
            <option value="">{compatibleModelRoutes.length === 0 ? "No compatible promoted route" : "Select qualified route"}</option>
            {compatibleModelRoutes.map((route) => <option key={route._id} value={route._id}>{route.displayName} · {route.provider}/{route.modelId}</option>)}
          </select>
          {compatibleModelRoutes.length === 0 ? <span className="mt-2 block text-warning">Promote an exact route matching the first workflow agent and selected harness before creating this version.</span> : null}
        </label>
        <label className="text-[11.5px] text-ink-muted">Governance policy
          <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
            <option value="">Select policy</option>
            {policies.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
          {policies.length === 0 ? (
            <Button className="mt-2" type="button" variant="outline" size="sm" disabled={Boolean(pending)} onClick={createVerificationPolicy}>
              {pending === "policy" ? "Creating policy…" : "Create Verification-First policy"}
            </Button>
          ) : null}
        </label>
        <label className="text-[11.5px] text-ink-muted">Maximum cost (USD)<Input className="mt-1" type="number" value={maxCostUsd} onChange={(event) => setMaxCostUsd(event.target.value)} /></label>
        <label className="text-[11.5px] text-ink-muted">Maximum runtime (minutes)<Input className="mt-1" type="number" value={maxRuntimeMinutes} onChange={(event) => setMaxRuntimeMinutes(event.target.value)} /></label>
        <label className="text-[11.5px] text-ink-muted">Maximum attempts<Input className="mt-1" type="number" value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} /></label>
        <label className="text-[11.5px] text-ink-muted">Risk boundary
          <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)}>
            <option value="GREEN">Green</option><option value="YELLOW">Yellow</option><option value="RED" disabled={executionBackend === "remote-sandbox"}>Red</option>
          </select>
        </label>
        <fieldset className="@md:col-span-2">
          <legend className="text-[11.5px] text-ink-muted">Independent verifiers</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {verifiers.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-warning">No active verifiers available.</span>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(pending)} onClick={createIndependentVerifier}>
                  {pending === "verifier" ? "Creating verifier…" : "Create independent verifier"}
                </Button>
              </div>
            ) : verifiers.map((item) => (
              <label key={item._id} className="flex items-center gap-2 rounded border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-ink-secondary">
                <input type="checkbox" checked={verifierIds.includes(item._id)} onChange={(event) => setVerifierIds((current) => event.target.checked ? [...current, item._id] : current.filter((id) => id !== item._id))} /> {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="@md:col-span-2">
          <legend className="text-[11.5px] text-ink-muted">Approved repository code scopes</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {versionOptions.codeScopes.length === 0 ? <span className="text-[12px] text-warning">No active code scopes available.</span> : versionOptions.codeScopes.map((scope) => (
              <label key={scope._id} className="flex items-center gap-2 rounded border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-ink-secondary">
                <input type="checkbox" checked={codeScopeIds.includes(scope._id)} onChange={(event) => setCodeScopeIds((current) => event.target.checked ? [...current, scope._id] : current.filter((id) => id !== scope._id))} /> {scope.name}
              </label>
            ))}
          </div>
        </fieldset>
        {selectedWorkflow?.agents.length ? (
          <fieldset className="@md:col-span-2">
            <legend className="text-[11.5px] text-ink-muted">Frozen workflow agent versions</legend>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {versionOptions.agentVersions.length === 0 ? <span className="text-[12px] text-warning">No approved workspace agent versions available.</span> : null}
              <Button type="button" variant="outline" size="sm" disabled={Boolean(pending)} onClick={createApprovedAgentVersion}>
                {pending === "agent" ? "Creating agent version…" : "Create approved agent version"}
              </Button>
            </div>
            <div className="mt-1 grid gap-2 @md:grid-cols-2">
              {selectedWorkflow.agents.map((agent) => (
                <label key={agent.id} className="text-[11.5px] text-ink-muted">{agent.persona} · {agent.id}
                  <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={agentBindings[agent.id] ?? ""} onChange={(event) => setAgentBindings((current) => ({ ...current, [agent.id]: event.target.value }))}>
                    <option value="">Select approved version</option>
                    {versionOptions.agentVersions.map((version) => <option key={version._id} value={version._id}>{version.template.name} · v{version.version} · {version.modelConfig.modelId}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="@md:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[11.5px] text-ink-muted">Executor: {selectedHarness?.manifest.identity.adapterId}/{selectedHarness?.manifest.identity.adapterVersion} · cancel and bounded retry enabled · pause/resume unsupported</span>
          {saveButton}
        </div>
      </div>
      ) : null}

      {experienceLevel === "advanced" ? (
        <SandboxProfileCreator
          projectId={projectId}
          pending={pending}
          setPending={setPending}
          setError={setError}
          setMessage={setMessage}
          createSandboxProfile={createSandboxProfile}
        />
      ) : null}

      {latestVersion ? (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px] font-medium text-ink">Version {latestVersion.version} · <code>{latestVersion.configurationDigest}</code></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={Boolean(pending)} onClick={runAssessment}>{pending === "assess" ? "Checking…" : "Run readiness"}</Button>
              <Button size="sm" disabled={Boolean(pending) || latestAssessment?.status !== "PASS"} onClick={activateVersion}>{pending === "activate" ? "Activating…" : "Activate"}</Button>
            </div>
          </div>
          {latestAssessment ? (
            <div className="mt-3 grid gap-2 @md:grid-cols-3">
              {latestAssessment.checks.map((check) => (
                <div key={check.id} className="rounded border border-line bg-surface-1 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">{check.status === "VERIFIED" ? <CheckCircle2 size={12} className="text-success" /> : <ShieldAlert size={12} className="text-warning" />}{check.label}</div>
                  {check.remediation ? <div className="mt-1 text-[10.5px] text-ink-muted">{check.remediation}</div> : null}
                </div>
              ))}
            </div>
          ) : <div className="mt-2 text-[11.5px] text-ink-muted">No readiness assessment exists for this version.</div>}
        </div>
      ) : null}
      {message ? <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success">{message}</div> : null}
      {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div> : null}
    </div>
  );
}

function ExecutionBackendSelector({
  backend,
  onBackendChange,
  profiles,
  profileId,
  onProfileChange,
  showProfileDetails,
  remoteEligible,
  remoteBlockReason,
  locked = false,
}: {
  backend: "persistent-worker" | "remote-sandbox";
  onBackendChange: (backend: "persistent-worker" | "remote-sandbox") => void;
  profiles: any[];
  profileId: string;
  onProfileChange: (profileId: string) => void;
  showProfileDetails: boolean;
  remoteEligible: boolean;
  remoteBlockReason?: string;
  locked?: boolean;
}) {
  const selected = profiles.find((profile) => profile._id === profileId);
  return (
    <fieldset>
      <legend className="sr-only">Execution boundary</legend>
      <div className="mt-3 grid gap-2 @md:grid-cols-2">
        <label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${backend === "persistent-worker" ? "border-[var(--focus-ring)] bg-surface-1" : "border-line bg-surface-1/50"}`}>
          <input aria-label="Local" className="mt-1" type="radio" name="factory-execution-backend" checked={backend === "persistent-worker"} disabled={locked} onChange={() => onBackendChange("persistent-worker")} />
          <span><span className="block text-[12.5px] font-medium text-ink">Local</span><span className="mt-0.5 block text-[11.5px] text-ink-muted">Execute in the canonical worker's owned host worktree. No provider spend.</span></span>
        </label>
        <label className={`flex min-h-16 items-start gap-3 rounded-md border p-3 transition-colors ${remoteEligible ? "cursor-pointer" : "cursor-not-allowed opacity-70"} ${backend === "remote-sandbox" ? "border-[var(--focus-ring)] bg-surface-1" : "border-line bg-surface-1/50"}`}>
          <input aria-label="Isolated Sandbox" className="mt-1" type="radio" name="factory-execution-backend" checked={backend === "remote-sandbox"} disabled={locked || !remoteEligible} onChange={() => onBackendChange("remote-sandbox")} />
          <span>
            <span className="block text-[12.5px] font-medium text-ink">Isolated Sandbox</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-muted">
              {remoteBlockReason ?? "Execute on an attempt-scoped disposable machine beneath the same worker lease."}
            </span>
          </span>
        </label>
      </div>
      {backend === "remote-sandbox" ? (
        <div className="mt-3 rounded-md border border-line bg-surface-1 p-3">
          {showProfileDetails ? <label className="text-[11.5px] text-ink-muted">Sandbox Profile
            <select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={profileId} onChange={(event) => onProfileChange(event.target.value)} disabled={locked}>
              <option value="">Select immutable profile</option>
              {profiles.map((profile) => <option key={profile._id} value={profile._id} disabled={profile.readinessState === "BLOCKED"}>{profile.profileKey} · v{profile.version} · {profile.readinessState.toLowerCase()}</option>)}
            </select>
          </label> : <div className="text-[11.5px] text-ink-muted">One sandbox · frozen profile and source · independent host verification · automatic credential revocation and teardown.</div>}
          {profiles.length === 0 ? <div role="status" className="mt-2 text-[11.5px] text-warning">No Sandbox Profile exists. Advanced can record an evidence-backed exe.dev profile.</div> : null}
          {selected?.readinessState === "DEGRADED" ? <div className="mt-2 text-[11.5px] text-warning">Degraded: provider egress is unrestricted. This limitation remains visible on the immutable Factory version.</div> : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function SandboxProfileCreator({
  projectId,
  pending,
  setPending,
  setError,
  setMessage,
  createSandboxProfile,
}: {
  projectId: Id<"projects">;
  pending: string;
  setPending: (value: string) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  createSandboxProfile: (input: any) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [profileKey, setProfileKey] = useState("exe-standard");
  const [providerProfileVersion, setProviderProfileVersion] = useState("2026-08-15");
  const [machineImage, setMachineImage] = useState("debian:bookworm");
  const [cpu, setCpu] = useState("2");
  const [memoryMb, setMemoryMb] = useState("4096");
  const [diskGb, setDiskGb] = useState("20");
  const [runtimeMinutes, setRuntimeMinutes] = useState("120");
  const [resultRetentionHours, setResultRetentionHours] = useState("24");
  const [spendLimitUsd, setSpendLimitUsd] = useState("5");
  const [networkEgress, setNetworkEgress] = useState<"UNRESTRICTED" | "RESTRICTED_ALLOWLIST">("UNRESTRICTED");
  const [previewMode, setPreviewMode] = useState<"DISABLED" | "PRIVATE_PROXY">("DISABLED");
  const [previewPort, setPreviewPort] = useState("3000");
  const [providerReachable, setProviderReachable] = useState(false);
  const [capacityAvailable, setCapacityAvailable] = useState(false);
  const [automaticCredentialCount, setAutomaticCredentialCount] = useState("0");
  const [egressEnforcementProven, setEgressEnforcementProven] = useState(false);
  const [evidenceReference, setEvidenceReference] = useState("");

  const create = async () => {
    setPending("sandbox-profile");
    setError("");
    setMessage("");
    try {
      await createSandboxProfile({
        projectId,
        profileKey,
        providerProfile: "exe.dev",
        providerProfileVersion,
        machineImage,
        cpu: Number(cpu),
        memoryMb: Number(memoryMb),
        diskGb: Number(diskGb),
        maxRuntimeMs: Number(runtimeMinutes) * 60_000,
        resultPollIntervalMs: 2_000,
        resultRetentionMs: Number(resultRetentionHours) * 60 * 60 * 1_000,
        networkEgress,
        egressAllowlist: [],
        spendLimitUsd: Number(spendLimitUsd),
        spendEnforcement: "PROVIDER_KEY_LIMIT",
        previewMode,
        previewPort: previewMode === "PRIVATE_PROXY" ? Number(previewPort) : undefined,
        readinessEvidence: {
          providerReachable,
          capacityAvailable,
          automaticCredentialCount: Number(automaticCredentialCount),
          egressEnforcementProven,
          evidenceReference,
        },
      });
      setMessage("Immutable exe.dev Sandbox Profile created. Blocked or degraded evidence remains visible and cannot be overridden by dispatch.");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Sandbox Profile could not be created. Review provider evidence and bounded resource values.");
    } finally {
      setPending("");
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <button type="button" className="flex min-h-9 w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="flex items-center gap-2"><SlidersHorizontal size={14} aria-hidden /><span className="text-[12.5px] font-medium text-ink">Create immutable exe.dev Sandbox Profile</span></span>
        <span className="text-[11.5px] text-ink-muted">{open ? "Hide settings" : "Provider, image, resources, network, credentials, teardown, and evidence"}</span>
      </button>
      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-[11.5px] leading-relaxed text-warning">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            Readiness is recorded evidence. Missing live lifecycle certification, unavailable capacity, or automatic provider credentials creates a blocked profile; unrestricted egress creates degraded status.
          </div>
          <div className="mt-3 grid gap-3 @md:grid-cols-2 @xl:grid-cols-4">
            <label className="text-[11.5px] text-ink-muted">Profile key<Input className="mt-1" value={profileKey} onChange={(event) => setProfileKey(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Provider profile version<Input className="mt-1" value={providerProfileVersion} onChange={(event) => setProviderProfileVersion(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Machine image<Input className="mt-1" value={machineImage} onChange={(event) => setMachineImage(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Network egress<select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={networkEgress} onChange={(event) => setNetworkEgress(event.target.value as typeof networkEgress)}><option value="UNRESTRICTED">Unrestricted (degraded)</option><option value="RESTRICTED_ALLOWLIST">Restricted allowlist</option></select></label>
            <label className="text-[11.5px] text-ink-muted">CPU<Input className="mt-1" type="number" value={cpu} onChange={(event) => setCpu(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Memory (MB)<Input className="mt-1" type="number" value={memoryMb} onChange={(event) => setMemoryMb(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Disk (GB)<Input className="mt-1" type="number" value={diskGb} onChange={(event) => setDiskGb(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Maximum runtime (minutes)<Input className="mt-1" type="number" value={runtimeMinutes} onChange={(event) => setRuntimeMinutes(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Result retention (hours)<Input className="mt-1" type="number" value={resultRetentionHours} onChange={(event) => setResultRetentionHours(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Per-sandbox spend cap (USD)<Input className="mt-1" type="number" value={spendLimitUsd} onChange={(event) => setSpendLimitUsd(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted">Preview<select className="mt-1 w-full rounded-md border border-line bg-surface-1 px-2 py-2 text-[12px] text-ink" value={previewMode} onChange={(event) => setPreviewMode(event.target.value as typeof previewMode)}><option value="DISABLED">Disabled</option><option value="PRIVATE_PROXY">Private proxy</option></select></label>
            {previewMode === "PRIVATE_PROXY" ? <label className="text-[11.5px] text-ink-muted">Private preview port<Input className="mt-1" type="number" value={previewPort} onChange={(event) => setPreviewPort(event.target.value)} /></label> : null}
            <label className="text-[11.5px] text-ink-muted">Automatic provider credentials<Input className="mt-1" type="number" min="0" value={automaticCredentialCount} onChange={(event) => setAutomaticCredentialCount(event.target.value)} /></label>
            <label className="text-[11.5px] text-ink-muted @md:col-span-2">Readiness evidence reference<Input className="mt-1" placeholder="Doctor receipt, incident record, or dated operator evidence" value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /></label>
          </div>
          <div className="mt-3 grid gap-2 @md:grid-cols-2 @xl:grid-cols-4">
            <EvidenceCheckbox label="Provider reachable" checked={providerReachable} onChange={setProviderReachable} />
            <EvidenceCheckbox label="Allocation capacity available" checked={capacityAvailable} onChange={setCapacityAvailable} />
            <EvidenceCheckbox label="Restricted egress enforcement proven" checked={egressEnforcementProven} onChange={setEgressEnforcementProven} />
          </div>
          <div className="mt-2 text-[11.5px] text-warning">Profiles created here remain blocked and Not Live Certified. Certification is a separate, explicitly authorized control-plane workflow after the exe.dev canary and GREEN-risk Attempt prove credential revocation and exact resource absence.</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex items-center gap-2 text-[11.5px] text-ink-muted"><Cpu size={13} aria-hidden /> mission-control-supervisor/v1 · SSH · current-state diagnostics · no public ports · no resume · mandatory credential revocation, teardown, and reconciliation</div>
            <Button size="sm" disabled={Boolean(pending) || evidenceReference.trim().length < 3} onClick={create}>{pending === "sandbox-profile" ? "Creating profile…" : "Create Sandbox Profile"}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface-1 px-3 text-[11.5px] text-ink-secondary"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function ProfileMeta({ label, value }: { label: string; value: string }) {
  return <div><div className="uppercase tracking-[0.12em] text-ink-muted">{label}</div><div className="mt-1 text-ink-secondary">{value}</div></div>;
}
