import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { UserPlus, Filter, Handshake, Phone, CalendarDays, Target } from "lucide-react";

interface CrmViewProps {
  projectId: Id<"projects"> | null;
}

const CRM_COLUMNS = [
  { id: "prospect", label: "Prospect" },
  { id: "contacted", label: "Contacted" },
  { id: "meeting", label: "Meeting" },
  { id: "proposal", label: "Proposal" },
  { id: "active", label: "Active" },
] as const;

export function CrmView({ projectId }: CrmViewProps) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  if (!agents) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          <div className="h-[620px] animate-pulse rounded-xl border border-line bg-surface-2" />
        </div>
      </main>
    );
  }

  const columnItems: Record<string, typeof agents> = {
    prospect: agents.filter((agent) => agent.status === "IDLE"),
    contacted: agents.filter((agent) => agent.status === "ASSIGNED"),
    meeting: agents.filter((agent) => agent.status === "PAUSED"),
    proposal: agents.filter((agent) => agent.status === "QUARANTINED"),
    active: agents.filter((agent) => agent.status === "ACTIVE"),
  };

  const totalContacts = agents.length;
  const engagedCount = columnItems.contacted.length + columnItems.meeting.length + columnItems.proposal.length;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="CRM"
        description="Track relationship posture, conversation stage, and active commercial motion across your contact pipeline."
        eyebrow="Comms"
        icon={<Handshake size={16} strokeWidth={1.7} />}
        status={<StatusBadge tone="neutral">{totalContacts} contacts</StatusBadge>}
        actions={
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            <Button>
              <UserPlus className="h-4 w-4" />
              Add contact
            </Button>
          </div>
        }
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock label="Pipeline size" value={totalContacts} detail="Current entries represented in the CRM flow" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Engaged" value={engagedCount} detail="Contacts already in live conversation or proposal motion" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Meetings" value={columnItems.meeting.length} detail="Contacts currently waiting on a meeting follow-up" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Active" value={columnItems.active.length} detail="Relationships that are already in active status" />
          </Card>
        </div>

        {totalContacts === 0 ? (
          <Card className="p-5">
            <EmptyState
              icon={Handshake}
              title="No CRM contacts yet"
              description="Add contacts once you are ready to track outreach, meeting posture, and commercial follow-through in one place."
              action={
                <Button>
                  <UserPlus className="h-4 w-4" />
                  Add first contact
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-5">
            {CRM_COLUMNS.map((column) => (
              <Card key={column.id} className="p-4">
                <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                  <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">{column.label}</div>
                  <StatusBadge tone="neutral">{columnItems[column.id].length}</StatusBadge>
                </div>

                <div className="mt-4 space-y-3">
                  {columnItems[column.id].length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-ink-muted">
                      No contacts in this stage
                    </div>
                  ) : (
                    columnItems[column.id].map((agent) => (
                      <div key={agent._id} className="rounded-lg border border-line bg-surface-2 p-3 transition-colors duration-150 hover:border-line-strong">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-1 text-[13px] font-semibold text-ink">
                            {agent.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-medium text-ink">{agent.name}</div>
                            <div className="truncate text-[12px] text-ink-muted">{agent.role}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <StatusBadge tone="neutral">
                            <Target size={12} aria-hidden />
                            {agent.status}
                          </StatusBadge>
                          <StatusBadge tone="neutral">
                            <Phone size={12} aria-hidden />
                            outreach
                          </StatusBadge>
                          <StatusBadge tone="neutral">
                            <CalendarDays size={12} aria-hidden />
                            follow-up
                          </StatusBadge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
