import { createHash } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import { ConvexActions } from "./convexCalls.js";
import type { GovernedMcpReceipt, GovernedMcpReceiptSink } from "./governedMcpBroker.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";

export class ConvexGovernedMcpReceiptSink implements GovernedMcpReceiptSink {
  constructor(
    private readonly client: ConvexHttpClient,
    private readonly repositoryId: string,
  ) {}

  async append(receipt: GovernedMcpReceipt) {
    const receiptCommandDigest = createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
    const command = createSignedServiceCommand({
      capability: "mcp.receipts.append",
      projectId: receipt.projectId,
      repositoryId: this.repositoryId,
      commandId: `mcp-receipt-${receiptCommandDigest}`,
      payload: { receipt },
    });
    return await this.client.action(ConvexActions.serviceCommands.recordGovernedMcpReceipt as any, command) as { created: boolean; permitted?: boolean; reason?: string; lateOrStale?: boolean };
  }
}
