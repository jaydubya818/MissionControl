import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { TelegraphInbox } from "../TelegraphInbox";
import { MeetingsView } from "../MeetingsView";
import { VoicePanel } from "../VoicePanel";
import { PeopleView } from "../PeopleView";
import { OrgView } from "../OrgView";
import { OfficeView } from "../OfficeView";
import { CrmView } from "../CrmView";

interface CommsSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
}

export function CommsSection({ currentView, projectId }: CommsSectionProps) {
  if (currentView === "telegraph") return <TelegraphInbox projectId={projectId} />;
  if (currentView === "meetings") return <MeetingsView projectId={projectId} />;
  if (currentView === "voice") return <VoicePanel projectId={projectId} />;
  if (currentView === "people") return <PeopleView projectId={projectId} />;
  if (currentView === "org") return <OrgView projectId={projectId} />;
  if (currentView === "office") return <OfficeView projectId={projectId} />;
  if (currentView === "crm") return <CrmView projectId={projectId} />;
  return null;
}
