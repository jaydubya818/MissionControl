import type { Doc } from "../_generated/dataModel";
import { classifyRisk, requiresApproval } from "./riskClassifier";

type LegacyDecision = {
  decision: "ALLOW" | "DENY" | "NEEDS_APPROVAL";
  reason: string;
  riskLevel: "GREEN" | "YELLOW" | "RED";
};

function matchesGlob(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\./g, "\\.");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

function checkShellAllowlist(command: string, policy: Doc<"policies">): { allowed: boolean; reason?: string } {
  const cmd = command.trim().toLowerCase();
  const blocklist = policy.shellBlocklist || [];
  const allowlist = policy.shellAllowlist || [];

  for (const blocked of blocklist) {
    if (cmd.includes(blocked.toLowerCase())) {
      return {
        allowed: false,
        reason: `Command contains blocked pattern: ${blocked}`,
      };
    }
  }

  if (allowlist.length === 0) return { allowed: true };

  for (const allowed of allowlist) {
    if (cmd.startsWith(allowed.toLowerCase())) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: "Command not in allowlist",
  };
}

function checkNetworkAllowlist(url: string, policy: Doc<"policies">): { allowed: boolean; reason?: string } {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const allowlist = policy.networkAllowlist || [];
    if (allowlist.length === 0) return { allowed: true };

    for (const allowed of allowlist) {
      if (hostname === allowed.toLowerCase() || hostname.endsWith(`.${allowed.toLowerCase()}`)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Domain ${hostname} not in allowlist`,
    };
  } catch {
    return {
      allowed: false,
      reason: "Invalid URL",
    };
  }
}

function checkFileReadAllowlist(path: string, policy: Doc<"policies">): { allowed: boolean; reason?: string } {
  const normalizedPath = path.trim().toLowerCase();
  const allowlist = policy.fileReadPaths || [];
  if (allowlist.length === 0) return { allowed: true };

  for (const pattern of allowlist) {
    if (matchesGlob(normalizedPath, pattern.toLowerCase())) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `Path ${path} not in read allowlist`,
  };
}

function checkFileWriteAllowlist(path: string, policy: Doc<"policies">): { allowed: boolean; reason?: string } {
  const normalizedPath = path.trim().toLowerCase();
  const allowlist = policy.fileWritePaths || [];
  if (allowlist.length === 0) return { allowed: true };

  for (const pattern of allowlist) {
    if (matchesGlob(normalizedPath, pattern.toLowerCase())) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `Path ${path} not in write allowlist`,
  };
}

function checkAllowlists(
  toolName: string,
  toolArgs: unknown,
  policy: Doc<"policies">
): { allowed: boolean; reason?: string } {
  const args = (toolArgs ?? {}) as Record<string, unknown>;

  if (toolName === "shell" || toolName === "exec" || toolName === "bash") {
    const command = typeof args.command === "string" ? args.command : typeof args.cmd === "string" ? args.cmd : "";
    return checkShellAllowlist(command, policy);
  }

  if (toolName === "web_fetch" || toolName === "http" || toolName === "fetch") {
    const url = typeof args.url === "string" ? args.url : "";
    return checkNetworkAllowlist(url, policy);
  }

  if (toolName === "read" || toolName === "read_file") {
    const path = typeof args.path === "string" ? args.path : "";
    return checkFileReadAllowlist(path, policy);
  }

  if (toolName === "write" || toolName === "write_file" || toolName === "edit") {
    const path = typeof args.path === "string" ? args.path : "";
    return checkFileWriteAllowlist(path, policy);
  }

  return { allowed: true };
}

export function evaluateLegacyToolPolicy(args: {
  policy: Doc<"policies"> | null;
  agentRole: "INTERN" | "SPECIALIST" | "LEAD" | "CEO";
  budgetRemaining: number;
  estimatedCost: number;
  toolName: string;
  toolArgs?: unknown;
}): LegacyDecision {
  const risk = classifyRisk(args.toolName, args.toolArgs as Record<string, unknown> | undefined);

  if (!args.policy) {
    return {
      decision: "ALLOW",
      reason: "No active legacy policy found",
      riskLevel: risk,
    };
  }

  const allowlistCheck = checkAllowlists(args.toolName, args.toolArgs, args.policy);
  if (!allowlistCheck.allowed) {
    return {
      decision: "DENY",
      reason: allowlistCheck.reason || "Action blocked by allowlist",
      riskLevel: "RED",
    };
  }

  const approvalCheck = requiresApproval(
    risk,
    args.agentRole,
    args.estimatedCost,
    args.budgetRemaining
  );

  if (approvalCheck.required) {
    return {
      decision: "NEEDS_APPROVAL",
      reason: approvalCheck.reason,
      riskLevel: risk,
    };
  }

  return {
    decision: "ALLOW",
    reason: `Legacy policy allows ${args.toolName} for ${args.agentRole}`,
    riskLevel: risk,
  };
}
