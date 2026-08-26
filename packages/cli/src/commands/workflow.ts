import { Command } from "commander";
import chalk from "chalk";

/**
 * Compatibility tombstone for the unauthenticated legacy workflow CLI.
 * Canonical V1 execution starts from an approved WorkOrder and is claimed by
 * mission-control-orchestration through signed service commands.
 */
export const workflowCommand = new Command("workflow")
  .description("Legacy workflow commands (retired)")
  .action(() => {
    console.error(chalk.red(
      "The legacy workflow CLI is retired. Use the Mission/WorkOrder operator flow and mission-control-orchestration.",
    ));
    process.exitCode = 1;
  });
