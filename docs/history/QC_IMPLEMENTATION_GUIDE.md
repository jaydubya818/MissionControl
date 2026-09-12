# Quality Control System — Implementation Guide

**Version:** 1.0  
**Status:** Complete ✅  
**Last Updated:** 2026-02-15

---

## 📄 TL;DR (One-Screen Summary)

**Where:** Mission Control → Quality section (ShieldCheck icon)

**What:** 4 new Convex tables + backend functions + UI views + workflow
- `qcRuns` - QC run lifecycle (status, risk grade, quality score, gates)
- `qcFindings` - Individual quality issues (severity, category, files, fixes)
- `qcArtifacts` - Evidence packs (JSON), summaries (MD), reports
- `qcRulesets` - Configurable quality check definitions (presets + custom)

**How:** `seed → dashboard → start → execute`
```bash
npx convex run seedMissionControlDemo:run  # Seed demo data
# Navigate to Quality section in UI
# Click "Start QC Run" → calls qcRuns.start → qcRuns.execute
```

**Risk Grade (Deterministic):**
- **RED** = At least one RED gate failed → blocks deployment, creates critical alert
- **YELLOW** = At least one YELLOW gate failed (no RED) → warning, review recommended
- **GREEN** = All gates passed → safe to proceed

**Integration Seam:**
```
Mission Control qcRuns.execute → HTTP POST → AssuranceAgents.AI /api/qc/scan
                                 ← QCEvidencePack JSON ←
```

**Current Status:** Backend + UI complete, AssuranceAgents.AI integration mocked (ready for endpoint hookup)

**Visual Flow:**
```
┌─────────────┐
│  Operator   │ Start QC Run
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Mission Control                                            │
│  ┌──────────────┐  idempotency   ┌──────────────┐         │
│  │ qcRuns.start │ ─────check────→ │ qcRuns table │         │
│  └──────┬───────┘                 └──────────────┘         │
│         │ create PENDING                                    │
│         ▼                                                    │
│  ┌──────────────────┐  policy    ┌────────────────┐       │
│  │ qcRuns.execute   │ ──check───→ │ Policy Engine  │       │
│  │   (action)       │             └────────────────┘       │
│  └──────┬───────────┘                   │ ALLOW            │
│         │                                ▼                  │
│         │                    ┌─────────────────────┐       │
│         └───HTTP POST────────→│ AssuranceAgents.AI │       │
│                                └──────────┬──────────┘      │
│         ┌──QCEvidencePack JSON───────────┘                 │
│         ▼                                                    │
│  ┌──────────────────┐                                      │
│  │ Parse + Validate │ schemaVersion === "1.0.0"            │
│  └──────┬───────────┘                                      │
│         │                                                    │
│         ├─→ Store findings (qcFindings)                    │
│         ├─→ Store artifacts (qcArtifacts)                  │
│         ├─→ Compute riskGrade (deterministic from gates)   │
│         ├─→ Complete run (qcRuns.status = COMPLETED)       │
│         ├─→ Log audit (opEvents + changeRecords)           │
│         └─→ If RED: Create alert + Telegraph notification  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│  Dashboard  │ Display results
└─────────────┘
```

---

## 📖 Terminology Glossary

**Core Concepts:**
- **QC Run**: A single quality control scan execution (status: PENDING → RUNNING → COMPLETED/FAILED/CANCELED)
- **Risk Grade**: Deterministic governance signal (GREEN/YELLOW/RED) computed from gate results
- **Quality Score**: Informational metric (0-100) from AssuranceAgents.AI, does NOT affect risk grade
- **Delivery Gate**: Pass/fail check with severity (RED/YELLOW/GREEN), e.g., "Coverage meets threshold"
- **gatePassed**: Boolean indicating if ALL gates passed (true) or ANY gate failed (false)
- **Evidence Pack**: Structured JSON output from AssuranceAgents.AI containing findings, coverage, traceability
- **Ruleset**: Configuration defining required docs, coverage thresholds, security paths, gate definitions

**Scope Types (Canonical):**
- `FULL_REPO` - Scan entire repository (scopeSpec: null)
- `FILE_LIST` - Scan specific files (scopeSpec: string[])
- `DIRECTORY` - Scan specific directory (scopeSpec: string)
- `BRANCH_DIFF` - Scan diff between branches (scopeSpec: { base, head })

**Severity Levels:**
- `RED` - Critical issues, blocks deployment, creates alert
- `YELLOW` - Warnings, review recommended
- `GREEN` - Passed checks, informational
- `INFO` - Informational findings, no action required

---

## 🚀 Quickstart (3 minutes)

### 1. Seed Demo Data
```bash
npx convex run seedMissionControlDemo:run
```
This creates:
- 2 QC rulesets (Pre-Release, Post-Merge)
- 7 QC runs with varied statuses (COMPLETED, RUNNING, PENDING, FAILED)
- Findings across all severity levels (RED, YELLOW, GREEN, INFO)
- Evidence pack artifacts (JSON + Markdown)
- 1 critical alert for RED gate failure

### 2. View in UI
1. Navigate to **Quality** section in CommandNav (ShieldCheck icon)
2. Dashboard shows:
   - Latest quality score with trend indicator
   - Risk distribution (RED/YELLOW/GREEN)
   - Recent runs with status badges
3. Click any run to see:
   - Findings grouped by category
   - Artifacts with download buttons
   - Gate validation results

### 3. Start a QC Run (Mock)

**Run from Convex Dashboard → Functions tab:**

```typescript
// Call qcRuns.start mutation
await ctx.runMutation(api.qcRuns.start, {
  projectId: "<project-id>",
  repoUrl: "https://github.com/your-org/your-repo",
  commitSha: "abc123",
  branch: "main",
  scopeType: "FULL_REPO",
  rulesetId: "<ruleset-id>",
  initiatorType: "HUMAN",
  idempotencyKey: "qc-run-2026-02-15-001"
});

// Then call qcRuns.execute action (calls mock for now)
await ctx.runAction(api.qcRuns.execute, { id: "<run-id>" });
```

**Or use inside a Convex action/mutation test harness.**

### 4. Verify Alert Firing
- If `riskGrade === "RED"` and `gatePassed === false`:
  - Alert created in `alerts` table with `severity: "CRITICAL"`
  - Alert visible in Alerts view
  - Telegraph notification is planned (see Known Limitations #4)

### 5. Artifacts Location
- **Inline**: Small artifacts (<10KB) stored in `qcArtifacts.content` field
- **Convex Storage**: Large artifacts (>10KB) stored in `_storage` with `storageId` reference
- **Download**: Use `qcArtifacts.getDownloadUrl` query to get URL or inline content

---

## 🎯 Deterministic Risk Grade Algorithm

**The risk grade is computed deterministically from delivery gates, NOT from qualityScore.**

```typescript
function computeRiskGrade(gates: DeliveryGate[]): "GREEN" | "YELLOW" | "RED" {
  // Rule 1: Any RED gate fails → RED
  const hasRedFail = gates.some((g) => g.severity === "RED" && !g.passed);
  if (hasRedFail) return "RED";
  
  // Rule 2: Any YELLOW gate fails → YELLOW
  const hasYellowFail = gates.some((g) => g.severity === "YELLOW" && !g.passed);
  if (hasYellowFail) return "YELLOW";
  
  // Rule 3: All gates pass → GREEN
  return "GREEN";
}
```

**Key Points:**
- **RED**: Blocks deployment, creates critical alert, requires immediate remediation
- **YELLOW**: Warning issued, review recommended before deployment
- **GREEN**: All gates passed, safe to proceed
- **INFO**: Informational findings only, do NOT affect risk grade
- **qualityScore** (0-100) is informational only and does NOT affect risk grade

**Gate Definitions:**
- **`gatePassed`** (boolean): `true` if ALL gates passed (regardless of severity), `false` if ANY gate failed
  - Computed as: `evidencePack.deliveryGates.every((g) => g.passed)`
  - Simple boolean for UI display and workflow conditions
- Only RED and YELLOW gate failures affect `riskGrade`
- INFO severity is for findings only, not gates

**Consistency Note:**  
Throughout this document, these terms are used identically:
- Scope types: `FULL_REPO`, `FILE_LIST`, `DIRECTORY`, `BRANCH_DIFF` (uppercase, underscore-separated)
- Risk grades: `GREEN`, `YELLOW`, `RED` (uppercase)
- Severities: `RED`, `YELLOW`, `GREEN`, `INFO` (uppercase)
- Status values: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELED` (uppercase)

**Ruleset Thresholds:**
- Coverage thresholds (unit/integration/e2e %) are encoded in gate definitions
- Gate failures are determined by AssuranceAgents.AI based on ruleset config
- Mission Control computes final risk grade from gate results

---

## 📋 Scope Type Alignment

**Canonical Enum (Mission Control & AssuranceAgents.AI):**

```typescript
type ScopeType = 
  | "FULL_REPO"      // Scan entire repository
  | "FILE_LIST"      // Scan specific files
  | "DIRECTORY"      // Scan specific directory
  | "BRANCH_DIFF";   // Scan diff between branches
```

**Scope Spec by Type:**

| scopeType | scopeSpec Type | Example |
|-----------|----------------|---------|
| `FULL_REPO` | `null` or `undefined` | `undefined` |
| `FILE_LIST` | `string[]` | `["src/api.ts", "src/auth.ts"]` |
| `DIRECTORY` | `string` | `"packages/workflow-engine"` |
| `BRANCH_DIFF` | `{ base: string; head: string }` | `{ base: "main", head: "feat/new-feature" }` |

**Examples:**
```typescript
// Full repo scan
{ scopeType: "FULL_REPO", scopeSpec: undefined }

// Specific files
{ scopeType: "FILE_LIST", scopeSpec: ["src/api.ts", "src/auth.ts"] }

// Directory
{ scopeType: "DIRECTORY", scopeSpec: "packages/workflow-engine" }

// Branch diff (delta scan)
{ scopeType: "BRANCH_DIFF", scopeSpec: { base: "main", head: "feat/new-feature" } }
```

**Migration Note:** Earlier references to FULL/DELTA/FOCUS have been replaced with this canonical set.

---

## 🔒 Idempotency Rules

### What Generates `idempotencyKey`?

**Client-side (recommended for production):**
```typescript
// Deterministic: same request always dedupes
const scopeHash = hashObject(scopeSpec); // or omit if scopeSpec is null
const idempotencyKey = `qc-${projectId}-${commitSha}-${scopeType}-${scopeHash}`;

// For intentional re-runs, add a suffix:
const idempotencyKey = `qc-${projectId}-${commitSha}-${scopeType}-${scopeHash}-retry-1`;
```

**Client-side (quick/dirty for testing):**
```typescript
// Non-deterministic: unlikely collisions but possible under high load
const idempotencyKey = `qc-${projectId}-${commitSha}-${Date.now()}`;
```

**Server-side (fallback):**
- If client doesn't provide `idempotencyKey`, one is NOT auto-generated
- Omitting `idempotencyKey` allows duplicate runs (useful for re-scans)

### Duplicate Start Behavior

**`qcRuns.start` with existing `idempotencyKey`:**
```typescript
const existing = await ctx.db
  .query("qcRuns")
  .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
  .first();

if (existing) {
  return { runId: existing.runId, id: existing._id, created: false };
}
```
- Returns existing run immediately
- No duplicate row created
- Safe under concurrent calls

### Action Retry Behavior

**`qcRuns.execute` with completed run:**
```typescript
if (run.status === "COMPLETED") {
  return { success: true, runId: run.runId, alreadyCompleted: true };
}
```
- Idempotent: calling `execute` on a COMPLETED run is a no-op
- Safe under Convex automatic retries
- No duplicate HTTP calls to AssuranceAgents.AI

### Load Testing Considerations

**Under high load:**
- Use `idempotencyKey` for all production runs
- Include `commitSha` + `timestamp` to ensure uniqueness
- Avoid omitting `idempotencyKey` unless intentionally re-scanning

---

## 💾 Artifacts Storage Strategy (Target Design)

### Size-Based Storage (Production)

**Small artifacts (<10KB):**
- Stored inline in `qcArtifacts.content` (string field)
- Fast retrieval via `getDownloadUrl` query
- Example: Summary markdown, small JSON reports

**Large artifacts (>10KB):**
- Stored in Convex `_storage` with `storageId` reference
- Retrieved via `ctx.storage.getUrl(storageId)`
- Example: Full evidence packs, trace matrices, coverage reports

### Implementation in `qcRuns.execute`

```typescript
const evidencePackJson = JSON.stringify(evidencePack, null, 2);
const sizeBytes = evidencePackJson.length;

if (sizeBytes < 10_000) {
  // Store inline
  await ctx.runMutation(internal.qcArtifacts.store, {
    qcRunId: args.id,
    type: "EVIDENCE_PACK_JSON",
    name: `${run.runId}_evidence_pack.json`,
    content: evidencePackJson,
    mimeType: "application/json",
    sizeBytes,
  });
} else {
  // Store in _storage
  const storageId = await ctx.storage.store(
    new Blob([evidencePackJson], { type: "application/json" })
  );
  await ctx.runMutation(internal.qcArtifacts.store, {
    qcRunId: args.id,
    type: "EVIDENCE_PACK_JSON",
    name: `${run.runId}_evidence_pack.json`,
    storageId,
    mimeType: "application/json",
    sizeBytes,
  });
}
```

### Current v1 Behavior

**All artifacts stored inline:**
- No size check implemented yet
- Simple for initial development
- Risk: Large evidence packs (>100KB) may hit Convex document limits

**Production Migration:**
- Implement size-based strategy above before scaling
- Add size check in `qcRuns.execute` action
- Update `getDownloadUrl` to handle both inline and storage cases

---

## ⚠️ Known Limitations (v1)

### 1. AssuranceAgents.AI Integration
- **Status**: Mocked via `mockAssuranceCall` function
- **Next Step**: Replace with HTTP POST to AssuranceAgents.AI endpoint
- **Location**: `convex/qcRuns.ts` line ~420

### 2. Diff / Drift Detection
- **Status**: Not implemented
- **Workaround**: Use `scopeType: "BRANCH_DIFF"` with `scopeSpec: { base, head }`
- **Next Step**: AssuranceAgents.AI should compute file diffs and detect docs drift

### 3. Artifact Storage
- **Status**: All artifacts stored inline (no size check)
- **Risk**: Large evidence packs (>100KB) may hit Convex document size limits
- **Next Step**: Implement size-based storage strategy (see above)

### 4. Telegraph Notifications
- **Status**: Alert created on RED gate, but Telegraph notification is TODO
- **Next Step**: Add `ctx.runMutation(api.telegraph.send, { ... })` in `qcRuns.execute`

### 5. Ruleset UI
- **Status**: Config tab shows placeholder
- **Next Step**: Build ruleset CRUD UI (create, edit, delete, activate)

### 6. Workflow Integration
- **Status**: `quality-audit.yaml` created but not tested end-to-end
- **Next Step**: Test workflow execution with real agents

### 7. Policy Approval Flow
- **Status**: `qc_scan` marked YELLOW but approval modal not wired
- **Next Step**: Add QC-specific approval UI in `ApprovalsModal.tsx`

---

## ✅ Acceptance Test Checklist

### Backend Tests

- [ ] **Start Run → Status Transitions**
  ```typescript
  const { id } = await ctx.runMutation(api.qcRuns.start, { ... });
  const run1 = await ctx.runQuery(api.qcRuns.get, { id });
  assert(run1.status === "PENDING");
  
  await ctx.runAction(api.qcRuns.execute, { id });
  const run2 = await ctx.runQuery(api.qcRuns.get, { id });
  assert(run2.status === "COMPLETED");
  ```

- [ ] **Idempotency: Duplicate Start**
  ```typescript
  const key = "test-idem-key";
  const res1 = await ctx.runMutation(api.qcRuns.start, { idempotencyKey: key, ... });
  const res2 = await ctx.runMutation(api.qcRuns.start, { idempotencyKey: key, ... });
  assert(res1.id === res2.id);
  assert(res2.created === false);
  ```

- [ ] **Idempotency: Duplicate Execute**
  ```typescript
  await ctx.runAction(api.qcRuns.execute, { id });
  const res = await ctx.runAction(api.qcRuns.execute, { id });
  assert(res.alreadyCompleted === true);
  ```

- [ ] **Risk Grade: RED Gate Fail**
  ```typescript
  // Mock evidence pack with RED gate failure
  const evidencePack = {
    deliveryGates: [
      { name: "Coverage", passed: false, severity: "RED", rationale: "Below threshold" }
    ],
    ...
  };
  // After execute
  const run = await ctx.runQuery(api.qcRuns.get, { id });
  assert(run.riskGrade === "RED");
  assert(run.gatePassed === false);
  ```

- [ ] **Risk Grade: YELLOW Gate Fail**
  ```typescript
  const evidencePack = {
    deliveryGates: [
      { name: "Docs", passed: false, severity: "YELLOW", rationale: "Outdated" }
    ],
    ...
  };
  const run = await ctx.runQuery(api.qcRuns.get, { id });
  assert(run.riskGrade === "YELLOW");
  ```

- [ ] **Risk Grade: All Gates Pass**
  ```typescript
  const evidencePack = {
    deliveryGates: [
      { name: "Coverage", passed: true, severity: "RED", rationale: "OK" },
      { name: "Docs", passed: true, severity: "YELLOW", rationale: "OK" }
    ],
    ...
  };
  const run = await ctx.runQuery(api.qcRuns.get, { id });
  assert(run.riskGrade === "GREEN");
  assert(run.gatePassed === true);
  ```

### Findings & Artifacts Tests

- [ ] **Findings Stored Correctly**
  ```typescript
  const findings = await ctx.runQuery(api.qcFindings.listByRun, { qcRunId: id });
  assert(findings.length > 0);
  
  // Verify expected severities exist (don't assume ordering)
  const severities = findings.map((f) => f.severity);
  assert(severities.includes("RED"));
  assert(severities.includes("YELLOW"));
  assert(severities.includes("GREEN"));
  
  // Verify at least one finding has expected category
  const categories = findings.map((f) => f.category);
  assert(categories.includes("COVERAGE_GAP"));
  ```

- [ ] **Artifacts Stored Correctly**
  ```typescript
  const artifacts = await ctx.runQuery(api.qcArtifacts.listByRun, { qcRunId: id });
  const evidencePack = artifacts.find((a) => a.type === "EVIDENCE_PACK_JSON");
  assert(evidencePack !== undefined);
  assert(evidencePack.content !== undefined || evidencePack.storageId !== undefined);
  ```

- [ ] **Artifact Download Works**
  ```typescript
  const { url, content, inline } = await ctx.runQuery(api.qcArtifacts.getDownloadUrl, { id: artifactId });
  if (inline) {
    assert(content !== undefined);
  } else {
    assert(url !== undefined);
  }
  ```

### Alert & Notification Tests

- [ ] **RED Gate → Alert Created**
  ```typescript
  // After execute with RED risk grade
  const alerts = await ctx.runQuery(api.alerts.listOpen, {});
  const qcAlert = alerts.find((a) => a.type === "QC_GATE_FAILED");
  assert(qcAlert !== undefined);
  assert(qcAlert.severity === "CRITICAL");
  assert(qcAlert.qcRunId === id);
  ```

- [ ] **Telegraph Notification Fired** (TODO)
  ```typescript
  // Check telegraph messages
  const messages = await ctx.runQuery(api.telegraph.listRecent, {});
  const qcMessage = messages.find((m) => m.metadata?.qcRunId === id);
  assert(qcMessage !== undefined);
  ```

### Audit Log Tests

- [ ] **OpEvents Logged**
  ```typescript
  const events = await ctx.runQuery(api.opEvents.list, { qcRunId: id });
  assert(events.some((e) => e.type === "QC_RUN_STARTED"));
  assert(events.some((e) => e.type === "QC_RUN_COMPLETED"));
  ```

- [ ] **ChangeRecords Logged**
  ```typescript
  const records = await ctx.runQuery(api.changeRecords.list, {});
  assert(records.some((r) => r.type === "QC_RUN_CREATED"));
  assert(records.some((r) => r.type === "QC_FINDINGS_RECORDED"));
  ```

### UI Tests

- [ ] **Dashboard Loads**
  - Navigate to Quality section
  - Verify metrics cards render
  - Verify recent runs table populates
  - Verify sparkline chart shows trend

- [ ] **Run Detail Loads**
  - Click a run from dashboard
  - Verify header shows runId, branch, commit
  - Verify summary cards show status, findings, gate status
  - Verify tabs (Findings, Artifacts, Details) switch correctly

- [ ] **Findings Display**
  - Open Findings tab
  - Verify findings grouped by category
  - Verify severity badges (RED/YELLOW/GREEN/INFO)
  - Verify file paths and suggested fixes render

- [ ] **Artifacts Download**
  - Open Artifacts tab
  - Click Download button
  - Verify file downloads or content displays

### Seed Script Tests

- [ ] **Seed Populates UI**
  ```bash
  npx convex run seedMissionControlDemo:run
  ```
  - Verify 7 QC runs created
  - Verify rulesets created
  - Verify findings created
  - Verify artifacts created
  - Verify 1 RED alert created

---

## 🔗 Integration Contract (AssuranceAgents.AI)

### HTTP Endpoint (To Be Implemented)

**POST** `/api/qc/scan`

**⚠️ Strict Schema Version Policy:**  
Mission Control validates `schemaVersion === "1.0.0"` exactly. Future minor versions (1.1.0, 1.2.0) require explicit opt-in. This prevents silent breakage.

**Request:**
```json
{
  "runId": "QC-ABC123",
  "repoUrl": "https://github.com/org/repo",
  "commitSha": "abc123def456",
  "branch": "main",
  "scopeType": "FULL_REPO",
  "scopeSpec": null,
  "rulesetConfig": {
    "requiredDocs": ["README.md", "docs/PRD*.md"],
    "coverageThresholds": { "unit": 80, "integration": 70, "e2e": 60 },
    "securityPaths": ["auth/**", "security/**"],
    "gateDefinitions": [
      { "name": "PRD exists", "condition": "requiredDocs", "severity": "RED" },
      { "name": "Coverage meets threshold", "condition": "coverageThresholds", "severity": "RED" }
    ]
  }
}
```

**Response (QCEvidencePack):**
```json
{
  "schemaVersion": "1.0.0",
  "producer": "assurance-agents/0.1.0",
  "runId": "QC-ABC123",
  "repoUrl": "https://github.com/org/repo",
  "commitSha": "abc123def456",
  "timestamp": "2026-02-15T10:00:00Z",
  "docsIndex": [
    { "path": "README.md", "type": "README", "lastModified": "2026-02-15T10:00:00Z" }
  ],
  "requirementTraceability": [
    {
      "requirementId": "REQ-001",
      "requirementText": "System must support X",
      "sourceDoc": "docs/PRD_V2.md",
      "implementationFiles": [{ "path": "src/x.ts", "lineRange": [10, 50] }],
      "testFiles": [{ "path": "tests/x.test.ts" }],
      "evidence": "Implementation found in x.ts with unit tests",
      "status": "COVERED"
    }
  ],
  "findings": [
    {
      "severity": "YELLOW",
      "category": "DOCS_DRIFT",
      "title": "README outdated",
      "description": "README last updated 5 days before recent code changes",
      "filePaths": ["README.md"],
      "confidence": 0.85,
      "suggestedFix": "Update README to reflect new features"
    }
  ],
  "coverageSummary": {
    "unit": { "covered": 150, "total": 200, "percentage": 75 },
    "integration": { "covered": 30, "total": 50, "percentage": 60 },
    "e2e": { "covered": 10, "total": 20, "percentage": 50 },
    "missingAreas": ["Error handling in workflow executor"]
  },
  "deliveryGates": [
    {
      "name": "PRD exists",
      "passed": true,
      "rationale": "Found docs/PRD_V2.md",
      "severity": "YELLOW"
    },
    {
      "name": "Coverage meets threshold",
      "passed": false,
      "rationale": "Integration coverage 60% < 70%",
      "severity": "RED"
    }
  ],
  "riskGrade": "RED",
  "qualityScore": 72,
  "policyNotes": [
    "RED gate failed: Coverage below threshold",
    "Recommend blocking deployment until fixed"
  ],
  "summary": "Quality audit completed with RED risk grade. Critical gate failures detected."
}
```

### Field Validation

**Required Fields:**
- `schemaVersion` (string, must be exactly "1.0.0" — strict compatibility policy)
- `producer` (string, identifies AssuranceAgents.AI version)
- `runId` (string, matches request)
- `repoUrl` (string, matches request)
- `commitSha` (string, matches request)
- `timestamp` (ISO 8601 string)
- `findings` (array, can be empty)
- `deliveryGates` (array, at least 1 gate)
- `riskGrade` ("GREEN" | "YELLOW" | "RED")
- `qualityScore` (number, 0-100)
- `summary` (string)

**Compatibility Policy (Strict by Design):**
- **`schemaVersion` must match exactly "1.0.0"** — reject anything else
- Future minor versions (1.1.0, 1.2.0) will be opt-in (explicit support required)
- Future major versions (2.0.0) will require migration code
- No automatic version compatibility (prevents silent breakage and data corruption)

**Optional Fields:**
- `docsIndex`, `requirementTraceability`, `coverageSummary`, `policyNotes`

### Error Handling

**If AssuranceAgents.AI returns error:**
```typescript
try {
  const evidencePack = await callAssuranceAgents(...);
} catch (error) {
  await ctx.runMutation(internal.qcRuns.complete, {
    id: args.id,
    status: "FAILED",
    error: error.message,
  });
  // Note: complete mutation automatically sets completedAt and durationMs
  // so dashboards show proper timing even for failed runs
  throw error;
}
```

**If schemaVersion missing:**
```typescript
if (!evidencePack.schemaVersion) {
  throw new Error("Evidence pack missing required schemaVersion field");
}
```

---

## 📦 Files Created/Modified

### Created
- `convex/qcRuns.ts` (400+ lines)
- `convex/qcFindings.ts` (80 lines)
- `convex/qcArtifacts.ts` (90 lines)
- `convex/qcRulesets.ts` (200+ lines)
- `apps/mission-control-ui/src/QcDashboardView.tsx` (250+ lines)
- `apps/mission-control-ui/src/QcRunDetailView.tsx` (300+ lines)
- `workflows/quality-audit.yaml` (200+ lines)

### Modified
- `convex/schema.ts` (+150 lines: 4 tables, enums, indexes)
- `convex/lib/armAudit.ts` (+10 lines: QC event types)
- `convex/alerts.ts` (+5 lines: projectId support)
- `convex/seedMissionControlDemo.ts` (+200 lines: QC demo data)
- `packages/policy-engine/src/rules.ts` (+2 lines: qc_scan, qc_report)
- `apps/mission-control-ui/src/TopNav.tsx` (+3 lines: quality section)
- `apps/mission-control-ui/src/components/CommandNav.tsx` (+5 lines: Quality nav)
- `apps/mission-control-ui/src/App.tsx` (+40 lines: routing, views)

---

## 🎯 Next Steps

### Immediate (Week 1)
1. **Replace Mock Integration**
   - Implement HTTP POST to AssuranceAgents.AI endpoint in `qcRuns.execute`
   - Add retry logic with exponential backoff
   - Add timeout handling (default: 5 minutes)

2. **Test End-to-End**
   - Run acceptance test checklist
   - Fix any bugs discovered
   - Verify all status transitions work

3. **Add Telegraph Notifications**
   - Wire up `api.telegraph.send` on RED gate failures
   - Test notification delivery

### Short-Term (Week 2-3)
4. **Implement Size-Based Artifact Storage**
   - Add size check in `qcRuns.execute`
   - Store large artifacts in `_storage`
   - Update `getDownloadUrl` to handle both cases

5. **Build Ruleset UI**
   - Create ruleset CRUD forms
   - Add preset selection dropdown
   - Add ruleset activation toggle

6. **Test Workflow Integration**
   - Execute `quality-audit.yaml` with real agents
   - Verify step outputs match expected format
   - Add workflow to CI/CD pipeline

### Medium-Term (Month 2)
7. **Add Diff Detection**
   - Implement `BRANCH_DIFF` scope type in AssuranceAgents.AI
   - Add file diff visualization in UI
   - Add docs drift detection

8. **Add Policy Approval Flow**
   - Wire up `qc_scan` approval modal
   - Add approval history to run detail
   - Add bulk approval for multiple runs

9. **Add Metrics & Analytics**
   - Quality score trend charts
   - Gate pass rate over time
   - Finding category distribution
   - MTTR (mean time to remediate) for RED runs

---

## 📢 Release Notes (v1.0)

**Added Quality Control workspace to Mission Control:**
- QC run model with deterministic risk grading (GREEN/YELLOW/RED)
- Evidence pack artifacts with requirement traceability and coverage analysis
- 4 built-in ruleset presets (Pre-Release, Post-Merge, Weekly Health, Security Focus)
- Dashboard UI with quality score trends and findings drill-down
- Multi-agent `quality-audit.yaml` workflow
- Policy engine integration (qc_scan YELLOW, qc_report GREEN)
- Audit logging (opEvents + changeRecords) and RED gate alerts

**Integration Status:**
- AssuranceAgents.AI integration mocked via `mockAssuranceCall`
- Ready for producer endpoint hookup at `/api/qc/scan`
- Evidence pack contract defined and validated

**Next Steps:**
- Replace mock with HTTP POST to AssuranceAgents.AI
- Add Telegraph notifications on RED gate failures
- Implement size-based artifact storage for large evidence packs

---

## 📚 References

- **Plan Document**: `.cursor/plans/quality_control_section_186f312d.plan.md`
- **Schema**: `convex/schema.ts` (search for "qcRuns", "qcFindings", "qcArtifacts", "qcRulesets")
- **Execute Action**: `convex/qcRuns.ts` (search for "export const execute")
- **Mock Integration**: `convex/qcRuns.ts` (search for "mockAssuranceCall")
- **Risk Grade Computation**: `convex/qcRuns.ts` (search for "computeRiskGrade")
- **Dashboard UI**: `apps/mission-control-ui/src/QcDashboardView.tsx`
- **Run Detail UI**: `apps/mission-control-ui/src/QcRunDetailView.tsx`
- **Workflow**: `workflows/quality-audit.yaml`
- **Policy Engine**: `packages/policy-engine/src/rules.ts` (search for "qc_scan", "qc_report")
- **Seed Data**: `convex/seedMissionControlDemo.ts` (search for "QUALITY CONTROL")

---

**End of Implementation Guide**
