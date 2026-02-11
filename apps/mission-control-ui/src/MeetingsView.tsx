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

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgInput: "#0f172a",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentPurple: "#8b5cf6",
};

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
      scheduledAt: Date.now() + 86400000, // tomorrow
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
      <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
        <button
          onClick={() => setSelectedMeetingId(null)}
          style={{ background: "none", border: "none", color: colors.accentBlue, cursor: "pointer", marginBottom: 16, fontSize: "0.85rem" }}
        >
          ← Back to Meetings
        </button>

        <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, padding: 20, maxWidth: 700 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ color: colors.textPrimary, margin: 0 }}>{selectedMeeting.title}</h3>
            <span style={{
              padding: "3px 10px",
              borderRadius: 4,
              fontSize: "0.75rem",
              fontWeight: 600,
              background:
                selectedMeeting.status === "COMPLETED" ? colors.accentGreen + "22" :
                selectedMeeting.status === "SCHEDULED" ? colors.accentBlue + "22" :
                selectedMeeting.status === "CANCELLED" ? colors.textMuted + "22" :
                colors.accentOrange + "22",
              color:
                selectedMeeting.status === "COMPLETED" ? colors.accentGreen :
                selectedMeeting.status === "SCHEDULED" ? colors.accentBlue :
                selectedMeeting.status === "CANCELLED" ? colors.textMuted :
                colors.accentOrange,
            }}>
              {selectedMeeting.status}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ color: colors.textMuted, fontSize: "0.8rem" }}>Date</div>
              <div style={{ color: colors.textPrimary }}>{new Date(selectedMeeting.scheduledAt).toLocaleDateString()}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted, fontSize: "0.8rem" }}>Duration</div>
              <div style={{ color: colors.textPrimary }}>{selectedMeeting.duration} min</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted, fontSize: "0.8rem" }}>Host</div>
              <div style={{ color: colors.textPrimary }}>{selectedMeeting.hostAgentId ?? "TBD"}</div>
            </div>
            <div>
              <div style={{ color: colors.textMuted, fontSize: "0.8rem" }}>Provider</div>
              <div style={{ color: colors.textPrimary }}>{selectedMeeting.provider}</div>
            </div>
          </div>

          <h4 style={{ color: colors.textSecondary, marginBottom: 8 }}>Participants</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {selectedMeeting.participants.map((p: any, i: number) => (
              <span key={i} style={{
                padding: "3px 10px",
                borderRadius: 4,
                background: colors.bgInput,
                border: "1px solid " + colors.border,
                color: colors.textSecondary,
                fontSize: "0.8rem",
              }}>
                {p.agentId} {p.orgPosition ? `(${p.orgPosition})` : ""}
              </span>
            ))}
          </div>

          {selectedMeeting.agenda && (
            <>
              <h4 style={{ color: colors.textSecondary, marginBottom: 8 }}>Agenda</h4>
              <pre style={{
                color: colors.textSecondary,
                fontSize: "0.85rem",
                whiteSpace: "pre-wrap",
                background: colors.bgInput,
                padding: 12,
                borderRadius: 6,
                border: "1px solid " + colors.border,
                marginBottom: 16,
              }}>
                {selectedMeeting.agenda}
              </pre>
            </>
          )}

          {selectedMeeting.actionItems && selectedMeeting.actionItems.length > 0 && (
            <>
              <h4 style={{ color: colors.textSecondary, marginBottom: 8 }}>Action Items</h4>
              {selectedMeeting.actionItems.map((item: any, i: number) => (
                <div key={i} style={{
                  background: colors.bgInput,
                  border: "1px solid " + colors.border,
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <span style={{ color: item.completed ? colors.accentGreen : colors.textPrimary, fontSize: "0.85rem", flex: 1 }}>
                    {item.description}
                  </span>
                  {item.assigneeAgentId && (
                    <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>→ {item.assigneeAgentId}</span>
                  )}
                  {item.taskId && (
                    <span style={{ color: colors.accentGreen, fontSize: "0.75rem", fontWeight: 600 }}>Task Created</span>
                  )}
                </div>
              ))}
              <button
                onClick={handleConvert}
                style={{
                  marginTop: 10,
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: colors.accentGreen,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
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
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: colors.textPrimary, margin: 0 }}>Meetings</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {(["upcoming", "all", "schedule"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid " + (tab === t ? colors.accentBlue : colors.border),
                background: tab === t ? colors.accentBlue + "22" : "transparent",
                color: tab === t ? colors.accentBlue : colors.textSecondary,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "schedule" && (
        <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, padding: 20, maxWidth: 500 }}>
          <h3 style={{ color: colors.textPrimary, margin: "0 0 16px" }}>Schedule Meeting</h3>
          <label style={{ color: colors.textSecondary, fontSize: "0.85rem", display: "block", marginBottom: 6 }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title..." style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid " + colors.border, background: colors.bgInput, color: colors.textPrimary, fontSize: "0.9rem", marginBottom: 14, outline: "none",
          }} />
          <label style={{ color: colors.textSecondary, fontSize: "0.85rem", display: "block", marginBottom: 6 }}>Duration (min)</label>
          <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{
            width: 100, padding: "8px 12px", borderRadius: 6, border: "1px solid " + colors.border, background: colors.bgInput, color: colors.textPrimary, fontSize: "0.9rem", marginBottom: 14, outline: "none",
          }} />
          <label style={{ color: colors.textSecondary, fontSize: "0.85rem", display: "block", marginBottom: 6 }}>Agenda Topics (one per line)</label>
          <textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={4} placeholder="Topic 1\nTopic 2\n..." style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid " + colors.border, background: colors.bgInput, color: colors.textPrimary, fontSize: "0.9rem", marginBottom: 14, resize: "vertical",
          }} />
          <button onClick={handleSchedule} disabled={!title.trim()} style={{
            padding: "10px 20px", borderRadius: 6, border: "none", background: colors.accentGreen, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
          }}>
            Schedule
          </button>
        </div>
      )}

      {(tab === "upcoming" || tab === "all") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(tab === "upcoming" ? upcomingMeetings : allMeetings)?.map((m: any) => (
            <div
              key={m._id}
              onClick={() => setSelectedMeetingId(m._id)}
              style={{
                background: colors.bgCard,
                border: "1px solid " + colors.border,
                borderRadius: 8,
                padding: 14,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{m.title}</span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  background: m.status === "COMPLETED" ? colors.accentGreen + "22" : colors.accentBlue + "22",
                  color: m.status === "COMPLETED" ? colors.accentGreen : colors.accentBlue,
                }}>
                  {m.status}
                </span>
              </div>
              <div style={{ color: colors.textMuted, fontSize: "0.8rem", marginTop: 4 }}>
                {new Date(m.scheduledAt).toLocaleDateString()} · {m.duration} min · {m.participants.length} participants · {m.provider}
              </div>
            </div>
          ))}
          {(tab === "upcoming" ? upcomingMeetings : allMeetings)?.length === 0 && (
            <div style={{ color: colors.textMuted, textAlign: "center", padding: 40, background: colors.bgCard, borderRadius: 8, border: "1px solid " + colors.border }}>
              {tab === "upcoming" ? "No upcoming meetings." : "No meetings found."}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
