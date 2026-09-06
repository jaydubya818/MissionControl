import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FactoryPackageImportDialog } from "./FactoryPackageImportDialog";

const previewPackage = vi.fn();
const importDrafts = vi.fn();
let qualificationEnabled = true;

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    factoryPackageImports: {
      qualificationStatus: "factoryPackageImports.qualificationStatus",
      preview: "factoryPackageImports.preview",
      importDrafts: "factoryPackageImports.importDrafts",
    },
    projects: {
      listRepositories: "projects.listRepositories",
      listCodeScopes: "projects.listCodeScopes",
    },
    softwareFactoryControlPlane: {
      listWorkspaceStructure:
        "softwareFactoryControlPlane.listWorkspaceStructure",
    },
    workflows: { list: "workflows.list" },
  },
}));

vi.mock("convex/react", () => ({
  useAction: (reference: string) =>
    reference === "factoryPackageImports.preview"
      ? previewPackage
      : importDrafts,
  useQuery: (reference: string, args: unknown) => {
    switch (reference) {
      case "factoryPackageImports.qualificationStatus":
        return { enabled: qualificationEnabled };
      case "projects.listRepositories":
        return [
          {
            repositoryId: "repository-1",
            repository: "sellerfi/platform",
            displayName: "SellerFi Platform",
            defaultBranch: "main",
            isDefault: true,
            status: "READY",
            dataClassification: "CONFIDENTIAL",
          },
        ];
      case "softwareFactoryControlPlane.listWorkspaceStructure":
        return {
          teams: [{ _id: "team-1", name: "Platform", status: "ACTIVE" }],
          members: [{ _id: "member-1", name: "Jay", active: true }],
          memberships: [
            {
              teamId: "team-1",
              memberId: "member-1",
              active: true,
            },
          ],
        };
      case "workflows.list":
        return [
          {
            _id: "workflow-record-1",
            workflowId: "software-change/verified-pr",
            name: "Verified PR",
            version: 7,
            active: true,
            projectId: "project-1",
          },
        ];
      case "projects.listCodeScopes":
        return args === "skip"
          ? undefined
          : [
              {
                _id: "scope-1",
                name: "Marketplace",
                active: true,
                owningTeamId: "team-1",
              },
            ];
      default:
        throw new Error(`Unexpected query reference: ${reference}`);
    }
  },
}));

const packageId = "12345678-1234-4234-9234-123456789abc";
const packageDigest = `sha256:${"a".repeat(64)}`;
const mappingDigest = `sha256:${"b".repeat(64)}`;

function renderDialog(options?: { onImported?: (missionId: string) => void }) {
  return render(
    <FactoryPackageImportDialog
      projectId={"project-1" as Id<"projects">}
      open
      onOpenChange={vi.fn()}
      initialPackageId={packageId}
      initialPackageVersion="1"
      initialRequestedCodeScopes={["apps/marketplace/**"]}
      onImported={options?.onImported}
    />,
  );
}

describe("FactoryPackageImportDialog", () => {
  beforeEach(() => {
    qualificationEnabled = true;
    previewPackage.mockReset();
    importDrafts.mockReset();
    previewPackage.mockResolvedValue({
      ok: true,
      preview: {
        issuerId: "factory-engineer-production",
        packageId,
        packageVersion: 1,
        packageDigest,
        currentStatus: "PUBLISHED",
        publishedAt: "2026-09-04T12:00:00.000Z",
        retrievedAt: "2026-09-04T12:01:00.000Z",
        correlationId: "correlation-1",
        requestedTarget: {
          workspaceRef: "sellerfi",
          repositoryRef: "sellerfi/platform",
          codeScopeRefs: ["apps/marketplace/**"],
          semanticWorkflowRef: "software-change/verified-pr",
          environmentClass: "POLICY_SELECTED",
        },
        localTarget: {
          repositoryId: "repository-1",
          ownerMemberId: "member-1",
          owningTeamId: "team-1",
          codeScopeIds: ["scope-1"],
          workflowId: "software-change/verified-pr",
          workflowVersion: 7,
          executionEnvironment: "POLICY_SELECTED",
        },
        missionDraft: {
          title: "Qualify marketplace checkout",
          objective: "Prove the design-partner checkout change safely.",
          constraints: ["Preserve payment controls"],
          stopCondition: "Stop if verification fails.",
        },
        planDraft: {
          assertions: [{ key: "checkout-preserved" }],
          workOrderBlueprints: [{ title: "Update checkout" }],
        },
        governance: { canCreateDrafts: true, blockers: [] },
        mappingRevision: 2,
        mappingDigest,
        warnings: ["Human review is still required."],
      },
    });
    importDrafts.mockResolvedValue({
      ok: true,
      receipt: {
        missionId: "mission-1",
        missionPlanId: "plan-1",
        packageDigest,
        mappingDigest,
        created: true,
        importedAt: Date.parse("2026-09-04T12:02:00.000Z"),
        warnings: [],
      },
    });
  });

  it("fails closed without the exact project qualification gate", async () => {
    qualificationEnabled = false;

    renderDialog();

    expect(
      await screen.findByText("Import is not enabled for this workspace"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview verified draft" }),
    ).not.toBeInTheDocument();
    expect(previewPackage).not.toHaveBeenCalled();
    expect(importDrafts).not.toHaveBeenCalled();
  });

  it("shows a bounded retrieval error and never exposes confirmation", async () => {
    previewPackage.mockResolvedValue({
      ok: false,
      error: {
        code: "ORIGIN_UNVERIFIED",
        message: "Factory Engineer did not authenticate the package response.",
        correlationId: "correlation-denied",
      },
    });
    renderDialog();

    fireEvent.change(
      await screen.findByRole("combobox", {
        name: "Mission Control code scope 1",
      }),
      { target: { value: "scope-1" } },
    );
    const previewButton = screen.getByRole("button", {
      name: "Preview verified draft",
    });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    expect(
      await screen.findByText(
        "Factory Engineer did not authenticate the package response.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Correlation correlation-denied"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create Mission + Plan drafts" }),
    ).not.toBeInTheDocument();
    expect(importDrafts).not.toHaveBeenCalled();
  });

  it("previews, explicitly confirms, and creates draft records without browser credentials", async () => {
    const onImported = vi.fn();
    renderDialog({ onImported });

    const scopeSelect = await screen.findByRole("combobox", {
      name: "Mission Control code scope 1",
    });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Marketplace" })).toBeEnabled(),
    );
    fireEvent.change(scopeSelect, { target: { value: "scope-1" } });

    const previewButton = screen.getByRole("button", {
      name: "Preview verified draft",
    });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    await waitFor(() => expect(previewPackage).toHaveBeenCalledTimes(1));
    expect(previewPackage.mock.calls[0][0]).toEqual({
      projectId: "project-1",
      packageId,
      packageVersion: 1,
      repositoryId: "repository-1",
      ownerMemberId: "member-1",
      owningTeamId: "team-1",
      codeScopeMappings: [
        {
          requestedCodeScope: "apps/marketplace/**",
          codeScopeId: "scope-1",
        },
      ],
      workflowId: "software-change/verified-pr",
      executionEnvironment: "POLICY_SELECTED",
    });
    expect(previewPackage.mock.calls[0][0]).not.toHaveProperty("token");
    expect(previewPackage.mock.calls[0][0]).not.toHaveProperty("url");
    expect(previewPackage.mock.calls[0][0]).not.toHaveProperty("issuerId");

    expect(
      await screen.findByText("Verified draft preview"),
    ).toBeInTheDocument();
    expect(screen.getByText(packageDigest)).toBeInTheDocument();
    expect(screen.getByText(/zero WorkOrders/)).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", {
      name: "Create Mission + Plan drafts",
    });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /no approval, WorkOrder, Attempt, dispatch, publication/i,
      }),
    );
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await waitFor(() => expect(importDrafts).toHaveBeenCalledTimes(1));
    expect(importDrafts.mock.calls[0][0]).toEqual({
      projectId: "project-1",
      packageId,
      packageVersion: 1,
      expectedPackageDigest: packageDigest,
      expectedMappingDigest: mappingDigest,
      repositoryId: "repository-1",
      ownerMemberId: "member-1",
      owningTeamId: "team-1",
      codeScopeMappings: [
        {
          requestedCodeScope: "apps/marketplace/**",
          codeScopeId: "scope-1",
        },
      ],
      workflowId: "software-change/verified-pr",
      executionEnvironment: "POLICY_SELECTED",
    });
    expect(importDrafts.mock.calls[0][0]).not.toHaveProperty("token");
    expect(importDrafts.mock.calls[0][0]).not.toHaveProperty("url");

    expect(
      await screen.findByText("Mission and Plan drafts created"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing was approved, dispatched, published, merged/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Mission draft" }));
    expect(onImported).toHaveBeenCalledWith("mission-1");
  });
});
