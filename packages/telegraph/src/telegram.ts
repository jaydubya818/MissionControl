/**
 * Telegram Telegraph Provider
 *
 * Bridges Telegraph messages to/from Telegram via the telegram-bot package.
 * Enforces the "final replies only" safety rule -- no streaming to external surfaces.
 */

import type {
  TelegraphProvider,
  TelegraphSendOptions,
  TelegraphGetOptions,
  TelegraphCreateThreadOptions,
  TelegraphMessageResult,
  TelegraphMessage,
} from "@mission-control/shared";

export interface TelegramBridgeClient {
  sendTelegramMessage(chatId: string, text: string): Promise<{ messageId: string }>;
  getThreadMessages(chatId: string, threadId?: string): Promise<any[]>;
}

export interface TelegramConvexClient {
  sendMessage(args: {
    threadId: string;
    senderId: string;
    senderType: string;
    content: string;
    channel: string;
    externalRef?: string;
    replyToId?: string;
    projectId?: string;
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
    externalThreadRef?: string;
    linkedTaskId?: string;
  }): Promise<string>;

  findThreadByExternalRef(args: {
    externalRef: string;
  }): Promise<string | null>;
}

export class TelegramTelegraphProvider implements TelegraphProvider {
  private telegramClient: TelegramBridgeClient;
  private convexClient: TelegramConvexClient;

  constructor(telegramClient: TelegramBridgeClient, convexClient: TelegramConvexClient) {
    this.telegramClient = telegramClient;
    this.convexClient = convexClient;
  }

  async sendMessage(
    threadRef: string,
    content: string,
    options?: TelegraphSendOptions
  ): Promise<TelegraphMessageResult> {
    // SAFETY: Enforce "final replies only" for external Telegram messages.
    // Reject messages that look like streaming/partial content.
    if (this.isPartialOrStreaming(content)) {
      throw new Error(
        "SAFETY: Cannot send partial or streaming content to Telegram. " +
        "Only final, complete messages are allowed on external surfaces."
      );
    }

    // Store in Convex first
    const messageId = await this.convexClient.sendMessage({
      threadId: threadRef,
      senderId: options?.senderId ?? "SYSTEM",
      senderType: options?.senderType ?? "SYSTEM",
      content,
      channel: "TELEGRAM",
      replyToId: options?.replyToId,
    });

    // Send to Telegram (best-effort; message is stored regardless)
    try {
      await this.telegramClient.sendTelegramMessage(threadRef, content);
    } catch (err) {
      // Log but don't fail -- message is stored in Convex
      console.error("Failed to send to Telegram:", err);
    }

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
    return await this.convexClient.getMessages({
      threadId: threadRef,
      limit: options?.limit,
    });
  }

  async createThread(
    options: TelegraphCreateThreadOptions
  ): Promise<string> {
    return await this.convexClient.createThread({
      title: options.title,
      projectId: options.projectId,
      participants: options.participants,
      channel: "TELEGRAM",
      linkedTaskId: options.linkedTaskId,
    });
  }

  async mapExternalThread(externalRef: string): Promise<string> {
    const existing = await this.convexClient.findThreadByExternalRef({ externalRef });
    if (existing) return existing;

    // Create a new thread mapped to this external reference
    return await this.convexClient.createThread({
      title: `Telegram: ${externalRef}`,
      participants: [],
      channel: "TELEGRAM",
      externalThreadRef: externalRef,
    });
  }

  /**
   * Detect partial or streaming content that should not be sent externally.
   */
  private isPartialOrStreaming(content: string): boolean {
    if (!content || content.trim().length === 0) return true;
    // Check for common streaming markers
    if (content.endsWith("...") && content.length < 20) return true;
    if (content.includes("[STREAMING]") || content.includes("[PARTIAL]")) return true;
    return false;
  }
}
