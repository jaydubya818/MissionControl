import {
  BedrockRuntimeClient,
  CountTokensCommand,
  ConverseCommand,
  InvokeModelCommand,
  type ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { bedrockRouteSchema, type BedrockRoute } from "./bedrockRoute.js";
import { bedrockModelRouteBinding } from "./bedrockModelRouteBinding.js";
import type { BedrockTransport } from "./bedrockAdapter.js";
import {
  assertProviderPrice,
  liabilityDigest,
  type ProviderPrice,
} from "../../../convex/lib/providerLiability.js";

const grantSchema = z
  .object({
    schema: z.literal("fdlc-bounded-bedrock-call-authorization/v1"),
    approvalReference: z.string().min(1),
    routeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    approvedPriceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    expectedStsPrincipalArn: z.string(),
    identityEvidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    profileEvidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    credentialsFile: z.string().startsWith("/"),
    validUntil: z.number().int().positive(),
    allowModelCalls: z.literal(true),
  })
  .strict();
export type BedrockCallAuthorization = z.infer<typeof grantSchema>;
const credentialSchema = z
  .object({
    awsAccountId: z.string(),
    roleArn: z.string().optional(),
    principalArn: z.string(),
    accessKeyId: z.string().min(16),
    secretAccessKey: z.string().min(16),
    sessionToken: z.string().min(1),
    expiresAt: z.number().int(),
  })
  .strict();
/** Dormant until a separately approved live-call grant is explicitly supplied.
 * No default credential chain, environment credentials, profile search or cache.
 * The approved provisioner writes this exact temporary-credential envelope;
 * safe handoff/configuration contains its location, never the credentials. */
export function qualifiedBedrockTransport(
  route: BedrockRoute,
  price: ProviderPrice,
  authorization: BedrockCallAuthorization,
  dependencies: {
    readCredentials?: (path: string) => Promise<string>;
    createClient?: (options: any) => {
      send: (command: any, options: any) => Promise<any>;
      destroy: () => void;
    };
    createStsClient?: (options: any) => {
      send: (command: any, options: any) => Promise<any>;
      destroy: () => void;
    };
    now?: () => number;
  } = {},
): BedrockTransport {
  const r = bedrockRouteSchema.parse(route),
    approvedPrice = structuredClone(price),
    grant = grantSchema.parse(authorization),
    now = dependencies.now ?? Date.now;
  assertProviderPrice(approvedPrice, now());
  const assertGrant = () => {
    if (
      grant.routeDigest !== bedrockModelRouteBinding(r).routeDigest ||
      grant.approvedPriceDigest !== liabilityDigest(approvedPrice) ||
      approvedPrice.provider !== "aws-bedrock" ||
      approvedPrice.model !== r.modelId ||
      !["CONVERSE", "INVOKE_MODEL"].includes(approvedPrice.api) ||
      approvedPrice.inputBound !== "CONSERVATIVELY_BOUNDED" ||
      approvedPrice.maximumInputTokens !== r.maximumContextTokens ||
      grant.validUntil <= now() ||
      grant.expectedStsPrincipalArn !== r.expectedStsPrincipalArn
    )
      throw new Error("BEDROCK_CALL_AUTHORIZATION_INVALID");
  };
  assertGrant();
  const authenticatedClient = async (signal: AbortSignal) => {
    const credentials = credentialSchema.parse(
      JSON.parse(
        await (dependencies.readCredentials ?? ((p) => readFile(p, "utf8")))(
          grant.credentialsFile,
        ),
      ),
    );
    assertGrant();
    signal.throwIfAborted();
    if (
      credentials.awsAccountId !== r.awsAccountId ||
      (credentials.roleArn !== undefined && credentials.roleArn !== r.roleArn) ||
      credentials.principalArn !== grant.expectedStsPrincipalArn ||
      credentials.expiresAt <= now()
    )
      throw new Error("BEDROCK_CREDENTIAL_IDENTITY_MISMATCH");
    const options = {
      region: r.region,
      endpoint: `https://bedrock-runtime.${r.region}.amazonaws.com`,
      maxAttempts: 1,
      followRegionRedirects: false,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    };
    const stsClient = dependencies.createStsClient?.({
      ...options,
      endpoint: `https://sts.${r.region}.amazonaws.com`,
    }) ?? new STSClient({ ...options, endpoint: `https://sts.${r.region}.amazonaws.com` });
    try {
      const caller = await stsClient.send(new GetCallerIdentityCommand({}), { abortSignal: signal });
      if (caller.Account !== r.awsAccountId || caller.Arn !== grant.expectedStsPrincipalArn)
        throw new Error("BEDROCK_AUTHENTICATED_PRINCIPAL_MISMATCH");
    } finally {
      stsClient.destroy();
    }
    assertGrant();
    signal.throwIfAborted();
    return dependencies.createClient?.(options) ?? new BedrockRuntimeClient(options);
  };
  const exactWireBody = (wire: Parameters<BedrockTransport["send"]>[0]) => {
    let exactBody: Record<string, unknown>;
    try {
      exactBody = JSON.parse(wire.serializedBody) as Record<string, unknown>;
    } catch {
      throw new Error("BEDROCK_SERIALIZED_BODY_INVALID");
    }
    if (
      wire.api !== approvedPrice.api ||
      wire.region !== r.region ||
      wire.modelId !== r.inferenceProfileArn ||
      wire.maxAttempts !== 1
    )
      throw new Error("BEDROCK_TRANSPORT_ROUTE_MISMATCH");
    const allowedBodyFields = wire.api === "CONVERSE"
      ? ["messages", "system", "toolConfig", "inferenceConfig"]
      : ["anthropic_version", "max_tokens", "system", "messages", "tools"];
    if (
      Object.keys(wire.body).some((key) => !allowedBodyFields.includes(key)) ||
      Object.keys(exactBody).some((key) => !allowedBodyFields.includes(key))
    )
      throw new Error("BEDROCK_BODY_FIELD_UNSUPPORTED");
    if (
      Buffer.byteLength(wire.serializedBody, "utf8") !== wire.payloadBytes ||
      JSON.stringify(exactBody) !== wire.serializedBody ||
      JSON.stringify(wire.body) !== wire.serializedBody
    )
      throw new Error("BEDROCK_TRANSPORT_ROUTE_MISMATCH");
    return exactBody;
  };
  let countTokensUnsupported = false;
  return {
    evidenceClass: "APPROVED_QUALIFICATION",
    countInputTokens: async (wire, signal) => {
      const exactBody = exactWireBody(wire);
      if (countTokensUnsupported) return {
        inputTokens: wire.payloadBytes,
        requestId: null,
        classification: "UTF8_BYTE_UPPER_BOUND",
      };
      const client = await authenticatedClient(signal);
      try {
        const countBody = structuredClone(exactBody);
        delete countBody.inferenceConfig;
        delete countBody.max_tokens;
        const response = await client.send(new CountTokensCommand({
          modelId: r.foundationModelArn,
          input: wire.api === "CONVERSE"
            ? { converse: countBody as any }
            : { invokeModel: { body: Buffer.from(wire.serializedBody) } },
        }), { abortSignal: signal });
        if (!Number.isSafeInteger(response.inputTokens) || response.inputTokens < 1)
          throw new Error("BEDROCK_TOKEN_COUNT_INVALID");
        return { inputTokens: response.inputTokens, requestId: response.$metadata?.requestId, classification: "PROVIDER_ACTUAL" };
      } catch (error: any) {
        if (error?.$metadata?.httpStatusCode === 400
          && error?.name === "ValidationException"
          && String(error?.message).includes("doesn't support counting tokens")) {
          countTokensUnsupported = true;
          return { inputTokens: wire.payloadBytes, requestId: error.$metadata?.requestId, classification: "UTF8_BYTE_UPPER_BOUND" };
        }
        throw error;
      } finally {
        client.destroy();
      }
    },
    send: async (wire, signal) => {
      assertGrant();
      signal.throwIfAborted();
      const exactBody = exactWireBody(wire);
      const client = await authenticatedClient(signal);
      try {
        if (wire.api === "CONVERSE") {
          const response = await client.send(new ConverseCommand({
            ...exactBody,
            modelId: wire.modelId,
          } as ConverseCommandInput), { abortSignal: signal });
          return { body: response, requestId: response.$metadata?.requestId };
        }
        const response = await client.send(new InvokeModelCommand({
          modelId: wire.modelId,
          contentType: "application/json",
          accept: "application/json",
          body: Buffer.from(wire.serializedBody),
        }), { abortSignal: signal });
        return {
          body: JSON.parse(new TextDecoder().decode(response.body)),
          requestId: response.$metadata?.requestId,
        };
      } finally {
        client.destroy();
      }
    },
  };
}
