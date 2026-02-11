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
  accentRed: "#ef4444",
  accentPurple: "#8b5cf6",
};

type Tab = "directory" | "compliance" | "soul";

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
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: colors.textPrimary, margin: 0 }}>Identity Directory</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {(["directory", "compliance"] as Tab[]).map((t) => (
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

      {tab === "directory" && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents by name, creature, or vibe..."
            style={{
              width: "100%",
              maxWidth: 400,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid " + colors.border,
              background: colors.bgInput,
              color: colors.textPrimary,
              fontSize: "0.9rem",
              marginBottom: 20,
              outline: "none",
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {filtered.map((identity: any) => (
              <div
                key={identity._id}
                onClick={() => {
                  setSelectedAgentId(identity.agentId);
                  setSoulContent(identity.soulContent ?? "");
                  setTab("soul");
                }}
                style={{
                  background: colors.bgCard,
                  border: "1px solid " + colors.border,
                  borderRadius: 8,
                  padding: 16,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: "2rem" }}>{identity.emoji ?? "🤖"}</span>
                  <div>
                    <div style={{ color: colors.textPrimary, fontWeight: 700, fontSize: "1rem" }}>
                      {identity.name}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: "0.8rem" }}>
                      {identity.creature ?? "—"}
                    </div>
                  </div>
                  <span
                    style={{
                      marginLeft: "auto",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background:
                        identity.validationStatus === "VALID"
                          ? colors.accentGreen + "22"
                          : identity.validationStatus === "PARTIAL"
                            ? colors.accentOrange + "22"
                            : colors.accentRed + "22",
                      color:
                        identity.validationStatus === "VALID"
                          ? colors.accentGreen
                          : identity.validationStatus === "PARTIAL"
                            ? colors.accentOrange
                            : colors.accentRed,
                    }}
                  >
                    {identity.validationStatus}
                  </span>
                </div>
                <div style={{ color: colors.textSecondary, fontSize: "0.85rem" }}>
                  {identity.vibe ?? "No vibe set"}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ color: colors.textMuted, gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
                {search ? "No agents match your search." : "No agent identities found. Run the identity scanner to populate."}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "compliance" && complianceReport && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {([
              { label: "Valid", count: complianceReport.valid, color: colors.accentGreen },
              { label: "Partial", count: complianceReport.partial, color: colors.accentOrange },
              { label: "Invalid", count: complianceReport.invalid, color: colors.accentRed },
              { label: "Missing", count: complianceReport.missing, color: colors.textMuted },
            ] as const).map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: colors.bgCard,
                  border: "1px solid " + colors.border,
                  borderRadius: 8,
                  padding: 16,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "2rem", fontWeight: 700, color: stat.color }}>{stat.count}</div>
                <div style={{ color: colors.textSecondary, fontSize: "0.85rem" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <h3 style={{ color: colors.textPrimary, marginBottom: 12 }}>Agents Needing Attention</h3>
          {[...complianceReport.details.missing, ...complianceReport.details.invalid, ...complianceReport.details.partial].map((item: any) => (
            <div
              key={item.agent?._id ?? Math.random()}
              style={{
                background: colors.bgCard,
                border: "1px solid " + colors.border,
                borderRadius: 8,
                padding: 14,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>
                  {item.agent?.emoji ?? "🤖"} {item.agent?.name ?? "Unknown"}
                </span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: "0.75rem",
                    color:
                      item.status === "MISSING" ? colors.textMuted
                        : item.status === "INVALID" ? colors.accentRed
                          : colors.accentOrange,
                  }}
                >
                  {item.status}
                </span>
                {item.identity?.validationErrors?.map((err: string, i: number) => (
                  <div key={i} style={{ color: colors.accentRed, fontSize: "0.8rem", marginTop: 4 }}>{err}</div>
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
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid " + colors.accentBlue,
                  background: "transparent",
                  color: colors.accentBlue,
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                Fix It
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "soul" && selectedAgentId && (
        <div style={{ maxWidth: 700 }}>
          <button
            onClick={() => { setTab("directory"); setSelectedAgentId(null); setEditingSoul(false); }}
            style={{
              background: "none",
              border: "none",
              color: colors.accentBlue,
              cursor: "pointer",
              marginBottom: 16,
              fontSize: "0.85rem",
            }}
          >
            ← Back to Directory
          </button>

          <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: "2.5rem" }}>{selectedIdentity?.emoji ?? "🤖"}</span>
              <div>
                <h3 style={{ color: colors.textPrimary, margin: 0 }}>{selectedIdentity?.name ?? "Unknown"}</h3>
                <div style={{ color: colors.textMuted, fontSize: "0.85rem" }}>
                  {selectedIdentity?.creature ?? "—"} · {selectedIdentity?.vibe ?? "—"}
                </div>
              </div>
            </div>

            <h4 style={{ color: colors.textSecondary, marginTop: 20, marginBottom: 8 }}>SOUL.md Content</h4>
            {editingSoul ? (
              <>
                <textarea
                  value={soulContent}
                  onChange={(e) => setSoulContent(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 300,
                    padding: 12,
                    borderRadius: 6,
                    border: "1px solid " + colors.border,
                    background: colors.bgInput,
                    color: colors.textPrimary,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: colors.accentBlue,
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Save Soul
                  </button>
                  <button
                    onClick={() => {
                      setEditingSoul(false);
                      setSoulContent(selectedIdentity?.soulContent ?? "");
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "1px solid " + colors.border,
                      background: "transparent",
                      color: colors.textSecondary,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <pre style={{
                  color: colors.textSecondary,
                  fontSize: "0.85rem",
                  whiteSpace: "pre-wrap",
                  background: colors.bgInput,
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid " + colors.border,
                  maxHeight: 400,
                  overflow: "auto",
                }}>
                  {selectedIdentity?.soulContent ?? "No soul content. Click Edit to add."}
                </pre>
                <button
                  onClick={() => setEditingSoul(true)}
                  style={{
                    marginTop: 12,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid " + colors.accentBlue,
                    background: "transparent",
                    color: colors.accentBlue,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Edit Soul
                </button>
              </>
            )}

            {selectedIdentity?.toolsNotes && (
              <>
                <h4 style={{ color: colors.textSecondary, marginTop: 20, marginBottom: 8 }}>TOOLS.md Notes</h4>
                <pre style={{
                  color: colors.textMuted,
                  fontSize: "0.85rem",
                  whiteSpace: "pre-wrap",
                  background: colors.bgInput,
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid " + colors.border,
                }}>
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
