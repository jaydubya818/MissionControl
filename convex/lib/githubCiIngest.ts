import type { PrCheckSignals } from "./harnessPrChecks";

export interface GithubCheckRun {
  name: string;
  status: string;
  conclusion?: string | null;
  html_url?: string;
  details_url?: string;
}

export interface GithubCiPayload {
  prUrl: string;
  prNumber: number;
  repoFullName: string;
  branch?: string;
  title?: string;
  prState: "OPEN" | "CLOSED" | "MERGED";
  mergeActor?: string;
  mergedAt?: number;
  mergeCommitSha?: string;
  headSha?: string;
  ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  ciRunUrl?: string;
  checkRuns: GithubCheckRun[];
  diffLineCount?: number;
  signals: Partial<PrCheckSignals>;
  lineage?: GithubPullRequestLineage;
}

export function githubPullRequestMergeEvidence(pr: {
  merged?: boolean;
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  merged_by?: { login?: string } | null;
}): Pick<GithubCiPayload, "mergeActor" | "mergedAt" | "mergeCommitSha"> {
  if (!pr.merged) return {};
  const parsedMergedAt = pr.merged_at ? Date.parse(pr.merged_at) : Number.NaN;
  return {
    mergeActor: pr.merged_by?.login || undefined,
    mergedAt: Number.isFinite(parsedMergedAt) ? parsedMergedAt : undefined,
    mergeCommitSha: pr.merge_commit_sha || undefined,
  };
}

export interface GithubPullRequestLineage {
  workOrderId: string;
  workflowRunId: string;
  taskId: string;
}

export function canonicalGithubPullRequestUrl(owner: string, repo: string, prNumber: number) {
  return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
}

export function isSupportedPullRequestWebhookAction(action: unknown): boolean {
  return ["opened", "synchronize", "reopened", "edited", "closed"].includes(String(action ?? ""));
}

export function parseMissionControlPullRequestLineage(
  body?: string | null
): GithubPullRequestLineage | undefined {
  if (!body) return undefined;
  const lineageSection = body.match(/^### Lineage\s*$([\s\S]*?)(?=^###\s|(?![\s\S]))/m)?.[1];
  if (!lineageSection) return undefined;

  const readField = (key: keyof GithubPullRequestLineage): string | undefined => {
    const pattern = new RegExp(
      "^\\s*-\\s+" + key + ":\\s+`([a-z0-9]+)`\\s*$",
      "gm"
    );
    const matches = Array.from(lineageSection.matchAll(pattern), (match) => match[1]);
    if (matches.length > 1) {
      throw new Error(`Mission Control PR lineage contains duplicate ${key} values`);
    }
    return matches[0];
  };

  const workOrderId = readField("workOrderId");
  const workflowRunId = readField("workflowRunId");
  const taskId = readField("taskId");
  const presentCount = [workOrderId, workflowRunId, taskId].filter(Boolean).length;
  if (presentCount === 0) return undefined;
  if (!workOrderId || !workflowRunId || !taskId) {
    throw new Error("Mission Control PR lineage is incomplete");
  }
  return { workOrderId, workflowRunId, taskId };
}

const GITHUB_REQUEST_TIMEOUT_MS = 15_000;

async function fetchFromGitHub(
  url: string,
  options: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `GitHub request timed out after ${GITHUB_REQUEST_TIMEOUT_MS / 1000} seconds`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "MissionControl-CI-Ingest",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function mapCheckRunsToSignals(
  checks: GithubCheckRun[]
): Partial<PrCheckSignals> & { ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN" } {
  let testPassCount = 0;
  let testFailCount = 0;

  for (const check of checks) {
    if (!/test|vitest|jest|pytest|mutation|coverage|ci/i.test(check.name)) continue;
    if (check.conclusion === "success") testPassCount += 1;
    else if (check.conclusion === "failure" || check.conclusion === "timed_out") testFailCount += 1;
  }

  const completed = checks.filter((c) => c.status === "completed");
  const hasPending = checks.some((c) => c.status === "in_progress" || c.status === "queued");
  const hasBlockingConclusion = completed.some((c) =>
    ["failure", "timed_out", "cancelled", "action_required", "startup_failure"].includes(
      c.conclusion ?? ""
    )
  );
  let ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN" = "UNKNOWN";
  if (hasBlockingConclusion) {
    ciStatus = "FAIL";
  } else if (hasPending) {
    ciStatus = "PENDING";
  } else if (
    completed.length > 0 &&
    completed.every((c) => ["success", "skipped", "neutral"].includes(c.conclusion ?? ""))
  ) {
    ciStatus = "PASS";
  } else if (completed.length > 0) {
    ciStatus = "PENDING";
  }

  return {
    testPassCount,
    testFailCount,
    verificationPassRate:
      testPassCount + testFailCount > 0
        ? Math.round((testPassCount / (testPassCount + testFailCount)) * 100)
        : undefined,
    ciStatus,
  };
}

export async function fetchPullRequestCi(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<GithubCiPayload> {
  const headers = githubHeaders(token);
  const prRes = await fetchFromGitHub(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers }
  );
  if (!prRes.ok) {
    throw new Error(`GitHub PR lookup failed (${prRes.status})`);
  }
  const pr = (await prRes.json()) as {
    title?: string;
    body?: string | null;
    state?: "open" | "closed";
    merged?: boolean;
    merged_at?: string | null;
    merge_commit_sha?: string | null;
    merged_by?: { login?: string } | null;
    head?: { ref?: string; sha?: string };
    html_url?: string;
  };

  const headSha = pr.head?.sha;
  if (!headSha) {
    throw new Error("PR head SHA missing");
  }

  const checksRes = await fetchFromGitHub(
    `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}/check-runs?per_page=100`,
    { headers }
  );
  if (!checksRes.ok) {
    throw new Error(`GitHub check-runs lookup failed (${checksRes.status})`);
  }
  const checksBody = (await checksRes.json()) as {
    check_runs?: Array<{
      name: string;
      status: string;
      conclusion?: string | null;
      html_url?: string;
      details_url?: string;
    }>;
  };

  const checkRuns: GithubCheckRun[] = (checksBody.check_runs ?? []).map((c) => ({
    name: c.name,
    status: c.status,
    conclusion: c.conclusion,
    html_url: c.html_url,
    details_url: c.details_url,
  }));

  const diffRes = await fetchFromGitHub(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: { ...headers, Accept: "application/vnd.github.v3.diff" } }
  );
  let diffLineCount: number | undefined;
  if (diffRes.ok) {
    const diff = await diffRes.text();
    diffLineCount = diff.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-")).length;
  }

  const mapped = mapCheckRunsToSignals(checkRuns);
  const prUrl = pr.html_url ?? `https://github.com/${owner}/${repo}/pull/${prNumber}`;
  const ciRunUrl = checkRuns.find((c) => c.html_url)?.html_url ?? checkRuns[0]?.details_url;
  const mergeEvidence = githubPullRequestMergeEvidence(pr);

  return {
    prUrl,
    prNumber,
    repoFullName: `${owner}/${repo}`,
    branch: pr.head?.ref,
    title: pr.title,
    prState: pr.merged ? "MERGED" : pr.state === "open" ? "OPEN" : "CLOSED",
    ...mergeEvidence,
    headSha,
    ciStatus: mapped.ciStatus ?? "UNKNOWN",
    ciRunUrl,
    checkRuns,
    diffLineCount,
    signals: {
      ...mapped,
      diffLineCount,
      qcFindings: checkRuns
        .filter((c) => c.conclusion === "failure")
        .map((c) => ({
          title: c.name,
          category: /security/i.test(c.name) ? "SECURITY_GAP" : "DELIVERY_GATE",
          severity: "RED" as const,
        })),
    },
    lineage: parseMissionControlPullRequestLineage(pr.body),
  };
}

export async function verifyGithubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=") || !secret) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actualHex.length !== expectedHex.length) return false;
  let eq = true;
  for (let i = 0; i < actualHex.length; i++) {
    if (actualHex[i] !== expectedHex[i]) eq = false;
  }
  return eq;
}

export function extractPrFromWebhookEvent(event: string, payload: Record<string, unknown>): {
  owner: string;
  repo: string;
  prNumber: number;
  prUrl: string;
} | null {
  if (event === "pull_request") {
    const pr = payload.pull_request as { number?: number; html_url?: string } | undefined;
    const repo = payload.repository as { full_name?: string } | undefined;
    if (!pr?.number || !repo?.full_name) return null;
    const [owner, name] = repo.full_name.split("/");
    return {
      owner,
      repo: name,
      prNumber: pr.number,
      prUrl: canonicalGithubPullRequestUrl(owner, name, pr.number),
    };
  }
  if (event === "pull_request_review") {
    const pr = payload.pull_request as { number?: number; html_url?: string } | undefined;
    const repo = payload.repository as { full_name?: string } | undefined;
    if (!pr?.number || !repo?.full_name) return null;
    const [owner, name] = repo.full_name.split("/");
    return {
      owner,
      repo: name,
      prNumber: pr.number,
      prUrl: canonicalGithubPullRequestUrl(owner, name, pr.number),
    };
  }
  if (event === "check_run") {
    const check = payload.check_run as { pull_requests?: Array<{ number?: number; url?: string }> } | undefined;
    const repo = payload.repository as { full_name?: string } | undefined;
    const pr = check?.pull_requests?.[0];
    if (!pr?.number || !repo?.full_name) return null;
    const [owner, name] = repo.full_name.split("/");
    return {
      owner,
      repo: name,
      prNumber: pr.number,
      prUrl: canonicalGithubPullRequestUrl(owner, name, pr.number),
    };
  }
  return null;
}
