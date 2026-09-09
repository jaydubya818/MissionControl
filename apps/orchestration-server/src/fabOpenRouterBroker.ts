import {
  HttpModelProvider,
  type CredentialProvider,
  type FabConfig,
  type ModelProvider,
  type Redactor,
} from "@fdlc/fab";
import type { ExecutorRequest, HarnessExecutionContext } from "@mission-control/workflow-engine";
import type { SandboxCredentialBroker, SandboxCredentialReference } from "./sandboxCredentials.js";

export interface FabOpenRouterRouteBinding {
  providerRoute: "openrouter";
  routeDigest: string;
  modelId: string;
  maxCostUsd: number;
  maximumOutputTokens: number;
}

export interface FabOpenRouterModelGrant {
  model: ModelProvider;
  release(): Promise<Record<string, unknown>>;
}

export function createFabOpenRouterBrokerFactory(
  broker: SandboxCredentialBroker,
  binding: FabOpenRouterRouteBinding,
  fetchImpl: typeof fetch = fetch,
  observeFailure?: (failure: { status: number; detail: string }) => void,
) {
  assertBinding(binding);
  return async (input: {
    config: FabConfig;
    request: ExecutorRequest;
    context: HarnessExecutionContext;
    redactor: Redactor;
  }): Promise<FabOpenRouterModelGrant> => {
    const attempt = input.context.attempt;
    if (!attempt) throw new Error("FAB_OPENROUTER_ATTEMPT_AUTHORITY_REQUIRED");
    if (input.config.provider !== "openrouter" || input.config.credential.source.kind !== "broker"
      || input.config.model !== binding.modelId || input.request.provider !== "openrouter"
      || input.request.providerRoute !== binding.providerRoute
      || input.request.modelRouteDigest !== binding.routeDigest) {
      throw new Error("FAB_OPENROUTER_ROUTE_BINDING_INVALID");
    }
    const expiresAt = Date.now() + Math.min(input.request.timeoutMs + 60_000, 8 * 60 * 60 * 1_000);
    const grant = await broker.mint({
      projectId: attempt.projectId,
      workflowRunId: attempt.workflowRunId,
      attemptId: attempt.attemptId,
      attemptLeaseId: attempt.leaseId,
      model: binding.modelId,
      maxCostUsd: binding.maxCostUsd,
      expiresAt,
    });
    input.redactor.register(grant.secret);
    const credentials: CredentialProvider = {
      metadata: () => ({ reference: input.config.credential.id, configured: true, storage: "environment" }),
      use: async (reference, operation) => {
        if (reference.id !== input.config.credential.id || reference.provider !== "openrouter"
          || reference.source.kind !== "broker" || reference.scope.root !== input.config.repository) {
          throw new Error("FAB_OPENROUTER_CREDENTIAL_SCOPE_INVALID");
        }
        return await operation(grant.secret);
      },
    };
    const reference: SandboxCredentialReference = {
      grantKey: grant.grantKey,
      provider: grant.provider,
      externalCredentialId: grant.externalCredentialId,
      environmentVariable: grant.environmentVariable,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      maxCostUsd: grant.maxCostUsd,
      secretFingerprint: grant.secretFingerprint,
    };
    let release: Promise<Record<string, unknown>> | undefined;
    return {
      model: new HttpModelProvider({
        provider: "openrouter",
        model: binding.modelId,
        credentials,
        reference: input.config.credential,
        redactor: input.redactor,
        maximumOutputTokens: binding.maximumOutputTokens,
        fetchImpl: async (...args) => {
          const response = await fetchImpl(...args);
          if (!response.ok && observeFailure) {
            let detail = "Provider error body unavailable.";
            try { detail = input.redactor.text((await response.clone().text()).slice(0, 2000)); } catch { /* bounded diagnostic only */ }
            observeFailure({ status: response.status, detail });
          }
          return response;
        },
      }),
      release: () => release ??= broker.revoke(reference).then(receipt => ({
        provider: "OPENROUTER",
        credentialReference: input.config.credential.id,
        externalCredentialId: receipt.externalCredentialId,
        maxCostUsd: reference.maxCostUsd,
        expiresAt: reference.expiresAt,
        revoked: receipt.revoked,
        confirmation: receipt.confirmation,
      })),
    };
  };
}

function assertBinding(binding: FabOpenRouterRouteBinding) {
  if (binding.providerRoute !== "openrouter"
    || !/^sha256:[a-f0-9]{64}$/.test(binding.routeDigest)
    || binding.modelId !== "openai/gpt-4.1-mini"
    || !Number.isFinite(binding.maxCostUsd) || binding.maxCostUsd <= 0 || binding.maxCostUsd > 5
    || !Number.isSafeInteger(binding.maximumOutputTokens) || binding.maximumOutputTokens < 1 || binding.maximumOutputTokens > 4096) {
    throw new Error("FAB_OPENROUTER_CONFIGURATION_INVALID");
  }
}
