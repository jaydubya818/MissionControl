/**
 * Start QC Run Modal
 *
 * Environment selector, check type, scope, ruleset picker; wired to api.qcRuns.start.
 */

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const ENVIRONMENTS = [
  { value: "local", label: "Local" },
  { value: "dev", label: "Dev" },
  { value: "staging", label: "Staging" },
  { value: "pilot", label: "Pilot" },
  { value: "production", label: "Production" },
] as const;

const CHECK_TYPES = [
  { value: "FULL_SUITE", label: "Full Suite" },
  { value: "CODE_REVIEW", label: "Code Review" },
  { value: "AGENT_OUTPUT", label: "Agent Output" },
  { value: "SECURITY", label: "Security" },
  { value: "COVERAGE", label: "Coverage" },
] as const;

const SCOPE_TYPES = [
  { value: "FULL_REPO", label: "Full Repo" },
  { value: "BRANCH_DIFF", label: "Branch Diff" },
  { value: "DIRECTORY", label: "Directory" },
  { value: "FILE_LIST", label: "File List" },
] as const;

export function StartQcRunModal({
  projectId,
  onClose,
  onStarted,
}: {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onStarted?: (runId: string) => void;
}) {
  const [environment, setEnvironment] = useState<string>("dev");
  const [checkType, setCheckType] = useState<string>("FULL_SUITE");
  const [scopeType, setScopeType] = useState<"FULL_REPO" | "BRANCH_DIFF" | "DIRECTORY" | "FILE_LIST">("FULL_REPO");
  const [repoUrl, setRepoUrl] = useState("https://github.com/org/repo");
  const [branch, setBranch] = useState("main");
  const [commitSha, setCommitSha] = useState("");
  const [scopeSpec, setScopeSpec] = useState<string>("");
  const [rulesetId, setRulesetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRun = useMutation(api.qcRuns.start);
  const rulesets = useQuery(api.qcRulesets.list, { projectId: projectId ?? undefined });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let spec: unknown = undefined;
      if (scopeType === "FILE_LIST") {
        spec = scopeSpec.trim() ? scopeSpec.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : [];
        if (Array.isArray(spec) && spec.length === 0) {
          setError("File list cannot be empty");
          setLoading(false);
          return;
        }
      } else if (scopeType === "DIRECTORY") {
        spec = scopeSpec.trim() || undefined;
        if (!spec) {
          setError("Directory path is required");
          setLoading(false);
          return;
        }
      } else if (scopeType === "BRANCH_DIFF") {
        const [base, head] = scopeSpec.split(/\s+/).map((s) => s.trim());
        spec = base && head ? { base, head } : undefined;
        if (!spec || typeof spec !== "object" || !("base" in spec)) {
          setError("Enter base and head branches (e.g. main feature-branch)");
          setLoading(false);
          return;
        }
      }

      const idempotencyKey = `qc-start-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await startRun({
        projectId: projectId ?? undefined,
        repoUrl,
        commitSha: commitSha.trim() || undefined,
        branch: branch.trim() || undefined,
        scopeType,
        scopeSpec: spec,
        rulesetId: rulesetId ? (rulesetId as Id<"qcRulesets">) : undefined,
        initiatorType: "HUMAN",
        idempotencyKey,
        environment: environment as "local" | "dev" | "staging" | "pilot" | "production",
        checkType: checkType as "FULL_SUITE" | "CODE_REVIEW" | "AGENT_OUTPUT" | "SECURITY" | "COVERAGE",
      });
      onStarted?.(result.runId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start QC run");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start QC Run</DialogTitle>
          <DialogDescription>
            Configure environment, check type, scope, and ruleset for a new quality control run.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Environment</Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Check type</Label>
            <Select value={checkType} onValueChange={setCheckType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECK_TYPES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Repo URL</Label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>
            <div className="space-y-2">
              <Label>Commit SHA (optional)</Label>
              <Input value={commitSha} onChange={(e) => setCommitSha(e.target.value)} placeholder="abc123" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select
              value={scopeType}
              onValueChange={(v) => setScopeType(v as typeof scopeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scopeType === "DIRECTORY" && (
              <Input
                value={scopeSpec}
                onChange={(e) => setScopeSpec(e.target.value)}
                placeholder="e.g. src/app"
              />
            )}
            {scopeType === "FILE_LIST" && (
              <Input
                value={scopeSpec}
                onChange={(e) => setScopeSpec(e.target.value)}
                placeholder="path/to/a.ts, path/to/b.ts"
              />
            )}
            {scopeType === "BRANCH_DIFF" && (
              <Input
                value={scopeSpec}
                onChange={(e) => setScopeSpec(e.target.value)}
                placeholder="main feature-branch"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Ruleset (optional)</Label>
            <Select value={rulesetId ?? "none"} onValueChange={(v) => setRulesetId(v === "none" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default</SelectItem>
                {rulesets?.map((r) => (
                  <SelectItem key={r._id} value={r._id}>
                    {r.name} {r.preset ? `(${r.preset})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
            This deployment has no quality-control analyzer configured. The run will be recorded and
            queued, but no evidence pack, quality score, or gate verdict will be produced until one is
            wired up — Mission Control does not synthesize them.
          </p>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                "Start QC Run"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
