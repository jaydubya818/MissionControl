/**
 * Message Types
 *
 * Messages are comments/discussions on tasks (thread-per-task).
 */
export type MessageAuthorType = "agent" | "human";
export interface Message {
    _id: string;
    _creationTime: number;
    taskId: string;
    threadRef: string;
    authorId: string;
    authorType: MessageAuthorType;
    content: string;
    mentions: string[];
    metadata: Record<string, any>;
}
export interface CreateMessageInput {
    taskId: string;
    threadRef: string;
    authorId: string;
    authorType: MessageAuthorType;
    content: string;
    metadata?: Record<string, any>;
}
export interface UpdateMessageInput {
    content?: string;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=message.d.ts.map