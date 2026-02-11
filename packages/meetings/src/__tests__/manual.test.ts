/**
 * Manual Meeting Provider Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ManualMeetingProvider } from "../manual";
import type { Meeting } from "@mission-control/shared";

const baseMeeting: Meeting = {
  _id: "meeting-1",
  _creationTime: Date.now(),
  title: "Sprint Review",
  scheduledAt: new Date("2026-02-10T14:00:00Z").getTime(),
  duration: 60,
  status: "SCHEDULED",
  hostAgentId: "agent-ceo",
  participants: [
    { agentId: "agent-ceo", orgPosition: "CEO", role: "host" },
    { agentId: "agent-lead", orgPosition: "LEAD", role: "presenter" },
    { agentId: "agent-dev", orgPosition: "SPECIALIST", role: "attendee" },
  ],
  provider: "MANUAL",
};

describe("ManualMeetingProvider", () => {
  let provider: ManualMeetingProvider;

  beforeEach(() => {
    provider = new ManualMeetingProvider();
  });

  describe("scheduleMeeting", () => {
    it("should return a meeting result with agenda and calendar payload", async () => {
      const result = await provider.scheduleMeeting({
        title: "Sprint Planning",
        scheduledAt: Date.now() + 86400000,
        duration: 30,
        hostAgentId: "agent-ceo",
        participants: [
          { agentId: "agent-ceo", role: "host" },
          { agentId: "agent-lead", role: "attendee" },
        ],
        agendaTopics: ["Status check", "Blockers", "Next sprint goals"],
      });

      expect(result.status).toBe("SCHEDULED");
      expect(result.meetingId).toMatch(/^manual-/);
      expect(result.agenda).toContain("Status check");
      expect(result.agenda).toContain("Blockers");
      expect(result.calendarPayload).toBeTruthy();

      const calendar = JSON.parse(result.calendarPayload);
      expect(calendar.summary).toBe("Sprint Planning");
      expect(calendar.attendees).toHaveLength(2);
    });

    it("should use default topics when none provided", async () => {
      const result = await provider.scheduleMeeting({
        title: "Quick Sync",
        scheduledAt: Date.now(),
        duration: 15,
        participants: [],
      });

      expect(result.agenda).toContain("Opening remarks");
    });
  });

  describe("generateAgenda", () => {
    it("should produce a markdown agenda with participants", async () => {
      const agenda = await provider.generateAgenda(baseMeeting);

      expect(agenda).toContain("# Sprint Review");
      expect(agenda).toContain("agent-ceo");
      expect(agenda).toContain("(CEO)");
      expect(agenda).toContain("Participants");
      expect(agenda).toContain("60 minutes");
    });
  });

  describe("generateNotes", () => {
    it("should produce a notes template", async () => {
      const meetingWithItems = {
        ...baseMeeting,
        actionItems: [
          { description: "Fix login bug", assigneeAgentId: "agent-dev", completed: false },
          { description: "Update docs", completed: false },
        ],
      };

      const notes = await provider.generateNotes(meetingWithItems);

      expect(notes).toContain("Meeting Notes:");
      expect(notes).toContain("Sprint Review");
      expect(notes).toContain("Fix login bug");
      expect(notes).toContain("agent-dev");
    });
  });

  describe("extractActionItems", () => {
    it("should parse action items from markdown notes", async () => {
      const notes = `
# Meeting Notes

## Summary
Good discussion about upcoming features.

## Action Items
- Implement user auth (Owner: agent-dev, Due: 2026-02-15)
- Update deployment docs (Owner: agent-ops)
- Review security checklist

## Open Questions
- TBD
`;
      const items = await provider.extractActionItems(notes);

      expect(items).toHaveLength(3);
      expect(items[0].description).toContain("Implement user auth");
      expect(items[0].assigneeAgentId).toBe("agent-dev");
      expect(items[0].dueAt).toBeTruthy();
      expect(items[1].description).toContain("Update deployment docs");
      expect(items[1].assigneeAgentId).toBe("agent-ops");
      expect(items[2].description).toContain("Review security checklist");
      expect(items[2].assigneeAgentId).toBeUndefined();
    });

    it("should return empty array for notes without action items", async () => {
      const notes = "# Meeting Notes\n\nJust a general discussion.";
      const items = await provider.extractActionItems(notes);
      expect(items).toHaveLength(0);
    });
  });

  describe("getCalendarPayload", () => {
    it("should return valid JSON calendar payload", async () => {
      const payload = await provider.getCalendarPayload(baseMeeting);
      const parsed = JSON.parse(payload);

      expect(parsed.summary).toBe("Sprint Review");
      expect(parsed.dtstart).toBeTruthy();
      expect(parsed.dtend).toBeTruthy();
      expect(parsed.attendees).toHaveLength(3);
      expect(parsed.uid).toMatch(/@missioncontrol$/);

      // Verify duration
      const start = new Date(parsed.dtstart).getTime();
      const end = new Date(parsed.dtend).getTime();
      expect(end - start).toBe(60 * 60000); // 60 minutes
    });
  });
});
