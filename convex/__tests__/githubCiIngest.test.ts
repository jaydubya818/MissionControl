import { describe, expect, it } from "vitest";
import {
  githubPullRequestMergeEvidence,
  canonicalGithubPullRequestUrl,
  extractPrFromWebhookEvent,
  isSupportedPullRequestWebhookAction,
  mapCheckRunsToSignals,
  parseMissionControlPullRequestLineage,
  verifyGithubWebhookSignature,
} from "../lib/githubCiIngest";
import { buildFileTreeFromPaths } from "../lib/fileTree";

describe("githubCiIngest", () => {
  it("maps GitHub check runs to CI signals", () => {
    const mapped = mapCheckRunsToSignals([
      { name: "unit-tests", status: "completed", conclusion: "success" },
      { name: "vitest", status: "completed", conclusion: "failure" },
      { name: "lint", status: "completed", conclusion: "success" },
    ]);
    expect(mapped.ciStatus).toBe("FAIL");
    expect(mapped.testPassCount).toBe(1);
    expect(mapped.testFailCount).toBe(1);
  });

  it("does not report pass while any GitHub check is still pending", () => {
    const mapped = mapCheckRunsToSignals([
      { name: "Vercel Preview", status: "completed", conclusion: "success" },
      { name: "unit-tests", status: "in_progress", conclusion: null },
      { name: "build", status: "queued", conclusion: null },
    ]);

    expect(mapped.ciStatus).toBe("PENDING");
  });

  it("fails closed when a webhook signature or secret is missing", async () => {
    expect(await verifyGithubWebhookSignature("{}", null, "secret")).toBe(false);
    expect(await verifyGithubWebhookSignature("{}", "sha256=abc", "")).toBe(false);
  });

  it("correlates pull-request and check-run payloads to the same PR", () => {
    const repository = { full_name: "owner/repo" };
    expect(extractPrFromWebhookEvent("pull_request", {
      repository,
      pull_request: { number: 42, html_url: "https://github.com/owner/repo/pull/42" },
    })).toMatchObject({ owner: "owner", repo: "repo", prNumber: 42 });
    expect(extractPrFromWebhookEvent("check_run", {
      repository,
      check_run: { pull_requests: [{ number: 42, url: "https://api.github.com/repos/owner/repo/pulls/42" }] },
    })).toEqual({ owner: "owner", repo: "repo", prNumber: 42, prUrl: "https://github.com/owner/repo/pull/42" });
    expect(extractPrFromWebhookEvent("pull_request_review", {
      repository,
      pull_request: { number: 42 },
    })).toMatchObject({ owner: "owner", repo: "repo", prNumber: 42 });
  });

  it("builds one canonical browser URL for every webhook source", () => {
    expect(canonicalGithubPullRequestUrl("owner", "repo", 42)).toBe("https://github.com/owner/repo/pull/42");
  });

  it("extracts complete factory lineage from the exact PR body section", () => {
    expect(parseMissionControlPullRequestLineage(`
## Mission Control governed execution

### Lineage
- missionId: \`mission123\`
- taskId: \`task123\`
- workOrderId: \`workorder123\`
- workflowRunId: \`run123\`

### Approved file scopes
- Docs: \`docs/**\`
`)).toEqual({
      workOrderId: "workorder123",
      workflowRunId: "run123",
      taskId: "task123",
    });
  });

  it("fails closed for partial or duplicate factory lineage", () => {
    expect(() => parseMissionControlPullRequestLineage(`
### Lineage
- workOrderId: \`workorder123\`
- workflowRunId: \`run123\`
`)).toThrow("lineage is incomplete");
    expect(() => parseMissionControlPullRequestLineage(`
### Lineage
- workOrderId: \`workorder123\`
- workOrderId: \`workorder456\`
- workflowRunId: \`run123\`
- taskId: \`task123\`
`)).toThrow("duplicate workOrderId");
  });

  it("accepts PR edits and closure as fresh evidence synchronization events", () => {
    expect(isSupportedPullRequestWebhookAction("edited")).toBe(true);
    expect(isSupportedPullRequestWebhookAction("closed")).toBe(true);
    expect(isSupportedPullRequestWebhookAction("labeled")).toBe(false);
  });

  it("preserves exact provider merge identity only for merged pull requests", () => {
    expect(githubPullRequestMergeEvidence({
      merged: true,
      merged_at: "2026-08-11T20:15:30Z",
      merge_commit_sha: "a".repeat(40),
      merged_by: { login: "release-operator" },
    })).toEqual({
      mergeActor: "release-operator",
      mergedAt: Date.parse("2026-08-11T20:15:30Z"),
      mergeCommitSha: "a".repeat(40),
    });
    expect(githubPullRequestMergeEvidence({
      merged: false,
      merged_at: "2026-08-11T20:15:30Z",
      merge_commit_sha: "b".repeat(40),
    })).toEqual({});
  });
});

describe("fileTree", () => {
  it("builds nested folders from flat paths", () => {
    const tree = buildFileTreeFromPaths([
      "skills/foo/SKILL.md",
      "skills/foo/docs/guide.md",
    ]);
    expect(tree[0]?.kind).toBe("folder");
    expect(tree[0]?.children?.length).toBeGreaterThan(0);
  });
});
