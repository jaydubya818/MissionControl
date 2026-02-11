/**
 * Output Parser
 * 
 * Parses agent outputs for "STATUS: done" completion markers and extracts
 * structured data. Follows Antfarm's pattern of explicit status signaling.
 */

export interface ParsedOutput {
  status: "done" | "failed" | "unknown";
  data: Record<string, string>;
  rawOutput: string;
}

/**
 * Parse agent output for status and structured data
 * 
 * Expected format:
 *   STATUS: done
 *   KEY: value
 *   KEY2: value2
 * 
 * @param output - Raw agent output text
 * @returns Parsed status and data
 * 
 * @example
 * parse("STATUS: done\nSTORIES: 5 stories defined\nCOST: $0.25")
 * // => {
 * //   status: "done",
 * //   data: { STORIES: "5 stories defined", COST: "$0.25" },
 * //   rawOutput: "..."
 * // }
 */
export function parse(output: string): ParsedOutput {
  const lines = output.split("\n");
  const data: Record<string, string> = {};
  let status: "done" | "failed" | "unknown" = "unknown";
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for STATUS marker
    if (trimmed.startsWith("STATUS:")) {
      const statusValue = trimmed.substring(7).trim().toLowerCase();
      if (statusValue === "done") {
        status = "done";
      } else if (statusValue === "failed") {
        status = "failed";
      }
      continue;
    }
    
    // Extract key-value pairs (KEY: value)
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0 && colonIndex < trimmed.length - 1) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      // Only capture uppercase keys (convention for structured output)
      if (key === key.toUpperCase() && key.length > 0) {
        data[key] = value;
      }
    }
  }
  
  return {
    status,
    data,
    rawOutput: output,
  };
}

/**
 * Check if output meets the expected criteria
 * 
 * @param output - Raw agent output text
 * @param expects - Expected string (e.g., "STATUS: done")
 * @returns True if output meets expectations
 * 
 * @example
 * meetsExpectations("STATUS: done\nFINDINGS: ...", "STATUS: done")
 * // => true
 * 
 * meetsExpectations("Still working...", "STATUS: done")
 * // => false
 */
export function meetsExpectations(output: string, expects: string): boolean {
  const normalized = output.toLowerCase().replace(/\s+/g, " ");
  const expectedNormalized = expects.toLowerCase().replace(/\s+/g, " ");
  
  return normalized.includes(expectedNormalized);
}

/**
 * Extract specific data field from parsed output
 * 
 * @param parsed - Parsed output object
 * @param key - Data key to extract
 * @returns Value or undefined
 */
export function extractData(parsed: ParsedOutput, key: string): string | undefined {
  return parsed.data[key.toUpperCase()];
}
