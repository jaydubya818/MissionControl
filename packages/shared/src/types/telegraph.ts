/**
 * Telegraph Communication Types
 *
 * Async messaging system for agent-org communications.
 */

export type TelegraphChannel = "INTERNAL" | "TELEGRAM";
export type MessageStatus = "DRAFT" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type SenderType = "AGENT" | "HUMAN" | "SYSTEM";

export interface TelegraphThread {
  _id: string;
  _creationTime: number;
  projectId?: string;
  title: string;
  participants: string[];
  channel: TelegraphChannel;
  externalThreadRef?: string;
  linkedTaskId?: string;
  linkedApprovalId?: string;
  linkedIncidentId?: string;
  lastMessageAt?: number;
  messageCount: number;
  metadata?: Record<string, any>;
}

export interface TelegraphMessage {
  _id: string;
  _creationTime: number;
  projectId?: string;
  threadId: string;
  senderId: string;
  senderType: SenderType;
  content: string;
  replyToId?: string;
  channel: TelegraphChannel;
  externalRef?: string;
  status: MessageStatus;
  metadata?: Record<string, any>;
}

/**
 * Provider interface for Telegraph implementations.
 */
export interface TelegraphProvider {
  sendMessage(threadRef: string, content: string, options?: TelegraphSendOptions): Promise<TelegraphMessageResult>;
  getMessages(threadRef: string, options?: TelegraphGetOptions): Promise<TelegraphMessage[]>;
  createThread(options: TelegraphCreateThreadOptions): Promise<string>;
  mapExternalThread(externalRef: string): Promise<string>;
}

export interface TelegraphSendOptions {
  senderId: string;
  senderType: SenderType;
  replyToId?: string;
  metadata?: Record<string, any>;
}

export interface TelegraphGetOptions {
  limit?: number;
  before?: string;
  after?: string;
}

export interface TelegraphCreateThreadOptions {
  title: string;
  projectId?: string;
  participants: string[];
  channel: TelegraphChannel;
  linkedTaskId?: string;
  linkedApprovalId?: string;
}

export interface TelegraphMessageResult {
  messageId: string;
  status: MessageStatus;
  timestamp: number;
}
