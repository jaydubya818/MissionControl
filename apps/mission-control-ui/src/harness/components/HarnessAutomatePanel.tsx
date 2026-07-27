import { useMutation } from "convex/react";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { MainView } from "../../TopNav";
import { AutomateThisCta } from "./HarnessUi";

const GITHUB_ACTION_TEMPLATE = `name: Mission Control Change Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
  check_run:
    types: [completed]

jobs:
  harness-ingest:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Mission Control
        run: |
          curl -X POST "$CONVEX_SITE_URL/github/webhook" \\
            -H "Content-Type: application/json" \\
            -H "X-GitHub-Event: pull_request" \\
            -d '{"action":"synchronize","pull_request":{"number": \${{ github.event.pull_request.number }}, "html_url": "\${{ github.event.pull_request.html_url }}"}, "repository":{"full_name": "\${{ github.repository }}"}}'
`;

export function HarnessAutomatePanel({
  projectId,
  skillName = "code-review",
  schedule = "0 9 * * 1",
  onNavigate,
}: {
  projectId?: Id<"projects"> | null;
  skillName?: string;
  schedule?: string;
  onNavigate?: (view: MainView) => void;
}): JSX.Element {
  const scheduleWorkflow = useMutation(api.factory.workflows.schedule);
  const [copied, setCopied] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  const handleSchedule = async () => {
    await scheduleWorkflow({
      projectId: projectId ?? undefined,
      skillName,
      schedule,
      idempotencyKey: `automate-${skillName}-${schedule}`,
      actorId: "harness-automate-ui",
    });
    setScheduled(true);
    onNavigate?.("harness-launch");
  };

  const handleCi = async () => {
    await navigator.clipboard.writeText(GITHUB_ACTION_TEMPLATE);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCron = () => {
    onNavigate?.("harness-launch");
  };

  return (
    <div className="space-y-2">
      <AutomateThisCta
        onSchedule={() => void handleSchedule()}
        onCi={() => void handleCi()}
        onCron={handleCron}
      />
      {scheduled ? (
        <p className="text-xs text-ok">Recurring workflow scheduled — see Launch.</p>
      ) : null}
      {copied ? (
        <p className="flex items-center gap-1 text-xs text-ok">
          <Check size={12} aria-hidden />
          GitHub Action template copied
        </p>
      ) : (
        <p className="flex items-center gap-1 text-[11px] text-ink-muted">
          <Copy size={11} aria-hidden />
          CI template posts PR events to your Convex /github/webhook endpoint
        </p>
      )}
    </div>
  );
}
