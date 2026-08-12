import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrReusePullRequest, loadGithubAppPrivateKey } from "../githubAppRuntime.js";

describe("GitHub App runtime", () => {
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
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      number: 42,
      html_url: "https://github.com/sellerfi/sandbox/pull/42",
      head: { ref: "mc/work-order-1", sha: "unverified-head" },
      base: { ref: "main" },
    }]), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(createOrReusePullRequest({
      repository: "sellerfi/sandbox",
      branch: "mc/work-order-1",
      base: "main",
      title: "Add buyer gate",
      body: "Evidence",
      token: "not-logged",
      headSha: "verified-head",
      fetchImpl,
    })).rejects.toThrow("head does not match the independently verified candidate");
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
});
