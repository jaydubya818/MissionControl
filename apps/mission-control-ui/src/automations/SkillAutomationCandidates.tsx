import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, Code2, Search, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STEPS = ["Source", "Adapter", "Artifact", "Trigger", "Governance", "Validate", "Create"];
const ADAPTERS = ["PLAYWRIGHT", "API", "TYPESCRIPT", "PYTHON", "SHELL", "WORKFLOW", "SKILL_PIPELINE"] as const;

export function SkillAutomationCandidates({ projectId }: { projectId: Id<"projects"> }) {
  const candidates = useQuery(api.skillAutomations.listCandidates, { projectId });
  const startDraft = useMutation(api.skillAutomations.startDraft);
  const decide = useMutation(api.skillAutomations.decideCandidate);
  const [draft, setDraft] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [adapter, setAdapter] = useState("ALL");
  const [conversion, setConversion] = useState("ALL");
  const [sort, setSort] = useState("UPDATED");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const rows = useMemo(() => (candidates ?? []).filter((candidate: any) => {
    const text = `${candidate.skill.name} ${candidate.skill.description} ${candidate.version.automationProfile?.category ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (status === "ALL" || candidate.assessment.status === status)
      && (category === "ALL" || candidate.version.automationProfile?.category === category)
      && (adapter === "ALL" || candidate.assessment.recommendedAdapter === adapter)
      && (conversion === "ALL" || candidate.disposition === conversion);
  }).sort((a: any, b: any) => sort === "NAME"
    ? String(a.skill.name).localeCompare(String(b.skill.name))
    : sort === "COMPLEXITY"
      ? String(a.assessment.complexity).localeCompare(String(b.assessment.complexity))
      : b.skill.updatedAt - a.skill.updatedAt), [candidates, query, status, category, adapter, conversion, sort]);
  const categories = [...new Set((candidates ?? []).map((item: any) => item.version.automationProfile?.category).filter(Boolean))] as string[];

  async function begin(candidate: any) {
    try {
      setDraft(await startDraft({ projectId, packageId: candidate.skill._id, actorId: "operator" }));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start conversion");
    }
  }

  async function disposition(candidate: any, decision: "DEFER" | "DISMISS" | "RESTORE") {
    if (reason.trim().length < 5) return setMessage("Enter a decision reason of at least five characters.");
    await decide({ projectId, packageId: candidate.skill._id, decision, actorId: "operator", reason: reason.trim() });
    setReason("");
    setMessage(`${decision.toLowerCase()} decision recorded.`);
  }

  if (draft) return <ConversionWizard draft={draft} onClose={() => setDraft(null)} />;
  if (candidates === undefined) {
    return <div role="status" aria-label="Loading Automation candidates" className="grid gap-3">{[1, 2, 3].map(item => <Card key={item} className="h-40 animate-pulse bg-muted/20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search skill candidates" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search deterministic skills…" className="pl-9" />
        </div>
        <select aria-label="Eligibility filter" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="ALL">All eligibility</option><option value="ELIGIBLE">Eligible</option>
          <option value="POTENTIALLY_ELIGIBLE">Potential</option><option value="INELIGIBLE">Ineligible</option>
        </select>
        <select aria-label="Category filter" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value)}>
          <option value="ALL">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Adapter filter" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={adapter} onChange={event => setAdapter(event.target.value)}>
          <option value="ALL">All adapters</option>{ADAPTERS.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Conversion status filter" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={conversion} onChange={event => setConversion(event.target.value)}>
          <option value="ALL">All conversion states</option>{["OPEN", "DEFERRED", "DISMISSED", "CONVERTED"].map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Sort candidates" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="UPDATED">Recently updated</option><option value="NAME">Name</option><option value="COMPLEXITY">Complexity</option>
        </select>
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {rows.map((candidate: any) => (
        <Card key={candidate.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Code2 className="h-4 w-4 text-info-accent" />
                <h3 className="font-semibold">{candidate.skill.displayName ?? candidate.skill.name}</h3>
                <Badge variant="outline">{candidate.version.version}</Badge>
                <Badge variant="outline">{candidate.assessment.status}</Badge>
                <Badge variant="outline">{candidate.assessment.recommendedAdapter ?? "Needs adapter"}</Badge>
                {candidate.definition && <Badge className="bg-ok-soft text-ok">Converted</Badge>}
              </div>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{candidate.skill.description}</p>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span>Category: {candidate.version.automationProfile?.category ?? "Unclassified"}</span>
                <span>Complexity: {candidate.assessment.complexity}</span>
                <span>Safety: {candidate.assessment.safetyClassification}</span>
                <span>Permissions: {candidate.version.automationProfile?.requiredPermissions?.join(", ") || "None"}</span>
                <span>Secrets: {candidate.version.automationProfile?.secretReferences?.join(", ") || "None"}</span>
                <span>Verification: {candidate.assessment.verificationReady ? "Ready" : "Missing"}</span>
                <span>Source: {candidate.version.sourceRepo ?? candidate.skill.owner}</span>
                <span>Updated: {new Date(candidate.skill.updatedAt).toLocaleDateString()}</span>
                <span>Conversion: {candidate.disposition}</span>
              </div>
              {(candidate.assessment.missing.length > 0 || candidate.assessment.blockers.length > 0) && (
                <div className="mt-3 rounded-md border border-warn/20 bg-warn-soft p-3 text-xs text-warn">
                  {[...candidate.assessment.blockers, ...candidate.assessment.missing].join(" · ")}
                </div>
              )}
            </div>
            <div className="flex flex-col items-start gap-2">
              <Button disabled={candidate.assessment.status !== "ELIGIBLE" || !!candidate.definition} onClick={() => void begin(candidate)}>
                {candidate.definition ? "Already converted" : candidate.draft ? "Resume conversion" : candidate.assessment.status === "INELIGIBLE" ? "Review eligibility" : "Convert to Automation"} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <a className="text-xs font-medium text-info-accent hover:text-foreground" href={`/v2/registry?workspace=${projectId}&package=${candidate.skill._id}`}>View skill</a>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-info-accent">View dependencies</summary>
                <div className="mt-2">{candidate.version.dependencies?.length ? candidate.version.dependencies.map((dependency: any) => `${dependency.slug}@${dependency.range}`).join(", ") : "No package dependencies declared."}</div>
              </details>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-info-accent">Preview generated artifact</summary>
                <div className="mt-2">Recommended {candidate.assessment.recommendedAdapter ?? "adapter"} artifact at the repository convention for this skill. Start conversion to generate, edit, diff, and validate the exact implementation.</div>
              </details>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <Input aria-label={`Reason for ${candidate.skill.name}`} value={reason} onChange={event => setReason(event.target.value)} placeholder="Governance reason…" className="max-w-sm" />
            <Button size="sm" variant="outline" onClick={() => void disposition(candidate, "DEFER")}>Defer</Button>
            <Button size="sm" variant="outline" onClick={() => void disposition(candidate, "DISMISS")}>Dismiss</Button>
            {candidate.disposition !== "OPEN" && <Button size="sm" variant="ghost" onClick={() => void disposition(candidate, "RESTORE")}>Restore</Button>}
          </div>
        </Card>
      ))}
      {candidates && rows.length === 0 && <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">No Registry skills match these filters.</Card>}
    </div>
  );
}

function ConversionWizard({ draft: initialDraft, onClose }: { draft: any; onClose: () => void }) {
  const update = useMutation(api.skillAutomations.updateDraft);
  const previewArtifact = useMutation(api.skillAutomations.previewArtifact);
  const validate = useMutation(api.skillAutomations.validateDraft);
  const create = useMutation(api.skillAutomations.createDefinition);
  const [draft, setDraft] = useState(initialDraft);
  const [config, setConfig] = useState<any>(initialDraft.configuration);
  const [step, setStep] = useState(initialDraft.currentStep);
  const [validation, setValidation] = useState<any>(initialDraft.validationResult);
  const [preview, setPreview] = useState<any>(initialDraft.artifactPreview);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(nextStep: number) {
    setBusy(true); setError("");
    try {
      const next = await update({ draftId: draft._id, currentStep: nextStep, adapterType: draft.adapterType, configuration: config, actorId: "operator" });
      setDraft(next); setStep(nextStep);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save draft"); }
    finally { setBusy(false); }
  }
  async function runValidation() {
    setBusy(true); setError("");
    try {
      await save(6);
      const result = await validate({ draftId: draft._id, actorId: "operator" });
      setValidation(result); setStep(6);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Validation failed"); }
    finally { setBusy(false); }
  }
  async function generatePreview() {
    setBusy(true); setError("");
    try {
      await update({ draftId: draft._id, currentStep: step, adapterType: draft.adapterType, configuration: config, actorId: "operator" });
      const result = await previewArtifact({ draftId: draft._id, actorId: "operator" });
      setPreview(result);
      if (!config.artifactContent && result.content) setConfig((current: any) => ({ ...current, artifactContent: result.content }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Artifact preview failed"); }
    finally { setBusy(false); }
  }
  async function finish() {
    if (reason.trim().length < 5) return setError("A creation reason is required.");
    setBusy(true);
    try {
      const result = await create({ draftId: draft._id, actorId: "operator", reason: reason.trim() });
      window.location.href = `/v2/automations?workspace=${draft.projectId}&tab=definitions&definition=${result.definitionId}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Definition creation failed"); setBusy(false); }
  }
  const set = (key: string, value: any) => setConfig((current: any) => ({ ...current, [key]: value }));

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Governed conversion</p><h2 className="mt-1 text-lg font-semibold">{config.name}</h2></div>
          <Button variant="ghost" onClick={onClose}>Exit wizard</Button>
        </div>
        <ol className="mt-5 grid grid-cols-7 gap-1" aria-label="Conversion progress">
          {STEPS.map((label, index) => <li key={label} className={`border-t-2 pt-2 text-[11px] ${index + 1 <= step ? "border-info-accent text-foreground" : "border-border text-muted-foreground"}`}>{index + 1}. {label}</li>)}
        </ol>
      </div>
      <div className="min-h-[360px] space-y-5 p-5">
        {step === 1 && <><PanelTitle title="Confirm deterministic source" body="The immutable published Registry version is the source of truth." /><ReadOnly label="Candidate ID" value={draft.candidateId} /><ReadOnly label="Eligibility" value={draft.eligibilitySnapshot.status} /></>}
        {step === 2 && <><PanelTitle title="Choose runtime adapter" body="Only explicit, bounded adapters are supported." /><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ADAPTERS.map(adapter => <Button key={adapter} variant={draft.adapterType === adapter ? "default" : "outline"} onClick={() => {
          setDraft((current: any) => ({ ...current, adapterType: adapter }));
          if (adapter === "SKILL_PIPELINE" && !config.steps?.length) set("steps", [{ name: "validate", adapterType: "SHELL", command: "pnpm run typecheck", timeoutMs: 300000 }]);
          if (adapter === "WORKFLOW" && !config.command) set("command", "pnpm run typecheck");
        }}>{adapter}</Button>)}</div></>}
        {step === 3 && <><PanelTitle title="Configure implementation artifact" body="Generate a reviewable artifact or link an existing implementation inside the approved repository." /><Field label="Repository" value={config.repository} onChange={v => set("repository", v)} /><Field label="Branch" value={config.branch} onChange={v => set("branch", v)} /><Field label="Working directory" value={config.workingDirectory} onChange={v => set("workingDirectory", v)} /><Field label="Artifact path" value={config.path} onChange={v => set("path", v)} />
          {draft.adapterType === "PLAYWRIGHT" && <><Field label="Base URL" value={config.baseUrl ?? "http://127.0.0.1:5199"} onChange={v => set("baseUrl", v)} /><ReadOnly label="Evidence policy" value="Headless Chromium · screenshot on failure and final · trace retained on failure" /></>}
          {draft.adapterType === "API" && <><Field label="Base URL" value={config.baseUrl ?? "http://127.0.0.1:5199"} onChange={v => set("baseUrl", v)} /><Field label="Read-only endpoint" value={config.endpoint ?? "/health"} onChange={v => set("endpoint", v)} /><Field label="Expected status" value={String(config.expectedStatus ?? 200)} onChange={v => set("expectedStatus", Number(v))} /><ReadOnly label="Method" value="GET (LEVEL_1 enforced)" /></>}
          {["SHELL", "WORKFLOW"].includes(draft.adapterType) && <Field label="Allowlisted command" value={config.command ?? "pnpm run typecheck"} onChange={v => set("command", v)} />}
          {["TYPESCRIPT", "PYTHON"].includes(draft.adapterType) && <ReadOnly label="Runtime invocation" value={draft.adapterType === "TYPESCRIPT" ? "pnpm exec tsx <approved artifact>" : "python3 <approved artifact>"} />}
          {draft.adapterType === "SKILL_PIPELINE" && <label className="block space-y-2"><Label>Ordered deterministic steps (JSON)</Label><Textarea className="min-h-36 font-mono text-xs" value={JSON.stringify(config.steps ?? [{ name: "validate", adapterType: "SHELL", command: "pnpm run typecheck", timeoutMs: 300000 }], null, 2)} onChange={event => { try { set("steps", JSON.parse(event.target.value)); setError(""); } catch { setError("Pipeline steps must be valid JSON."); } }} /></label>}
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Timeout (seconds)" value={String(config.maxDurationSeconds ?? 900)} onChange={v => set("maxDurationSeconds", Number(v))} /><Field label="Retry limit" value={String(config.maxRetries ?? 0)} onChange={v => set("maxRetries", Number(v))} /><Field label="Cost limit (USD)" value={String(config.maxCostUsd ?? 1)} onChange={v => set("maxCostUsd", Number(v))} /></div>
          <Button variant="outline" onClick={() => void generatePreview()} disabled={busy}>Generate preview and diff</Button>{preview?.content ? <><Label htmlFor="artifact-editor">Approved artifact content</Label><Textarea id="artifact-editor" className="min-h-52 font-mono text-xs" value={config.artifactContent ?? preview.content} onChange={event => set("artifactContent", event.target.value)} /><details><summary className="cursor-pointer text-sm text-info-accent">Structured repository diff</summary><pre className="mt-2 max-h-52 overflow-auto rounded bg-black/20 p-3 text-xs">{preview.diff}</pre></details></> : null}</>}
        {step === 4 && <><PanelTitle title="Define trigger" body="Manual is safest. Schedules create review gates; they never auto-dispatch." /><label className="space-y-2"><Label>Trigger type</Label><select className="h-10 w-full rounded-md border border-border bg-background px-3" value={config.triggerType} onChange={e => set("triggerType", e.target.value)}><option>MANUAL</option><option>SCHEDULE</option><option>EVENT</option><option>CONDITION</option></select></label>{config.triggerType === "SCHEDULE" && <Field label="Five-field cron" value={config.cron} onChange={v => set("cron", v)} />}</>}
        {step === 5 && <><PanelTitle title="Review governance" body="These controls are fixed for V1 and cannot be weakened in the wizard." /><div className="grid gap-3 sm:grid-cols-2">{["LEVEL_1 / read-only", "Operator approval required", "Automatic dispatch disabled", "Independent receipt required", "Concurrency limit 1", "Overlap policy: skip"].map(item => <div key={item} className="flex items-center gap-2 rounded-md border border-ok/20 p-3 text-sm"><ShieldCheck className="h-4 w-4 text-ok" />{item}</div>)}</div></>}
        {step === 6 && <><PanelTitle title="Validate artifact and policy" body="Validation is deterministic and server enforced." /><Button onClick={() => void runValidation()} disabled={busy}>Run validation</Button>{validation && <div className={`rounded-md border p-4 ${validation.status === "PASSED" ? "border-ok/25" : "border-err/25"}`}><div className="flex items-center gap-2 font-medium">{validation.status === "PASSED" ? <CheckCircle2 className="text-ok" /> : <XCircle className="text-err" />}{validation.status}</div>{validation.findings?.map((finding: string) => <p key={finding} className="mt-2 text-sm text-muted-foreground">{finding}</p>)}{validation.content && <pre className="mt-4 max-h-52 overflow-auto rounded bg-black/20 p-3 text-xs">{validation.content}</pre>}</div>}</>}
        {step === 7 && <><PanelTitle title="Create disabled Definition" body="Creation persists the versioned artifact and audit lineage. Review, approval, and activation remain separate actions." /><Label>Creation reason</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why this deterministic skill should become a governed Automation…" /><Button onClick={() => void finish()} disabled={busy || validation?.status !== "PASSED"}>Create disabled Definition</Button></>}
        {error && <p role="alert" className="text-sm text-err">{error}</p>}
      </div>
      <div className="flex justify-between border-t border-border p-4">
        <Button variant="outline" disabled={step === 1 || busy} onClick={() => void save(step - 1)}>Back</Button>
        {step < 6 && <Button disabled={busy} onClick={() => void save(step + 1)}>Save and continue</Button>}
        {step === 6 && <Button disabled={validation?.status !== "PASSED"} onClick={() => setStep(7)}>Continue to create</Button>}
      </div>
    </Card>
  );
}

function PanelTitle({ title, body }: { title: string; body: string }) { return <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><Label>{label}</Label><div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-sm">{value}</div></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block space-y-2"><Label>{label}</Label><Input value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>; }
