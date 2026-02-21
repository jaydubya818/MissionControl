/**
 * Meetings View
 *
 * Schedule meetings, view upcoming/past, generate agendas/notes,
 * convert action items to tasks.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "all" | "schedule";

export function MeetingsView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [selectedMeetingId, setSelectedMeetingId] = useState<Id<"meetings"> | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [topics, setTopics] = useState("");

  const allMeetings = useQuery(api.meetings.list, projectId ? { projectId } : {});
  const upcomingMeetings = useQuery(api.meetings.getUpcoming, projectId ? { projectId } : {});
  const selectedMeeting = useQuery(
    api.meetings.get,
    selectedMeetingId ? { meetingId: selectedMeetingId } : "skip"
  );
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  const scheduleMeeting = useMutation(api.meetings.schedule);
  const completeMeeting = useMutation(api.meetings.complete);
  const convertActionItems = useMutation(api.meetings.convertActionItems);

  const handleSchedule = async () => {
    if (!title.trim()) return;
    const topicList = topics.split("\n").filter((t) => t.trim());
    await scheduleMeeting({
      projectId: projectId ?? undefined,
      title: title.trim(),
      scheduledAt: Date.now() + 86400000,
      duration,
      participants: (agents ?? []).slice(0, 5).map((a: any) => ({
        agentId: a._id,
        orgPosition: a.role,
        role: "attendee",
      })),
      agendaTopics: topicList.length > 0 ? topicList : undefined,
    });
    setTitle("");
    setTopics("");
    setTab("upcoming");
  };

  const handleConvert = async () => {
    if (!selectedMeetingId) return;
    await convertActionItems({ meetingId: selectedMeetingId });
  };

  if (selectedMeeting) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <button
          onClick={() => setSelectedMeetingId(null)}
          className="mb-4 border-none bg-transparent text-sm text-primary"
        >
          ← Back to Meetings
        </button>

        <div className="max-w-[700px] rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="m-0 text-foreground">{selectedMeeting.title}</h3>
            <span
              className={cn(
                "rounded px-2.5 py-0.5 text-xs font-semibold",
                selectedMeeting.status === "COMPLETED" && "bg-emerald-500/15 text-emerald-500",
                selectedMeeting.status === "SCHEDULED" && "bg-primary/15 text-primary",
                selectedMeeting.status === "CANCELLED" && "bg-muted text-muted-foreground",
                selectedMeeting.status !== "COMPLETED" &&
                  selectedMeeting.status !== "SCHEDULED" &&
                  selectedMeeting.status !== "CANCELLED" &&
                  "bg-amber-500/15 text-amber-500"
              )}
            >
              {selectedMeeting.status}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground/70">Date</div>
              <div className="text-foreground">{new Date(selectedMeeting.scheduledAt).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground/70">Duration</div>
              <div className="text-foreground">{selectedMeeting.duration} min</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground/70">Host</div>
              <div className="text-foreground">{selectedMeeting.hostAgentId ?? "TBD"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground/70">Provider</div>
              <div className="text-foreground">{selectedMeeting.provider}</div>
            </div>
          </div>

          <h4 className="mb-2 text-muted-foreground">Participants</h4>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {selectedMeeting.participants.map((p: any, i: number) => (
              <span
                key={i}
                className="rounded border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {p.agentId} {p.orgPosition ? `(${p.orgPosition})` : ""}
              </span>
            ))}
          </div>

          {selectedMeeting.agenda && (
            <>
              <h4 className="mb-2 text-muted-foreground">Agenda</h4>
              <pre className="mb-4 whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
                {selectedMeeting.agenda}
              </pre>
            </>
          )}

          {selectedMeeting.actionItems && selectedMeeting.actionItems.length > 0 && (
            <>
              <h4 className="mb-2 text-muted-foreground">Action Items</h4>
              {selectedMeeting.actionItems.map((item: any, i: number) => (
                <div
                  key={i}
                  className="mb-1.5 flex items-center gap-2.5 rounded-md border border-border bg-background p-2.5"
                >
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      item.completed ? "text-emerald-500" : "text-foreground"
                    )}
                  >
                    {item.description}
                  </span>
                  {item.assigneeAgentId && (
                    <span className="text-xs text-muted-foreground/70">→ {item.assigneeAgentId}</span>
                  )}
                  {item.taskId && (
                    <span className="text-xs font-semibold text-emerald-500">Task Created</span>
                  )}
                </div>
              ))}
              <button
                onClick={handleConvert}
                className="mt-2.5 rounded-md border-none bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Convert Action Items to Tasks
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="m-0 text-foreground">Meetings</h2>
        <div className="flex gap-2">
          {(["upcoming", "all", "schedule"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md border px-3.5 py-1.5 text-sm font-semibold capitalize",
                tab === t
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-transparent text-muted-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "schedule" && (
        <div className="max-w-[500px] rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-foreground">Schedule Meeting</h3>
          <label className="mb-1.5 block text-sm text-muted-foreground">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Meeting title..."
            className="mb-3.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
          <label className="mb-1.5 block text-sm text-muted-foreground">Duration (min)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mb-3.5 w-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
          <label className="mb-1.5 block text-sm text-muted-foreground">Agenda Topics (one per line)</label>
          <textarea
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            rows={4}
            placeholder="Topic 1\nTopic 2\n..."
            className="mb-3.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={handleSchedule}
            disabled={!title.trim()}
            className="rounded-md border-none bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white"
          >
            Schedule
          </button>
        </div>
      )}

      {(tab === "upcoming" || tab === "all") && (
        <div className="flex flex-col gap-2">
          {(tab === "upcoming" ? upcomingMeetings : allMeetings)?.map((m: any) => (
            <div
              key={m._id}
              onClick={() => setSelectedMeetingId(m._id)}
              className="cursor-pointer rounded-lg border border-border bg-card p-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{m.title}</span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[0.7rem] font-semibold",
                    m.status === "COMPLETED"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-primary/15 text-primary"
                  )}
                >
                  {m.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground/70">
                {new Date(m.scheduledAt).toLocaleDateString()} · {m.duration} min · {m.participants.length} participants · {m.provider}
              </div>
            </div>
          ))}
          {(tab === "upcoming" ? upcomingMeetings : allMeetings)?.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground/70">
              {tab === "upcoming" ? "No upcoming meetings." : "No meetings found."}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
