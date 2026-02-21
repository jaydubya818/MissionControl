/**
 * Workflow CLI Commands
 * 
 * mc workflow list
 * mc workflow run <workflow-id> "<task>"
 * mc workflow status <run-id>
 * mc workflow runs
 * mc workflow resume <run-id>
 */

import { Command } from "commander";
import { ConvexHttpClient } from "convex/browser";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { api } from "../../../../convex/_generated/api";

const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  console.error(chalk.red("Error: CONVEX_URL environment variable not set"));
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

export const workflowCommand = new Command("workflow")
  .description("Manage multi-agent workflows")
  .addCommand(listCommand())
  .addCommand(runCommand())
  .addCommand(statusCommand())
  .addCommand(runsCommand())
  .addCommand(resumeCommand());

/**
 * mc workflow list
 */
function listCommand() {
  return new Command("list")
    .description("List available workflows")
    .option("-a, --all", "Show inactive workflows too")
    .action(async (options) => {
      const spinner = ora("Loading workflows...").start();
      
      try {
        const workflows = await client.query(api.workflows.list, {
          activeOnly: !options.all,
        });
        
        spinner.stop();
        
        if (workflows.length === 0) {
          console.log(chalk.yellow("No workflows found"));
          return;
        }
        
        const table = new Table({
          head: [
            chalk.cyan("ID"),
            chalk.cyan("Name"),
            chalk.cyan("Agents"),
            chalk.cyan("Steps"),
            chalk.cyan("Status"),
          ],
          style: { head: [], border: [] },
        });
        
        for (const workflow of workflows) {
          table.push([
            workflow.workflowId,
            workflow.name,
            workflow.agents.length.toString(),
            workflow.steps.length.toString(),
            workflow.active ? chalk.green("Active") : chalk.gray("Inactive"),
          ]);
        }
        
        console.log(table.toString());
        console.log(chalk.gray(`\nTotal: ${workflows.length} workflow(s)`));
      } catch (error) {
        spinner.fail("Failed to load workflows");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * mc workflow run <workflow-id> "<task>"
 */
function runCommand() {
  return new Command("run")
    .description("Start a workflow run")
    .argument("<workflow-id>", "Workflow ID (e.g., feature-dev)")
    .argument("<task>", "Task description")
    .option("-p, --project <id>", "Project ID")
    .action(async (workflowId, task, options) => {
      const spinner = ora(`Starting ${workflowId} workflow...`).start();
      
      try {
        // Verify workflow exists
        const workflow = await client.query(api.workflows.get, { workflowId });
        
        if (!workflow) {
          spinner.fail(`Workflow not found: ${workflowId}`);
          process.exit(1);
        }
        
        if (!workflow.active) {
          spinner.warn(`Workflow is inactive: ${workflowId}`);
          process.exit(1);
        }
        
        // Start the run
        const result = await client.mutation(api.workflowRuns.start, {
          workflowId,
          projectId: options.project,
          initialInput: task,
        });
        
        spinner.succeed(`Workflow started: ${chalk.cyan(result.runId)}`);
        
        console.log("");
        console.log(chalk.bold("Workflow:"), workflow.name);
        console.log(chalk.bold("Run ID:"), result.runId);
        console.log(chalk.bold("Steps:"), workflow.steps.length);
        console.log("");
        console.log(chalk.gray(`Use ${chalk.white(`mc workflow status ${result.runId}`)} to check progress`));
      } catch (error) {
        spinner.fail("Failed to start workflow");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * mc workflow status <run-id>
 */
function statusCommand() {
  return new Command("status")
    .description("Check workflow run status")
    .argument("<run-id>", "Run ID or search query")
    .action(async (runId) => {
      const spinner = ora("Loading workflow run...").start();
      
      try {
        // Try exact match first
        let run = await client.query(api.workflowRuns.get, { runId });
        
        // If not found, try search
        if (!run) {
          const results = await client.query(api.workflowRuns.search, {
            query: runId,
            limit: 1,
          });
          
          if (results.length > 0) {
            run = results[0];
          }
        }
        
        if (!run) {
          spinner.fail(`Workflow run not found: ${runId}`);
          process.exit(1);
        }
        
        // Get workflow definition
        const workflow = await client.query(api.workflows.get, {
          workflowId: run.workflowId,
        });
        
        spinner.stop();
        
        // Status badge
        const statusColors: Record<string, any> = {
          PENDING: chalk.gray,
          RUNNING: chalk.blue,
          COMPLETED: chalk.green,
          FAILED: chalk.red,
          PAUSED: chalk.yellow,
        };
        
        const statusColor = statusColors[run.status] || chalk.white;
        
        console.log("");
        console.log(chalk.bold("Run ID:"), run.runId);
        console.log(chalk.bold("Workflow:"), workflow?.name ?? run.workflowId);
        console.log(chalk.bold("Status:"), statusColor(run.status));
        console.log(chalk.bold("Progress:"), `${run.currentStepIndex + 1}/${run.totalSteps} steps`);
        console.log("");
        
        // Steps table
        const table = new Table({
          head: [
            chalk.cyan("#"),
            chalk.cyan("Step"),
            chalk.cyan("Status"),
            chalk.cyan("Retries"),
            chalk.cyan("Duration"),
          ],
          style: { head: [], border: [] },
        });
        
        for (let i = 0; i < run.steps.length; i++) {
          const step = run.steps[i];
          const stepDef = workflow?.steps[i];
          
          const stepStatusColors: Record<string, any> = {
            PENDING: chalk.gray,
            RUNNING: chalk.blue,
            DONE: chalk.green,
            FAILED: chalk.red,
          };
          
          const stepColor = stepStatusColors[step.status] || chalk.white;
          
          let duration = "-";
          if (step.startedAt && step.completedAt) {
            const ms = step.completedAt - step.startedAt;
            duration = `${Math.round(ms / 1000)}s`;
          } else if (step.startedAt) {
            const ms = Date.now() - step.startedAt;
            duration = `${Math.round(ms / 1000)}s (running)`;
          }
          
          table.push([
            (i + 1).toString(),
            step.stepId,
            stepColor(step.status),
            step.retryCount > 0 ? chalk.yellow(`${step.retryCount}/${stepDef?.retryLimit ?? "?"}`) : "-",
            duration,
          ]);
        }
        
        console.log(table.toString());
        
        // Error details
        const failedSteps = run.steps.filter((s) => s.status === "FAILED");
        if (failedSteps.length > 0) {
          console.log("");
          console.log(chalk.red.bold("Errors:"));
          for (const step of failedSteps) {
            console.log(chalk.red(`  ${step.stepId}: ${step.error}`));
          }
        }
        
        // Timing
        console.log("");
        if (run.completedAt) {
          const elapsed = Math.round((run.completedAt - run.startedAt) / 1000);
          console.log(chalk.gray(`Completed in ${elapsed}s`));
        } else {
          const elapsed = Math.round((Date.now() - run.startedAt) / 1000);
          console.log(chalk.gray(`Running for ${elapsed}s`));
        }
      } catch (error) {
        spinner.fail("Failed to load workflow run");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * mc workflow runs
 */
function runsCommand() {
  return new Command("runs")
    .description("List workflow runs")
    .option("-s, --status <status>", "Filter by status")
    .option("-w, --workflow <id>", "Filter by workflow ID")
    .option("-l, --limit <number>", "Limit results", "20")
    .action(async (options) => {
      const spinner = ora("Loading workflow runs...").start();
      
      try {
        const runs = await client.query(api.workflowRuns.list, {
          status: options.status,
          workflowId: options.workflow,
          limit: parseInt(options.limit, 10),
        });
        
        spinner.stop();
        
        if (runs.length === 0) {
          console.log(chalk.yellow("No workflow runs found"));
          return;
        }
        
        const table = new Table({
          head: [
            chalk.cyan("Run ID"),
            chalk.cyan("Workflow"),
            chalk.cyan("Status"),
            chalk.cyan("Progress"),
            chalk.cyan("Started"),
          ],
          style: { head: [], border: [] },
        });
        
        const statusColors: Record<string, any> = {
          PENDING: chalk.gray,
          RUNNING: chalk.blue,
          COMPLETED: chalk.green,
          FAILED: chalk.red,
          PAUSED: chalk.yellow,
        };
        
        for (const run of runs) {
          const statusColor = statusColors[run.status] || chalk.white;
          const completedSteps = run.steps.filter((s) => s.status === "DONE").length;
          const startedAt = new Date(run.startedAt).toLocaleString();
          
          table.push([
            run.runId,
            run.workflowId,
            statusColor(run.status),
            `${completedSteps}/${run.totalSteps}`,
            startedAt,
          ]);
        }
        
        console.log(table.toString());
        console.log(chalk.gray(`\nTotal: ${runs.length} run(s)`));
      } catch (error) {
        spinner.fail("Failed to load workflow runs");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}

/**
 * mc workflow resume <run-id>
 */
function resumeCommand() {
  return new Command("resume")
    .description("Resume a paused workflow run")
    .argument("<run-id>", "Run ID to resume")
    .action(async (runId) => {
      const spinner = ora("Resuming workflow...").start();
      
      try {
        const run = await client.query(api.workflowRuns.get, { runId });
        
        if (!run) {
          spinner.fail(`Workflow run not found: ${runId}`);
          process.exit(1);
        }
        
        if (run.status !== "PAUSED") {
          spinner.warn(`Workflow is not paused (status: ${run.status})`);
          process.exit(1);
        }
        
        await client.mutation(api.workflowRuns.updateStatus, {
          runId,
          status: "RUNNING",
        });
        
        spinner.succeed(`Workflow resumed: ${chalk.cyan(runId)}`);
        console.log(chalk.gray(`\nUse ${chalk.white(`mc workflow status ${runId}`)} to check progress`));
      } catch (error) {
        spinner.fail("Failed to resume workflow");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
}
