/**
 * Session Memory — Tier 1
 * 
 * Short-lived memory for a single task execution.
 * Tracks conversation context, tool outputs, decisions made,
 * and intermediate results during a task run.
 * 
 * This lives in-process (not persisted between restarts) but
 * is periodically flushed to Convex agentDocuments (SESSION_MEMORY).
 */

export interface SessionEntry {
  timestamp: number;
  type: "observation" | "decision" | "tool_result" | "error" | "note";
  content: string;
  metadata?: Record<string, unknown>;
}

export class SessionMemory {
  private entries: SessionEntry[] = [];
  private agentId: string;
  private taskId: string | null = null;
  private maxEntries: number;
  
  constructor(agentId: string, maxEntries = 100) {
    this.agentId = agentId;
    this.maxEntries = maxEntries;
  }
  
  /**
   * Start a new session for a task.
   */
  startSession(taskId: string): void {
    this.taskId = taskId;
    this.entries = [];
  }
  
  /**
   * Add an entry to session memory.
   */
  add(type: SessionEntry["type"], content: string, metadata?: Record<string, unknown>): void {
    this.entries.push({
      timestamp: Date.now(),
      type,
      content,
      metadata,
    });
    
    // Evict oldest entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
  
  /**
   * Get all entries of a specific type.
   */
  getByType(type: SessionEntry["type"]): SessionEntry[] {
    return this.entries.filter((e) => e.type === type);
  }
  
  /**
   * Get the last N entries.
   */
  getRecent(count: number): SessionEntry[] {
    // Handle non-positive counts
    if (count <= 0) {
      return [];
    }
    return this.entries.slice(-count);
  }
  
  /**
   * Search entries by content (simple substring match).
   */
  search(query: string): SessionEntry[] {
    const lower = query.toLowerCase();
    return this.entries.filter((e) => e.content.toLowerCase().includes(lower));
  }
  
  /**
   * Get all entries.
   */
  getAll(): SessionEntry[] {
    return [...this.entries];
  }
  
  /**
   * Get the current task ID.
   */
  getTaskId(): string | null {
    return this.taskId;
  }
  
  /**
   * Get the agent ID.
   */
  getAgentId(): string {
    return this.agentId;
  }
  
  /**
   * Serialize session memory to a string for Convex persistence.
   */
  serialize(): string {
    const sections: string[] = [];
    
    sections.push(`# Session Memory — ${this.agentId}`);
    sections.push(`Task: ${this.taskId ?? "none"}`);
    sections.push(`Entries: ${this.entries.length}`);
    sections.push(`Last updated: ${new Date().toISOString()}`);
    sections.push("");
    
    for (const entry of this.entries) {
      const time = new Date(entry.timestamp).toISOString();
      sections.push(`## [${entry.type.toUpperCase()}] ${time}`);
      sections.push(entry.content);
      if (entry.metadata) {
        sections.push(`> Metadata: ${JSON.stringify(entry.metadata)}`);
      }
      sections.push("");
    }
    
    return sections.join("\n");
  }
  
  /**
   * Clear session memory (called when task finishes).
   */
  clear(): void {
    this.entries = [];
    this.taskId = null;
  }
  
  /**
   * Get summary statistics for this session.
   */
  stats(): {
    entryCount: number;
    errorCount: number;
    decisionCount: number;
    toolResultCount: number;
    durationMs: number;
  } {
    const errors = this.entries.filter((e) => e.type === "error").length;
    const decisions = this.entries.filter((e) => e.type === "decision").length;
    const toolResults = this.entries.filter((e) => e.type === "tool_result").length;
    
    const first = this.entries[0]?.timestamp ?? Date.now();
    const last = this.entries[this.entries.length - 1]?.timestamp ?? Date.now();
    
    return {
      entryCount: this.entries.length,
      errorCount: errors,
      decisionCount: decisions,
      toolResultCount: toolResults,
      durationMs: last - first,
    };
  }
}
