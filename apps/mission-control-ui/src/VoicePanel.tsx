/**
 * Voice Panel
 *
 * "Talk as Agent" panel: select agent, enter text, synthesize TTS,
 * play audio with avatar animation, log transcript.
 */

import { useState, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

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
    <main className="flex-1 overflow-auto p-6">
      <h2 className="mb-5 text-foreground">Voice Panel</h2>

      <div className="grid max-w-[1000px] grid-cols-2 gap-6">
        {/* Synthesis Panel */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold text-foreground">Talk as Agent</h3>

          <label className="mb-1.5 block text-sm text-muted-foreground">
            Select Agent
          </label>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
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
            className={cn(
              "mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-background text-5xl transition-all duration-300",
              speaking
                ? "scale-105 border-[3px] border-primary shadow-[0_0_20px_rgba(59,130,246,0.27)]"
                : "border-[3px] border-border"
            )}
          >
            {selectedAgent?.emoji ?? "🤖"}
          </div>

          <label className="mb-1.5 block text-sm text-muted-foreground">
            Message
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type the message for the agent to speak..."
            rows={4}
            className="mb-3 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />

          {error && (
            <div className="mb-3 text-sm text-red-500">{error}</div>
          )}

          <button
            onClick={handleSynthesize}
            disabled={synthesizing || !text.trim()}
            className={cn(
              "w-full rounded-md border-none px-3 py-2.5 text-sm font-bold text-white",
              synthesizing
                ? "cursor-wait bg-muted-foreground/70"
                : "cursor-pointer bg-blue-500"
            )}
          >
            {synthesizing ? "Synthesizing..." : "Speak"}
          </button>
        </div>

        {/* Transcript Log */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold text-foreground">Transcript Log</h3>

          {!artifacts?.length && (
            <div className="p-10 text-center text-sm text-muted-foreground/70">
              No voice artifacts yet. Synthesize speech to see transcripts here.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {(artifacts ?? []).map((artifact: any) => (
              <div
                key={artifact._id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="mb-1.5 text-sm text-foreground">
                  {artifact.text}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground/70">
                    {artifact.provider} · {artifact.voiceId ?? "default"}
                    {artifact.durationMs ? ` · ${(artifact.durationMs / 1000).toFixed(1)}s` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    {new Date(artifact._creationTime).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </main>
  );
}
