/**
 * Telegram Telegraph Provider Tests
 *
 * Tests the Telegram bridge provider including safety enforcement.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramTelegraphProvider } from "../telegram";
import type { TelegramBridgeClient, TelegramConvexClient } from "../telegram";

function createMockTelegramClient(): TelegramBridgeClient {
  return {
    sendTelegramMessage: vi.fn().mockResolvedValue({ messageId: "tg-msg-001" }),
    getThreadMessages: vi.fn().mockResolvedValue([]),
  };
}

function createMockConvexClient(): TelegramConvexClient {
  return {
    sendMessage: vi.fn().mockResolvedValue("cvx-msg-001"),
    getMessages: vi.fn().mockResolvedValue([]),
    createThread: vi.fn().mockResolvedValue("cvx-thread-001"),
    findThreadByExternalRef: vi.fn().mockResolvedValue(null),
  };
}

describe("TelegramTelegraphProvider", () => {
  let provider: TelegramTelegraphProvider;
  let telegramClient: TelegramBridgeClient;
  let convexClient: TelegramConvexClient;

  beforeEach(() => {
    telegramClient = createMockTelegramClient();
    convexClient = createMockConvexClient();
    provider = new TelegramTelegraphProvider(telegramClient, convexClient);
  });

  describe("sendMessage", () => {
    it("should send message to both Convex and Telegram", async () => {
      const result = await provider.sendMessage(
        "thread-1",
        "Hello from Mission Control!",
        { senderId: "agent-ceo", senderType: "AGENT" }
      );

      expect(result.status).toBe("SENT");
      expect(convexClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread-1",
          senderId: "agent-ceo",
          content: "Hello from Mission Control!",
          channel: "TELEGRAM",
        })
      );
      expect(telegramClient.sendTelegramMessage).toHaveBeenCalledWith(
        "thread-1",
        "Hello from Mission Control!"
      );
    });

    it("should BLOCK empty/whitespace-only content (safety)", async () => {
      await expect(
        provider.sendMessage("thread-1", "")
      ).rejects.toThrow("SAFETY");

      await expect(
        provider.sendMessage("thread-1", "   ")
      ).rejects.toThrow("SAFETY");
    });

    it("should BLOCK short streaming-indicator messages (safety)", async () => {
      await expect(
        provider.sendMessage("thread-1", "Loading...")
      ).rejects.toThrow("SAFETY");
    });

    it("should BLOCK messages with [STREAMING] marker (safety)", async () => {
      await expect(
        provider.sendMessage("thread-1", "[STREAMING] Here is partial output")
      ).rejects.toThrow("SAFETY");
    });

    it("should BLOCK messages with [PARTIAL] marker (safety)", async () => {
      await expect(
        provider.sendMessage("thread-1", "[PARTIAL] First chunk of response")
      ).rejects.toThrow("SAFETY");
    });

    it("should allow full complete messages", async () => {
      const result = await provider.sendMessage(
        "thread-1",
        "This is a complete and final response from the agent."
      );
      expect(result.status).toBe("SENT");
    });

    it("should store message in Convex even if Telegram fails", async () => {
      (telegramClient.sendTelegramMessage as any).mockRejectedValueOnce(
        new Error("Telegram API error")
      );

      // Should not throw; message is still stored
      const result = await provider.sendMessage("thread-1", "Important message");
      expect(result.status).toBe("SENT");
      expect(convexClient.sendMessage).toHaveBeenCalled();
    });
  });

  describe("createThread", () => {
    it("should create a thread with TELEGRAM channel", async () => {
      const threadId = await provider.createThread({
        title: "External Comms",
        participants: ["agent-ceo"],
        channel: "TELEGRAM",
      });

      expect(threadId).toBe("cvx-thread-001");
      expect(convexClient.createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "TELEGRAM",
        })
      );
    });
  });

  describe("mapExternalThread", () => {
    it("should return existing thread if found", async () => {
      (convexClient.findThreadByExternalRef as any).mockResolvedValueOnce("existing-thread");

      const threadId = await provider.mapExternalThread("tg-chat-123");
      expect(threadId).toBe("existing-thread");
    });

    it("should create new thread if not found", async () => {
      (convexClient.findThreadByExternalRef as any).mockResolvedValueOnce(null);

      const threadId = await provider.mapExternalThread("tg-chat-456");
      expect(threadId).toBe("cvx-thread-001");
      expect(convexClient.createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Telegram: tg-chat-456",
          channel: "TELEGRAM",
          externalThreadRef: "tg-chat-456",
        })
      );
    });
  });
});
