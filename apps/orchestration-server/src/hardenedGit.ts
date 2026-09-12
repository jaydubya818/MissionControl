/** Git subprocess context used by Factory-owned source operations. Repository
 * configuration is separately admitted; ambient user/system configuration and
 * Git redirection variables must not change the executed operation. */
export function hardenedGitArgs(args: string[]) {
  return [
    "-c", "core.fsmonitor=false",
    "-c", "core.hooksPath=/dev/null",
    "-c", "protocol.file.allow=never",
    ...args,
  ];
}

export function hardenedGitEnvironment(additional: Record<string, string> = {}) {
  const inheritedIdentity = [
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
  ] as const;
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const key of inheritedIdentity) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  return { ...env, ...additional };
}
