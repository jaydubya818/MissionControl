import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const GITHUB_API_VERSION = "2026-03-10";

export interface InstallationToken {
  token: string;
  expiresAt: number;
}

export function loadGithubAppPrivateKey(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const inlineKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (inlineKey) return inlineKey;
  const privateKeyFile = env.GITHUB_APP_PRIVATE_KEY_FILE?.trim();
  if (!privateKeyFile) return undefined;
  try {
    const key = readFileSync(privateKeyFile, "utf8").trim();
    if (!key) throw new Error("empty key file");
    return key;
  } catch {
    throw new Error("GitHub App private key file could not be read.");
  }
}

export async function mintInstallationToken(input: {
  appId: string;
  installationId: string;
  providerRepositoryId: string;
  privateKey: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<InstallationToken> {
  if (!/^\d+$/.test(input.installationId) || !/^\d+$/.test(input.providerRepositoryId)) {
    throw new Error("GitHub App installation and repository identities must be numeric.");
  }
  const appJwt = createGithubAppJwt({ appId: input.appId, privateKey: input.privateKey, now: input.now });
  const result = await githubJson<{ token?: string; expires_at?: string }>(
    `https://api.github.com/app/installations/${input.installationId}/access_tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${appJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ repository_ids: [Number(input.providerRepositoryId)] }),
    },
    input.fetchImpl
  );
  const expiresAt = result.expires_at ? Date.parse(result.expires_at) : Number.NaN;
  if (!result.token || !Number.isFinite(expiresAt)) throw new Error("GitHub installation token could not be issued.");
  return { token: result.token, expiresAt };
}

export async function createOrReusePullRequest(input: {
  repository: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  token: string;
  headSha: string;
  fetchImpl?: typeof fetch;
}) {
  const [owner] = input.repository.split("/");
  if (!owner || input.repository.split("/").length !== 2) throw new Error("GitHub repository must use owner/name format.");
  const existing = await githubJson<Array<any>>(
    `https://api.github.com/repos/${input.repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${input.branch}`)}&per_page=10`,
    { method: "GET", headers: { Authorization: `Bearer ${input.token}` } },
    input.fetchImpl
  );
  const exact = existing.find((pull) => pull?.head?.ref === input.branch && pull?.base?.ref === input.base);
  if (exact) {
    return normalizePullRequest(exact, input, true);
  }
  if (existing.length > 0) throw new Error("An open pull request exists for the branch with a different base branch.");
  const created = await githubJson<any>(
    `https://api.github.com/repos/${input.repository}/pulls`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.slice(0, 240),
        body: input.body.slice(0, 60_000),
        head: input.branch,
        base: input.base,
        draft: false,
      }),
    },
    input.fetchImpl
  );
  return normalizePullRequest(created, input, false);
}

export function createGithubAppJwt(input: { appId: string; privateKey: string; now?: number }) {
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: input.appId }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(input.privateKey.replace(/\\n/g, "\n"));
  return `${signingInput}.${signature.toString("base64url")}`;
}

async function githubJson<T>(url: string, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "Mission-Control-Factory-Worker",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(`GitHub request failed (${response.status}): ${String(error.message ?? "request rejected").slice(0, 300)}`);
  }
  return await response.json() as T;
}

function normalizePullRequest(
  pull: any,
  expected: { branch: string; base: string; headSha: string },
  reused: boolean,
) {
  if (!Number.isInteger(pull?.number) || typeof pull?.html_url !== "string") {
    throw new Error("GitHub returned an invalid pull-request record.");
  }
  if (pull?.head?.ref !== expected.branch || pull?.base?.ref !== expected.base) {
    throw new Error("GitHub pull-request refs do not match the approved publication target.");
  }
  if (typeof pull?.head?.sha !== "string" || pull.head.sha !== expected.headSha) {
    throw new Error("GitHub pull-request head does not match the independently verified candidate.");
  }
  return {
    number: pull.number as number,
    url: pull.html_url as string,
    nodeId: typeof pull.node_id === "string" ? pull.node_id : undefined,
    headSha: pull.head.sha,
    reused,
  };
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
