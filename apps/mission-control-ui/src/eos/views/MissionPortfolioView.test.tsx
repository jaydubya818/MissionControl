import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { MissionPortfolioView } from "./MissionPortfolioView";

let qualificationEnabled = true;

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    missions: { list: "missions.list" },
    factoryPackageImports: {
      qualificationStatus: "factoryPackageImports.qualificationStatus",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: string) => {
    if (reference === "missions.list") return [];
    if (reference === "factoryPackageImports.qualificationStatus") {
      return { enabled: qualificationEnabled };
    }
    throw new Error(`Unexpected query reference: ${reference}`);
  },
}));

vi.mock("../../factoryExperience/CreateFactoryMissionDialog", () => ({
  CreateFactoryMissionDialog: () => null,
}));

vi.mock("../../factoryExperience/ExperienceLevelSelector", () => ({
  ExperienceLevelSelector: () => null,
}));

vi.mock("../../factoryExperience/useFactoryExperienceLevel", () => ({
  useFactoryExperienceLevel: () => ["intermediate", vi.fn()],
}));

vi.mock("../../factoryExperience/FactoryPackageImportDialog", () => ({
  FactoryPackageImportDialog: (props: {
    open: boolean;
    initialPackageId: string;
    initialPackageVersion: string;
    initialRequestedCodeScopes: string[];
    onImported: (missionId: string) => void;
  }) =>
    props.open ? (
      <div
        role="dialog"
        aria-label="Factory package import"
        data-package-id={props.initialPackageId}
        data-package-version={props.initialPackageVersion}
        data-code-scopes={props.initialRequestedCodeScopes.join("|")}
      >
        <button type="button" onClick={() => props.onImported("mission-1")}>
          Complete mock import
        </button>
      </div>
    ) : null,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

function renderPortfolio(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MissionPortfolioView projectId={"project-1" as Id<"projects">} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("MissionPortfolioView Factory package initiation", () => {
  beforeEach(() => {
    qualificationEnabled = true;
  });

  it("opens a non-secret package deep link without previewing or importing", () => {
    renderPortfolio(
      "/v2/missions?factoryPackageId=12345678-1234-4234-9234-123456789abc&factoryPackageVersion=4&factoryCodeScope=apps%2Fmarketplace%2F**&factoryCodeScope=packages%2Fpayments%2F**&returnTo=portfolio",
    );

    const dialog = screen.getByRole("dialog", {
      name: "Factory package import",
    });
    expect(dialog).toHaveAttribute(
      "data-package-id",
      "12345678-1234-4234-9234-123456789abc",
    );
    expect(dialog).toHaveAttribute("data-package-version", "4");
    expect(dialog).toHaveAttribute(
      "data-code-scopes",
      "apps/marketplace/**|packages/payments/**",
    );
  });

  it("preserves unrelated parameters and removes package parameters after confirmation", () => {
    renderPortfolio(
      "/v2/missions?factoryPackageId=12345678-1234-4234-9234-123456789abc&factoryPackageVersion=4&factoryCodeScope=apps%2Fmarketplace%2F**&returnTo=portfolio",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Complete mock import" }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/v2/missions/mission-1?returnTo=portfolio",
    );
  });

  it("hides manual initiation when the server qualification status is off", () => {
    qualificationEnabled = false;
    renderPortfolio("/v2/missions");

    expect(
      screen.queryByRole("button", {
        name: "Import Factory Engineer draft",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Factory package import" }),
    ).not.toBeInTheDocument();
  });
});
