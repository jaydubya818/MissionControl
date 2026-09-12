import { readFileSync } from "node:fs";
import { isolatedInvocationIssues, invocationResult, type IsolatedInvocation } from "../../../packages/workflow-engine/src/isolatedInvocation.js";

// Separate execution entrypoint. No dynamic module, shell, provider, or prompt dispatch.
const startedAt = Date.now();
let input = Buffer.alloc(0);
try {
  for await (const chunk of process.stdin) {
    input = Buffer.concat([input, chunk]);
    if (input.length > 16_384) throw new Error("request-size-invalid");
  }
  const request: IsolatedInvocation = JSON.parse(input.toString("utf8"));
  const issues = isolatedInvocationIssues(request);
  if (issues.length) throw new Error("request-invalid");
  // Build-time binding is inside immutable image bytes, separate from self-reported request identity.
  const binding = JSON.parse(readFileSync("/runtime/invocation-binding.json", "utf8"));
  if (request.composition.bridge.digest !== binding.bridgeDigest
    || request.composition.backend.digest !== binding.backendDigest
    || request.schema !== binding.invocationSchema || request.resultSchema !== binding.resultSchema
    || request.composition.isolationDigest !== binding.isolationDigest) throw new Error("composition-mismatch");
  process.stdout.write(JSON.stringify(invocationResult(request, "SUCCESS", startedAt)) + "\n");
} catch {
  // Invalid identities cannot be echoed or represented as authoritative execution evidence.
  process.stdout.write(JSON.stringify({ schema: "factory-isolated-rejection/v1", status: "INVALID_REQUEST" }) + "\n");
  process.exitCode = 2;
}
