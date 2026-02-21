/**
 * Identity Directory View
 *
 * Grid/list of all agents with identity info: avatar, name, creature, vibe, emoji.
 * Search + filter by project/role/compliance status.
 * Includes Compliance Dashboard and Soul Detail modal.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type Tab = "directory" | "compliance" | "soul";

const VALIDATION_BADGE: Record<string, { bg: string; text: string }> = {
  VALID: { bg: "bg-emerald-500/15", text: "text-emerald-500" },
  PARTIAL: { bg: "bg-amber-500/15", text: "text-amber-500" },
  INVALID: { bg: "bg-red-500/15", text: "text-red-500" },
};

export function IdentityDirectoryView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [tab, setTab] = useState<Tab>("directory");
  const [search, setSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [soulContent, setSoulContent] = useState("");
  const [editingSoul, setEditingSoul] = useState(false);

  const directory = useQuery(api.identity.getDirectory, projectId ? { projectId } : {});
  const complianceReport = useQuery(api.identity.getComplianceReport, projectId ? { projectId } : {});
  const selectedIdentity = useQuery(
    api.identity.getByAgent,
    selectedAgentId ? { agentId: selectedAgentId } : "skip"
  );

  const upsertIdentity = useMutation(api.identity.upsert);

  const filtered = (directory ?? []).filter((d: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.creature?.toLowerCase().includes(q) ||
      d.vibe?.toLowerCase().includes(q)
    );
  });

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-foreground font-semibold text-xl">Identity Directory</h2>
        <div className="flex gap-2">
          {(["directory", "compliance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3.5 py-1.5 rounded-md border text-sm font-semibold capitalize cursor-pointer transition-colors",
                tab === t
                  ? "border-blue-500 bg-blue-500/15 text-blue-500"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "directory" && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents by name, creature, or vibe..."
            className="w-full max-w-[400px] px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm mb-5 outline-none focus:border-blue-500 transition-colors"
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filtered.map((identity: any) => {
              const badge = VALIDATION_BADGE[identity.validationStatus] || VALIDATION_BADGE.INVALID;
              return (
                <div
                  key={identity._id}
                  onClick={() => {
                    setSelectedAgentId(identity.agentId);
                    setSoulContent(identity.soulContent ?? "");
                    setTab("soul");
                  }}
                  className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <span className="text-3xl">{identity.emoji ?? "🤖"}</span>
                    <div>
                      <div className="text-foreground font-bold text-base">
                        {identity.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {identity.creature ?? "—"}
                      </div>
                    </div>
                    <span className={cn(
                      "ml-auto px-2 py-0.5 rounded text-[0.7rem] font-semibold",
                      badge.bg, badge.text
                    )}>
                      {identity.validationStatus}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {identity.vibe ?? "No vibe set"}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-muted-foreground col-span-full text-center py-10">
                {search ? "No agents match your search." : "No agent identities found. Run the identity scanner to populate."}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "compliance" && complianceReport && (
        <div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {([
              { label: "Valid", count: complianceReport.valid, classes: "text-emerald-500" },
              { label: "Partial", count: complianceReport.partial, classes: "text-amber-500" },
              { label: "Invalid", count: complianceReport.invalid, classes: "text-red-500" },
              { label: "Missing", count: complianceReport.missing, classes: "text-muted-foreground" },
            ] as const).map((stat) => (
              <div
                key={stat.label}
                className="bg-card border border-border rounded-lg p-4 text-center"
              >
                <div className={cn("text-3xl font-bold", stat.classes)}>{stat.count}</div>
                <div className="text-muted-foreground text-sm">{stat.label}</div>
              </div>
            ))}
          </div>

          <h3 className="text-foreground font-semibold mb-3">Agents Needing Attention</h3>
          {[...complianceReport.details.missing, ...complianceReport.details.invalid, ...complianceReport.details.partial].map((item: any) => (
            <div
              key={item.agent?._id ?? Math.random()}
              className="bg-card border border-border rounded-lg px-3.5 py-3 mb-2.5 flex items-center justify-between"
            >
              <div>
                <span className="text-foreground font-semibold">
                  {item.agent?.emoji ?? "🤖"} {item.agent?.name ?? "Unknown"}
                </span>
                <span className={cn(
                  "ml-2 text-xs",
                  item.status === "MISSING" ? "text-muted-foreground"
                    : item.status === "INVALID" ? "text-red-500"
                    : "text-amber-500"
                )}>
                  {item.status}
                </span>
                {item.identity?.validationErrors?.map((err: string, i: number) => (
                  <div key={i} className="text-red-500 text-xs mt-1">{err}</div>
                ))}
              </div>
              <button
                onClick={() => {
                  if (item.agent?._id) {
                    setSelectedAgentId(item.agent._id);
                    setSoulContent(item.identity?.soulContent ?? "");
                    setEditingSoul(true);
                    setTab("soul");
                  }
                }}
                className="px-3 py-1.5 rounded-md border border-blue-500 bg-transparent text-blue-500 cursor-pointer text-xs font-semibold hover:bg-blue-500/10 transition-colors"
              >
                Fix It
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "soul" && selectedAgentId && (
        <div className="max-w-[700px]">
          <button
            onClick={() => { setTab("directory"); setSelectedAgentId(null); setEditingSoul(false); }}
            className="bg-transparent border-none text-blue-500 cursor-pointer mb-4 text-sm hover:text-blue-400 transition-colors"
          >
            ← Back to Directory
          </button>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{selectedIdentity?.emoji ?? "🤖"}</span>
              <div>
                <h3 className="text-foreground font-semibold text-lg">{selectedIdentity?.name ?? "Unknown"}</h3>
                <div className="text-muted-foreground text-sm">
                  {selectedIdentity?.creature ?? "—"} · {selectedIdentity?.vibe ?? "—"}
                </div>
              </div>
            </div>

            <h4 className="text-muted-foreground mt-5 mb-2 text-sm font-semibold uppercase tracking-wider">SOUL.md Content</h4>
            {editingSoul ? (
              <>
                <textarea
                  value={soulContent}
                  onChange={(e) => setSoulContent(e.target.value)}
                  className="w-full min-h-[300px] p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm resize-y"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={async () => {
                      if (!selectedAgentId) return;
                      await upsertIdentity({
                        agentId: selectedAgentId,
                        name: selectedIdentity?.name ?? "Unknown",
                        creature: selectedIdentity?.creature,
                        vibe: selectedIdentity?.vibe,
                        emoji: selectedIdentity?.emoji,
                        avatarPath: selectedIdentity?.avatarPath,
                        soulContent,
                        toolsNotes: selectedIdentity?.toolsNotes,
                      });
                      setEditingSoul(false);
                    }}
                    className="px-4 py-2 rounded-md border-none bg-blue-500 hover:bg-blue-600 text-white cursor-pointer font-semibold text-sm transition-colors"
                  >
                    Save Soul
                  </button>
                  <button
                    onClick={() => {
                      setEditingSoul(false);
                      setSoulContent(selectedIdentity?.soulContent ?? "");
                    }}
                    className="px-4 py-2 rounded-md border border-border bg-transparent text-muted-foreground cursor-pointer text-sm hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <pre className="text-muted-foreground text-sm whitespace-pre-wrap bg-background p-3 rounded-md border border-border max-h-[400px] overflow-auto">
                  {selectedIdentity?.soulContent ?? "No soul content. Click Edit to add."}
                </pre>
                <button
                  onClick={() => setEditingSoul(true)}
                  className="mt-3 px-4 py-2 rounded-md border border-blue-500 bg-transparent text-blue-500 cursor-pointer font-semibold text-sm hover:bg-blue-500/10 transition-colors"
                >
                  Edit Soul
                </button>
              </>
            )}

            {selectedIdentity?.toolsNotes && (
              <>
                <h4 className="text-muted-foreground mt-5 mb-2 text-sm font-semibold uppercase tracking-wider">TOOLS.md Notes</h4>
                <pre className="text-muted-foreground text-sm whitespace-pre-wrap bg-background p-3 rounded-md border border-border">
                  {selectedIdentity.toolsNotes}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
