export const PILOT_SCHEMA = "production-factory-pilot/v1";

export const PRODUCTION_FACTORY_WORKLOADS = Object.freeze([
  {
    key: "bug-fix",
    class: "BUG_FIX",
    title: "Correct integer-cent listing fee behavior",
    risk: "LOW",
    allowedPaths: ["src/**"],
    requirements: [
      "Listing fees use five percent of non-negative integer cents.",
      "Invalid monetary inputs fail deterministically.",
    ],
    acceptanceCriteria: [
      { id: "BUG-001", title: "Five-percent regression passes", method: "node --test" },
      { id: "BUG-002", title: "Invalid inputs fail closed", method: "node --test" },
    ],
    prompt: "Fix the listing fee defect in src/listingFee.mjs. The fee is five percent of non-negative integer cents, rounded to the nearest cent. Preserve strict input validation. Do not modify tests or package.json. Run npm test.",
    files: {
      "package.json": "{\"name\":\"pilot-bug-fix\",\"private\":true,\"type\":\"module\",\"scripts\":{\"test\":\"node --test\"}}\n",
      "src/listingFee.mjs": "export function listingFee(cents) {\n  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError(\"cents must be a non-negative integer\");\n  return Math.round(cents * 0.03);\n}\n",
      "tests/listingFee.test.mjs": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { listingFee } from '../src/listingFee.mjs';\ntest('charges five percent in integer cents', () => { assert.equal(listingFee(10_000), 500); assert.equal(listingFee(399), 20); assert.equal(listingFee(0), 0); });\ntest('rejects invalid money', () => { assert.throws(() => listingFee(-1), TypeError); assert.throws(() => listingFee(1.5), TypeError); });\n",
    },
  },
  {
    key: "feature",
    class: "FEATURE",
    title: "Add a multi-file pricing preview",
    risk: "MEDIUM",
    allowedPaths: ["src/**"],
    requirements: [
      "Pricing preview exposes subtotal, five-percent fee, and total in cents.",
      "A separate formatter produces a stable human-readable summary.",
    ],
    acceptanceCriteria: [
      { id: "FEATURE-001", title: "Preview API returns exact integer-cent totals", method: "node --test" },
      { id: "FEATURE-002", title: "Preview formatter is stable", method: "node --test" },
    ],
    prompt: "Implement the approved pricing preview feature. Add src/pricingPreview.mjs exporting buildPricingPreview(items), and src/formatPricingPreview.mjs exporting formatPricingPreview(preview). Sum item priceCents * quantity, add a rounded five-percent fee, and return subtotalCents, feeCents, and totalCents. Format exactly `Subtotal: $100.00 · Fee: $5.00 · Total: $105.00`. Do not modify tests or package.json. Run npm test.",
    files: {
      "package.json": "{\"name\":\"pilot-feature\",\"private\":true,\"type\":\"module\",\"scripts\":{\"test\":\"node --test\"}}\n",
      "src/cart.mjs": "export function subtotalCents(items) {\n  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);\n}\n",
      "tests/pricingPreview.test.mjs": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { buildPricingPreview } from '../src/pricingPreview.mjs';\nimport { formatPricingPreview } from '../src/formatPricingPreview.mjs';\ntest('builds an exact preview', () => { const value = buildPricingPreview([{ priceCents: 2_500, quantity: 4 }]); assert.deepEqual(value, { subtotalCents: 10_000, feeCents: 500, totalCents: 10_500 }); assert.equal(formatPricingPreview(value), 'Subtotal: $100.00 · Fee: $5.00 · Total: $105.00'); });\n",
    },
  },
  {
    key: "refactor",
    class: "REFACTOR",
    title: "Extract pricing policy without behavior change",
    risk: "LOW",
    allowedPaths: ["src/**"],
    requirements: [
      "Public quote behavior remains byte-for-byte equivalent for governed cases.",
      "The platform fee calculation moves to a focused policy module.",
    ],
    acceptanceCriteria: [
      { id: "REFACTOR-001", title: "Behavioral contract remains unchanged", method: "node --test" },
      { id: "REFACTOR-002", title: "Fee policy is extracted", method: "changed-file inspection" },
    ],
    prompt: "Refactor src/pricing.mjs without changing observable behavior. Extract calculatePlatformFee(subtotalCents) into a new src/feePolicy.mjs and import it from src/pricing.mjs. Keep the public quote(items) API unchanged. Do not modify tests or package.json. Run npm test.",
    files: {
      "package.json": "{\"name\":\"pilot-refactor\",\"private\":true,\"type\":\"module\",\"scripts\":{\"test\":\"node --test\"}}\n",
      "src/pricing.mjs": "function calculatePlatformFee(subtotalCents) { return Math.round(subtotalCents * 0.05); }\nexport function quote(items) {\n  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);\n  const feeCents = calculatePlatformFee(subtotalCents);\n  return { subtotalCents, feeCents, totalCents: subtotalCents + feeCents };\n}\n",
      "tests/pricing.test.mjs": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { quote } from '../src/pricing.mjs';\ntest('preserves quote behavior', () => { assert.deepEqual(quote([{ priceCents: 1999, quantity: 2 }]), { subtotalCents: 3998, feeCents: 200, totalCents: 4198 }); assert.deepEqual(quote([]), { subtotalCents: 0, feeCents: 0, totalCents: 0 }); });\n",
    },
  },
  {
    key: "security-policy",
    class: "SECURITY_POLICY",
    title: "Fail closed when authorization context is missing",
    risk: "HIGH",
    allowedPaths: ["src/**"],
    requirements: [
      "Missing or malformed authorization context is denied.",
      "Only owner and administrator roles may change a listing.",
    ],
    acceptanceCriteria: [
      { id: "SECURITY-001", title: "Missing context fails closed", method: "node --test" },
      { id: "SECURITY-002", title: "Role allowlist is exact", method: "node --test" },
    ],
    prompt: "Fix src/authorization.mjs so canEditListing(context) fails closed. Return true only when context is an object whose role is exactly `owner` or `admin`; all missing, malformed, or other roles return false. Do not modify tests or package.json. Run npm test.",
    files: {
      "package.json": "{\"name\":\"pilot-security\",\"private\":true,\"type\":\"module\",\"scripts\":{\"test\":\"node --test\"}}\n",
      "src/authorization.mjs": "export function canEditListing(context) {\n  if (!context?.role) return true;\n  return ['owner', 'admin'].includes(context.role);\n}\n",
      "tests/authorization.test.mjs": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { canEditListing } from '../src/authorization.mjs';\ntest('fails closed', () => { assert.equal(canEditListing(), false); assert.equal(canEditListing(null), false); assert.equal(canEditListing('owner'), false); assert.equal(canEditListing({}), false); });\ntest('uses exact roles', () => { assert.equal(canEditListing({ role: 'viewer' }), false); assert.equal(canEditListing({ role: 'Owner' }), false); assert.equal(canEditListing({ role: 'owner' }), true); assert.equal(canEditListing({ role: 'admin' }), true); });\n",
    },
  },
  {
    key: "data-migration",
    class: "DATA_SCHEMA_MIGRATION",
    title: "Migrate listing ownership with compatibility and rollback",
    risk: "HIGH",
    allowedPaths: ["src/**", "migrations/**"],
    requirements: [
      "Current reads prefer ownerId and remain compatible with the legacy owner field.",
      "Forward migration and rollback preserve unrelated fields and ownership data.",
    ],
    acceptanceCriteria: [
      { id: "MIGRATION-001", title: "Mixed-version reads remain compatible", method: "node --test" },
      { id: "MIGRATION-002", title: "Forward migration preserves data", method: "node --test" },
      { id: "MIGRATION-003", title: "Rollback restores the legacy shape", method: "node --test" },
    ],
    prompt: "Implement the approved ownership schema migration. In src/orderOwnership.mjs implement readOwnerId(record) that prefers ownerId and falls back to legacy owner. Add migrations/001-owner-id.mjs exporting migrateOwner(record) and rollbackOwner(record); each must preserve unrelated fields, move the ownership value, remove only the superseded key, and be idempotent. Do not modify tests or package.json. Run npm test.",
    files: {
      "package.json": "{\"name\":\"pilot-migration\",\"private\":true,\"type\":\"module\",\"scripts\":{\"test\":\"node --test\"}}\n",
      "src/orderOwnership.mjs": "export function readOwnerId(record) { return record.ownerId ?? null; }\n",
      "migrations/001-owner-id.mjs": "export function migrateOwner(record) { return record; }\nexport function rollbackOwner(record) { return record; }\n",
      "tests/orderOwnership.test.mjs": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readOwnerId } from '../src/orderOwnership.mjs';\nimport { migrateOwner, rollbackOwner } from '../migrations/001-owner-id.mjs';\ntest('reads mixed versions', () => { assert.equal(readOwnerId({ ownerId: 'new', owner: 'old' }), 'new'); assert.equal(readOwnerId({ owner: 'legacy' }), 'legacy'); assert.equal(readOwnerId({}), null); });\ntest('migrates forward idempotently', () => { const value = migrateOwner({ id: 'o1', owner: 'u1', amount: 20 }); assert.deepEqual(value, { id: 'o1', ownerId: 'u1', amount: 20 }); assert.deepEqual(migrateOwner(value), value); });\ntest('rolls back idempotently', () => { const value = rollbackOwner({ id: 'o1', ownerId: 'u1', amount: 20 }); assert.deepEqual(value, { id: 'o1', owner: 'u1', amount: 20 }); assert.deepEqual(rollbackOwner(value), value); });\n",
    },
  },
]);

export function buildPilotSchedule() {
  return PRODUCTION_FACTORY_WORKLOADS.flatMap((workload) => [1, 2, 3].map((repetition) => ({
    workload,
    repetition,
    executionId: `${workload.key}-${repetition}`,
    backend: repetition === 3 && ["bug-fix", "security-policy", "data-migration"].includes(workload.key)
      ? "remote-sandbox"
      : "persistent-worker",
  })));
}

export function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function percentile(values, fraction) {
  const observed = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!observed.length) return null;
  const index = Math.min(observed.length - 1, Math.max(0, Math.ceil(fraction * observed.length) - 1));
  return observed[index];
}

function dimension(observedValue, sampleCount, population, limitations = []) {
  return {
    observedValue,
    sampleCount,
    coverage: rate(sampleCount, population),
    confidence: sampleCount === population ? "HIGH" : sampleCount >= Math.ceil(population / 2) ? "MEDIUM" : "LOW",
    limitations,
  };
}

export function buildReliabilityScorecard(executions, failureInjections = []) {
  const completed = executions.filter((execution) => execution.eventualSuccess);
  const verified = executions.filter((execution) => execution.verification?.verdict === "VERIFIED");
  const cleanupObserved = executions.filter((execution) => execution.cleanup?.observed === true);
  const cleanupPassed = cleanupObserved.filter((execution) => execution.cleanup?.passed === true);
  const contextObserved = executions.filter((execution) => execution.context?.sufficient !== null && execution.context?.sufficient !== undefined);
  const firstPass = executions.filter((execution) => execution.firstPassSuccess);
  const recovered = executions.filter((execution) => execution.retries > 0 && execution.eventualSuccess);
  const recoveryPopulation = executions.filter((execution) => execution.retries > 0);
  const evidenceObserved = executions.filter((execution) => Number.isFinite(execution.evidenceCompleteness));
  const reviewObserved = executions.filter((execution) => execution.review?.correctionRequired !== null && execution.review?.correctionRequired !== undefined);
  const reviewCorrections = reviewObserved.filter((execution) => execution.review.correctionRequired);
  const costObserved = executions.filter((execution) => Number.isFinite(execution.cost?.totalUsd));
  const latencyObserved = executions.map((execution) => execution.metrics?.totalCycleMs).filter(Number.isFinite);
  return {
    schemaVersion: "factory-reliability-scorecard/v1",
    population: executions.length,
    dimensions: {
      executionReliability: dimension(rate(completed.length, executions.length), executions.length, executions.length),
      verificationReliability: dimension(rate(verified.length, executions.length), executions.length, executions.length),
      cleanupReliability: dimension(rate(cleanupPassed.length, cleanupObserved.length), cleanupObserved.length, executions.length, cleanupObserved.length < executions.length ? ["Cleanup is observed only where the execution backend exposes a cleanup receipt."] : []),
      contextSufficiency: dimension(rate(contextObserved.filter((item) => item.context.sufficient).length, contextObserved.length), contextObserved.length, executions.length),
      firstPassQuality: dimension(rate(firstPass.length, executions.length), executions.length, executions.length),
      recoveryEffectiveness: dimension(rate(recovered.length, recoveryPopulation.length), recoveryPopulation.length, executions.length, recoveryPopulation.length === 0 ? ["No retries were observed; recovery effectiveness is unknown."] : []),
      evidenceCompleteness: dimension(evidenceObserved.length ? evidenceObserved.reduce((sum, item) => sum + item.evidenceCompleteness, 0) / evidenceObserved.length : null, evidenceObserved.length, executions.length),
      reviewCorrectionFrequency: dimension(rate(reviewCorrections.length, reviewObserved.length), reviewObserved.length, executions.length),
      costEfficiency: dimension(costObserved.length ? rate(costObserved.filter((item) => item.eventualSuccess).length, costObserved.reduce((sum, item) => sum + item.cost.totalUsd, 0)) : null, costObserved.length, executions.length, costObserved.length < executions.length ? ["Missing model or provider cost remains null and cannot improve this dimension."] : []),
      latency: dimension(latencyObserved.length ? { medianMs: percentile(latencyObserved, 0.5), p95Ms: percentile(latencyObserved, 0.95) } : null, latencyObserved.length, executions.length),
    },
    failureInjectionCoverage: dimension(
      rate(failureInjections.filter((item) => item.failClosed && item.recoveryProven).length, failureInjections.length),
      failureInjections.length,
      failureInjections.length,
    ),
  };
}

export function validatePilotDataset(dataset) {
  const errors = [];
  if (dataset?.schemaVersion !== PILOT_SCHEMA) errors.push("Pilot schema is invalid.");
  if (dataset?.baseline?.sha !== "75981d8ae1bd49e235cc1478bac3d0f853fc717f") errors.push("Pilot baseline SHA is not the approved exact main.");
  if (dataset?.baseline?.runtimeContract !== 30) errors.push("Pilot runtime contract is not v30.");
  if (!Array.isArray(dataset?.executions) || dataset.executions.length < 15) errors.push("At least 15 governed executions are required.");
  const classes = new Set((dataset?.executions ?? []).map((item) => item.workloadClass));
  if (classes.size < 5) errors.push("Five materially different workload classes are required.");
  if ((dataset?.executions ?? []).some((item) => !item.attempts?.length || !item.lineage?.workOrderId || !item.lineage?.specDigest)) errors.push("Execution lineage or Attempt history is incomplete.");
  if ((dataset?.executions ?? []).some((item) => item.cost?.totalUsd === 0 && item.cost?.observed !== true)) errors.push("Unknown cost cannot be represented as zero.");
  if (dataset?.routingShadow?.guardedAutoEnabled !== false) errors.push("Guarded Auto must remain disabled.");
  if (dataset?.authority?.canonicalAcceptance !== "workOrders.accept") errors.push("Canonical acceptance authority is incorrect.");
  return errors;
}
