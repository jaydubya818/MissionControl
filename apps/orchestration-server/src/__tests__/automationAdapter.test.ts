import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  executeAutomation,
  parseAllowlistedCommand,
  redactAutomationLog,
  safeRepositoryPath,
  verifyArtifactHash,
} from "../automationAdapter.js";
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

describe("Automation adapter safety", () => {
  it("keeps artifacts inside the approved repository", () => {
    expect(safeRepositoryPath("/tmp/repo", "tests/a.spec.ts")).toBe("/tmp/repo/tests/a.spec.ts");
    expect(() => safeRepositoryPath("/tmp/repo", "../secret")).toThrow(/escapes/);
    expect(() => safeRepositoryPath("/tmp/repo", "/etc/passwd")).toThrow(/relative/);
  });

  it("allows argv without shell operators and blocks injection", () => {
    expect(parseAllowlistedCommand("pnpm run typecheck")).toEqual(["pnpm", "run", "typecheck"]);
    expect(() => parseAllowlistedCommand("pnpm test; curl evil")).toThrow(/unsupported/);
    expect(() => parseAllowlistedCommand("rm -rf /")).toThrow(/allowlisted/);
  });

  it("redacts named and common credential shapes", () => {
    expect(redactAutomationLog("token=abc password: hunter2 raw-value", ["raw-value"]))
      .toBe("token=[REDACTED] password=[REDACTED] [REDACTED]");
  });

  it("verifies immutable artifact hashes", () => {
    expect(verifyArtifactHash("approved", hash("approved"))).toBe(true);
    expect(verifyArtifactHash("changed", hash("approved"))).toBe(false);
  });

  it("materializes and executes a bounded shell artifact", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-"));
    const content = "#!/usr/bin/env bash\nset -euo pipefail\nprintf passed\n";
    const result = await executeAutomation({
      adapterType: "SHELL",
      repository: "test/repo",
      repositoryRoot: root,
      workingDirectory: ".",
      artifactPath: "automations/health.sh",
      artifactContent: content,
      artifactContentHash: hash(content),
      timeoutMs: 5_000,
      secretReferences: [],
      configuration: {},
    });
    expect(result.status).toBe("passed");
    expect(result.redactedLogs.join("")).toContain("passed");
    expect(await readFile(path.join(root, "automations/health.sh"), "utf8")).toBe(content);
  });

  it("terminates a read-only adapter at the frozen timeout", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-"));
    const content = "#!/usr/bin/env bash\nsleep 1\n";
    try {
      const result = await executeAutomation({
        adapterType: "SHELL", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
        artifactPath: "automations/timeout.sh", artifactContent: content, artifactContentHash: hash(content),
        timeoutMs: 25, secretReferences: [], configuration: {},
      });
      expect(result.status).toBe("timed_out");
      expect(result.durationMs).toBeLessThan(1_000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("cancels a running read-only adapter through its abort signal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-"));
    const content = "#!/usr/bin/env bash\nsleep 5\n";
    const controller = new AbortController();
    const cancel = setTimeout(() => controller.abort(), 25);
    try {
      const result = await executeAutomation({
        adapterType: "SHELL", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
        artifactPath: "automations/cancel.sh", artifactContent: content, artifactContentHash: hash(content),
        timeoutMs: 5_000, secretReferences: [], configuration: {},
      }, controller.signal);
      expect(result.status).toBe("cancelled");
      expect(result.durationMs).toBeLessThan(1_000);
    } finally {
      clearTimeout(cancel);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not materialize an artifact when cancellation already arrived", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-cancelled-"));
    const content = "#!/usr/bin/env bash\nprintf should-not-run\n";
    const controller = new AbortController();
    controller.abort();
    try {
      const result = await executeAutomation({
        adapterType: "SHELL", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
        artifactPath: "automations/cancelled.sh", artifactContent: content, artifactContentHash: hash(content),
        timeoutMs: 5_000, secretReferences: [], configuration: {},
      }, controller.signal);
      expect(result.status).toBe("cancelled");
      await expect(readFile(path.join(root, "automations/cancelled.sh"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("kills surviving process-group children after the leader exits on cancellation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-group-"));
    const content = "#!/usr/bin/env bash\ntrap 'exit 0' TERM\nbash -c 'trap \"\" TERM; printf ready > child-ready; sleep 5' &\nwait\n";
    const controller = new AbortController();
    const execution = executeAutomation({
      adapterType: "SHELL", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
      artifactPath: "automations/group.sh", artifactContent: content, artifactContentHash: hash(content),
      timeoutMs: 10_000, secretReferences: [], configuration: {},
    }, controller.signal);
    try {
      const deadline = Date.now() + 2_000;
      while (await readFile(path.join(root, "child-ready"), "utf8").catch(() => "") !== "ready") {
        if (Date.now() >= deadline) throw new Error("Child did not become ready");
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const abortedAt = Date.now();
      controller.abort();
      const result = await execution;
      expect(result.status).toBe("cancelled");
      expect(Date.now() - abortedAt).toBeLessThan(2_500);
    } finally {
      controller.abort();
      await execution;
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects a repository artifact that differs from the approved hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-"));
    const first = "#!/usr/bin/env bash\nprintf first\n";
    const second = "#!/usr/bin/env bash\nprintf second\n";
    await executeAutomation({
      adapterType: "SHELL", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
      artifactPath: "automations/check.sh", artifactContent: first, artifactContentHash: hash(first),
      timeoutMs: 5_000, secretReferences: [], configuration: {},
    });
    const result = await executeAutomation({
      adapterType: "SHELL", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
      artifactPath: "automations/check.sh", artifactContent: second, artifactContentHash: hash(second),
      timeoutMs: 5_000, secretReferences: [], configuration: {},
    });
    expect(result.status).toBe("infrastructure_error");
    expect(result.error).toMatch(/differs/);
  });

  it("executes TypeScript and Python artifacts through fixed argv adapters", async () => {
    const root = await mkdtemp(path.join(process.cwd(), ".automation-test-"));
    try {
      for (const [adapterType, artifactPath, content] of [
        ["TYPESCRIPT", "automations/check.ts", "console.log(JSON.stringify({ status: 'passed' }));\n"],
        ["PYTHON", "automations/check.py", "print('{\"status\":\"passed\"}')\n"],
      ] as const) {
        const result = await executeAutomation({
          adapterType, repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
          artifactPath, artifactContent: content, artifactContentHash: hash(content),
          timeoutMs: 10_000, secretReferences: [], configuration: {},
        });
        expect(result.status, result.error ?? result.redactedLogs.join("\n")).toBe("passed");
        expect(result.redactedLogs.join("")).toContain("passed");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs read-only API checks and enforces the expected status", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-"));
    const content = JSON.stringify({ method: "GET" });
    try {
      const result = await executeAutomation({
        adapterType: "API", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
        artifactPath: "automations/api.json", artifactContent: content, artifactContentHash: hash(content),
        timeoutMs: 5_000, secretReferences: [],
        configuration: { baseUrl: `http://127.0.0.1:${address.port}`, endpoint: "/health", method: "GET", expectedStatus: 204 },
      });
      expect(result.status).toBe("passed");
    } finally {
      server.close();
    }
  });

  it("executes skill pipelines sequentially and stops on failure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mc-automation-"));
    const content = JSON.stringify({ pipeline: true });
    const result = await executeAutomation({
      adapterType: "SKILL_PIPELINE", repository: "test/repo", repositoryRoot: root, workingDirectory: ".",
      artifactPath: "automations/pipeline.json", artifactContent: content, artifactContentHash: hash(content),
      timeoutMs: 5_000, secretReferences: [],
      configuration: {
        steps: [
          { name: "first", command: "node -e console.log('first')" },
          { name: "fail", command: "node -e process.exit(2)" },
          { name: "never", command: "node -e console.log('never')" },
        ],
      },
    });
    expect(result.status).toBe("failed");
    expect(result.redactedLogs.join("")).toContain("first");
    expect(result.redactedLogs.join("")).not.toContain('"name":"never"');
  });
});
