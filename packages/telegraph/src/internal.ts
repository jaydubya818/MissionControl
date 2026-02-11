/**
 * Internal Telegraph Provider
 *
 * Stores messages directly in Convex tables.
 * No external dependencies -- pure Convex mutations/queries.
 */

import type {
  TelegraphProvider,
  TelegraphSendOptions,
  TelegraphGetOptions,
  TelegraphCreateThreadOptions,
  TelegraphMessageResult,
  TelegraphMessage,
} from "@mission-control/shared";

/**
 * Convex client interface -- the actual Convex client is injected.
 * This allows the provider to work with both ConvexHttpClient and useAction.
 */
export interface ConvexTelegraphClient {
  sendMessage(args: {
    threadId: string;
    senderId: string;
    senderType: string;
    content: string;
    channel: string;
    replyToId?: string;
    projectId?: string;
    metadata?: Record<string, any>;
  }): Promise<string>;

  getMessages(args: {
    threadId: string;
    limit?: number;
  }): Promise<TelegraphMessage[]>;

  createThread(args: {
    title: string;
    projectId?: string;
    participants: string[];
    channel: string;
    linkedTaskId?: string;
    linkedApprovalId?: string;
  }): Promise<string>;
}

export class InternalTelegraphProvider implements TelegraphProvider {
  private client: ConvexTelegraphClient;

  constructor(client: ConvexTelegraphClient) {
    this.client = client;
  }

  async sendMessage(
    threadRef: string,
    content: string,
    options?: TelegraphSendOptions
  ): Promise<TelegraphMessageResult> {
    const messageId = await this.client.sendMessage({
      threadId: threadRef,
      senderId: options?.senderId ?? "SYSTEM",
      senderType: options?.senderType ?? "SYSTEM",
      content,
      channel: "INTERNAL",
      replyToId: options?.replyToId,
      metadata: options?.metadata,
    });

    return {
      messageId,
      status: "SENT",
      timestamp: Date.now(),
    };
  }

  async getMessages(
    threadRef: string,
    options?: TelegraphGetOptions
  ): Promise<TelegraphMessage[]> {
    return await this.client.getMessages({
      threadId: threadRef,
      limit: options?.limit,
    });
  }

  async createThread(
    options: TelegraphCreateThreadOptions
  ): Promise<string> {
    return await this.client.createThread({
      title: options.title,
      projectId: options.projectId,
      participants: options.participants,
      channel: "INTERNAL",
      linkedTaskId: options.linkedTaskId,
      linkedApprovalId: options.linkedApprovalId,
    });
  }

  async mapExternalThread(_externalRef: string): Promise<string> {
    throw new Error("Internal provider does not support external thread mapping");
  }
}
