/**
 * Voice Panel
 *
 * "Talk as Agent" panel: select agent, enter text, synthesize TTS,
 * play audio with avatar animation, log transcript.
 */

import { useState, useRef } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
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
  accentPurple: "#8b5cf6",
};

export function VoicePanel({ projectId }: { projectId: Id<"projects"> | null }) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [text, setText] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const artifacts = useQuery(api.voice.listArtifacts, selectedAgentId ? { agentId: selectedAgentId, limit: 20 } : { limit: 20 });
  const synthesize = useAction(api.voice.synthesize);

  const selectedAgent = agents?.find((a: any) => a._id === selectedAgentId);

  const handleSynthesize = async () => {
    if (!text.trim()) return;
    setError(null);
    setSynthesizing(true);
    try {
      await synthesize({
        text: text.trim(),
        agentId: selectedAgentId || undefined,
        projectId: projectId ?? undefined,
      });
      setText("");
    } catch (err: any) {
      setError(err.message ?? "Synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <h2 style={{ color: colors.textPrimary, marginBottom: 20 }}>Voice Panel</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 1000 }}>
        {/* Synthesis Panel */}
        <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, padding: 20 }}>
          <h3 style={{ color: colors.textPrimary, margin: "0 0 16px 0", fontSize: "1rem" }}>Talk as Agent</h3>

          <label style={{ color: colors.textSecondary, fontSize: "0.85rem", marginBottom: 6, display: "block" }}>
            Select Agent
          </label>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid " + colors.border,
              background: colors.bgInput,
              color: colors.textPrimary,
              fontSize: "0.9rem",
              marginBottom: 16,
            }}
          >
            <option value="">Any Agent</option>
            {agents?.map((a: any) => (
              <option key={a._id} value={a._id}>
                {a.emoji ?? "🤖"} {a.name}
              </option>
            ))}
          </select>

          {/* Avatar */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: colors.bgInput,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "3rem",
              margin: "0 auto 16px",
              border: speaking ? `3px solid ${colors.accentBlue}` : `3px solid ${colors.border}`,
              boxShadow: speaking ? `0 0 20px ${colors.accentBlue}44` : "none",
              transition: "all 0.3s ease",
              transform: speaking ? "scale(1.05)" : "scale(1)",
            }}
          >
            {selectedAgent?.emoji ?? "🤖"}
          </div>

          <label style={{ color: colors.textSecondary, fontSize: "0.85rem", marginBottom: 6, display: "block" }}>
            Message
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type the message for the agent to speak..."
            rows={4}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid " + colors.border,
              background: colors.bgInput,
              color: colors.textPrimary,
              fontSize: "0.9rem",
              resize: "vertical",
              marginBottom: 12,
            }}
          />

          {error && (
            <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: 12 }}>{error}</div>
          )}

          <button
            onClick={handleSynthesize}
            disabled={synthesizing || !text.trim()}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 6,
              border: "none",
              background: synthesizing ? colors.textMuted : colors.accentPurple,
              color: "#fff",
              cursor: synthesizing ? "wait" : "pointer",
              fontSize: "0.9rem",
              fontWeight: 700,
            }}
          >
            {synthesizing ? "Synthesizing..." : "Speak"}
          </button>
        </div>

        {/* Transcript Log */}
        <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, padding: 20 }}>
          <h3 style={{ color: colors.textPrimary, margin: "0 0 16px 0", fontSize: "1rem" }}>Transcript Log</h3>

          {!artifacts?.length && (
            <div style={{ color: colors.textMuted, textAlign: "center", padding: 40, fontSize: "0.9rem" }}>
              No voice artifacts yet. Synthesize speech to see transcripts here.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(artifacts ?? []).map((artifact: any) => (
              <div
                key={artifact._id}
                style={{
                  background: colors.bgInput,
                  border: "1px solid " + colors.border,
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div style={{ color: colors.textPrimary, fontSize: "0.85rem", marginBottom: 6 }}>
                  {artifact.text}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                    {artifact.provider} · {artifact.voiceId ?? "default"}
                    {artifact.durationMs ? ` · ${(artifact.durationMs / 1000).toFixed(1)}s` : ""}
                  </span>
                  <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                    {new Date(artifact._creationTime).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <audio ref={audioRef} style={{ display: "none" }} />
    </main>
  );
}
