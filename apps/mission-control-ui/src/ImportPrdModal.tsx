import { useState, useRef } from "react";
import { useAction, useMutation } from "convex/react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileUp, Trash2 } from "lucide-react";

const TASK_TYPES = [
  "ENGINEERING",
  "CONTENT",
  "DOCS",
  "OPS",
  "SOCIAL",
  "EMAIL_MARKETING",
  "CUSTOMER_RESEARCH",
  "SEO_RESEARCH",
] as const;

const PRIORITIES = [
  { value: 1, label: "Critical" },
  { value: 2, label: "High" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Low" },
] as const;

export type ParsedTaskRow = {
  title: string;
  description?: string;
  type: string;
  priority: number;
  dependencyIndices?: number[];
};

export function ImportPrdModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onCreated?: (count: number) => void;
}) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [content, setContent] = useState("");
  const [tasks, setTasks] = useState<ParsedTaskRow[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsePrd = useAction(api.prd.parsePrd);
  const storePrdDocument = useMutation(api.prd.storePrdDocument);
  const bulkCreateFromPrd = useMutation(api.prd.bulkCreateFromPrd);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setError(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleParse = async () => {
    const text = content.trim();
    if (!text) {
      setError("Paste or upload PRD content first.");
      return;
    }
    setParseLoading(true);
    setError(null);
    try {
      const result = await parsePrd({ content: text, maxTasks: 25 });
      const rows: ParsedTaskRow[] = (result.tasks ?? []).map((t) => ({
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        dependencyIndices: t.dependencyIndices,
      }));
      setTasks(rows);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse PRD");
    } finally {
      setParseLoading(false);
    }
  };

  const updateTask = (index: number, patch: Partial<ParsedTaskRow>) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t))
    );
  };

  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateAll = async () => {
    if (tasks.length === 0) {
      setError("No tasks to create.");
      return;
    }
    setCreateLoading(true);
    setError(null);
    try {
      const title = content.slice(0, 80).replace(/\n/g, " ").trim() || "Imported PRD";
      const docId = await storePrdDocument({
        projectId: projectId ?? undefined,
        title,
        content,
        taskCount: tasks.length,
        createdBy: "HUMAN",
      });
      await bulkCreateFromPrd({
        projectId: projectId ?? undefined,
        prdDocumentId: docId,
        tasks: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          type: t.type,
          priority: t.priority,
          dependencyIndices: t.dependencyIndices,
        })),
        createdBy: "HUMAN",
      });
      onCreated?.(tasks.length);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tasks");
    } finally {
      setCreateLoading(false);
    }
  };

  const backToInput = () => {
    setStep("input");
    setTasks([]);
    setError(null);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>
            {step === "input" ? "Import PRD" : "Review tasks"}
          </DialogTitle>
          <DialogDescription>
            {step === "input"
              ? "Paste markdown or upload a .md file. We'll parse it into tasks."
              : "Edit types and priorities, then create all tasks in INBOX."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <>
            <div className="space-y-2">
              <Textarea
                placeholder="Paste your PRD markdown here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                disabled={parseLoading}
              />
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parseLoading}
                >
                  <FileUp className="h-4 w-4 mr-1" />
                  Upload .md
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={parseLoading || !content.trim()}>
                {parseLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing…
                  </>
                ) : (
                  "Parse"
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="border rounded-md overflow-auto max-h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[8%]">Priority</TableHead>
                    <TableHead className="w-[18%]">Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select
                          value={String(t.priority)}
                          onValueChange={(v) => updateTask(i, { priority: Number(v) })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITIES.map((p) => (
                              <SelectItem key={p.value} value={String(p.value)}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={t.type}
                          onValueChange={(v) => updateTask(i, { type: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[240px] truncate" title={t.title}>
                        {t.title}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTask(i)}
                          aria-label="Remove task"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={backToInput}>
                Back
              </Button>
              <Button
                onClick={handleCreateAll}
                disabled={createLoading || tasks.length === 0}
              >
                {createLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : (
                  `Create All (${tasks.length})`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
