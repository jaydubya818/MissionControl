import {
  createNoisyContextExperiment,
  runFactoryMemoryGoldenPath,
} from "./fixtures.js";

const result = await runFactoryMemoryGoldenPath();
for (const line of result.output) console.log(line);
console.log("");
console.log("Context Package:");
console.log(
  JSON.stringify(
    {
      id: result.contextPackage.id,
      workOrderId: result.contextPackage.workOrderId,
      attemptId: result.contextPackage.attemptId,
      purpose: result.contextPackage.purpose,
      estimatedTokens: result.contextPackage.estimatedTokens,
      budget: result.contextPackage.budget,
      strategies: result.contextPackage.retrievalStrategies,
      sources: result.contextPackage.items.map((item) => ({
        type: item.sourceType,
        id: item.sourceId,
        revision: item.provenance.revision,
        method: item.retrievalMethod,
        priority: item.priority,
      })),
    },
    null,
    2,
  ),
);
console.log("");
console.log("Verification Plan:");
console.log(JSON.stringify(result.verificationPlan, null, 2));
console.log("");
console.log("Context experiment:");
console.log(
  JSON.stringify(createNoisyContextExperiment(result.contextPackage), null, 2),
);

if (result.assertions.some((assertion) => !assertion.passed))
  process.exitCode = 1;
