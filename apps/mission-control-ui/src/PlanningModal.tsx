import { useState, useEffect } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";

type Step = "questions" | "plan" | "done";

export function PlanningModal({
  taskId,
  onClose,
  onSuccess,
}: {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [step, setStep] = useState<Step>("questions");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [plan, setPlan] = useState<{
    bullets: string[];
    estimatedCost?: number;
    estimatedDuration?: string;
    source?: "MODEL" | "TEMPLATE";
    unavailableReason?: string;
  } | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const task = useQuery(
    api.planning.getTaskForPlanning,
    taskId ? { taskId } : "skip"
  );
  const generateQuestions = useAction(api.planning.generateQuestions);
  const generatePlanFromAnswers = useAction(api.planning.generatePlanFromAnswers);
  const submitPlan = useMutation(api.planning.submitPlan);

  useEffect(() => {
    setStep("questions");
    setQuestions([]);
    setAnswers({});
    setPlan(null);
    setError(null);
    setQuestionsLoading(false);
    setPlanLoading(false);
    setSubmitLoading(false);
  }, [taskId]);

  useEffect(() => {
    if (!taskId || !task) return;
    if (step !== "questions" || questions.length > 0) return;
    setQuestionsLoading(true);
    setError(null);
    generateQuestions({
      title: task.title,
      description: task.description ?? undefined,
      type: task.type,
    })
      .then((res) => {
        setQuestions(res.questions);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to generate questions");
      })
      .finally(() => {
        setQuestionsLoading(false);
      });
  }, [taskId, task, step, questions.length, generateQuestions]);

  const handleNextToPlan = async () => {
    if (!task) return;
    const qa = questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
    if (qa.some((a) => !a.answer.trim())) {
      setError("Please answer all questions.");
      return;
    }
    setPlanLoading(true);
    setError(null);
    try {
      const res = await generatePlanFromAnswers({
        title: task.title,
        description: task.description ?? undefined,
        type: task.type,
        answers: qa,
      });
      setPlan(res);
      setStep("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!taskId || !plan) return;
    const qa = questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
    setSubmitLoading(true);
    setError(null);
    try {
      await submitPlan({
        taskId,
        workPlan: {
          bullets: plan.bullets,
          estimatedCost: plan.estimatedCost,
          estimatedDuration: plan.estimatedDuration,
        },
        planningQa: qa,
        idempotencyKey: `plan:${taskId}:${Date.now()}`,
      });
      setStep("done");
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit plan");
    } finally {
      setSubmitLoading(false);
    }
  };

  const open = !!taskId;
  const canNext = questions.length > 0 && questions.every((_, i) => (answers[i] ?? "").trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Plan with AI
          </DialogTitle>
          <DialogDescription>
            {task
              ? `Clarify and plan: ${task.title.slice(0, 50)}${task.title.length > 50 ? "…" : ""}`
              : "Loading task…"}
          </DialogDescription>
        </DialogHeader>

        {task && (
          <div className="space-y-4 py-2">
            {step === "questions" && (
              <>
                {questionsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating questions…
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Answer these so we can build a precise work plan.
                    </p>
                    {questions.map((q, i) => (
                      <div key={i} className="space-y-2">
                        <Label className="text-sm font-medium">{q}</Label>
                        <Input
                          value={answers[i] ?? ""}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                          }
                          placeholder="Your answer…"
                          className="bg-background"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === "plan" && plan && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Review the work plan, then submit to assign.</p>
                {plan.source === "TEMPLATE" && (
                  <p role="status" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
                    This is a generic template, not a generated plan
                    {plan.unavailableReason ? `: ${plan.unavailableReason}` : "."} Edit it before
                    submitting — no cost or duration has been estimated.
                  </p>
                )}
                <ul className="list-disc pl-5 text-sm text-foreground/90 space-y-1">
                  {plan.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {plan.estimatedCost != null && (
                    <span>Est. cost: ${plan.estimatedCost.toFixed(2)}</span>
                  )}
                  {plan.estimatedDuration && (
                    <span>Est. duration: {plan.estimatedDuration}</span>
                  )}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "questions" && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleNextToPlan}
                disabled={questionsLoading || planLoading || !canNext}
              >
                {planLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating plan…
                  </>
                ) : (
                  "Generate plan"
                )}
              </Button>
            </>
          )}
          {step === "plan" && (
            <>
              <Button variant="outline" onClick={() => setStep("questions")}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitLoading}>
                {submitLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting…
                  </>
                ) : (
                  "Submit plan & assign"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
