const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);

export function resolveServerBinding(env: NodeJS.ProcessEnv = process.env): { host: string; port: number } {
  const host = env.ORCHESTRATION_HOST?.trim() || "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("ORCHESTRATION_HOST must be an explicit loopback address (127.0.0.1 or ::1).");
  }

  const rawPort = env.ORCHESTRATION_PORT?.trim() || "4100";
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("ORCHESTRATION_PORT must be an integer between 1 and 65535.");
  }
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("ORCHESTRATION_PORT must be an integer between 1 and 65535.");
  }

  return { host, port };
}
