import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FactoryConfigurationPanel } from "./FactoryConfigurationPanel";

const codexHarness = {
  manifest: {
    identity: { harnessId: "codex-cli", harnessVersion: "0.146.0", harnessCommit: "e363b08c9175ac1cbe5893615dd2cb9ddf95043b", adapterId: "codex", adapterVersion: "v1" },
    admission: { maturity: "PRODUCTION", executionBackends: ["persistent-worker", "remote-sandbox"] },
    cancellation: { mode: "PROCESS_SIGNAL" },
    telemetry: { cost: "UNSUPPORTED" },
    limitations: ["Cost telemetry is unavailable."],
  },
  available: true,
  advertised: true,
};
const deepSeekHarness = {
  manifest: {
    identity: { harnessId: "deepseek-harness", harnessVersion: "0.1.0-rc.5", harnessCommit: "47f943859bef60e4160492346772ded9b24f765a", adapterId: "deepseek-harness", adapterVersion: "0.2.0" },
    admission: { maturity: "EXPERIMENTAL", executionBackends: ["persistent-worker"] },
    cancellation: { mode: "PROCESS_SIGNAL" },
    telemetry: { cost: "UNSUPPORTED" },
    limitations: ["Developer preview is explicitly enabled only."],
  },
  available: false,
  advertised: false,
};
const localExecutionProfile = {
  _id: "execution-profile-local-1",
  profileKey: "codex-local",
  version: 1,
  profileDigest: "sha256:profile-local",
  qualificationDigest: "sha256:qualification-local",
  qualificationExpiresAt: Date.now() + 60_000,
  executor: { adapter: "codex", version: "v1" },
  executionBackend: "persistent-worker",
  modelCatalogId: "model-route-1",
  modelRouteDigest: "sha256:route-1",
  isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
};
const remoteExecutionProfile = {
  ...localExecutionProfile,
  _id: "execution-profile-remote-1",
  profileKey: "codex-exe",
  profileDigest: "sha256:profile-remote",
  qualificationDigest: "sha256:qualification-remote",
  executionBackend: "remote-sandbox",
  sandboxProfileId: "sandbox-profile-1",
  sandboxProfileDigest: "sha256:sandbox-profile-1",
};

const mocks = vi.hoisted(() => ({
  definitions: [] as any[],
  detail: undefined as any,
  workflows: [{ _id: "workflow-1", name: "Mission delivery", version: 1, agents: [{ id: "implementer", persona: "Implementer" }] }],
  policies: [{ _id: "policy-1", name: "Default governance" }],
  verifiers: [{ _id: "verifier-1", label: "Independent review" }],
  versionOptions: {
    codeScopes: [{ _id: "scope-1", name: "Application", includePaths: ["apps/example/**"] }],
    agentVersions: [{ _id: "agent-version-1", version: 2, template: { name: "Implementer" }, modelConfig: { provider: "openai", modelId: "gpt-5" } }],
    modelRoutes: [{ _id: "model-route-1", provider: "openai", modelId: "gpt-5", displayName: "GPT-5" }],
    executionProfiles: [] as any[],
    sandboxProfiles: [] as any[],
    harnesses: [] as any[],
  },
  createFactory: vi.fn(),
  createVersion: vi.fn(),
  createSandboxProfile: vi.fn(),
  assess: vi.fn(),
  activate: vi.fn(),
  createPolicy: vi.fn(),
  createVerifier: vi.fn(),
  agentTemplates: [] as any[],
  createAgentTemplate: vi.fn(),
  createAgentVersion: vi.fn(),
  registerProductionWorkflow: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    "factory/configuration": {
      list: "factory.list",
      getDetail: "factory.getDetail",
      getVersionOptions: "factory.getVersionOptions",
      create: "factory.create",
      createVersion: "factory.createVersion",
      createSandboxProfile: "factory.createSandboxProfile",
      assessReadiness: "factory.assessReadiness",
      activate: "factory.activate",
    },
    workflows: { list: "workflows.list", registerProduction: "workflows.registerProduction" },
    "governance/policyEnvelopes": { listPolicyEnvelopes: "policies.list", createPolicyEnvelope: "policies.create" },
    "context/verifiers": { list: "verifiers.list", create: "verifiers.create" },
    "registry/agentTemplates": { listTemplates: "agentTemplates.list", createTemplate: "agentTemplates.create" },
    "registry/agentVersions": { createVersion: "agentVersions.create" },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    if (query === "factory.list") return mocks.definitions;
    if (query === "factory.getDetail") return mocks.detail;
    if (query === "factory.getVersionOptions") return mocks.versionOptions;
    if (query === "workflows.list") return mocks.workflows;
    if (query === "policies.list") return mocks.policies;
    if (query === "verifiers.list") return mocks.verifiers;
    if (query === "agentTemplates.list") return mocks.agentTemplates;
    return undefined;
  },
  useMutation: (mutation: string) => {
    if (mutation === "factory.create") return mocks.createFactory;
    if (mutation === "factory.createVersion") return mocks.createVersion;
    if (mutation === "factory.createSandboxProfile") return mocks.createSandboxProfile;
    if (mutation === "factory.assessReadiness") return mocks.assess;
    if (mutation === "factory.activate") return mocks.activate;
    if (mutation === "policies.create") return mocks.createPolicy;
    if (mutation === "verifiers.create") return mocks.createVerifier;
    if (mutation === "agentTemplates.create") return mocks.createAgentTemplate;
    if (mutation === "agentVersions.create") return mocks.createAgentVersion;
    if (mutation === "workflows.registerProduction") return mocks.registerProductionWorkflow;
    throw new Error(`Unexpected mutation: ${mutation}`);
  },
}));

function renderPanel(repositoryDataClassification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "UNCLASSIFIED" = "PUBLIC") {
  return render(
    <FactoryConfigurationPanel
      projectId={"project-1" as any}
      repositoryId={"repository-1" as any}
      repositoryDataClassification={repositoryDataClassification}
    />
  );
}

function detailWith(status: "PASS" | "BLOCKED") {
  return {
    definition: { _id: "factory-1", status: "DRAFT" },
    versions: [{ _id: "version-1", version: 1, configurationDigest: "factory-v1-12345678" }],
    assessments: [{
      _id: "assessment-1",
      factoryDefinitionVersionId: "version-1",
      status,
      checks: [{
        id: "github",
        label: "GitHub App connection",
        status: status === "PASS" ? "VERIFIED" : "MISSING",
        remediation: status === "PASS" ? undefined : "Install the GitHub App.",
      }],
    }],
  };
}

describe("FactoryConfigurationPanel", () => {
  beforeEach(() => {
    mocks.definitions = [];
    mocks.detail = undefined;
    mocks.workflows = [{ _id: "workflow-1", name: "Mission delivery", version: 1, agents: [{ id: "implementer", persona: "Implementer" }] }];
    mocks.policies = [{ _id: "policy-1", name: "Default governance" }];
    mocks.verifiers = [{ _id: "verifier-1", label: "Independent review" }];
    mocks.agentTemplates = [];
    mocks.versionOptions = {
      codeScopes: [{ _id: "scope-1", name: "Application", includePaths: ["apps/example/**"] }],
      agentVersions: [{ _id: "agent-version-1", version: 2, template: { name: "Implementer" }, modelConfig: { provider: "openai", modelId: "gpt-5" } }],
      modelRoutes: [{ _id: "model-route-1", provider: "openai", modelId: "gpt-5", displayName: "GPT-5" }],
      executionProfiles: [localExecutionProfile],
      sandboxProfiles: [],
      harnesses: [codexHarness],
    };
    window.localStorage.setItem("mc.factory.experience-level", "advanced");
    mocks.createFactory.mockReset().mockResolvedValue("factory-1");
    mocks.createVersion.mockReset().mockResolvedValue("version-1");
    mocks.createSandboxProfile.mockReset().mockResolvedValue("sandbox-profile-1");
    mocks.assess.mockReset().mockResolvedValue("assessment-1");
    mocks.activate.mockReset().mockResolvedValue({ activeVersionId: "version-1" });
    mocks.createPolicy.mockReset().mockResolvedValue({ _id: "policy-created" });
    mocks.createVerifier.mockReset().mockResolvedValue("verifier-created");
    mocks.createAgentTemplate.mockReset().mockResolvedValue({ _id: "template-created", slug: "factory-local-codex-runner" });
    mocks.createAgentVersion.mockReset().mockResolvedValue({ _id: "agent-version-created" });
    mocks.registerProductionWorkflow.mockReset().mockResolvedValue("workflow-created");
  });

  it("creates a draft Factory from the explicit empty state", async () => {
    renderPanel();
    expect(screen.getByText(/No Factory exists for this repository/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Software Factory" }));

    await waitFor(() => expect(mocks.createFactory).toHaveBeenCalledWith({
      repositoryId: "repository-1",
      name: "Software Factory",
      purpose: "SOFTWARE",
    }));
  });

  it("creates a separate Verification Factory for the same repository", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "ACTIVE", purpose: "SOFTWARE", name: "Software Factory" }];
    mocks.detail = detailWith("PASS");
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Create Verification Factory" }));

    await waitFor(() => expect(mocks.createFactory).toHaveBeenCalledWith({
      repositoryId: "repository-1",
      name: "Verification Factory",
      purpose: "VERIFICATION",
    }));
  });

  it("shows remediation and blocks activation after failed readiness", () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = detailWith("BLOCKED");
    renderPanel();

    expect(screen.getByText("Install the GitHub App.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
  });

  it("allows activation only for a passing assessment of the latest version", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = detailWith("PASS");
    renderPanel();

    const activate = screen.getByRole("button", { name: "Activate" });
    expect(activate).toBeEnabled();
    fireEvent.click(activate);

    await waitFor(() => expect(mocks.activate).toHaveBeenCalledWith({
      factoryDefinitionVersionId: "version-1",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Factory version 1 activated.");
  });

  it("freezes code scope and approved agent bindings in a new version", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    renderPanel();

    fireEvent.change(screen.getByLabelText("Workflow"), { target: { value: "workflow-1" } });
    fireEvent.change(screen.getByLabelText("Governance policy"), { target: { value: "policy-1" } });
    fireEvent.click(screen.getByLabelText("Independent review"));
    fireEvent.click(screen.getByLabelText("Application"));
    fireEvent.change(screen.getByLabelText(/Implementer · implementer/), { target: { value: "agent-version-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create configuration version" }));

    await waitFor(() => expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      executionProfileId: "execution-profile-local-1",
      codeScopeIds: ["scope-1"],
      agentBindings: [{ workflowAgentId: "implementer", agentVersionId: "agent-version-1" }],
      recovery: { pause: false, cancel: true, retry: true, resume: false },
    })));
  });

  it("uses the shared progressive Factory level instead of rendering a competing mode selector", () => {
    window.localStorage.setItem("mc.factory.experience-level", "basic");
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    renderPanel();

    expect(screen.getByText("basic")).toBeInTheDocument();
    expect(screen.getByLabelText("Local")).toBeInTheDocument();
    expect(screen.getByLabelText("Isolated Sandbox")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: /Factory configuration detail/i })).not.toBeInTheDocument();
  });

  it("denies remote selection for sensitive repositories without provider-enforced egress", () => {
    window.localStorage.setItem("mc.factory.experience-level", "basic");
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    renderPanel("INTERNAL");

    expect(screen.getByLabelText("Isolated Sandbox")).toBeDisabled();
    expect(screen.getByText(/internal repository: no eligible profile proves provider-enforced egress/i)).toBeInTheDocument();
  });

  it("blocks Factory version creation until a compatible qualified Execution Profile exists", () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.versionOptions = { ...mocks.versionOptions, executionProfiles: [] };
    renderPanel();

    expect(screen.getByLabelText("Qualified Execution Profile")).toBeDisabled();
    expect(screen.getByText(/Register and qualify an exact profile/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create configuration version" })).toBeDisabled();
  });

  it("labels the exact governed tool as a qualification fixture without claiming harness support", () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.versionOptions = {
      ...mocks.versionOptions,
      executionProfiles: [{
        ...localExecutionProfile,
        toolGrant: {
          id: "grant-1", digest: "sha256:grant", key: "doctrine-read", version: 1,
          operation: "read_factory_doctrine_excerpt", expiresAt: Date.now() + 60_000,
          credentialClass: "NONE", destination: "LOCAL_PROCESS", admission: "QUALIFICATION_FIXTURE",
        },
      }],
    };
    renderPanel();

    expect(screen.getByText(/Qualified fixture tool/i)).toBeInTheDocument();
    expect(screen.getByText(/read_factory_doctrine_excerpt/i)).toBeInTheDocument();
    expect(screen.getByText(/no real MCP service is admitted/i)).toBeInTheDocument();
    expect(screen.getByText(/Harness MCP remains unsupported/i)).toBeInTheDocument();
  });

  it("shows experimental harness capability detail only in Advanced and disables selection until a worker advertises the exact pin", () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.versionOptions = { ...mocks.versionOptions, harnesses: [codexHarness, deepSeekHarness] };
    renderPanel();

    const selector = screen.getByLabelText("Harness executor");
    expect(selector).toHaveValue("codex\0v1");
    expect(screen.getByRole("option", { name: /deepseek-harness 0.1.0-rc.5/i })).toBeDisabled();
    expect(screen.getByText(/Cost telemetry is unavailable/i)).toBeInTheDocument();
  });

  it("keeps live certification outside routine Factory configuration", () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Create immutable exe.dev Sandbox Profile/i }));

    expect(screen.queryByLabelText(/Live lifecycle explicitly certified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Profiles created here remain blocked and Not Live Certified/i)).toBeInTheDocument();
  });

  it("freezes a dispatchable Sandbox Profile into the remote execution backend", async () => {
    window.localStorage.setItem("mc.factory.experience-level", "intermediate");
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.versionOptions = {
      ...mocks.versionOptions,
      executionProfiles: [localExecutionProfile, remoteExecutionProfile],
      sandboxProfiles: [{
        _id: "sandbox-profile-1", profileKey: "exe-standard", version: 1, provider: "EXE_DEV",
        readinessState: "DEGRADED", previewMode: "DISABLED",
      }],
    };
    renderPanel();

    fireEvent.change(screen.getByLabelText("Qualified Execution Profile"), { target: { value: "execution-profile-remote-1" } });
    await waitFor(() => expect(screen.getByLabelText("Sandbox Profile")).toHaveValue("sandbox-profile-1"));
    fireEvent.click(screen.getByRole("button", { name: "Create configuration version" }));

    await waitFor(() => expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      executionProfileId: "execution-profile-remote-1",
      riskBoundary: "YELLOW",
    })));
    expect(screen.getByText(/Preview · Not Live Certified/i)).toBeInTheDocument();
  });

  it("creates a browser-governed local baseline when policy and verifier records are missing", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.policies = [];
    mocks.verifiers = [];
    mocks.versionOptions = {
      ...mocks.versionOptions,
      codeScopes: [{ _id: "scope-1", name: "Application", includePaths: ["apps/example/**"] }],
      agentVersions: [],
    };
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Create local governance baseline" }));

    await waitFor(() => expect(mocks.createPolicy).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      rules: expect.objectContaining({ executionEnvironments: ["LOCAL"] }),
    })));
    expect(mocks.createVerifier).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      globPatterns: ["apps/example/**"],
    }));
    expect(mocks.createAgentTemplate).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      slug: "factory-local-codex-runner",
    }));
    expect(mocks.createAgentVersion).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      status: "APPROVED",
      genome: expect.objectContaining({
        modelConfig: expect.objectContaining({ modelId: "gpt-5.6-sol" }),
      }),
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("approved LOCAL runner are ready");
  });

  it("creates missing Verification-First readiness records from the Factory editor", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.policies = [];
    mocks.verifiers = [];
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Create Verification-First policy" }));
    await waitFor(() => expect(mocks.createPolicy).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      name: "Verification-First V1 Factory Envelope",
    })));

    fireEvent.click(screen.getByRole("button", { name: "Create independent verifier" }));
    await waitFor(() => expect(mocks.createVerifier).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      label: "Verification-First Independent Validator",
    })));
  });

  it("creates and binds an explicitly approved agent when the workspace has none", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    mocks.versionOptions = { ...mocks.versionOptions, agentVersions: [] };
    renderPanel();

    fireEvent.change(screen.getByLabelText("Workflow"), { target: { value: "workflow-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create approved agent version" }));

    await waitFor(() => expect(mocks.createAgentVersion).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      templateId: "template-created",
      status: "APPROVED",
      genome: expect.objectContaining({
        modelConfig: expect.objectContaining({ modelId: "gpt-5.6-sol" }),
      }),
    })));
  });

  it("creates a structured Verification-First workflow from Factory setup", async () => {
    mocks.definitions = [{ _id: "factory-1", repositoryId: "repository-1", status: "DRAFT" }];
    mocks.detail = { definition: { _id: "factory-1", status: "DRAFT" }, versions: [], assessments: [] };
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Create Verification-First workflow" }));

    await waitFor(() => expect(mocks.registerProductionWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      name: "Verification-First V1 Delivery",
      agents: expect.arrayContaining([expect.objectContaining({ id: "independent-verifier" })]),
      steps: expect.arrayContaining([expect.objectContaining({ id: "verify", kind: "VERIFY" })]),
    })));
  });
});
