import { FileInput, Target } from "lucide-react";
import { useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "../../components/factory/DetailLayout";
import { StatusBadge } from "../../components/factory/badges";
import { EmptyState } from "../../components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { ProvenanceBadge } from "../components";
import { missionDetailPath } from "../missionRoutes";
import { presentMissionState } from "../missionPresentation";
import { CreateFactoryMissionDialog } from "../../factoryExperience/CreateFactoryMissionDialog";
import { ExperienceLevelSelector } from "../../factoryExperience/ExperienceLevelSelector";
import { useFactoryExperienceLevel } from "../../factoryExperience/useFactoryExperienceLevel";
import { FactoryPackageImportDialog } from "../../factoryExperience/FactoryPackageImportDialog";

export interface MissionPortfolioViewProps {
  projectId: Id<"projects">;
}

function MissionCard({
  mission,
  onOpen,
}: {
  mission: any;
  onOpen: () => void;
}) {
  const assertionProgress =
    mission.assertionCount === 0
      ? "No contract yet"
      : `${mission.assertionCount} assertions`;
  const presentation = presentMissionState(mission.state);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4 text-left transition-colors duration-150 hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink">
            {mission.title}
          </div>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">
            {mission.objective}
          </p>
        </div>
        <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
      </div>
      <div className="text-[12.5px] text-ink-secondary">
        {presentation.health}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5 text-[12px] text-ink-muted">
        <span>
          {mission.workOrderCount} work orders · {assertionProgress}
        </span>
        <ProvenanceBadge
          provenance="convex"
          variant="dot"
          className="shrink-0"
        />
      </div>
    </button>
  );
}

export function MissionPortfolioView({
  projectId,
}: MissionPortfolioViewProps): JSX.Element {
  const missions = useQuery(api.missions.list, { projectId });
  const navigate = useNavigate();
  const location = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [factoryImportOpen, setFactoryImportOpen] = useState(false);
  const [experienceLevel, setExperienceLevel] = useFactoryExperienceLevel();
  const qualification = useQuery(
    api.factoryPackageImports.qualificationStatus,
    { projectId },
  );
  const factoryLink = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      packageId: params.get("factoryPackageId") ?? "",
      packageVersion: params.get("factoryPackageVersion") ?? "1",
      requestedCodeScopes: params.getAll("factoryCodeScope"),
    };
  }, [location.search]);
  const hasFactoryLink = Boolean(factoryLink.packageId);

  useEffect(() => {
    if (hasFactoryLink) setFactoryImportOpen(true);
  }, [hasFactoryLink]);

  const openMission = (missionId: string) => {
    navigate({
      pathname: missionDetailPath(missionId),
      search: location.search,
    });
  };

  const openImportedMission = (missionId: string) => {
    const params = new URLSearchParams(location.search);
    params.delete("factoryPackageId");
    params.delete("factoryPackageVersion");
    params.delete("factoryCodeScope");
    const search = params.toString();
    navigate({
      pathname: missionDetailPath(missionId),
      search: search ? `?${search}` : "",
    });
  };

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <PageHeader
        title="Missions"
        description="Governed outcomes with explicit validation, handoffs, and operator decision gates."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExperienceLevelSelector
              value={experienceLevel}
              onChange={setExperienceLevel}
              compact
            />
            {qualification?.enabled ? (
              <Button
                variant="outline"
                onClick={() => setFactoryImportOpen(true)}
              >
                <FileInput className="mr-1.5 h-4 w-4" />
                Import Factory Engineer draft
              </Button>
            ) : null}
            <Button onClick={() => setCreateOpen(true)}>Define mission</Button>
          </div>
        }
      />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <div className="rounded-xl border border-line bg-surface-1 px-4 py-3 text-[12.5px] text-ink-secondary">
          Live Mission records from Convex. A draft remains non-executable until
          its plan and validation contract are approved.
        </div>
        {missions === undefined ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-xl bg-surface-2"
              />
            ))}
          </div>
        ) : null}
        {missions?.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {missions.map((mission) => (
              <MissionCard
                key={mission._id}
                mission={mission}
                onOpen={() => openMission(mission._id)}
              />
            ))}
          </div>
        ) : null}
        {missions && missions.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Define your first Mission"
            description="Missions turn an approved outcome into serial, evidence-backed WorkOrders."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                Define mission
              </Button>
            }
          />
        ) : null}
      </div>
      <CreateFactoryMissionDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        experienceLevel={experienceLevel}
        onCreated={(mission) => openMission(String(mission._id))}
      />
      <FactoryPackageImportDialog
        key={String(projectId)}
        projectId={projectId}
        open={factoryImportOpen}
        onOpenChange={setFactoryImportOpen}
        initialPackageId={factoryLink.packageId}
        initialPackageVersion={factoryLink.packageVersion}
        initialRequestedCodeScopes={factoryLink.requestedCodeScopes}
        onImported={openImportedMission}
      />
    </div>
  );
}
