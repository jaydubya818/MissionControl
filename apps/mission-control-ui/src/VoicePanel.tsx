import { useState, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { Mic, Volume2, Bot, Waves, Loader2 } from "lucide-react";

export function VoicePanel({ projectId }: { projectId: Id<"projects"> | null }) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [text, setText] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const artifacts = useQuery(
    api.voice.listArtifacts,
    selectedAgentId ? { agentId: selectedAgentId, limit: 20 } : { limit: 20 }
  );
  const synthesize = useAction(api.voice.synthesize);

  const selectedAgent = agents?.find((a: any) => a._id === selectedAgentId);
  const artifactList = artifacts ?? [];
  const generatedCount = artifactList.length;
  const totalDuration = artifactList.reduce((sum: number, item: any) => sum + (item.durationMs ?? 0), 0);

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
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Voice"
        description="Generate operator-reviewed voice output, inspect transcripts, and keep spoken interactions attached to a real agent context."
        eyebrow="Comms"
        icon={<Mic size={16} strokeWidth={1.7} />}
        status={
          <StatusBadge tone="neutral">{generatedCount} artifacts</StatusBadge>
        }
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Artifacts"
              value={generatedCount}
              detail="Voice outputs currently retained for review"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Agents available"
              value={agents?.length ?? 0}
              detail="Eligible identities for synthesis routing"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Total duration"
              value={`${(totalDuration / 1000).toFixed(1)}s`}
              detail="Recorded output length in this session scope"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Output posture"
              value={selectedAgent ? "Scoped" : "Open"}
              detail={selectedAgent ? `Targeting ${selectedAgent.name}` : "No agent selected yet"}
            />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[12.5px] font-medium text-ink-secondary">Speech console</div>
                <div className="mt-1 text-[15px] font-semibold text-ink">Talk as an agent with explicit routing</div>
              </div>
              <StatusBadge tone="neutral">Operator-reviewed</StatusBadge>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div
                  className={cn(
                    "mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-line",
                    selectedAgent ? "bg-surface-3 text-ink-secondary" : "bg-surface-1 text-ink-muted"
                  )}
                >
                  <Bot size={32} strokeWidth={1.6} aria-hidden />
                </div>
                <div className="mt-4 text-center">
                  <div className="text-[13.5px] font-medium text-ink">{selectedAgent?.name ?? "Any agent"}</div>
                  <div className="mt-1 text-[12.5px] text-ink-muted">
                    {selectedAgent?.role ?? "Unscoped output"}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[12.5px] font-medium text-ink-secondary">
                    Agent
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink"
                  >
                    <option value="">Any agent</option>
                    {agents?.map((agent: any) => (
                      <option key={agent._id} value={agent._id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12.5px] font-medium text-ink-secondary">
                    Message
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write the exact message the agent should speak. Keep it concise, accurate, and safe to replay."
                    rows={6}
                    className="flex min-h-[148px] w-full rounded-lg border border-line bg-surface-1 px-3 py-3 text-[13.5px] text-ink placeholder:text-ink-muted"
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-err-soft px-3 py-2 text-[13.5px] text-err">
                    {error}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    onClick={handleSynthesize}
                    disabled={synthesizing || !text.trim()}
                    className="min-w-[148px]"
                  >
                    {synthesizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                    {synthesizing ? "Synthesizing" : "Generate voice"}
                  </Button>
                  <Button variant="outline" onClick={() => setText("")} disabled={!text}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-[12.5px] font-medium text-ink-secondary">Operator guidance</div>
            <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
              <div className="rounded-xl border border-line bg-surface-2 px-4 py-4">
                Voice output should be routed through a clear agent identity whenever it leaves the system.
              </div>
              <div className="rounded-xl border border-line bg-surface-2 px-4 py-4">
                Treat transcripts as operational records. If wording matters, write it precisely before synthesis.
              </div>
              <div className="rounded-xl border border-line bg-surface-2 px-4 py-4">
                Keep previews short. Use chat or task comments for long reasoning, then convert only the final spoken output here.
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[12.5px] font-medium text-ink-secondary">Transcript log</div>
              <div className="mt-1 text-[15px] font-semibold text-ink">Recent voice artifacts</div>
            </div>
            <StatusBadge tone="neutral">Reviewable history</StatusBadge>
          </div>

          {artifactList.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={Waves}
                title="No voice artifacts yet"
                description="Synthesize speech to capture transcripts, providers, and generated duration here."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {artifactList.map((artifact: any) => (
                <div
                  key={artifact._id}
                  className="rounded-xl border border-line bg-surface-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] leading-relaxed text-ink">{artifact.text}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge tone="info">{artifact.provider}</StatusBadge>
                        <StatusBadge tone="neutral">{artifact.voiceId ?? "default"}</StatusBadge>
                        {artifact.durationMs ? (
                          <StatusBadge tone="neutral">
                            {(artifact.durationMs / 1000).toFixed(1)}s
                          </StatusBadge>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-[11.5px] text-ink-muted">
                      {new Date(artifact._creationTime).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <audio ref={audioRef} className="hidden" />
      </div>
    </main>
  );
}
