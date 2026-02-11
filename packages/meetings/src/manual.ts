/**
 * Manual Meeting Provider
 *
 * Generates markdown meeting documents, structured agendas,
 * calendar-ready payloads, and action item extraction.
 * No external API dependencies.
 */

import type {
  MeetingProvider,
  Meeting,
  MeetingActionItem,
  ScheduleMeetingOptions,
  MeetingResult,
} from "@mission-control/shared";

export class ManualMeetingProvider implements MeetingProvider {
  async scheduleMeeting(options: ScheduleMeetingOptions): Promise<MeetingResult> {
    const agenda = this.buildAgenda(options);
    const calendarPayload = this.buildCalendarPayload(options);

    return {
      meetingId: `manual-${Date.now()}`,
      status: "SCHEDULED",
      agenda,
      calendarPayload,
    };
  }

  async generateAgenda(meeting: Meeting): Promise<string> {
    const date = new Date(meeting.scheduledAt);
    const dateStr = date.toISOString().split("T")[0];
    const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    const participantList = meeting.participants
      .map((p) => {
        const role = p.orgPosition ? ` (${p.orgPosition})` : "";
        const meetingRole = p.role ? ` - ${p.role}` : "";
        return `- ${p.agentId}${role}${meetingRole}`;
      })
      .join("\n");

    return `# ${meeting.title}

**Date:** ${dateStr}
**Time:** ${timeStr}
**Duration:** ${meeting.duration} minutes
**Host:** ${meeting.hostAgentId ?? "TBD"}
**Provider:** ${meeting.provider}

## Participants

${participantList}

## Agenda

${meeting.agenda ?? "1. Opening remarks\n2. Status updates\n3. Discussion items\n4. Action items review\n5. Next steps"}

## Notes

*(To be filled during meeting)*

## Action Items

| # | Description | Owner | Due Date | Status |
|---|---|---|---|---|
| 1 | | | | Pending |

## Follow-Up

- Next meeting: TBD
`;
  }

  async generateNotes(meeting: Meeting): Promise<string> {
    const date = new Date(meeting.scheduledAt);
    const dateStr = date.toISOString().split("T")[0];

    return `# Meeting Notes: ${meeting.title}

**Date:** ${dateStr}
**Attendees:** ${meeting.participants.map((p) => p.agentId).join(", ")}
**Host:** ${meeting.hostAgentId ?? "N/A"}

## Summary

*(Summary of key discussion points)*

## Decisions Made

1. 

## Action Items

${(meeting.actionItems ?? []).map((item, i) => `${i + 1}. ${item.description} — Owner: ${item.assigneeAgentId ?? "TBD"} — Due: ${item.dueAt ? new Date(item.dueAt).toISOString().split("T")[0] : "TBD"}`).join("\n") || "*(None recorded)*"}

## Open Questions

1. 

## Next Steps

- 
`;
  }

  async extractActionItems(notes: string): Promise<MeetingActionItem[]> {
    const items: MeetingActionItem[] = [];

    // Parse action items from markdown notes
    // Look for patterns like "- [ ] Do X (Owner: AgentName, Due: YYYY-MM-DD)"
    // or numbered list items in an "Action Items" section
    const lines = notes.split("\n");
    let inActionSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect action items section
      if (/^#+\s*action\s*items/i.test(trimmed)) {
        inActionSection = true;
        continue;
      }
      // Exit section on next header
      if (inActionSection && /^#+\s/.test(trimmed) && !/action/i.test(trimmed)) {
        inActionSection = false;
        continue;
      }

      if (!inActionSection) continue;

      // Parse list items
      const listMatch = trimmed.match(/^[-*\d.]+\s+(.+)/);
      if (!listMatch) continue;

      const itemText = listMatch[1];
      if (!itemText || itemText.length < 3) continue;

      // Try to extract owner and due date
      const ownerMatch = itemText.match(/(?:owner|assigned?):\s*([\w-]+)/i);
      const dueMatch = itemText.match(/(?:due|by):\s*(\d{4}-\d{2}-\d{2})/i);

      const description = itemText
        .replace(/(?:owner|assigned?):\s*\S+/gi, "")
        .replace(/(?:due|by):\s*\d{4}-\d{2}-\d{2}/gi, "")
        .replace(/[—-]+\s*$/g, "")
        .trim();

      if (description.length > 0) {
        items.push({
          description,
          assigneeAgentId: ownerMatch?.[1],
          dueAt: dueMatch ? new Date(dueMatch[1]).getTime() : undefined,
          completed: false,
        });
      }
    }

    return items;
  }

  async getCalendarPayload(meeting: Meeting): Promise<string> {
    return this.buildCalendarPayload({
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
      duration: meeting.duration,
      hostAgentId: meeting.hostAgentId,
      participants: meeting.participants,
    });
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private buildAgenda(options: ScheduleMeetingOptions): string {
    const topics = options.agendaTopics ?? [
      "Opening remarks and status check",
      "Key discussion items",
      "Blockers and escalations",
      "Action items and next steps",
    ];

    return topics.map((t, i) => `${i + 1}. ${t}`).join("\n");
  }

  private buildCalendarPayload(options: {
    title: string;
    scheduledAt: number;
    duration: number;
    hostAgentId?: string;
    participants: { agentId: string; orgPosition?: string; role?: string }[];
    projectId?: string;
  }): string {
    const start = new Date(options.scheduledAt);
    const end = new Date(options.scheduledAt + options.duration * 60000);

    // iCal-compatible JSON payload
    const payload = {
      summary: options.title,
      dtstart: start.toISOString(),
      dtend: end.toISOString(),
      organizer: options.hostAgentId ?? "Mission Control",
      attendees: options.participants.map((p) => ({
        id: p.agentId,
        role: p.role ?? "attendee",
        orgPosition: p.orgPosition,
      })),
      description: `Mission Control Meeting: ${options.title}`,
      location: "Mission Control Platform",
      uid: `mc-meeting-${Date.now()}@missioncontrol`,
    };

    return JSON.stringify(payload, null, 2);
  }
}
