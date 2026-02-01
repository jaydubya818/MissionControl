/**
 * Allowlist Validators
 * 
 * Functions to check if shell commands, network calls, and file operations are allowed.
 */

import { ALLOWLISTS } from "./rules";
import { SECRET_PATTERNS, PRODUCTION_INDICATORS } from "@mission-control/shared";

/**
 * Check if a shell command is allowed
 */
export function isShellAllowed(command: string): { allowed: boolean; reason?: string } {
  const cmd = command.trim().toLowerCase();
  
  // Check blocklist first (highest priority)
  for (const blocked of ALLOWLISTS.shellBlocked) {
    if (cmd.includes(blocked.toLowerCase())) {
      return {
        allowed: false,
        reason: `Command contains blocked pattern: ${blocked}`,
      };
    }
  }
  
  // Check allowlist
  for (const allowed of ALLOWLISTS.shell) {
    if (cmd.startsWith(allowed.toLowerCase())) {
      return { allowed: true };
    }
  }
  
  return {
    allowed: false,
    reason: "Command not in allowlist",
  };
}

/**
 * Check if a network domain is allowed
 */
export function isNetworkAllowed(url: string): { allowed: boolean; reason?: string } {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check allowlist
    for (const allowed of ALLOWLISTS.network) {
      if (hostname === allowed.toLowerCase() || hostname.endsWith(`.${allowed.toLowerCase()}`)) {
        return { allowed: true };
      }
    }
    
    return {
      allowed: false,
      reason: `Domain ${hostname} not in allowlist`,
    };
  } catch (error) {
    return {
      allowed: false,
      reason: "Invalid URL",
    };
  }
}

/**
 * Check if a file read is allowed
 */
export function isFileReadAllowed(path: string): { allowed: boolean; reason?: string } {
  const normalizedPath = path.trim().toLowerCase();
  
  // Check allowlist (glob patterns)
  for (const pattern of ALLOWLISTS.filesystem.read) {
    if (matchesGlob(normalizedPath, pattern.toLowerCase())) {
      return { allowed: true };
    }
  }
  
  return {
    allowed: false,
    reason: `Path ${path} not in read allowlist`,
  };
}

/**
 * Check if a file write is allowed
 */
export function isFileWriteAllowed(path: string): { allowed: boolean; reason?: string } {
  const normalizedPath = path.trim().toLowerCase();
  
  // Check blocklist first
  for (const blocked of ALLOWLISTS.filesystem.writeBlocked) {
    if (matchesGlob(normalizedPath, blocked.toLowerCase())) {
      return {
        allowed: false,
        reason: `Path ${path} is in write blocklist`,
      };
    }
  }
  
  // Check allowlist
  for (const pattern of ALLOWLISTS.filesystem.write) {
    if (matchesGlob(normalizedPath, pattern.toLowerCase())) {
      return { allowed: true };
    }
  }
  
  return {
    allowed: false,
    reason: `Path ${path} not in write allowlist`,
  };
}

/**
 * Simple glob pattern matching
 * Supports: *, **, exact matches
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, ".*") // ** matches any path
    .replace(/\*/g, "[^/]*") // * matches any filename
    .replace(/\./g, "\\."); // Escape dots
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Check if command/input contains secrets
 */
export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if command/input affects production
 */
export function affectsProduction(text: string): boolean {
  return PRODUCTION_INDICATORS.some((pattern) => pattern.test(text));
}

/**
 * Comprehensive validation for a tool action
 */
export interface ToolActionValidation {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  approvalReasons: string[];
}

export function validateToolAction(
  tool: string,
  params: Record<string, any>
): ToolActionValidation {
  const result: ToolActionValidation = {
    allowed: true,
    reasons: [],
    requiresApproval: false,
    approvalReasons: [],
  };
  
  // Check for secrets
  const paramsStr = JSON.stringify(params);
  if (containsSecrets(paramsStr)) {
    result.requiresApproval = true;
    result.approvalReasons.push("Action involves secrets");
  }
  
  // Check for production impact
  if (affectsProduction(paramsStr)) {
    result.requiresApproval = true;
    result.approvalReasons.push("Action affects production");
  }
  
  // Tool-specific validation
  switch (tool) {
    case "shell_exec":
      if (params.command) {
        const shellCheck = isShellAllowed(params.command);
        if (!shellCheck.allowed) {
          result.allowed = false;
          result.reasons.push(shellCheck.reason || "Shell command not allowed");
        }
      }
      break;
      
    case "network_call":
    case "http_request":
      if (params.url) {
        const networkCheck = isNetworkAllowed(params.url);
        if (!networkCheck.allowed) {
          result.allowed = false;
          result.reasons.push(networkCheck.reason || "Network call not allowed");
        }
      }
      break;
      
    case "read_file":
      if (params.path) {
        const readCheck = isFileReadAllowed(params.path);
        if (!readCheck.allowed) {
          result.allowed = false;
          result.reasons.push(readCheck.reason || "File read not allowed");
        }
      }
      break;
      
    case "write_file":
    case "delete_file":
      if (params.path) {
        const writeCheck = isFileWriteAllowed(params.path);
        if (!writeCheck.allowed) {
          result.allowed = false;
          result.reasons.push(writeCheck.reason || "File write not allowed");
        }
      }
      break;
  }
  
  return result;
}
