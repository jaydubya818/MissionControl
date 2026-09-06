import { it, expect, vi } from "vitest";
import { bedrockFactoryProviderFactory } from "../bedrockFactoryComposition.js";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { canonicalHash } from "@mission-control/shared";
import { DockerSandboxProvider } from "../dockerSandboxProvider.js";
import { DOCKER_BEDROCK_CANDIDATE_IDENTITY } from "../dockerBedrockIdentity.js";
import { CodexBedrockExecutorAdapter } from "../codexBedrockExecutorAdapter.js";
import { sandboxProfileDigest } from "../sandboxProvider.js";
import { bedrockProfileFixture } from "./fixtures/bedrockProfileFixture.js";
import { bridgeFixture } from "./fixtures/bedrockBridgeFixture.js";
const exec = promisify(execFile);
it.runIf(process.env.MC_DOCKER_QUALIFICATION === "1")(
  "runs exact Codex Bedrock V3 through no-network Docker and bounded tool cycle",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mc-bedrock-duplex-"));
    let allocation: any;
    let provider: DockerSandboxProvider | undefined;
    try {
      const git = (args: string[]) => exec("git", args, { cwd: root });
      await git(["init", "-b", "main"]);
      await git(["config", "user.name", "Offline Fixture"]);
      await git(["config", "user.email", "fixture@example.test"]);
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/fixture.txt"), "before\n");
      await git(["add", "."]);
      await git(["commit", "-m", "Disposable offline fixture"]);
      const source = (await git(["rev-parse", "HEAD"])).stdout.trim();
      await git(["bundle", "create", path.join(root, "repo.bundle"), "HEAD"]);
      const f = bedrockProfileFixture(source, root),
        budget = bridgeFixture(),
        m = f.manifest;
      const runId = m.causation.workflowRunId;
      Object.assign(budget.binding, {
        workflowRunId: runId,
        leaseId: "fixture-lease",
      });
      Object.assign(budget.binding.identity, {
        workOrderId: m.causation.workOrderId,
        workOrderRevision: 1,
        executionProfileId: m.executionProfile.profileId,
        executionProfileDigest: f.profileDigest,
        harnessDigest: f.harnessDigest,
        runtimeDigest: f.runtimeDigest,
        modelRouteDigest: f.modelRoute.routeDigest,
      });
      Object.assign(budget.reservation.scope, {
        workOrderId: m.causation.workOrderId,
        executionProfileId: m.executionProfile.profileId,
        executionProfileDigest: f.profileDigest,
        modelRouteDigest: f.modelRoute.routeDigest,
      });
      let sends = 0;
      const requests: any[] = [];
      budget.transport.send = async (wire) => {
        requests.push(wire);
        const tool = ++sends === 1;
        return {
          requestId: `offline-provider-${sends}`,
          body: {
            output: {
              message: {
                role: "assistant",
                content: tool
                  ? [
                      {
                        toolUse: {
                          toolUseId: "fixture_call",
                          name: "exec_command",
                          input: {
                            cmd: "printf after > src/fixture.txt",
                            max_output_tokens: 1000,
                          },
                        },
                      },
                    ]
                  : [
                      {
                        text: JSON.stringify({
                          schema: "factory-result/v1",
                          status: "COMPLETED",
                          summary: "Offline fixture finished",
                          completedAcceptanceCriterionIds: ["ac-remote"],
                          incompleteAcceptanceCriterionIds: [],
                          unknownAcceptanceCriterionIds: [],
                          verificationCommands: [],
                          knownRisks: [],
                          nextAction: "Independent verification required",
                        }),
                      },
                    ],
              },
            },
            stopReason: tool ? "tool_use" : "end_turn",
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        };
      };
      vi.stubEnv(
        "MISSION_CONTROL_SERVICE_COMMAND_SECRET",
        "OFFLINE_FIXTURE_SERVICE_SECRET",
      );
      const client: any = {
        action: async (_ref: any, args: any) =>
          args.envelope.capability === "provider-liability.reserve"
            ? budget.authority.reserve(JSON.parse(args.payloadJson))
            : budget.authority.settle(JSON.parse(args.payloadJson)),
      };
      provider = bedrockFactoryProviderFactory(
        client,
        {
          route: budget.binding.route,
          reservationId: budget.binding.reservationId,
          priceDigest: budget.binding.identity.priceDigest,
          maximumOutputTokens: 4096,
          timeoutMs: 10000,
        },
        budget.transport,
      )(f.profile, {
        claim: {
          projectId: "project",
          repositoryId: "repo",
          workflowRunId: runId,
          workOrderId: m.causation.workOrderId,
          lease: { workerGeneration: 1 },
        },
        manifest: m,
        leaseId: "fixture-lease",
      }) as DockerSandboxProvider;
      const digest = `sha256:${canonicalHash(m)}`,
        resourceName = m.sandbox.resourceName;
      allocation = await provider.allocate({
        projectId: "project",
        workOrderId: m.causation.workOrderId,
        workflowRunId: runId,
        attemptId: runId,
        attemptLeaseId: "fixture-lease",
        sourceSha: source,
        manifestDigest: digest,
        profile: f.profile,
        resourceName,
        requestedAt: Date.now(),
      });
      const executor = new CodexBedrockExecutorAdapter().createRemoteInvocation(
        {
          executionId: runId,
          repositoryRoot: root,
          workingDirectory: root,
          prompt: m.compiledPrompt,
          allowedPaths: m.repository.allowedPaths,
          deniedPaths: m.repository.excludedPaths,
          timeoutMs: m.harness.timeoutMs,
          isolation: "WORKSPACE_WRITE",
          provider: "aws-bedrock",
          model: "anthropic.claude-sonnet-4-6",
          modelRouteDigest: f.modelRoute.routeDigest,
          providerRoute: f.modelRoute.routeSnapshot.providerRoute,
        },
        {
          repositoryRoot: "/var/lib/mission-control/attempt/repository",
          resultPath: "/var/lib/mission-control/attempt/executor-result.json",
        },
      );
      await provider.start({
        allocation,
        executionManifest: m,
        profileAdmittedAt: Date.now(),
        workOrderId: m.causation.workOrderId,
        workOrderRevisionNumber: 1,
        workflowRunId: runId,
        attemptId: runId,
        manifestDigest: digest,
        sourceSha: source,
        profileDigest: sandboxProfileDigest(f.profile),
        environmentDescriptor: {
          provider: "DOCKER",
          image: DOCKER_BEDROCK_CANDIDATE_IDENTITY.image,
        },
        repositoryArchive: await readFile(path.join(root, "repo.bundle")),
        supervisorSource: "",
        executor,
        environment: {},
      });
      let result: Buffer | null = null;
      const until = Date.now() + 55000;
      while (Date.now() < until) {
        result = await provider.fetchResult(allocation);
        if (result) break;
        const d = await provider.fetchDiagnostics(allocation);
        if (d.exitCode !== null && d.exitCode !== undefined) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const diagnostics = await provider.fetchDiagnostics(allocation);
      await writeFile(
        "/tmp/fdlc-bedrock-duplex-evidence.json",
        JSON.stringify(
          {
            sends,
            requests,
            diagnostics,
            result: result ? JSON.parse(result.toString()) : null,
            holds: budget.reservation.holds,
          },
          null,
          2,
        ),
      );
      expect(result, JSON.stringify(diagnostics)).not.toBeNull();
      expect(sends).toBe(2);
      const bundle = JSON.parse(result!.toString());
      expect(bundle.status).toBe("COMPLETED");
      expect(bundle.structuredResult.status).toBe("COMPLETED");
      expect(bundle.changedFiles).toEqual(["src/fixture.txt"]);
      expect(Buffer.from(bundle.patch.content, "base64").toString()).toContain(
        "+after",
      );
      expect(budget.reservation.holds.every((h) => h.state === "SETTLED")).toBe(
        true,
      );
      expect(requests[0].maxAttempts).toBe(1);
      expect(requests[0].api).toBe("CONVERSE");
      expect(requests[0].body.inferenceConfig.maxTokens).toBe(4096);
    } finally {
      vi.unstubAllEnvs();
      if (allocation && provider) await provider.terminate(allocation);
      await rm(root, { recursive: true, force: true });
    }
  },
  90000,
);
