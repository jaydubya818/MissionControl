/**
 * QC Run Detail View
 * 
 * Detailed view of a single QC run with findings, artifacts, and evidence.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  FileText,
  Download,
  ArrowLeft,
  Clock,
  GitBranch,
  GitCommit,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QcRunDetailViewProps {
  runId: Id<"qcRuns">;
  onBack?: () => void;
}

function RiskGradeBadge({ grade }: { grade: "GREEN" | "YELLOW" | "RED" | undefined }) {
  if (!grade) return <Badge variant="outline">N/A</Badge>;
  
  const colors = {
    GREEN: "bg-green-500/10 text-green-600 border-green-500/20",
    YELLOW: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    RED: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  
  return (
    <Badge variant="outline" className={cn("font-mono", colors[grade])}>
      {grade}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: "RED" | "YELLOW" | "GREEN" | "INFO" }) {
  const colors = {
    RED: "bg-red-500/10 text-red-600 border-red-500/20",
    YELLOW: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    GREEN: "bg-green-500/10 text-green-600 border-green-500/20",
    INFO: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  };
  
  const icons = {
    RED: AlertTriangle,
    YELLOW: AlertTriangle,
    GREEN: CheckCircle2,
    INFO: Info,
  };
  
  const Icon = icons[severity];
  
  return (
    <Badge variant="outline" className={cn("gap-1", colors[severity])}>
      <Icon className="h-3 w-3" />
      {severity}
    </Badge>
  );
}

export function QcRunDetailView({ runId, onBack }: QcRunDetailViewProps) {
  const run = useQuery(api.qcRuns.get, { id: runId });
  const findings = useQuery(api.qcFindings.listByRun, { qcRunId: runId });
  const artifacts = useQuery(api.qcArtifacts.listByRun, { qcRunId: runId });

  if (!run || !findings || !artifacts) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading run details...</div>
      </div>
    );
  }

  const findingsByCategory = findings.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, typeof findings>);

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              {run.runId}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {run.branch ?? "main"}
              <span>•</span>
              <GitCommit className="h-3 w-3" />
              {run.commitSha?.substring(0, 7)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RiskGradeBadge grade={run.riskGrade} />
          {run.qualityScore !== undefined && (
            <Badge variant="outline" className="font-mono">
              Score: {run.qualityScore}
            </Badge>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</div>
          <div className="mt-2 text-lg font-semibold">{run.status}</div>
          {run.durationMs && (
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.round(run.durationMs / 1000)}s
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Findings</div>
          <div className="mt-2 flex items-center gap-2">
            {run.findingCounts ? (
              <>
                <span className="text-red-600 font-medium">{run.findingCounts.red}</span>
                <span className="text-yellow-600 font-medium">{run.findingCounts.yellow}</span>
                <span className="text-green-600 font-medium">{run.findingCounts.green}</span>
                <span className="text-blue-600 font-medium">{run.findingCounts.info}</span>
              </>
            ) : (
              <span className="text-lg font-semibold">--</span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            RED / YELLOW / GREEN / INFO
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gate Status</div>
          <div className="mt-2 flex items-center gap-2">
            {run.gatePassed === true && (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-lg font-semibold text-green-600">PASSED</span>
              </>
            )}
            {run.gatePassed === false && (
              <>
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="text-lg font-semibold text-red-600">FAILED</span>
              </>
            )}
            {run.gatePassed === undefined && (
              <span className="text-lg font-semibold text-muted-foreground">N/A</span>
            )}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="findings" className="w-full">
        <TabsList>
          <TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts ({artifacts.length})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="space-y-4 mt-4">
          {Object.entries(findingsByCategory).map(([category, categoryFindings]) => (
            <Card key={category} className="p-4">
              <h3 className="text-sm font-semibold mb-3">
                {category.replace(/_/g, " ")} ({categoryFindings.length})
              </h3>
              <div className="space-y-3">
                {categoryFindings.map((finding) => (
                  <div key={finding._id} className="border-l-2 border-border pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={finding.severity} />
                          <span className="font-medium text-sm">{finding.title}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{finding.description}</p>
                        {finding.filePaths && finding.filePaths.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground font-mono">
                            {finding.filePaths.join(", ")}
                          </div>
                        )}
                        {finding.suggestedFix && (
                          <div className="mt-2 p-2 rounded bg-accent/50 text-xs">
                            <span className="font-medium">Suggested fix:</span> {finding.suggestedFix}
                          </div>
                        )}
                      </div>
                      {finding.confidence !== undefined && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(finding.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {findings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No findings for this run
            </div>
          )}
        </TabsContent>

        <TabsContent value="artifacts" className="space-y-3 mt-4">
          {artifacts.map((artifact) => (
            <Card key={artifact._id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{artifact.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {artifact.type} • {artifact.mimeType}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </Card>
          ))}
          {artifacts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No artifacts for this run
            </div>
          )}
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card className="p-6">
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Run ID</dt>
                <dd className="mt-1 font-mono text-sm">{run.runId}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Repo URL</dt>
                <dd className="mt-1 text-sm">{run.repoUrl}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scope</dt>
                <dd className="mt-1 text-sm">{run.scopeType}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Initiator</dt>
                <dd className="mt-1 text-sm">{run.initiatorType}</dd>
              </div>
              {run.evidenceHash && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Evidence Hash</dt>
                  <dd className="mt-1 font-mono text-xs break-all">{run.evidenceHash}</dd>
                </div>
              )}
            </dl>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
