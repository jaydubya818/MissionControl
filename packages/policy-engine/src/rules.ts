/**
 * Policy Rules (v1)
 * 
 * Default policy configuration based on PRD requirements.
 */

import {
  Policy,
  AutonomyRules,
  ToolRiskMap,
  Allowlists,
  BudgetDefaults,
  SpawnLimits,
  LoopDetection,
} from "@mission-control/shared";

/**
 * Autonomy Rules
 * 
 * Defines what each autonomy level can do.
 * Keys are UPPERCASE to match AutonomyLevel type.
 */
export const AUTONOMY_RULES: AutonomyRules = {
  INTERN: {
    canSpawn: false,
    yellowAllowed: false,
    redAllowed: false,
    requiresApprovalForYellow: true,
    requiresApprovalForRed: true,
  },
  SPECIALIST: {
    canSpawn: true,
    yellowAllowed: true,
    redAllowed: false,
    requiresApprovalForYellow: false,
    requiresApprovalForRed: true,
  },
  LEAD: {
    canSpawn: true,
    yellowAllowed: true,
    redAllowed: false,
    requiresApprovalForYellow: false,
    requiresApprovalForRed: true,
  },
  CEO: {
    canSpawn: true,
    yellowAllowed: true,
    redAllowed: false,
    requiresApprovalForYellow: false,
    requiresApprovalForRed: true,
  },
};

/**
 * Tool Risk Map
 * 
 * Classifies tools by risk level.
 */
export const TOOL_RISK_MAP: ToolRiskMap = {
  // GREEN: Internal, reversible, read-only
  read_db: "green",
  query_db: "green",
  post_comment: "green",
  create_doc: "green",
  read_file: "green",
  list_files: "green",
  web_search: "green",
  generate_draft: "green",
  analyze_data: "green",
  
  // YELLOW: Potentially harmful, requires guardrails
  shell_exec: "yellow",
  git_commit: "yellow",
  git_push: "yellow",
  network_call: "yellow",
  http_request: "yellow",
  write_file: "yellow",
  delete_file: "yellow",
  install_deps: "yellow",
  modify_cron: "yellow",
  create_branch: "yellow",
  
  // RED: External impact, irreversible, secrets
  send_email: "red",
  post_social: "red",
  tweet: "red",
  post_linkedin: "red",
  deploy_prod: "red",
  modify_prod_config: "red",
  access_secrets: "red",
  read_env: "red",
  destructive_shell: "red",
  rm_rf: "red",
  drop_table: "red",
  external_api_write: "red",
};

/**
 * Allowlists
 * 
 * Defines what shell commands, network domains, and filesystem paths are allowed.
 */
export const ALLOWLISTS: Allowlists = {
  shell: [
    "ls",
    "pwd",
    "cat",
    "head",
    "tail",
    "grep",
    "find",
    "git status",
    "git diff",
    "git log",
    "git checkout -b",
    "git add",
    "git commit",
    "npm test",
    "npm run lint",
    "npm run typecheck",
    "node scripts/",
    "python scripts/",
  ],
  shellBlocked: [
    "rm -rf",
    "sudo",
    "chmod 777",
    "chown",
    "dd",
    "mkfs",
    "curl | bash",
    "wget | sh",
    "../",
    "~/",
    "/etc/",
    "/var/",
    "/usr/",
  ],
  network: [
    "github.com",
    "gitlab.com",
    "api.openai.com",
    "api.anthropic.com",
    "docs.convex.dev",
    "stackoverflow.com",
    "npmjs.com",
    "pypi.org",
  ],
  filesystem: {
    read: [
      "workspace/**",
      "src/**",
      "docs/**",
      "scripts/**",
      "package.json",
      "tsconfig.json",
      "README.md",
    ],
    write: [
      "workspace/output/**",
      "workspace/docs/**",
      "workspace/memory/**",
      "src/**",
      "docs/**",
    ],
    writeBlocked: [
      "workspace/config/**",
      ".env",
      ".env.local",
      "package-lock.json",
      "node_modules/**",
    ],
  },
};

/**
 * Budget Defaults
 * 
 * Default budget caps in USD.
 * Keys are UPPERCASE to match AutonomyLevel and TaskType.
 */
export const BUDGET_DEFAULTS: BudgetDefaults = {
  perAgentDaily: {
    INTERN: 2,
    SPECIALIST: 5,
    LEAD: 12,
    CEO: 25,
  },
  perTask: {
    CONTENT: 6,
    SOCIAL: 2,
    EMAIL_MARKETING: 4,
    CUSTOMER_RESEARCH: 5,
    SEO_RESEARCH: 4,
    ENGINEERING: 8,
    DOCS: 3,
    OPS: 3,
  },
  perRun: {
    INTERN: 0.25,
    SPECIALIST: 0.75,
    LEAD: 1.5,
    CEO: 3.0,
  },
};

// ============================================================================
// SAFETY DEFAULTS (OpenClaw-aligned)
// ============================================================================

/**
 * Patterns that indicate secret/credential exposure.
 * Used to block outbound messages containing secrets.
 */
export const SECRET_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey)\s*[=:]\s*\S+/i,
  /(?:secret|token|password|passwd|pwd)\s*[=:]\s*\S+/i,
  /(?:sk|pk)[-_][a-zA-Z0-9]{20,}/,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}/,
  /(?:xoxb|xoxp|xoxo|xoxa|xoxr|xoxs)-[A-Za-z0-9-]+/,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
];

/**
 * Patterns that indicate directory listing/dump commands.
 */
export const DIRECTORY_DUMP_PATTERNS: RegExp[] = [
  /\btree\s/i,
  /\bls\s+-[a-zA-Z]*[rR]/,
  /\bfind\s+[./]\s+-type/,
  /\bdir\s+\/s/i,
  /\bget-childitem\s+-recurse/i,
];

/**
 * Safety rule evaluator for OpenClaw defaults.
 */
export interface SafetyCheckResult {
  safe: boolean;
  violations: string[];
  ruleIds: string[];
}

export function checkSafetyDefaults(context: {
  content?: string;
  command?: string;
  channel?: string;
  isStreaming?: boolean;
  inputSource?: string;
}): SafetyCheckResult {
  const violations: string[] = [];
  const ruleIds: string[] = [];

  // Rule 1: Block secret exposure in outbound content
  if (context.content) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(context.content)) {
        violations.push("Content contains potential secrets or credentials");
        ruleIds.push("BLOCK_SECRET_PATTERNS");
        break;
      }
    }
  }

  // Rule 2: Block directory dump commands
  if (context.command) {
    for (const pattern of DIRECTORY_DUMP_PATTERNS) {
      if (pattern.test(context.command)) {
        violations.push("Command appears to dump directory structure");
        ruleIds.push("BLOCK_DIRECTORY_DUMP");
        break;
      }
    }
  }

  // Rule 3: Block streaming/partial replies to external channels
  if (context.channel === "TELEGRAM" && context.isStreaming) {
    violations.push("Cannot send streaming/partial content to external messaging surface");
    ruleIds.push("FINAL_REPLIES_ONLY");
  }

  // Rule 4: Flag untrusted DM input
  if (context.inputSource === "DM") {
    // Not a violation, but adds a flag for downstream policy decisions
    ruleIds.push("UNTRUSTED_DM_INPUT");
  }

  return {
    safe: violations.length === 0,
    violations,
    ruleIds,
  };
}

/**
 * Spawn Limits
 * 
 * Limits for sub-agent spawning.
 */
export const SPAWN_LIMITS: SpawnLimits = {
  maxActive: 30,
  maxPerParent: 3,
  maxDepth: 2,
  ttl: 6 * 60 * 60 * 1000, // 6 hours in ms
};

/**
 * Loop Detection
 * 
 * Thresholds for detecting runaway loops.
 */
export const LOOP_DETECTION: LoopDetection = {
  commentRateThreshold: 20,
  commentRateWindow: 30 * 60 * 1000, // 30 minutes in ms
  reviewCycleLimit: 3,
  backAndForthLimit: 8,
  backAndForthWindow: 10 * 60 * 1000, // 10 minutes in ms
  retryLimit: 3,
};

/**
 * Default Policy v1
 * 
 * Complete policy object ready to be stored in the database.
 */
export const DEFAULT_POLICY_V1: Omit<Policy, "_id" | "_creationTime"> = {
  version: "v1",
  active: true,
  autonomyRules: AUTONOMY_RULES,
  riskMap: TOOL_RISK_MAP,
  allowlists: ALLOWLISTS,
  budgets: BUDGET_DEFAULTS,
  spawnLimits: SPAWN_LIMITS,
  loopDetection: LOOP_DETECTION,
};
