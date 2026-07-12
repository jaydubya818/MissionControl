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
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";

type Tab = "directory" | "compliance" | "soul";

const VALIDATION_TONE: Record<string, StatusBadgeProps["tone"]> = {
  VALID: "success",
  PARTIAL: "warning",
  INVALID: "error",
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
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Identity Directory"
        description={
          tab === "compliance"
            ? "Compliance status and soul validation across agents."
            : "Agent identities: creature, vibe, emoji. Search and manage souls."
        }
        actions={
          <div role="tablist" className="flex items-center rounded-lg border border-line p-0.5">
            {(["directory", "compliance"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 h-8 rounded-md text-[13px] font-medium capitalize transition-colors duration-150",
                  tab === t
                    ? "bg-surface-2 text-ink"
                    : "text-ink-secondary hover:text-ink"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6">
      {tab === "directory" && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents by name, creature, or vibe..."
            aria-label="Search agents by name, creature, or vibe"
            className="w-full max-w-[400px] h-9 px-3 rounded-lg border border-line bg-surface-1 text-ink text-[13.5px] placeholder:text-ink-muted mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filtered.map((identity: any) => {
              return (
                <div
                  key={identity._id}
                  onClick={() => {
                    setSelectedAgentId(identity.agentId);
                    setSoulContent(identity.soulContent ?? "");
                    setTab("soul");
                  }}
                  className="bg-surface-1 border border-line rounded-xl p-4 cursor-pointer hover:border-line-strong transition-colors duration-150"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-xl">
                      {identity.emoji ?? (identity.name?.charAt(0)?.toUpperCase() || "?")}
                    </span>
                    <div>
                      <div className="text-ink font-semibold text-[15px]">
                        {identity.name}
                      </div>
                      <div className="text-ink-muted text-[12.5px]">
                        {identity.creature ?? "—"}
                      </div>
                    </div>
                    <StatusBadge
                      tone={VALIDATION_TONE[identity.validationStatus] ?? "error"}
                      className="ml-auto"
                    >
                      {identity.validationStatus}
                    </StatusBadge>
                  </div>
                  <div className="text-ink-secondary text-[13.5px]">
                    {identity.vibe ?? "No vibe set"}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-ink-muted col-span-full text-center py-10 text-[13.5px]">
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
              { label: "Valid", count: complianceReport.valid, classes: "text-ok" },
              { label: "Partial", count: complianceReport.partial, classes: "text-warn" },
              { label: "Invalid", count: complianceReport.invalid, classes: "text-err" },
              { label: "Missing", count: complianceReport.missing, classes: "text-ink-muted" },
            ] as const).map((stat) => (
              <div
                key={stat.label}
                className="bg-surface-1 border border-line rounded-xl p-4 text-center"
              >
                <div className={cn("text-[26px] font-semibold", stat.classes)}>{stat.count}</div>
                <div className="text-ink-muted text-[12.5px]">{stat.label}</div>
              </div>
            ))}
          </div>

          <h3 className="text-ink text-[15px] font-semibold mb-3">Agents Needing Attention</h3>
          {[...complianceReport.details.missing, ...complianceReport.details.invalid, ...complianceReport.details.partial].map((item: any) => (
            <div
              key={item.agent?._id ?? Math.random()}
              className="bg-surface-1 border border-line rounded-xl px-3.5 py-3 mb-2.5 flex items-center justify-between"
            >
              <div>
                <span className="text-ink font-medium text-[13.5px]">
                  {item.agent?.emoji ? `${item.agent.emoji} ` : ""}{item.agent?.name ?? "Unknown"}
                </span>
                <span className={cn(
                  "ml-2 text-[12.5px]",
                  item.status === "MISSING" ? "text-ink-muted"
                    : item.status === "INVALID" ? "text-err"
                    : "text-warn"
                )}>
                  {item.status}
                </span>
                {item.identity?.validationErrors?.map((err: string, i: number) => (
                  <div key={i} className="text-err text-[12.5px] mt-1">{err}</div>
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
                className="h-9 px-3 rounded-lg border border-line text-[13px] font-medium text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150"
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
            className="bg-transparent border-none text-ink-secondary cursor-pointer mb-4 text-[13px] hover:text-ink transition-colors duration-150"
          >
            ← Back to Directory
          </button>

          <div className="bg-surface-1 border border-line rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-2xl">
                {selectedIdentity?.emoji ?? (selectedIdentity?.name?.charAt(0)?.toUpperCase() || "?")}
              </span>
              <div>
                <h3 className="text-ink font-semibold text-[15px]">{selectedIdentity?.name ?? "Unknown"}</h3>
                <div className="text-ink-muted text-[12.5px]">
                  {selectedIdentity?.creature ?? "—"} · {selectedIdentity?.vibe ?? "—"}
                </div>
              </div>
            </div>

            <h4 className="text-ink-muted mt-5 mb-2 text-[11.5px] font-medium uppercase tracking-[0.06em]">SOUL.md Content</h4>
            {editingSoul ? (
              <>
                <textarea
                  value={soulContent}
                  onChange={(e) => setSoulContent(e.target.value)}
                  aria-label="SOUL.md content"
                  className="w-full min-h-[300px] p-3 rounded-lg border border-line bg-surface-2 text-ink font-mono text-[13px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="h-9 px-3 rounded-lg bg-act text-act-ink text-[13px] font-medium hover:opacity-90 transition-opacity duration-150"
                  >
                    Save Soul
                  </button>
                  <button
                    onClick={() => {
                      setEditingSoul(false);
                      setSoulContent(selectedIdentity?.soulContent ?? "");
                    }}
                    className="h-9 px-3 rounded-lg border border-line text-[13px] font-medium text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <pre className="text-ink-secondary text-[13px] font-mono whitespace-pre-wrap bg-surface-2 p-3 rounded-lg border border-line max-h-[400px] overflow-auto">
                  {selectedIdentity?.soulContent ?? "No soul content. Click Edit to add."}
                </pre>
                <button
                  onClick={() => setEditingSoul(true)}
                  className="mt-3 h-9 px-3 rounded-lg border border-line text-[13px] font-medium text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150"
                >
                  Edit Soul
                </button>
              </>
            )}

            {selectedIdentity?.toolsNotes && (
              <>
                <h4 className="text-ink-muted mt-5 mb-2 text-[11.5px] font-medium uppercase tracking-[0.06em]">TOOLS.md Notes</h4>
                <pre className="text-ink-secondary text-[13px] font-mono whitespace-pre-wrap bg-surface-2 p-3 rounded-lg border border-line">
                  {selectedIdentity.toolsNotes}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
