import { CodexBedrockExecutorAdapter } from "./codexBedrockExecutorAdapter.js";
import { CodexV1ExecutorAdapter } from "./codexExecutorAdapter.js";
import { DeepSeekHarnessExecutorAdapter } from "./deepseekHarnessExecutorAdapter.js";
import type { HarnessRuntimeAdapter } from "./harnessAdapterRegistry.js";

export interface FactoryHarnessEnablement {
  codexEnabled: boolean;
  codexBedrockEnabled?: boolean;
  deepseekEnabled: boolean;
  legacyFactoryWorkerEnabled: boolean;
}

export interface FactoryHarnessAdapterFactories {
  createCodex: () => HarnessRuntimeAdapter;
  createCodexBedrock?: () => HarnessRuntimeAdapter;
  createDeepSeek: () => HarnessRuntimeAdapter;
}

const DEFAULT_ADAPTER_FACTORIES: FactoryHarnessAdapterFactories = {
  createCodex: () => new CodexV1ExecutorAdapter(),
  createCodexBedrock: () => new CodexBedrockExecutorAdapter(),
  createDeepSeek: () => new DeepSeekHarnessExecutorAdapter(),
};

export function configuredFactoryHarnessAdapters(
  enablement: FactoryHarnessEnablement,
  factories: FactoryHarnessAdapterFactories = DEFAULT_ADAPTER_FACTORIES,
): HarnessRuntimeAdapter[] {
  const adapters: HarnessRuntimeAdapter[] = [];
  if (enablement.codexBedrockEnabled) {
    if (!factories.createCodexBedrock)
      throw new Error("Explicit Bedrock harness factory required.");
    adapters.push(factories.createCodexBedrock());
  }
  if (enablement.codexEnabled) adapters.push(factories.createCodex());
  if (enablement.deepseekEnabled) adapters.push(factories.createDeepSeek());
  if (enablement.legacyFactoryWorkerEnabled && adapters.length === 0) {
    throw new Error("Factory execution is enabled, but no harness adapters were explicitly configured.");
  }
  return adapters;
}
