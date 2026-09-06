import { it, expect } from "vitest";
import { bedrockProfileFixture } from "./fixtures/bedrockProfileFixture.js";
import {
  executionProfileIssues,
  executionProfileQualificationMatches,
} from "../../../../convex/lib/executionProfile.js";
import { factoryConfigurationDigest } from "../../../../convex/lib/factoryConfiguration.js";
import { HarnessAdapterRegistry } from "../harnessAdapterRegistry.js";
import { CodexBedrockExecutorAdapter } from "../codexBedrockExecutorAdapter.js";
it("derives exact Bedrock Docker profile without inheriting V1 qualification", () => {
  const f = bedrockProfileFixture();
  expect(executionProfileIssues(f.snapshot)).toEqual([]);
  expect(
    executionProfileQualificationMatches({
      profileId: "bedrock-fixture-profile",
      profileSnapshot: f.snapshot,
      profileDigest: f.profileDigest,
      qualificationSnapshot: f.qualification,
    }),
  ).toBe(true);
  expect(f.snapshot.authority.acceptance).toBe(false);
});
it("registers Bedrock through existing harness registry only for remote backend", () => {
  const r = new HarnessAdapterRegistry([new CodexBedrockExecutorAdapter()]);
  expect(
    r.supports({ adapter: "codex", version: "bedrock-v1" }, "remote-sandbox"),
  ).toBe(true);
  expect(
    r.supports(
      { adapter: "codex", version: "bedrock-v1" },
      "persistent-worker",
    ),
  ).toBe(false);
});
it("binds Bedrock profile to existing Factory configuration digest", () => {
  const f = bedrockProfileFixture();
  const config: any = {
    purpose: "SOFTWARE",
    repositoryId: "fixture",
    workflowId: "fixture",
    executor: { adapter: "codex", version: "bedrock-v1" },
    modelRouteDigest: f.modelRoute.routeDigest,
    executionProfileDigest: f.profileDigest,
    codeScopeIds: [],
    agentBindings: [],
    verifierIds: [],
  };
  expect(factoryConfigurationDigest(config)).not.toBe(
    factoryConfigurationDigest({
      ...config,
      executionProfileDigest: "sha256:" + "f".repeat(64),
    }),
  );
});
it("keeps existing providers available alongside Bedrock", async () => {
  const { selectBedrockFactoryProvider } =
    await import("../bedrockFactoryComposition.js");
  const selected: string[] = [];
  const selector = selectBedrockFactoryProvider(
    (p) => {
      selected.push("bedrock");
      return {} as any;
    },
    (p) => {
      selected.push(p.provider);
      return {} as any;
    },
  );
  const f = bedrockProfileFixture();
  selector(f.profile);
  selector({ ...f.profile, providerProfile: "factory/docker/v1" });
  selector({ ...f.profile, provider: "EXE_DEV" });
  expect(selected).toEqual(["bedrock", "DOCKER", "EXE_DEV"]);
});
it('satisfies canonical Factory configuration admission fields without issuing a version',async()=>{
  const {validFactoryBudget,validFactoryExecutorBinding,validFactoryExecutionBinding,validFactoryExecutionProfileBinding}=await import('../../../../convex/lib/factoryConfiguration.js');
  const {executionProfileQualificationDigest}=await import('../../../../convex/lib/executionProfile.js');
  const {sandboxProfileDigest}=await import('../sandboxProvider.js');
  const f=bedrockProfileFixture();
  const config={executor:{adapter:'codex',version:'bedrock-v1'},executionBackend:'remote-sandbox' as const,
    executionProfileId:'OFFLINE_FIXTURE_PROFILE',executionProfileVersion:1,executionProfileDigest:f.profileDigest,
    executionProfileQualificationDigest:executionProfileQualificationDigest(f.qualification),sandboxProfileId:'OFFLINE_FIXTURE_SANDBOX',
    sandboxProfileDigest:sandboxProfileDigest(f.profile),budget:{maxCostUsd:1,maxRuntimeMinutes:1,maxAttempts:1},
    riskBoundary:'GREEN' as const,recovery:{pause:false,cancel:true,retry:true,resume:false}};
  expect(validFactoryBudget(config.budget)).toBe(true);expect(validFactoryExecutorBinding(config.executor)).toBe(true);
  expect(validFactoryExecutionBinding(config)).toBe(true);expect(validFactoryExecutionProfileBinding(config)).toBe(true);
  expect(validFactoryExecutionProfileBinding({...config,executionProfileQualificationDigest:undefined})).toBe(false);
});
