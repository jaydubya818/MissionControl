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
 */
export const AUTONOMY_RULES: AutonomyRules = {
  intern: {
    canSpawn: false,
    yellowAllowed: false,
    redAllowed: false,
    requiresApprovalForYellow: true,
    requiresApprovalForRed: true,
  },
  specialist: {
    canSpawn: true,
    yellowAllowed: true,
    redAllowed: false,
    requiresApprovalForYellow: false,
    requiresApprovalForRed: true,
  },
  lead: {
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
 */
export const BUDGET_DEFAULTS: BudgetDefaults = {
  perAgentDaily: {
    intern: 2,
    specialist: 5,
    lead: 12,
  },
  perTask: {
    content: 6,
    social: 2,
    email_marketing: 4,
    customer_research: 5,
    seo_research: 4,
    engineering: 8,
    docs: 3,
    ops: 3,
  },
  perRun: {
    intern: 0.25,
    specialist: 0.75,
    lead: 1.5,
  },
};

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
