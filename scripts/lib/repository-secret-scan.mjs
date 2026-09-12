const PLACEHOLDER_FRAGMENTS = [
  "example",
  "placeholder",
  "your-",
  "dummy",
  "fixture",
  "must-not",
  "attempt-secret",
  "1234567890",
  "abcdefghijklmnopqrstuvwxyz",
  "miie...",
];

const SECRET_PATTERNS = [
  { rule: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{32,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { rule: "github-installation-token", pattern: /\bghs_[A-Za-z0-9._-]{36,}\b/g },
  { rule: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  // Fine-grained PATs are `github_pat_<base62>_<base62>`; the underscore
  // separators keep them outside the classic `gh[pousr]_[A-Za-z0-9]+` rule.
  { rule: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9]{20,}_[A-Za-z0-9]{20,}\b/g },
  // Telegram bot tokens: `<bot-id>:AA<secret>`. This repo ships a Telegram bot.
  { rule: "telegram-bot-token", pattern: /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/g },
  { rule: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { rule: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { rule: "provider-api-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g },
  { rule: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { rule: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    rule: "sensitive-env-assignment",
    pattern: /\b(?:ORCHESTRATION_API_TOKEN|MC_API_TOKEN|CONVEX_DEPLOY_KEY|GITHUB_APP_PRIVATE_KEY|OPENROUTER_MANAGEMENT_API_KEY)\b\s*[:=]\s*["']?([^\s"'#]{12,})/g,
  },
];

function isPlaceholder(match) {
  const normalized = match.toLowerCase();
  return match.includes("<") || match.includes("${") || PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function scanTextForSecrets(text) {
  const findings = [];
  for (const { rule, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (isPlaceholder(match[0])) continue;
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index);
      const sourceLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      if (sourceLine.includes("secret-scan: allow-fixture")) continue;
      const prefix = text.slice(0, match.index);
      findings.push({
        rule,
        line: prefix.split("\n").length,
      });
    }
  }
  return findings;
}

export function isSensitiveTrackedPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized === ".env.example" || normalized.endsWith("/.env.example")) return false;
  return /(^|\/)(?:\.env(?:\.[^/]+)?|[^/]+\.(?:pem|key|p12|pfx))$/.test(normalized);
}
