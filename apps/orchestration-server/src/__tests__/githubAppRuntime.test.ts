import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOrReusePullRequest,
  reconcilePublishedPullRequest,
  fetchGithubPullRequestEvidence,
  loadGithubAppPrivateKey,
} from "../githubAppRuntime.js";

describe("GitHub App runtime", () => {
  for (const reason of ["expiry", "cancellation"] as const) it(`rechecks ${reason} after GET and before creating a PR`, async () => {
    const controller = new AbortController();
    let expired = false;
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      expect(init.method).toBe("GET");
      expired = true;
      if (reason === "cancellation") controller.abort();
      return Response.json([]);
    });
    await expect(createOrReusePullRequest({ repository: "qualification/repo", branch: "mc/candidate", base: "main",
      headSha: "a".repeat(40), token: "synthetic", title: "candidate", body: "evidence", fetchImpl, signal: controller.signal,
      assertWriteAllowed: async () => { if (reason === "expiry" && expired) throw new Error("Permit expired during GET"); },
    })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("reconciles a lost publication response using GET only and never retries an absent or conflicting PR", async () => {
    const input = { repository: "qualification/repo", providerRepositoryId: "101", branch: "mc/candidate", base: "main", headSha: "a".repeat(40), token: "synthetic" };
    const pull = { number: 42, html_url: "https://github.com/qualification/repo/pull/42", node_id: "PR_42", state: "open", draft: true,
      head: { ref: input.branch, sha: input.headSha, repo: { id: 101 } }, base: { ref: input.base, repo: { id: 101 } } };
    for (const remotePulls of [[pull], [], [pull, pull], [{ ...pull, state: "closed" }], [{ ...pull, head: { ...pull.head, sha: "b".repeat(40) } }]]) {
      const fetchImpl = vi.fn(async (url: any, init: any) => {
        expect(init.method).toBe("GET");
        return Response.json(String(url).includes("/git/ref/") ? { object: { type: "commit", sha: input.headSha } } : remotePulls);
      });
      const result = reconcilePublishedPullRequest({ ...input, fetchImpl });
      if (remotePulls.length === 1 && remotePulls[0] === pull) await expect(result).resolves.toMatchObject({ nodeId: "PR_42", reused: true });
      else await expect(result).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });
  it("loads the private key from an inline value or an owner-controlled file", () => {
    expect(loadGithubAppPrivateKey({ GITHUB_APP_PRIVATE_KEY: " inline-key " })).toBe("inline-key");

    const directory = mkdtempSync(join(tmpdir(), "mc-github-app-key-"));
    const privateKeyFile = join(directory, "app.pem");
    try {
      writeFileSync(privateKeyFile, "file-key\n", { mode: 0o600 });
      expect(loadGithubAppPrivateKey({ GITHUB_APP_PRIVATE_KEY_FILE: privateKeyFile })).toBe("file-key");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the configured private-key file is unreadable", () => {
    expect(() => loadGithubAppPrivateKey({
      GITHUB_APP_PRIVATE_KEY_FILE: "/definitely-missing/mission-control-app.pem",
    })).toThrow("GitHub App private key file could not be read");
  });

  it("reuses the exact open branch/base pull request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      number: 42,
      html_url: "https://github.com/sellerfi/sandbox/pull/42",
      node_id: "PR_42",
      head: { ref: "mc/work-order-1", sha: "abc123" },
      base: { ref: "main" },
    }]), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await createOrReusePullRequest({
      repository: "sellerfi/sandbox",
      branch: "mc/work-order-1",
      base: "main",
      title: "Add buyer gate",
      body: "Evidence",
      token: "not-logged",
      headSha: "abc123",
      fetchImpl,
    });
    expect(result).toMatchObject({ number: 42, reused: true, headSha: "abc123" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses to attest a reused pull request at a different head commit", async () => {
    const staleResponse = () => new Response(JSON.stringify([{
      number: 42,
      html_url: "https://github.com/sellerfi/sandbox/pull/42",
      head: { ref: "mc/work-order-1", sha: "unverified-head" },
      base: { ref: "main" },
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchImpl = vi.fn().mockImplementation(async () => staleResponse());

    await expect(createOrReusePullRequest({
      repository: "sellerfi/sandbox",
      branch: "mc/work-order-1",
      base: "main",
      title: "Add buyer gate",
      body: "Evidence",
      token: "not-logged",
      headSha: "verified-head",
      fetchImpl,
      sleepImpl: async () => undefined,
      headPropagationAttempts: 2,
    })).rejects.toThrow("head does not match the independently verified candidate");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("waits for a just-pushed candidate head to propagate before reusing the pull request", async () => {
    const stalePullRequest = {
      number: 42,
      html_url: "https://github.com/sellerfi/sandbox/pull/42",
      node_id: "PR_42",
      head: { ref: "mc/work-order-1", sha: "previous-head" },
      base: { ref: "main" },
    };
    const currentPullRequest = {
      ...stalePullRequest,
      head: { ref: "mc/work-order-1", sha: "verified-head" },
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([stalePullRequest]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([currentPullRequest]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    const sleepImpl = vi.fn(async () => undefined);

    const result = await createOrReusePullRequest({
      repository: "sellerfi/sandbox",
      branch: "mc/work-order-1",
      base: "main",
      title: "Add buyer gate",
      body: "Evidence",
      token: "not-logged",
      headSha: "verified-head",
      fetchImpl,
      sleepImpl,
    });

    expect(result).toMatchObject({ number: 42, reused: true, headSha: "verified-head" });
    expect(sleepImpl).toHaveBeenCalledWith(750);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("creates a review-ready pull request when the branch has none", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        number: 43,
        html_url: "https://github.com/sellerfi/sandbox/pull/43",
        node_id: "PR_43",
        head: { ref: "mc/work-order-1", sha: "def456" },
        base: { ref: "main" },
      }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const result = await createOrReusePullRequest({
      repository: "sellerfi/sandbox",
      branch: "mc/work-order-1",
      base: "main",
      title: "Add buyer gate",
      body: "Evidence",
      token: "not-logged",
      headSha: "def456",
      fetchImpl,
    });
    expect(result).toMatchObject({ number: 43, reused: false });
    const createCall = fetchImpl.mock.calls[1];
    expect(JSON.parse(createCall[1].body)).toMatchObject({ head: "mc/work-order-1", base: "main", draft: false });
  });

  it("fetches an exact App-authenticated PR head and completed CI without returning credentials", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 105,
        node_id: "PR_policy_v2_105",
        number: 105,
        html_url: "https://github.com/sellerfi/sandbox/pull/105",
        title: "Policy v2 candidate",
        state: "open",
        draft: true,
        head: { ref: "mc/work-order-1", sha: "candidate-sha" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        check_runs: [
          { name: "Unit Tests", status: "completed", conclusion: "success", html_url: "https://github.com/check/1" },
          { name: "Security", status: "completed", conclusion: "success", html_url: "https://github.com/check/2" },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("+policyVersion\n-old\n", { status: 200 }));

    const result = await fetchGithubPullRequestEvidence({
      repository: "sellerfi/sandbox",
      prNumber: 105,
      token: "installation-token-never-returned",
      fetchImpl,
    });

    expect(result).toMatchObject({
      providerPullRequestId: "PR_policy_v2_105",
      headSha: "candidate-sha",
      ciStatus: "PASS",
      draft: true,
      diffLineCount: 2,
      signals: { testPassCount: 1, testFailCount: 0, securityFindingCount: 0 },
    });
    expect(JSON.stringify(result)).not.toContain("installation-token-never-returned");
    expect(fetchImpl.mock.calls.every(([, init]) =>
      new Headers(init?.headers).get("authorization") === "Bearer installation-token-never-returned"
    )).toBe(true);
  });
});
