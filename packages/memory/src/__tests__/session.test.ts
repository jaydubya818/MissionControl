import { describe, it, expect } from "vitest";
import { SessionMemory } from "../session";

describe("SessionMemory", () => {
  it("starts empty", () => {
    const session = new SessionMemory("agent-1");
    expect(session.getAll()).toEqual([]);
    expect(session.getTaskId()).toBeNull();
  });

  it("tracks task ID after startSession", () => {
    const session = new SessionMemory("agent-1");
    session.startSession("task-42");
    expect(session.getTaskId()).toBe("task-42");
  });

  it("adds and retrieves entries", () => {
    const session = new SessionMemory("agent-1");
    session.startSession("task-1");
    session.add("observation", "Found a bug in auth module");
    session.add("decision", "Will fix using JWT refresh tokens");
    session.add("error", "Module not found: jsonwebtoken");
    
    expect(session.getAll().length).toBe(3);
    expect(session.getByType("error").length).toBe(1);
    expect(session.getByType("decision").length).toBe(1);
  });

  it("getRecent returns the last N entries", () => {
    const session = new SessionMemory("agent-1");
    session.add("note", "Entry 1");
    session.add("note", "Entry 2");
    session.add("note", "Entry 3");
    
    const recent = session.getRecent(2);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe("Entry 2");
    expect(recent[1].content).toBe("Entry 3");
  });

  it("search finds matching entries", () => {
    const session = new SessionMemory("agent-1");
    session.add("observation", "React component renders slowly");
    session.add("observation", "Database query takes 5 seconds");
    session.add("decision", "Use React.memo to optimize");
    
    const results = session.search("react");
    expect(results.length).toBe(2);
  });

  it("enforces maxEntries limit", () => {
    const session = new SessionMemory("agent-1", 3);
    session.add("note", "Entry 1");
    session.add("note", "Entry 2");
    session.add("note", "Entry 3");
    session.add("note", "Entry 4"); // Should evict Entry 1
    
    const all = session.getAll();
    expect(all.length).toBe(3);
    expect(all[0].content).toBe("Entry 2");
  });

  it("clear resets session", () => {
    const session = new SessionMemory("agent-1");
    session.startSession("task-1");
    session.add("note", "something");
    session.clear();
    
    expect(session.getAll()).toEqual([]);
    expect(session.getTaskId()).toBeNull();
  });

  it("serializes to a readable format", () => {
    const session = new SessionMemory("agent-1");
    session.startSession("task-1");
    session.add("decision", "Use Hono for the server");
    
    const serialized = session.serialize();
    expect(serialized).toContain("# Session Memory");
    expect(serialized).toContain("DECISION");
    expect(serialized).toContain("Use Hono for the server");
  });

  it("computes correct stats", () => {
    const session = new SessionMemory("agent-1");
    session.add("observation", "obs 1");
    session.add("decision", "dec 1");
    session.add("error", "err 1");
    session.add("error", "err 2");
    session.add("tool_result", "result 1");
    
    const stats = session.stats();
    expect(stats.entryCount).toBe(5);
    expect(stats.errorCount).toBe(2);
    expect(stats.decisionCount).toBe(1);
    expect(stats.toolResultCount).toBe(1);
  });
});
