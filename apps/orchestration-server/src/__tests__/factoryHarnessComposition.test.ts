import { describe, expect, it, vi } from "vitest";
import { CodexV1ExecutorAdapter } from "../codexExecutorAdapter.js";
import { DeepSeekHarnessExecutorAdapter } from "../deepseekHarnessExecutorAdapter.js";
import {
  configuredFactoryHarnessAdapters,
  type FactoryHarnessEnablement,
} from "../factoryHarnessComposition.js";
import { HarnessAdapterRegistry } from "../harnessAdapterRegistry.js";

interface CompositionCase {
  name: string;
  enablement: FactoryHarnessEnablement;
  expected: string[];
  codexCalls: number;
  deepseekCalls: number;
}

describe("Factory harness startup composition", () => {
  it.each<CompositionCase>([
    {
      name: "no adapters",
      enablement: { codexEnabled: false, deepseekEnabled: false, legacyFactoryWorkerEnabled: false },
      expected: [],
      codexCalls: 0,
      deepseekCalls: 0,
    },
    {
      name: "Codex only",
      enablement: { codexEnabled: true, deepseekEnabled: false, legacyFactoryWorkerEnabled: false },
      expected: ["codex/v1"],
      codexCalls: 1,
      deepseekCalls: 0,
    },
    {
      name: "DeepSeek only",
      enablement: { codexEnabled: false, deepseekEnabled: true, legacyFactoryWorkerEnabled: false },
      expected: ["deepseek-harness/0.2.0"],
      codexCalls: 0,
      deepseekCalls: 1,
    },
    {
      name: "Codex and DeepSeek",
      enablement: { codexEnabled: true, deepseekEnabled: true, legacyFactoryWorkerEnabled: false },
      expected: ["codex/v1", "deepseek-harness/0.2.0"],
      codexCalls: 1,
      deepseekCalls: 1,
    },
  ])("composes exactly $name from explicit enablement", ({
    enablement,
    expected,
    codexCalls,
    deepseekCalls,
  }) => {
    const createCodex = vi.fn(() => new CodexV1ExecutorAdapter());
    const createDeepSeek = vi.fn(() => new DeepSeekHarnessExecutorAdapter({ enabled: true }));
    const registry = new HarnessAdapterRegistry(configuredFactoryHarnessAdapters(
      enablement,
      { createCodex, createDeepSeek },
    ));

    expect(registry.registrations().map(({ capabilities }) =>
      `${capabilities.adapter}/${capabilities.version}`
    )).toEqual(expected);
    expect(createCodex).toHaveBeenCalledTimes(codexCalls);
    expect(createDeepSeek).toHaveBeenCalledTimes(deepseekCalls);
  });

  it("fails startup when a Factory worker mode is enabled without an explicit adapter", () => {
    const createCodex = vi.fn(() => new CodexV1ExecutorAdapter());
    const createDeepSeek = vi.fn(() => new DeepSeekHarnessExecutorAdapter({ enabled: true }));

    expect(() => configuredFactoryHarnessAdapters({
      codexEnabled: false,
      deepseekEnabled: false,
      legacyFactoryWorkerEnabled: true,
    }, { createCodex, createDeepSeek })).toThrow(
      "Factory execution is enabled, but no harness adapters were explicitly configured.",
    );
    expect(createCodex).not.toHaveBeenCalled();
    expect(createDeepSeek).not.toHaveBeenCalled();
  });
});
