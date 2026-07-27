import { useState } from "react";
import { Button } from "@/components/ui/button";

export function HarnessFirstReviewModal({
  open,
  onClose,
  onProceedComment,
}: {
  open: boolean;
  onClose: () => void;
  onProceedComment: () => void;
}): JSX.Element | null {
  const [fixedHarness, setFixedHarness] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-md rounded-xl border border-line bg-surface-1 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-ink">Harness-first feedback</h3>
        <p className="mt-2 text-sm text-ink-secondary">
          Before leaving a drive-by PR comment, fix the harness once: update skill, test, or architecture — then retry.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={fixedHarness}
            onChange={(e) => setFixedHarness(e.target.checked)}
          />
          I updated the harness and retried
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!fixedHarness} onClick={onProceedComment}>
            Leave comment
          </Button>
        </div>
      </div>
    </div>
  );
}
