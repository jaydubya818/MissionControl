import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthRuntimeProvider } from "../../src/auth/AuthRuntimeContext";
import { MissionDraftForm } from "../../src/eos/views/MissionDraftForm";
import { SofieOwnerReview } from "../../src/eos/views/SofieOwnerReview";
import { FactoryOverviewView } from "../../src/controlPlane/FactoryOverviewView";
import { WorkflowMetrics } from "../../src/WorkflowMetrics";
import { WorkflowSelector } from "../../src/WorkflowSelector";
import { DirectoryView } from "../../src/DirectoryView";
import { OfficeView } from "../../src/OfficeView";
import { ContentPipelineView } from "../../src/ContentPipelineView";
import { AgentRegistryView } from "../../src/AgentRegistryView";
import { AddPersonModal } from "../../src/AddPersonModal";
import "./style.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "dark";
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-app p-4 text-ink">
    <h1 className="mb-4 text-xl">
      UI component fixture — no authenticated owner authority
    </h1>
    <AuthRuntimeProvider
      value={{
        mode: params.get("scenario") === "signed-out" ? "legacy" : "clerk",
      }}
    >
      <BrowserRouter>
        <output id="fixture-navigation" aria-label="Selected view" />
        {params.get("view") === "directory" ? <DirectoryView projectId={"project-ui-fixture" as any} /> : params.get("view") === "office" ? <OfficeView projectId={"project-ui-fixture" as any} /> : params.get("view") === "content" ? <ContentPipelineView projectId={"project-ui-fixture" as any} /> : params.get("view") === "agents" ? <AgentRegistryView projectId={"project-ui-fixture" as any} /> : params.get("view") === "member" ? <AddPersonModal open onClose={() => undefined} projectId={null} /> : params.get("view") === "factory-overview" ? <FactoryOverviewView projectId={"project-ui-fixture" as any} onNavigate={view => { document.getElementById("fixture-navigation")!.textContent = view; }} /> : params.get("view") === "metrics" ? <WorkflowMetrics projectId={params.get("scenario") === "missing-workspace" ? undefined : "project-ui-fixture" as any} /> : params.get("view") === "workflow-selector" ? <WorkflowSelector projectId={params.get("scenario") === "missing-workspace" ? undefined : "project-ui-fixture" as any} onClose={() => undefined} /> : params.get("view") === "mission-draft" ? <MissionDraftForm projectId={"project-ui-fixture" as any} mission={{
          _id:"mission-ui-fixture", state:"DRAFT", title:"Draft environment qualification", objective:"Review explicit execution setup", stopCondition:"Stop before execution",
          owner:"Fixture owner", ownerMemberId:"member-ui-fixture", owningTeamId:"team-ui-fixture", repositoryId:"repo-ui-fixture", codeScopeIds:["scope-ui-fixture"], budgetUsd:0,
        }} /> : <SofieOwnerReview projectId={"project-ui-fixture" as any} />}
      </BrowserRouter>
    </AuthRuntimeProvider>
  </main>,
);
