# Configure the factory's host pnpm runtime

Use this configuration when the worker cannot find pnpm on its fixed PATH.
Keep the package manager on the operator's host, outside candidate worktrees.

1. Provision the pnpm JavaScript CLI version required by the repository's
   `packageManager` field. Mission Control currently specifies `pnpm@9.0.0`.
2. Verify the CLI with the same Node executable that starts the worker.

   ```sh
   node /absolute/host/pnpm/bin/pnpm.cjs --version
   ```

3. Set the absolute path in the worker's environment.

   ```sh
   export MISSION_CONTROL_FACTORY_PNPM_CLI_PATH=/absolute/host/pnpm/bin/pnpm.cjs
   ```

4. If you have a prewarmed dependency store, set
   `MISSION_CONTROL_FACTORY_PNPM_STORE_DIR` to its absolute host path.
   The worker tries that store offline, then allows the existing single online
   fallback. Without a configured store, the worker installs online directly.
5. Restart the worker so it receives the configuration.
6. From the repository root, run the dependency preparation checks.

   ```sh
   node node_modules/vitest/vitest.mjs run \
     --config apps/orchestration-server/vitest.config.ts \
     apps/orchestration-server/src/__tests__/factoryDependencyInstall.test.ts \
     apps/orchestration-server/src/__tests__/factoryGitRuntime.test.ts
   ```

The CLI path must resolve to a regular file. The worker rejects a relative path,
a missing file, a directory, a candidate-local path, and a host symlink into the
candidate. A candidate symlink to a host CLI is also rejected. A host symlink to
another host file is resolved before execution.

The worker invokes the configured CLI with `process.execPath` and explicit
arguments. It retains the scrubbed environment, temporary HOME, frozen lockfile,
disabled lifecycle scripts, disabled pnpm hooks, and source-state checks. Candidate
configuration cannot supply the host CLI path. The worker does not add directories
from its ambient PATH or discover a CLI from candidate dependencies.

Leave the variable unset to keep the existing `pnpm` lookup on
`/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`. If that lookup fails, dependency
preparation reports the process error code and the first nonempty stderr, stdout,
or error message. A passing preparation check proves dependency setup only. It
does not establish executor admission, candidate verification, or release status.
