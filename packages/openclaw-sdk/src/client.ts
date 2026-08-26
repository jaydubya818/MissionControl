import type { SDKConfig } from "./types";

/**
 * V1 compatibility tombstone.
 *
 * The original SDK called human Task and Approval actions while asserting an
 * Agent identity. That is not authentication. Agent execution now uses the
 * signed, scoped, leased service-command boundary in
 * mission-control-orchestration.
 */
export class MissionControlClient {
  constructor(_config: SDKConfig) {
    throw new Error(
      "@mission-control/openclaw-sdk is retired for V1. Use mission-control-orchestration signed service commands.",
    );
  }
}
