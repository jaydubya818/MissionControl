import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { CalendarDays, ArrowLeft, CheckCircle2 } from "lucide-react";

type Tab = "upcoming" | "all" | "schedule";

const MEETING_STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "error" | "info"> = {
  COMPLETED: "success",
  SCHEDULED: "info",
  IN_PROGRESS: "info",
  CANCELED: "neutral",
};

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
  const convertActionItems = useMutation(api.meetings.convertActionItems);

  const meetings = allMeetings ?? [];
  const upcoming = upcomingMeetings ?? [];
  const completedMeetings = meetings.filter((meeting) => meeting.status === "COMPLETED").length;
  const scheduledParticipants = upcoming.reduce((sum, meeting) => sum + meeting.participants.length, 0);
  const averageDuration = meetings.length > 0
    ? Math.round(meetings.reduce((sum, meeting) => sum + meeting.duration, 0) / meetings.length)
    : 0;

  const visibleMeetings = tab === "upcoming" ? upcoming : meetings;

  const selectedActionItems = useMemo(
    () => selectedMeeting?.actionItems ?? [],
    [selectedMeeting]
  );

  const handleSchedule = async () => {
    if (!title.trim()) return;
    const topicList = topics.split("\n").map((topic) => topic.trim()).filter(Boolean);
    await scheduleMeeting({
      projectId: projectId ?? undefined,
      title: title.trim(),
      scheduledAt: Date.now() + 86_400_000,
      duration,
      participants: (agents ?? []).slice(0, 5).map((agent) => ({
        agentId: agent._id,
        orgPosition: agent.role,
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
    const pendingActionItems = selectedActionItems.filter((item) => !item.taskId).length;

    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title={selectedMeeting.title}
          description="Review agenda, attendees, and follow-through before leaving the meeting thread."
          eyebrow="Comms"
          icon={<CalendarDays size={16} strokeWidth={1.7} />}
          status={
            <StatusBadge tone={MEETING_STATUS_TONE[selectedMeeting.status] ?? "neutral"}>
              {selectedMeeting.status}
            </StatusBadge>
          }
          actions={
            <Button size="sm" variant="outline" onClick={() => setSelectedMeetingId(null)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to meetings
            </Button>
          }
        />
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <MetricBlock
                label="Scheduled"
                value={new Date(selectedMeeting.scheduledAt).toLocaleDateString()}
                detail="Meeting date and handoff checkpoint"
              />
            </Card>
            <Card className="p-4">
              <MetricBlock
                label="Duration"
                value={`${selectedMeeting.duration}m`}
                detail="Reserved operator and agent time"
              />
            </Card>
            <Card className="p-4">
              <MetricBlock
                label="Participants"
                value={selectedMeeting.participants.length}
                detail="People or agents expected in the room"
              />
            </Card>
            <Card className="p-4">
              <MetricBlock
                label="Action items"
                value={pendingActionItems}
                detail="Items that still need a task or explicit owner"
              />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="text-[12.5px] font-medium text-ink-secondary">Session facts</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <InfoCell label="Host" value={selectedMeeting.hostAgentId ?? "TBD"} />
                    <InfoCell label="Provider" value={selectedMeeting.provider} />
                    <InfoCell
                      label="Scheduled at"
                      value={new Date(selectedMeeting.scheduledAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    />
                    <InfoCell label="Status" value={selectedMeeting.status} />
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="text-[12.5px] font-medium text-ink-secondary">Participants</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedMeeting.participants.map((participant, index) => (
                      <StatusBadge key={`${participant.agentId}-${index}`} tone="neutral">
                        {participant.agentId} {participant.orgPosition ? `· ${participant.orgPosition}` : ""}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              </div>

              {selectedMeeting.agenda && (
                <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                  <div className="text-[12.5px] font-medium text-ink-secondary">Agenda</div>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-ink-secondary">
                    {selectedMeeting.agenda}
                  </pre>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] font-medium text-ink-secondary">Action register</div>
                    <div className="mt-1 text-[15px] font-semibold text-ink">Turn meeting outcomes into tracked execution</div>
                  </div>
                  {selectedActionItems.length > 0 ? (
                    <Button size="sm" variant="default" onClick={handleConvert}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Convert to tasks
                    </Button>
                  ) : null}
                </div>

                {selectedActionItems.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-line px-4 py-8 text-center text-[13.5px] text-ink-muted">
                    No action items recorded yet.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {selectedActionItems.map((item, index) => (
                      <div
                        key={`${item.description}-${index}`}
                        className="rounded-lg border border-line bg-surface-1 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[13.5px] text-ink">{item.description}</div>
                          {item.taskId ? (
                            <StatusBadge tone="success">Task created</StatusBadge>
                          ) : (
                            <StatusBadge tone="warning">Needs routing</StatusBadge>
                          )}
                        </div>
                        <div className="mt-2 text-[12.5px] text-ink-muted">
                          {item.assigneeAgentId ? `Assigned to ${item.assigneeAgentId}` : "No assignee yet"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-[12.5px] font-medium text-ink-secondary">Operator notes</div>
              <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
                <p>Meetings should end with explicit ownership, not just discussion. If an item matters, convert it into a task before the room closes.</p>
                <p>Use this view to check whether the agenda mapped to execution and whether any task still needs a human decision.</p>
              </div>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Meetings"
        description="Scheduled conversations, review syncs, and agenda-driven operator sessions."
        eyebrow="Comms"
        icon={<CalendarDays size={16} strokeWidth={1.7} />}
        status={
          <StatusBadge tone="neutral">{upcoming.length} upcoming</StatusBadge>
        }
        actions={
          <div className="flex rounded-lg border border-line p-0.5" role="tablist">
            {(["upcoming", "all", "schedule"] as Tab[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12.5px] capitalize transition-colors duration-150",
                  tab === value
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:text-ink-secondary"
                )}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Upcoming"
              value={upcoming.length}
              detail="Meetings still ahead on the calendar"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="All meetings"
              value={meetings.length}
              detail="Recorded sessions across this project"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Participants booked"
              value={scheduledParticipants}
              detail="People or agents attached to upcoming sessions"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Average duration"
              value={`${averageDuration}m`}
              detail={`${completedMeetings} meetings completed so far`}
            />
          </Card>
        </div>

        {tab === "schedule" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="p-5">
              <div className="text-[12.5px] font-medium text-ink-secondary">Schedule a meeting</div>
              <div className="mt-1 text-[15px] font-semibold text-ink">Create a session with a title, duration, and agenda seeds</div>
              <div className="mt-4 grid gap-4">
                <Field label="Title">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Weekly operator review"
                    className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
                  />
                </Field>
                <Field label="Duration">
                  <input
                    type="number"
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className="h-9 w-36 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
                  />
                </Field>
                <Field label="Agenda topics">
                  <textarea
                    value={topics}
                    onChange={(event) => setTopics(event.target.value)}
                    rows={6}
                    placeholder={"Review blockers\nDecide approvals\nRoute next work"}
                    className="w-full rounded-lg border border-line bg-surface-1 px-3 py-3 text-[13.5px] text-ink placeholder:text-ink-muted"
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <Button onClick={handleSchedule} disabled={!title.trim()} variant="default">
                    Schedule meeting
                  </Button>
                  <div className="text-[12.5px] text-ink-muted">New meetings default to tomorrow until a dedicated picker is added.</div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-[12.5px] font-medium text-ink-secondary">Scheduling guidance</div>
              <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
                <p>Use meetings for decisions, review, and routing. Do not use them as a substitute for well-scoped tasks.</p>
                <p>A good agenda ends in explicit action items that can be converted into tasks immediately after the session.</p>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="p-5">
              <div className="text-[12.5px] font-medium text-ink-secondary">{tab === "upcoming" ? "Upcoming meetings" : "All meetings"}</div>
              <div className="mt-1 text-[15px] font-semibold text-ink">
                {tab === "upcoming" ? "What the team is about to discuss" : "Past and future conversations in one register"}
              </div>
              {visibleMeetings.length === 0 ? (
                <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-10 text-center">
                  <div className="text-[15px] font-semibold text-ink">
                    {tab === "upcoming" ? "No upcoming meetings" : "No meetings found"}
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-muted">
                    Schedule a review session to keep decisions and follow-through explicit.
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {visibleMeetings.map((meeting) => (
                    <button
                      key={meeting._id}
                      type="button"
                      onClick={() => setSelectedMeetingId(meeting._id)}
                      className="w-full rounded-xl border border-line bg-surface-2 p-4 text-left transition-colors duration-150 hover:border-line-strong"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium text-ink">{meeting.title}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
                            <span>{new Date(meeting.scheduledAt).toLocaleDateString()}</span>
                            <span>·</span>
                            <span>{meeting.duration} min</span>
                            <span>·</span>
                            <span>{meeting.participants.length} participants</span>
                            <span>·</span>
                            <span>{meeting.provider}</span>
                          </div>
                        </div>
                        <StatusBadge tone={MEETING_STATUS_TONE[meeting.status] ?? "neutral"}>
                          {meeting.status}
                        </StatusBadge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="text-[12.5px] font-medium text-ink-secondary">Operator guidance</div>
              <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
                <p>Keep recurring syncs short and agenda-driven. If a meeting does not produce decisions or task routing, it is probably noise.</p>
                <p>Use the detail view to convert action items into tasks before the meeting trail goes stale.</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11.5px] text-ink-muted">{label}</div>
      <div className="mt-1 text-[13.5px] text-ink">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[12.5px] font-medium text-ink-secondary">{label}</div>
      {children}
    </label>
  );
}
