import type { DockerTerminalState } from "./dockerSandboxProvider.js";

// Diagnostic only. RemoteSandboxRuntime still validates the complete result
// against the frozen Attempt before accepting any workload outcome.
export function dockerTerminalState(input: {
  prior?: DockerTerminalState;
  canceled: boolean;
  failure?: string;
  exitCode: number | null;
  result?: Buffer;
}): DockerTerminalState {
  if (input.prior) return input.prior;
  if (input.canceled) return "CANCELED";
  if (input.failure) return "INFRASTRUCTURE_FAILURE";
  if (input.exitCode === 124) return "TIMEOUT";
  if (input.exitCode !== 0 || !input.result) return "INFRASTRUCTURE_FAILURE";
  try {
    const result = JSON.parse(input.result.toString("utf8"));
    if (result?.schema !== "factory-sandbox-result/v1")
      return "INVALID_REQUEST";
    switch (result.status) {
      case "COMPLETED":
        return result.structuredResult?.status === "COMPLETED" &&
          !result.failure
          ? "SUCCESS"
          : "INVALID_REQUEST";
      case "FAILED":
        return "WORKLOAD_FAILURE";
      case "CANCELED":
        return "CANCELED";
      case "TIMED_OUT":
        return "TIMEOUT";
      default:
        return "INVALID_REQUEST";
    }
  } catch {
    return "INVALID_REQUEST";
  }
}
