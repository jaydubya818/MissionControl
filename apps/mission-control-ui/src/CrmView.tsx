/**
 * CRM — not available.
 *
 * ## What this view used to do
 *
 * There is no CRM data source in Mission Control: no contacts table, no
 * outreach records, no deal stages. This view queried `agents.listAll` and
 * rendered the *agent fleet* as a sales pipeline — `IDLE` agents appeared under
 * "Prospect", `QUARANTINED` agents under "Proposal", and every card was
 * stamped with static "outreach" and "follow-up" badges that corresponded to
 * nothing. The header read "N contacts" where N was the agent count, and
 * "Engaged" counted assigned + paused + quarantined agents as people in live
 * commercial conversation. "Add contact", "Add first contact" and "Filter" were
 * unwired buttons.
 *
 * An operator reading "3 in Proposal" was reading "3 quarantined agents". That
 * is worse than an empty page, so the page is now honest about being empty.
 * When a real contact model exists, rebuild this against it.
 */

import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Handshake } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

interface CrmViewProps {
  projectId: Id<"projects"> | null;
}

export function CrmView(_props: CrmViewProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="CRM"
        description="Not available in this build."
        eyebrow="Comms"
        icon={<Handshake size={16} strokeWidth={1.7} />}
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        <Card className="p-5">
          <EmptyState
            icon={Handshake}
            title="CRM is not available"
            description="Mission Control has no contact, outreach, or deal model. This page previously displayed the agent fleet styled as a sales pipeline — agent statuses relabelled as pipeline stages — which meant every number on it described something other than what it claimed. It has been withdrawn rather than left in place as a plausible-looking mock."
          />
        </Card>
      </div>
    </section>
  );
}
