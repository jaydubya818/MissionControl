import path from "node:path";
import {
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  type ExecutorRequest,
  type ExecutorConfigurationIssue,
} from "@mission-control/workflow-engine";
import {
  CodexV1ExecutorAdapter,
  commandArguments,
  FACTORY_RESULT_SCHEMA,
} from "./codexExecutorAdapter.js";

export const CODEX_BEDROCK_LOCAL_PORT = 43191;
export const CODEX_BEDROCK_OVERRIDES = [
  'model_provider="mission-control-bedrock-bridge"',
  'model_providers.mission-control-bedrock-bridge.name="Mission Control governed Bedrock bridge"',
  `model_providers.mission-control-bedrock-bridge.base_url="http://127.0.0.1:${CODEX_BEDROCK_LOCAL_PORT}"`,
  'model_providers.mission-control-bedrock-bridge.wire_api="responses"',
  "model_providers.mission-control-bedrock-bridge.requires_openai_auth=false",
  "model_providers.mission-control-bedrock-bridge.supports_websockets=false",
  "model_providers.mission-control-bedrock-bridge.request_max_retries=0",
  "model_providers.mission-control-bedrock-bridge.stream_max_retries=0",
  'model_reasoning_effort="none"',
  'model_reasoning_summary="none"',
  'web_search="disabled"',
  "features.multi_agent=false",
] as const;

/** Shares repository/result and CLI argument mechanics, never V1 provider setup
 * or V1 qualification. Only the separately governed Docker path can start it. */
export class CodexBedrockExecutorAdapter extends CodexV1ExecutorAdapter {
  capabilities() {
    return {
      ...super.capabilities(),
      version: "bedrock-v1",
      displayName: "Codex / governed Bedrock",
      provider: "aws-bedrock",
      capabilityManifest: CODEX_BEDROCK_V1_HARNESS_MANIFEST,
      executionBackends: ["remote-sandbox" as const],
    };
  }
  validateConfiguration(
    request: ExecutorRequest,
  ): ExecutorConfigurationIssue[] {
    const common = super.validateConfiguration({
      ...request,
      provider: "openai",
      providerRoute: undefined,
      modelRouteDigest: undefined,
      reasoningConfig: undefined,
    });
    if (
      request.provider !== "aws-bedrock" ||
      request.model !== "anthropic.claude-sonnet-4-6" ||
      !/^bedrock-us:[a-f0-9]{64}$/.test(request.providerRoute ?? "") ||
      !/^sha256:[a-f0-9]{64}$/.test(request.modelRouteDigest ?? "")
    ) {
      common.push({
        field: "modelRouteDigest",
        message: "Exact canonical Bedrock US route required.",
      });
    }
    if (request.reasoningConfig !== undefined)
      common.push({
        field: "reasoningConfig",
        message:
          "Bedrock V1 reasoning overrides are unsupported; bridge owns the output bound.",
      });
    return common;
  }
  validateRemoteConfiguration(request: ExecutorRequest) {
    return this.validateConfiguration(request);
  }
  async prepare(): Promise<never> {
    throw new Error(
      "codex/bedrock-v1 requires the governed Docker bridge; local execution prohibited.",
    );
  }
  async health() {
    return {
      status: "DEGRADED" as const,
      checkedAt: Date.now(),
      adapter: "codex",
      version: "bedrock-v1",
      details:
        "Offline composition; approved AWS identity and exact route qualification required.",
    };
  }
  createRemoteInvocation(
    request: ExecutorRequest,
    context: { repositoryRoot: string; resultPath: string },
  ) {
    const issues = this.validateRemoteConfiguration(request);
    if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
    const schemaPath = path.posix.join(
      path.posix.dirname(context.resultPath),
      "factory-result.schema.json",
    );
    return {
      command: "codex",
      args: commandArguments(
        {
          ...request,
          workingDirectory: context.repositoryRoot,
          repositoryRoot: context.repositoryRoot,
        },
        context.resultPath,
        schemaPath,
        CODEX_BEDROCK_OVERRIDES,
        "danger-full-access",
      ),
      resultPath: context.resultPath,
      outputSchemaPath: schemaPath,
      outputSchema: structuredClone(
        request.structuredOutput?.jsonSchema ?? FACTORY_RESULT_SCHEMA,
      ),
      reasoningConfig: undefined,
      provider: request.provider,
      model: request.model,
      modelRouteDigest: request.modelRouteDigest,
      providerRoute: request.providerRoute,
      prompt: request.prompt,
      allowedPaths: request.allowedPaths,
      timeoutMs: request.timeoutMs,
    };
  }
}
