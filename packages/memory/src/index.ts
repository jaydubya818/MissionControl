/**
 * Mission Control Memory System
 * 
 * Three-tier persistent memory for AI agents:
 * 
 *   1. Session Memory — Short-lived, within a single task execution.
 *      Stored in agentDocuments (type: SESSION_MEMORY).
 *      Cleared when the agent finishes a task.
 * 
 *   2. Project Memory — Medium-lived, scoped to a project.
 *      Stored in agentDocuments (type: WORKING_MD, DAILY_NOTE).
 *      Persists across sessions, evolves over time.
 * 
 *   3. Global Memory — Long-lived, cross-project learning.
 *      Stored in agentPerformance and agentPatterns tables.
 *      Used for routing decisions and pattern recognition.
 */

export { SessionMemory, type SessionEntry } from "./session.js";
export { ProjectMemory, type WorkingDoc, type DailyNote } from "./project.js";
export { GlobalMemory, type PerformanceRecord, type PatternRecord } from "./global.js";
export { MemoryManager, type MemoryConfig } from "./manager.js";
export * from "./factory/index.js";
