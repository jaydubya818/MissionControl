/**
 * Internal Telegraph Provider Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { InternalTelegraphProvider } from "../internal";
import type { ConvexTelegraphClient } from "../internal";

function createMockClient(): ConvexTelegraphClient {
  return {
    sendMessage: vi.fn().mockResolvedValue("msg-001"),
    getMessages: vi.fn().mockResolvedValue([]),
    createThread: vi.fn().mockResolvedValue("thread-001"),
  };
}

describe("InternalTelegraphProvider", () => {
  let provider: InternalTelegraphProvider;
  let client: ConvexTelegraphClient;

  beforeEach(() => {
    client = createMockClient();
    provider = new InternalTelegraphProvider(client);
  });

  describe("sendMessage", () => {
    it("should send a message to the internal channel", async () => {
      const result = await provider.sendMessage("thread-1", "Hello team!", {
        senderId: "agent-001",
        senderType: "AGENT",
      });

      expect(result.messageId).toBe("msg-001");
      expect(result.status).toBe("SENT");
      expect(result.timestamp).toBeDefined();
      expect(client.sendMessage).toHaveBeenCalledWith({
        threadId: "thread-1",
        senderId: "agent-001",
        senderType: "AGENT",
        content: "Hello team!",
        channel: "INTERNAL",
        replyToId: undefined,
        metadata: undefined,
      });
    });

    it("should default to SYSTEM sender when no options", async () => {
      await provider.sendMessage("thread-1", "System message");

      expect(client.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          senderId: "SYSTEM",
          senderType: "SYSTEM",
        })
      );
    });

    it("should support reply-to messages", async () => {
      await provider.sendMessage("thread-1", "Reply content", {
        senderId: "agent-001",
        senderType: "AGENT",
        replyToId: "msg-000",
      });

      expect(client.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          replyToId: "msg-000",
        })
      );
    });
  });

  describe("getMessages", () => {
    it("should retrieve messages for a thread", async () => {
      const mockMessages = [
        { _id: "msg-1", content: "Hello", senderId: "agent-1" },
        { _id: "msg-2", content: "Hi there", senderId: "agent-2" },
      ];
      (client.getMessages as any).mockResolvedValue(mockMessages);

      const messages = await provider.getMessages("thread-1", { limit: 10 });

      expect(messages).toEqual(mockMessages);
      expect(client.getMessages).toHaveBeenCalledWith({
        threadId: "thread-1",
        limit: 10,
      });
    });
  });

  describe("createThread", () => {
    it("should create a new internal thread", async () => {
      const threadId = await provider.createThread({
        title: "Sprint Planning",
        projectId: "project-1",
        participants: ["agent-1", "agent-2"],
        channel: "INTERNAL",
      });

      expect(threadId).toBe("thread-001");
      expect(client.createThread).toHaveBeenCalledWith({
        title: "Sprint Planning",
        projectId: "project-1",
        participants: ["agent-1", "agent-2"],
        channel: "INTERNAL",
        linkedTaskId: undefined,
        linkedApprovalId: undefined,
      });
    });

    it("should support linking thread to task", async () => {
      await provider.createThread({
        title: "Task Discussion",
        participants: ["agent-1"],
        channel: "INTERNAL",
        linkedTaskId: "task-123",
      });

      expect(client.createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedTaskId: "task-123",
        })
      );
    });
  });

  describe("mapExternalThread", () => {
    it("should throw for internal provider", async () => {
      await expect(
        provider.mapExternalThread("ext-thread-1")
      ).rejects.toThrow("Internal provider does not support external thread mapping");
    });
  });
});
