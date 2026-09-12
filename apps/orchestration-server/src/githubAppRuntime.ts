import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const GITHUB_API_VERSION = "2026-03-10";

export interface InstallationToken {
  token: string;
  expiresAt: number;
}

export interface GithubPullRequestEvidence {
  prUrl: string;
  prNumber: number;
  providerPullRequestId: string;
  repoFullName: string;
  branch?: string;
  title?: string;
  draft: boolean;
  prState: "OPEN" | "CLOSED" | "MERGED";
  mergeActor?: string;
  mergedAt?: number;
  mergeCommitSha?: string;
  headSha: string;
  ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  ciRunUrl?: string;
  checkRuns: Array<{
    name: string;
    status: string;
    conclusion?: string | null;
    html_url?: string;
    details_url?: string;
  }>;
  diffLineCount?: number;
  signals: {
    testPassCount: number;
    testFailCount: number;
    verificationPassRate?: number;
    diffLineCount?: number;
    ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
    securityFindingCount: number;
    qcFindings: Array<{ title: string; category: string; severity: string }>;
  };
}

export function loadGithubAppPrivateKey(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const inlineKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (inlineKey) return inlineKey;
  const privateKeyFile = env.GITHUB_APP_PRIVATE_KEY_FILE?.trim();
  if (!privateKeyFile) return undefined;
  try {
    const key = readFileSync(privateKeyFile, "utf8").trim();
    if (!key) throw new Error("empty key file");
    return key;
  } catch {
    throw new Error("GitHub App private key file could not be read.");
  }
}

export async function mintInstallationToken(input: {
  appId: string;
  installationId: string;
  providerRepositoryId: string;
  privateKey: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<InstallationToken> {
  if (!/^\d+$/.test(input.installationId) || !/^\d+$/.test(input.providerRepositoryId)) {
    throw new Error("GitHub App installation and repository identities must be numeric.");
  }
  const appJwt = createGithubAppJwt({ appId: input.appId, privateKey: input.privateKey, now: input.now });
  const result = await githubJson<{ token?: string; expires_at?: string }>(
    `https://api.github.com/app/installations/${input.installationId}/access_tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${appJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ repository_ids: [Number(input.providerRepositoryId)] }),
    },
    input.fetchImpl
  );
  const expiresAt = result.expires_at ? Date.parse(result.expires_at) : Number.NaN;
  if (!result.token || !Number.isFinite(expiresAt)) throw new Error("GitHub installation token could not be issued.");
  return { token: result.token, expiresAt };
}

/** Exact read-only recovery. Absence or disagreement never causes a write. */
export async function reconcilePublishedPullRequest(input: {
  repository: string; providerRepositoryId: string; branch: string; base: string; headSha: string; token: string; fetchImpl?: typeof fetch;
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)) throw new Error("Invalid reconciliation repository.");
  const [owner] = input.repository.split("/");
  const headers = { Authorization: `Bearer ${input.token}` };
  const ref = await githubJson<any>(`https://api.github.com/repos/${input.repository}/git/ref/heads/${encodeURIComponent(input.branch)}`, { method: "GET", headers }, input.fetchImpl);
  if (ref?.object?.type !== "commit" || ref.object.sha !== input.headSha) throw new Error("Remote branch does not prove the exact published candidate.");
  const pulls = await githubJson<any[]>(`https://api.github.com/repos/${input.repository}/pulls?state=all&head=${encodeURIComponent(`${owner}:${input.branch}`)}&per_page=100`, { method: "GET", headers }, input.fetchImpl);
  if (pulls.length !== 1) throw new Error("Publication remains uncertain: exactly one remote pull request is required; no write was retried.");
  const pull = pulls[0];
  if (pull.state !== "open" || pull.draft !== true || !pull.node_id
    || String(pull.head?.repo?.id) !== input.providerRepositoryId || String(pull.base?.repo?.id) !== input.providerRepositoryId
    || pull.html_url !== `https://github.com/${input.repository}/pull/${pull.number}`) {
    throw new Error("Remote pull request is not the exact open draft in the authorized repository.");
  }
  return normalizePullRequest(pull, input, true);
}

export async function createOrReusePullRequest(input: {
  repository: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  token: string;
  headSha: string;
  draft?: boolean;
  signal?: AbortSignal;
  assertWriteAllowed?: () => Promise<void>;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  headPropagationAttempts?: number;
  headPropagationDelayMs?: number;
}) {
  const [owner] = input.repository.split("/");
  if (!owner || input.repository.split("/").length !== 2) throw new Error("GitHub repository must use owner/name format.");
  const listOpenPullRequests = () => githubJson<Array<any>>(
    `https://api.github.com/repos/${input.repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${input.branch}`)}&per_page=10`,
    { method: "GET", headers: { Authorization: `Bearer ${input.token}` }, signal: input.signal },
    input.fetchImpl
  );
  const existing = await listOpenPullRequests();
  const exact = existing.find((pull) => pull?.head?.ref === input.branch && pull?.base?.ref === input.base);
  if (exact) {
    return await normalizeReusedPullRequestAfterPush(exact, input, listOpenPullRequests);
  }
  if (existing.length > 0) throw new Error("An open pull request exists for the branch with a different base branch.");
  await input.assertWriteAllowed?.();
  input.signal?.throwIfAborted();
  const created = await githubJson<any>(
    `https://api.github.com/repos/${input.repository}/pulls`,
    {
      method: "POST",
      signal: input.signal,
      headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.slice(0, 240),
        body: input.body.slice(0, 60_000),
        head: input.branch,
        base: input.base,
        draft: input.draft === true,
      }),
    },
    input.fetchImpl
  );
  return normalizePullRequest(created, input, false);
}

async function normalizeReusedPullRequestAfterPush(
  initialPullRequest: any,
  expected: {
    branch: string;
    base: string;
    headSha: string;
    sleepImpl?: (milliseconds: number) => Promise<void>;
    headPropagationAttempts?: number;
    headPropagationDelayMs?: number;
  },
  listOpenPullRequests: () => Promise<Array<any>>,
) {
  const attempts = Math.max(1, expected.headPropagationAttempts ?? 8);
  const delayMs = Math.max(0, expected.headPropagationDelayMs ?? 750);
  const sleepImpl = expected.sleepImpl ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  let pullRequest = initialPullRequest;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (pullRequest?.head?.sha === expected.headSha) {
      return normalizePullRequest(pullRequest, expected, true);
    }
    if (attempt < attempts) {
      await sleepImpl(delayMs);
      const openPullRequests = await listOpenPullRequests();
      const refreshed = openPullRequests.find((pull) =>
        pull?.head?.ref === expected.branch && pull?.base?.ref === expected.base
      );
      if (!refreshed) throw new Error("The exact open GitHub pull request disappeared while confirming its candidate head.");
      pullRequest = refreshed;
    }
  }
  return normalizePullRequest(pullRequest, expected, true);
}

export async function fetchGithubPullRequestEvidence(input: {
  repository: string;
  prNumber: number;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubPullRequestEvidence> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${input.token}` };
  const pullRequest = await githubJson<any>(
    `https://api.github.com/repos/${input.repository}/pulls/${input.prNumber}`,
    { method: "GET", headers },
    fetchImpl,
  );
  const headSha = pullRequest?.head?.sha;
  if (!headSha || typeof pullRequest?.node_id !== "string" || !pullRequest.node_id.trim()) {
    throw new Error("GitHub pull request is missing its immutable provider identity.");
  }
  const checksPayload = await githubJson<{ check_runs?: GithubPullRequestEvidence["checkRuns"] }>(
    `https://api.github.com/repos/${input.repository}/commits/${headSha}/check-runs?per_page=100`,
    { method: "GET", headers },
    fetchImpl,
  );
  const checkRuns = (checksPayload.check_runs ?? []).map((check) => ({
    name: check.name,
    status: check.status,
    conclusion: check.conclusion,
    html_url: check.html_url,
    details_url: check.details_url,
  }));
  const completed = checkRuns.filter((check) => check.status === "completed");
  const hasPending = checkRuns.some((check) => ["queued", "in_progress", "pending"].includes(check.status));
  const hasFailure = completed.some((check) => [
    "failure", "timed_out", "cancelled", "action_required", "startup_failure",
  ].includes(check.conclusion ?? ""));
  const ciStatus = hasFailure
    ? "FAIL" as const
    : hasPending
      ? "PENDING" as const
      : completed.length > 0 && completed.every((check) => ["success", "skipped", "neutral"].includes(check.conclusion ?? ""))
        ? "PASS" as const
        : completed.length > 0
          ? "PENDING" as const
          : "UNKNOWN" as const;
  const testChecks = checkRuns.filter((check) => /test|vitest|jest|pytest|mutation|coverage|ci/i.test(check.name));
  const testPassCount = testChecks.filter((check) => check.conclusion === "success").length;
  const testFailCount = testChecks.filter((check) => ["failure", "timed_out"].includes(check.conclusion ?? "")).length;
  const diffResponse = await fetchImpl(
    `https://api.github.com/repos/${input.repository}/pulls/${input.prNumber}`,
    {
      method: "GET",
      headers: {
        ...githubHeaders(headers),
        Accept: "application/vnd.github.v3.diff",
      },
    },
  );
  const diffLineCount = diffResponse.ok
    ? (await diffResponse.text()).split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length
    : undefined;
  const mergedAt = pullRequest.merged_at ? Date.parse(pullRequest.merged_at) : Number.NaN;
  return {
    prUrl: pullRequest.html_url ?? `https://github.com/${input.repository}/pull/${input.prNumber}`,
    prNumber: input.prNumber,
    providerPullRequestId: pullRequest.node_id,
    repoFullName: input.repository,
    branch: pullRequest.head?.ref,
    title: pullRequest.title,
    draft: pullRequest.draft === true,
    prState: pullRequest.merged ? "MERGED" : pullRequest.state === "open" ? "OPEN" : "CLOSED",
    mergeActor: pullRequest.merged ? pullRequest.merged_by?.login : undefined,
    mergedAt: pullRequest.merged && Number.isFinite(mergedAt) ? mergedAt : undefined,
    mergeCommitSha: pullRequest.merged ? pullRequest.merge_commit_sha ?? undefined : undefined,
    headSha,
    ciStatus,
    ciRunUrl: checkRuns.find((check) => check.html_url)?.html_url ?? checkRuns[0]?.details_url,
    checkRuns,
    diffLineCount,
    signals: {
      testPassCount,
      testFailCount,
      verificationPassRate: testPassCount + testFailCount > 0
        ? Math.round((testPassCount / (testPassCount + testFailCount)) * 100)
        : undefined,
      diffLineCount,
      ciStatus,
      securityFindingCount: checkRuns.filter((check) => /security/i.test(check.name) && check.conclusion === "failure").length,
      qcFindings: checkRuns
        .filter((check) => check.conclusion === "failure")
        .map((check) => ({
          title: check.name,
          category: /security/i.test(check.name) ? "SECURITY_GAP" : "DELIVERY_GATE",
          severity: "RED",
        })),
    },
  };
}

export function createGithubAppJwt(input: { appId: string; privateKey: string; now?: number }) {
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: input.appId }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(input.privateKey.replace(/\\n/g, "\n"));
  return `${signingInput}.${signature.toString("base64url")}`;
}

async function githubJson<T>(url: string, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: githubHeaders(init.headers),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(`GitHub request failed (${response.status}): ${String(error.message ?? "request rejected").slice(0, 300)}`);
  }
  return await response.json() as T;
}

function githubHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    normalized[key] = value;
  });
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "Mission-Control-Factory-Worker",
    ...normalized,
  };
}

function normalizePullRequest(
  pull: any,
  expected: { branch: string; base: string; headSha: string },
  reused: boolean,
) {
  if (!Number.isInteger(pull?.number) || typeof pull?.html_url !== "string") {
    throw new Error("GitHub returned an invalid pull-request record.");
  }
  if (pull?.head?.ref !== expected.branch || pull?.base?.ref !== expected.base) {
    throw new Error("GitHub pull-request refs do not match the approved publication target.");
  }
  if (typeof pull?.head?.sha !== "string" || pull.head.sha !== expected.headSha) {
    throw new Error("GitHub pull-request head does not match the independently verified candidate.");
  }
  return {
    number: pull.number as number,
    url: pull.html_url as string,
    nodeId: typeof pull.node_id === "string" ? pull.node_id : undefined,
    headSha: pull.head.sha,
    draft: pull.draft === true,
    reused,
  };
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
