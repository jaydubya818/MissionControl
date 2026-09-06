import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { bedrockRouteSchema, type BedrockRoute } from "./bedrockRoute.js";
import { bedrockModelRouteBinding } from "./bedrockModelRouteBinding.js";
import type { BedrockTransport } from "./bedrockAdapter.js";

const grantSchema = z
  .object({
    schema: z.literal("fdlc-bounded-bedrock-call-authorization/v1"),
    approvalReference: z.string().min(1),
    routeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
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
    roleArn: z.string(),
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
  authorization: BedrockCallAuthorization,
  dependencies: {
    readCredentials?: (path: string) => Promise<string>;
    createClient?: (options: any) => {
      send: (command: any, options: any) => Promise<any>;
      destroy: () => void;
    };
    now?: () => number;
  } = {},
): BedrockTransport {
  const r = bedrockRouteSchema.parse(route),
    grant = grantSchema.parse(authorization),
    now = dependencies.now ?? Date.now;
  const assertGrant = () => {
    if (
      grant.routeDigest !== bedrockModelRouteBinding(r).routeDigest ||
      grant.validUntil <= now() ||
      !grant.expectedStsPrincipalArn.startsWith(
        `arn:aws:sts::${r.awsAccountId}:assumed-role/`,
      ) ||
      grant.expectedStsPrincipalArn.split("/")[1] !==
        r.roleArn.split("/").at(-1)
    )
      throw new Error("BEDROCK_CALL_AUTHORIZATION_INVALID");
  };
  assertGrant();
  return {
    evidenceClass: "APPROVED_QUALIFICATION",
    send: async (wire, signal) => {
      assertGrant();
      signal.throwIfAborted();
      if (
        wire.api !== "CONVERSE" ||
        wire.region !== r.region ||
        wire.modelId !== r.inferenceProfileArn ||
        wire.maxAttempts !== 1
      )
        throw new Error("BEDROCK_TRANSPORT_ROUTE_MISMATCH");
      if (
        Object.keys(wire.body).some(
          (key) =>
            !["messages", "system", "toolConfig", "inferenceConfig"].includes(
              key,
            ),
        )
      )
        throw new Error("BEDROCK_BODY_FIELD_UNSUPPORTED");
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
        credentials.roleArn !== r.roleArn ||
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
      const client =
        dependencies.createClient?.(options) ??
        new BedrockRuntimeClient(options);
      try {
        const response = await client.send(
          new ConverseCommand({
            ...wire.body,
            modelId: wire.modelId,
          } as ConverseCommandInput),
          { abortSignal: signal },
        );
        return { body: response, requestId: response.$metadata?.requestId };
      } finally {
        client.destroy();
      }
    },
  };
}
