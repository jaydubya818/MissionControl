/**
 * Output Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parse, meetsExpectations, extractData } from "../parser";

describe("parse", () => {
  it("should parse STATUS: done", () => {
    const output = "STATUS: done\nFINDINGS: All tests passed";
    const result = parse(output);
    
    expect(result.status).toBe("done");
    expect(result.data.FINDINGS).toBe("All tests passed");
  });
  
  it("should parse STATUS: failed", () => {
    const output = "STATUS: failed\nERROR: Connection timeout";
    const result = parse(output);
    
    expect(result.status).toBe("failed");
    expect(result.data.ERROR).toBe("Connection timeout");
  });
  
  it("should extract multiple data fields", () => {
    const output = `STATUS: done
STORIES: 5 stories defined
COST: $0.25
DURATION: 45 minutes`;
    const result = parse(output);
    
    expect(result.status).toBe("done");
    expect(result.data.STORIES).toBe("5 stories defined");
    expect(result.data.COST).toBe("$0.25");
    expect(result.data.DURATION).toBe("45 minutes");
  });
  
  it("should handle output without STATUS marker", () => {
    const output = "Just some regular output\nNo status here";
    const result = parse(output);
    
    expect(result.status).toBe("unknown");
    expect(result.data).toEqual({});
  });
  
  it("should only extract uppercase keys", () => {
    const output = `STATUS: done
UPPERCASE: This should be extracted
lowercase: This should not
MixedCase: This should not`;
    const result = parse(output);
    
    expect(result.data.UPPERCASE).toBe("This should be extracted");
    expect(result.data.lowercase).toBeUndefined();
    expect(result.data.MixedCase).toBeUndefined();
  });
  
  it("should handle multiline values", () => {
    const output = `STATUS: done
PLAN: Story 1: Add authentication
Story 2: Add tests
Story 3: Deploy`;
    const result = parse(output);
    
    // Only captures first line after colon
    expect(result.data.PLAN).toBe("Story 1: Add authentication");
  });
  
  it("should preserve raw output", () => {
    const output = "STATUS: done\nSome detailed output here";
    const result = parse(output);
    
    expect(result.rawOutput).toBe(output);
  });
  
  it("should handle empty output", () => {
    const output = "";
    const result = parse(output);
    
    expect(result.status).toBe("unknown");
    expect(result.data).toEqual({});
  });
  
  it("should be case-insensitive for status value", () => {
    const output1 = "STATUS: DONE";
    const output2 = "STATUS: Done";
    const output3 = "STATUS: done";
    
    expect(parse(output1).status).toBe("done");
    expect(parse(output2).status).toBe("done");
    expect(parse(output3).status).toBe("done");
  });
});

describe("meetsExpectations", () => {
  it("should return true when output contains expected string", () => {
    const output = "STATUS: done\nAll tests passed";
    const expects = "STATUS: done";
    
    expect(meetsExpectations(output, expects)).toBe(true);
  });
  
  it("should return false when output doesn't contain expected string", () => {
    const output = "Still working on it...";
    const expects = "STATUS: done";
    
    expect(meetsExpectations(output, expects)).toBe(false);
  });
  
  it("should be case-insensitive", () => {
    const output = "STATUS: DONE";
    const expects = "status: done";
    
    expect(meetsExpectations(output, expects)).toBe(true);
  });
  
  it("should ignore extra whitespace", () => {
    const output = "STATUS:    done";
    const expects = "STATUS: done";
    
    expect(meetsExpectations(output, expects)).toBe(true);
  });
  
  it("should handle multiline output", () => {
    const output = `Working on task...
STATUS: done
All complete!`;
    const expects = "STATUS: done";
    
    expect(meetsExpectations(output, expects)).toBe(true);
  });
});

describe("extractData", () => {
  it("should extract specific data field", () => {
    const parsed = parse("STATUS: done\nSTORIES: 5\nCOST: $0.25");
    
    expect(extractData(parsed, "STORIES")).toBe("5");
    expect(extractData(parsed, "COST")).toBe("$0.25");
  });
  
  it("should return undefined for missing field", () => {
    const parsed = parse("STATUS: done\nSTORIES: 5");
    
    expect(extractData(parsed, "MISSING")).toBeUndefined();
  });
  
  it("should be case-insensitive for key", () => {
    const parsed = parse("STATUS: done\nSTORIES: 5");
    
    expect(extractData(parsed, "stories")).toBe("5");
    expect(extractData(parsed, "Stories")).toBe("5");
    expect(extractData(parsed, "STORIES")).toBe("5");
  });
});
