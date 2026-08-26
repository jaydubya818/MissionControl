import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRepositoriesPanel } from "./WorkspaceRepositoriesPanel";

vi.mock("./FactoryConfigurationPanel", () => ({
  FactoryConfigurationPanel: () => <div>Factory configuration test boundary</div>,
}));

const mocks = vi.hoisted(() => ({
  repositories: [] as any[],
  scopes: [] as any[],
  structure: { teams: [{ _id: "team-1", name: "Checkout", status: "ACTIVE" }], memberships: [], members: [], repositories: [], assignmentCount: 0, canManageTeams: true },
  readiness: undefined as any,
  deliveries: [] as any[],
  setDefault: vi.fn(),
  setClassification: vi.fn(),
  backfill: vi.fn(),
  beginInstallation: vi.fn(),
  verifyInstallation: vi.fn(),
  bindExistingInstallation: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    projects: {
      listRepositories: "projects.listRepositories",
      listCodeScopes: "projects.listCodeScopes",
      setDefaultRepository: "projects.setDefaultRepository",
      setRepositoryDataClassification: "projects.setRepositoryDataClassification",
      backfillLegacyRepositories: "projects.backfillLegacyRepositories",
      createRepositoryConnection: "projects.createRepositoryConnection",
      createRepositoryCodeScope: "projects.createRepositoryCodeScope",
      archiveRepositoryCodeScope: "projects.archiveRepositoryCodeScope",
    },
    githubAppConnections: {
      getRepositoryReadiness: "githubAppConnections.getRepositoryReadiness",
      listDeliveries: "githubAppConnections.listDeliveries",
      beginInstallation: "githubAppConnections.beginInstallation",
      verifyInstallation: "githubAppConnections.verifyInstallation",
      bindExistingInstallation: "githubAppConnections.bindExistingInstallation",
    },
    governancePolicies: {
      getActiveForProject: "governancePolicies.getActiveForProject",
      activateVerificationFirstV1: "governancePolicies.activateVerificationFirstV1",
    },
    softwareFactoryControlPlane: {
      listWorkspaceStructure: "control-plane.listWorkspaceStructure",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    if (query === "projects.listRepositories") return mocks.repositories;
    if (query === "projects.listCodeScopes") return mocks.scopes;
    if (query === "control-plane.listWorkspaceStructure") return mocks.structure;
    if (query === "githubAppConnections.getRepositoryReadiness") return mocks.readiness;
    if (query === "githubAppConnections.listDeliveries") return mocks.deliveries;
    if (query === "governancePolicies.getActiveForProject") return null;
    return undefined;
  },
  useMutation: (mutation: string) => {
    if (mutation === "projects.setDefaultRepository") return mocks.setDefault;
    if (mutation === "projects.setRepositoryDataClassification") return mocks.setClassification;
    if (mutation === "projects.backfillLegacyRepositories") return mocks.backfill;
    if (mutation === "governancePolicies.activateVerificationFirstV1") return vi.fn();
    return vi.fn();
  },
  useAction: (action: string) => {
    if (action === "githubAppConnections.beginInstallation") return mocks.beginInstallation;
    if (action === "githubAppConnections.verifyInstallation") return mocks.verifyInstallation;
    if (action === "githubAppConnections.bindExistingInstallation") return mocks.bindExistingInstallation;
    return vi.fn();
  },
}));

const project = {
  _id: "workspace-1",
  _creationTime: 1,
  name: "SellerFi",
  slug: "sellerfi",
  status: "ACTIVE",
} as never;

describe("WorkspaceRepositoriesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repositories = [];
    mocks.scopes = [];
    mocks.readiness = undefined;
    mocks.deliveries = [];
    mocks.setDefault.mockResolvedValue({ success: true });
    mocks.setClassification.mockResolvedValue({ success: true, dataClassification: "CONFIDENTIAL" });
    mocks.backfill.mockResolvedValue({ created: 1, existing: 0, skipped: 0, failed: 0 });
    mocks.beginInstallation.mockResolvedValue({
      ok: true,
      installUrl: "https://github.com/apps/mission-control/installations/new?state=opaque",
    });
    mocks.verifyInstallation.mockResolvedValue({ ok: true });
    mocks.bindExistingInstallation.mockResolvedValue({ ok: true });
  });

  it("shows a truthful setup state when the workspace has no repository", () => {
    render(<WorkspaceRepositoriesPanel project={project} />);

    expect(screen.getByText("No repository connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();
    expect(screen.getByText(/Workspaces can contain multiple repositories/)).toBeInTheDocument();
  });

  it("shows multiple repositories and monorepo scopes without exposing host paths", () => {
    mocks.repositories = [
      {
        repositoryId: "repository-1",
        source: "CONNECTION",
        repository: "sellerfi/marketplace",
        displayName: "marketplace",
        defaultBranch: "main",
        isDefault: true,
        status: "READY",
        webhookStatus: "READY",
        dataClassification: "INTERNAL",
        scopeCount: 1,
      },
      {
        repositoryId: "repository-2",
        source: "CONNECTION",
        repository: "sellerfi/docs",
        displayName: "docs",
        defaultBranch: "main",
        isDefault: false,
        status: "CONFIGURED",
        webhookStatus: "MISSING",
        dataClassification: "PUBLIC",
        scopeCount: 0,
      },
    ];
    mocks.scopes = [
      {
        _id: "scope-1",
        active: true,
        name: "Buyer portal",
        includePaths: ["apps/buyer-portal"],
        owningTeam: "Checkout",
        owningTeamId: "team-1",
        allowedEnvironments: ["LOCAL", "CLOUD"],
        verificationPolicy: "Unit + browser",
      },
    ];

    render(<WorkspaceRepositoriesPanel project={project} />);

    expect(screen.getByText("sellerfi/marketplace")).toBeInTheDocument();
    expect(screen.getByText("sellerfi/docs")).toBeInTheDocument();
    expect(screen.getByText("Buyer portal")).toBeInTheDocument();
    expect(screen.getByText("apps/buyer-portal")).toBeInTheDocument();
    expect(screen.queryByText(/Users\//)).not.toBeInTheDocument();
  });

  it("classifies a repository with a reason and shows the remote-execution boundary", async () => {
    mocks.repositories = [{
      repositoryId: "repository-1",
      source: "CONNECTION",
      repository: "sellerfi/marketplace",
      displayName: "marketplace",
      defaultBranch: "main",
      isDefault: true,
      status: "READY",
      webhookStatus: "READY",
      dataClassification: "INTERNAL",
      scopeCount: 0,
    }];

    render(<WorkspaceRepositoriesPanel project={project} />);
    fireEvent.change(screen.getByLabelText("Repository data classification"), { target: { value: "CONFIDENTIAL" } });
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Contains private product source" } });
    fireEvent.click(screen.getByRole("button", { name: "Save classification" }));

    await waitFor(() => expect(mocks.setClassification).toHaveBeenCalledWith({
      repositoryId: "repository-1",
      dataClassification: "CONFIDENTIAL",
      reason: "Contains private product source",
    }));
    expect(screen.getByText(/Remote Sandbox is denied/)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Create a new Factory version");
  });

  it("materializes a legacy repository before monorepo scopes are added", async () => {
    mocks.repositories = [
      {
        repositoryId: null,
        source: "LEGACY",
        repository: "sellerfi/marketplace",
        displayName: "marketplace",
        defaultBranch: "main",
        isDefault: true,
        status: "CONFIGURED",
        webhookStatus: "MISSING",
        scopeCount: 0,
      },
    ];
    render(<WorkspaceRepositoriesPanel project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "Prepare monorepo scopes" }));

    await waitFor(() =>
      expect(mocks.backfill).toHaveBeenCalledWith({ projectId: "workspace-1" })
    );
  });

  it("shows actionable GitHub App readiness without exposing credentials", () => {
    mocks.repositories = [
      {
        repositoryId: "repository-1",
        source: "CONNECTION",
        repository: "sellerfi/marketplace",
        displayName: "marketplace",
        defaultBranch: "main",
        isDefault: true,
        status: "DEGRADED",
        webhookStatus: "ERROR",
        scopeCount: 0,
      },
    ];
    mocks.readiness = {
      overall: "BLOCKED",
      installation: {
        installationId: "12345",
        accountLogin: "sellerfi",
      },
      checks: [
        {
          id: "permissions",
          status: "BLOCKED",
          label: "Least-privilege permissions",
          detail: "Missing checks:read",
          remediation: "Update the GitHub App permission grant to the documented V1 envelope.",
        },
      ],
    };

    render(<WorkspaceRepositoriesPanel project={project} />);

    expect(screen.getByText("GitHub App readiness")).toBeInTheDocument();
    expect(screen.getByText(/Missing checks:read/)).toBeInTheDocument();
    expect(screen.getByText(/tokens are not stored/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify installation" })).toBeInTheDocument();
    expect(screen.queryByText(/ghs_/i)).not.toBeInTheDocument();
  });

  it("shows authenticated webhook processing outcomes for the selected repository", () => {
    mocks.repositories = [{
      repositoryId: "repository-1",
      source: "CONNECTION",
      repository: "sellerfi/marketplace",
      displayName: "marketplace",
      defaultBranch: "main",
      isDefault: true,
      status: "READY",
      webhookStatus: "READY",
      scopeCount: 0,
    }];
    mocks.readiness = { overall: "VERIFIED", installation: { installationId: "12345", accountLogin: "sellerfi" }, checks: [] };
    mocks.deliveries = [{
      _id: "delivery-record-1",
      deliveryId: "github-delivery-1",
      event: "check_run",
      action: "completed",
      signatureStatus: "VALID",
      status: "PROCESSED",
      result: "Harness PR check updated.",
      receivedAt: 1_786_000_000_000,
    }];

    render(<WorkspaceRepositoriesPanel project={project} />);

    expect(screen.getByText("Recent webhook deliveries")).toBeInTheDocument();
    expect(screen.getByText("check_run · completed")).toBeInTheDocument();
    expect(screen.getByText("signature valid")).toBeInTheDocument();
    expect(screen.getByText("processed")).toBeInTheDocument();
  });

  it("re-verifies an existing installation without reopening GitHub", async () => {
    mocks.repositories = [{
      repositoryId: "repository-1",
      source: "CONNECTION",
      repository: "sellerfi/marketplace",
      displayName: "marketplace",
      defaultBranch: "main",
      isDefault: true,
      status: "DEGRADED",
      webhookStatus: "ERROR",
      scopeCount: 0,
    }];
    mocks.readiness = {
      overall: "STALE",
      installation: { installationId: "12345", accountLogin: "sellerfi" },
      checks: [],
    };

    render(<WorkspaceRepositoriesPanel project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Verify installation" }));

    await waitFor(() => expect(mocks.verifyInstallation).toHaveBeenCalledWith({ repositoryId: "repository-1" }));
    expect(mocks.beginInstallation).not.toHaveBeenCalled();
  });

  it("sanitizes GitHub App setup failures", async () => {
    mocks.repositories = [
      {
        repositoryId: "repository-1",
        source: "CONNECTION",
        repository: "sellerfi/marketplace",
        displayName: "marketplace",
        defaultBranch: "main",
        isDefault: true,
        status: "CONFIGURED",
        webhookStatus: "MISSING",
        scopeCount: 0,
      },
    ];
    mocks.readiness = {
      overall: "MISSING",
      installation: null,
      checks: [{
        id: "installation",
        status: "MISSING",
        label: "GitHub App installation",
        detail: "No GitHub App installation is bound to this repository.",
        remediation: "Install the Mission Control GitHub App.",
      }],
    };
    mocks.beginInstallation.mockResolvedValue({ ok: false, code: "NOT_CONFIGURED" });

    render(<WorkspaceRepositoriesPanel project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Install GitHub App" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "GitHub App setup is not configured for this environment"
    );
    expect(screen.queryByText(/Request ID secret/)).not.toBeInTheDocument();
  });

  it("verifies and binds a pre-existing GitHub App installation", async () => {
    mocks.repositories = [{
      repositoryId: "repository-1",
      source: "CONNECTION",
      repository: "sellerfi/marketplace",
      displayName: "marketplace",
      defaultBranch: "main",
      isDefault: true,
      status: "CONFIGURED",
      webhookStatus: "MISSING",
      scopeCount: 0,
    }];
    mocks.readiness = {
      overall: "MISSING",
      installation: null,
      checks: [{ id: "installation", status: "MISSING", label: "GitHub App installation", detail: "Missing" }],
    };
    render(<WorkspaceRepositoriesPanel project={project} />);

    fireEvent.change(screen.getByLabelText("Existing GitHub installation ID"), { target: { value: "152563527" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and bind installation" }));

    await waitFor(() => expect(mocks.bindExistingInstallation).toHaveBeenCalledWith({
      repositoryId: "repository-1",
      installationId: "152563527",
    }));
  });
});
