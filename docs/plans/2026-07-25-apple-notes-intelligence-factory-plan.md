# Apple Notes → Intelligence Factory Plan

Date: 2026-07-25
Window reviewed: last 24 hours from 2026-07-25 20:38 PDT
Source extraction: `/Users/jaywest/.hermes/audits/apple-notes-20260725-24h-raw.json`

## Coverage

Apple Notes modified in window: 3

1. `Own Your Intelligence: The Key to Lasting AI Advantage`
   - Link: https://www.langchain.com/blog/own-your-intelligence
   - Status: applied-to-plan

2. `codila (@0xCodila) 2K likes · 52 replies`
   - Unique links: 14 X posts after Google-share redirects
   - X Search blocked by xAI credits; resolved through local `x-cli` and expanded `t.co` links.
   - Status: applied-to-plan

3. `Dr Ben Hardy - Frame Floor Focus`
   - YouTube Shorts metadata resolved through oEmbed; full video extraction blocked by YouTube app restriction in `yt-dlp`.
   - Status: partially-applied; leadership/framing themes only

Resolved artifacts:
- X resolved: `/Users/jaywest/.hermes/audits/apple-notes-20260725-x-resolved.json`
- X expanded: `/Users/jaywest/.hermes/audits/apple-notes-20260725-x-expanded.json`
- GitHub resolved: `/Users/jaywest/.hermes/audits/apple-notes-20260725-github-resolved.json`
- YouTube oEmbed: `/Users/jaywest/.hermes/audits/apple-notes-20260725-youtube-oembed.json`

## What the notes actually say

### 1. Own your intelligence

The LangChain article's useful primitive is not “use LangChain.” It is:

- Generic model access is not durable advantage.
- Durable advantage comes from owning:
  - context
  - memory
  - evals
  - behavior/risk policy
  - observability
  - feedback loops
  - cost and quality controls
- The system should improve with use.

Translation for Jay's stack:
MissionControl should become the operating system for owned intelligence. Hermes is the operator/runtime brain. Pi and other agents are execution harnesses. SellerFi benefits only when the loop produces better deal qualification, better decisions, and lower manual work.

### 2. Loops vs graphs

The X cluster repeats one useful distinction:

- Loop: agent receives a frame, explores path, self-critiques, retries until quality bar clears.
- Graph: operator defines nodes/edges/states; agents execute known pipeline steps with parallelism, checks, retries, and recovery.

Translation:
MissionControl should not just spawn agents. It should model agent work as graph-shaped execution with clear loop policies inside nodes.

Recommended mental model:

```text
Mission / WorkOrder
  → graph template
  → node execution envelopes
  → loop policy per node
  → receipts / artifacts / evals
  → verifier / critic nodes
  → approval gates
  → dashboard read models
```

### 3. Agent evals are the missing quality primitive

The eval thread surfaced a good catalog:

- golden sets
- LLM-as-judge rubrics
- trajectory evals
- tool-call correctness
- MCP/tool inspection
- red-team/security scanning
- observability and traces
- dataset labeling / human review

Relevant tools mentioned/resolved:

- `openai/evals` — benchmark/eval framework
- `langchain-ai/openevals` — ready-made LLM evaluators
- `confident-ai/deepeval` — LLM eval framework
- `langchain-ai/agentevals` — agent trajectory evaluators
- `modelcontextprotocol/inspector` — MCP server testing
- `promptfoo/promptfoo` — prompt/RAG/agent testing and red teaming
- `growthbook/growthbook` — experiments/feature flags
- `argilla-io/argilla` — human labeling/datasets
- `langfuse/langfuse` — observability/evals/traces
- `NVIDIA/garak` — LLM vulnerability scanning

Translation:
MissionControl's Quality/QC surfaces should become an agent-eval control plane, not just generic QA views.

### 4. Book-to-skill / long-context compression

The Spanish X post points to converting books into skills instead of dumping huge books into context.

Translation:
Hermes already has `book-mirror` / book-to-skill-like workflows. This is already mostly covered. The useful next step is to connect generated skills to MissionControl's Registry quality metadata and eval status.

### 5. Autoreview iteration loops

The `steipete`/OpenClaw autoreview link shows extreme iterative review loops: many rounds on hard refactors.

Translation:
Hermes/MissionControl should track review loop count, quality trend, cost, and stop conditions. A 66-round review loop can be good or insane depending on value, risk, and convergence. MissionControl should make that visible.

### 6. Frame / floor / focus

The YouTube note titles only provide metadata, not full transcript:

- `Dr Ben Hardy - Frame Floor Focus`
- `Dr Ben Hardy x Myron Golden - Lesser Goals Cost You Scale`

Translation:
Useful leadership/product framing: set bigger goals, define the floor/quality bar, force focus. In repo terms: every factory loop needs a clear quality floor and a stop condition.

## Recommended application by repo

### MissionControl — primary target

MissionControl should absorb most of this. It is the right system of record for governed execution, graph state, evals, receipts, approvals, and dashboards.

### Hermes Agent — secondary target

Hermes should improve operator behavior and reusable skills:

- run Notes-learning audits with a ledger
- load eval/graph skills when planning agentic systems
- generate MissionControl work orders from vetted notes
- avoid claiming collaboration unless bidirectional receipts exist

### Agentic-Pi-Harness — supporting target

Pi should provide runtime receipts and execution traces into MissionControl, not just run commands.

### SellerFi — downstream beneficiary, not first implementation target

Do not jump straight to SellerFi product code. First build the owned-intelligence/eval/graph substrate in MissionControl, then apply it to SellerFi deal qualification and financing workflows.

## Execution plan

### P0 — MissionControl: Agent Graph + Eval Read Model

Goal: turn factory work from “tasks with statuses” into graph-shaped execution with eval receipts.

Files likely involved:

- `convex/schema.ts`
- `convex/projects.ts`
- `convex/workOrders.ts`
- `convex/workflowRuns.ts`
- `convex/qcRuns.ts`
- `convex/qcMetrics.ts`
- `convex/lib/factoryProjectSeed.ts`
- `apps/mission-control-ui/src/controlPlane/FactoryOverviewView.tsx`
- Quality/QC views under `apps/mission-control-ui/src/`

Implementation slice:

1. Add fixture-first graph/eval contracts:
   - `factoryGraphTemplates`
   - `factoryGraphNodes`
   - `factoryGraphEdges`
   - `factoryNodeLoopPolicies`
   - `agentEvalSuites`
   - `agentEvalCases`
   - `agentEvalResults`
   - `agentTrajectoryReceipts`

2. Extend the software-factory project seed:
   - seed one graph template for “WorkOrder → implement → verify → review → approve”
   - seed eval suite references:
     - golden cases
     - tool-call correctness
     - trajectory evaluation
     - security/red-team scan
   - seed one blocked Pi receipt ingestion node to match current known gap

3. Add factory overview read-model fields:
   - graphNodeCount
   - graphNodesBlocked
   - evalSuitesConfigured
   - evalCasesPassing
   - reviewLoopCount
   - staleReceipts
   - averageNodeCycleTime
   - costPerAcceptedWorkOrder

4. UI:
   - add a compact “Graph + Evals” card to Factory Overview
   - show current graph nodes, status, eval coverage, blocked receipts
   - link to Quality/QC run details when available

5. Tests:
   - seed contract test
   - read-model test
   - UI model/render test
   - Playwright v2 route smoke inclusion

Done when:

- creating a software-factory project seeds graph/eval fixtures
- overview shows graph/eval health without credentials
- tests pass without external providers

### P1 — MissionControl: Agent Eval Catalog

Goal: make evals a first-class MissionControl surface.

Implementation slice:

1. Add `convex/agentEvals.ts`:
   - list eval suites
   - list eval cases
   - record eval result
   - summarize eval health by project/workflow/agent

2. Add UI under Quality:
   - “Agent Evals” tab
   - golden set status
   - trajectory eval status
   - tool-call correctness
   - red-team/security scan state
   - latest regressions

3. Add fixture catalog entries inspired by resolved tools:
   - OpenAI Evals = benchmark/golden set
   - OpenEvals/DeepEval = judge/rubric
   - AgentEvals = trajectory
   - MCP Inspector = MCP/tool smoke
   - Promptfoo/Garak = red-team
   - Langfuse = observability/traces
   - Argilla = human feedback/dataset curation
   - GrowthBook = experiment rollout

Do not integrate external tools yet. Start with references and fixtures.

### P1 — Hermes Agent: Notes → WorkOrder learning loop

Goal: turn Notes signals into auditable MissionControl work proposals, not loose summaries.

Implementation slice:

1. Patch/create a Hermes skill for “Notes to MissionControl plan” if existing skill is missing current lessons:
   - exact note/link ledger
   - resolve X/t.co links
   - classify by target repo
   - create MissionControl plan artifact
   - optionally create WorkOrders after approval

2. Add a safe cron/watch pattern later:
   - collects recent Notes JSON
   - redacts secrets
   - outputs proposed actions only
   - does not mutate repos unless explicitly approved

3. Add output contract:
   - `notes_review_id`
   - `sources_resolved`
   - `applied/deferred/blocked ledger`
   - `repo_target`
   - `recommended_slice`

### P1 — Agentic-Pi-Harness: bridge receipts into MissionControl

Goal: make live Pi collaboration auditable.

Implementation slice:

1. Fix approved output root/path mismatch for bridge execution receipts.
2. Define receipt packet contract:
   - execution_id
   - session_id
   - workdir
   - objective
   - artifacts
   - stdout/stderr summary
   - status
   - blocked reason
   - safety guard denials
3. Add MissionControl ingestion:
   - `convex/workflowRuns.ts` or new bridge ingestion module
   - run artifacts
   - stale evidence detection
   - Telegraph thread linkage
4. Factory overview should display:
   - Pi receipts received
   - missing receipts
   - bridge health
   - last successful bidirectional collaboration

### P2 — Hermes/MissionControl: autoreview loop governance

Goal: support deep autoreview loops without runaway cost or fake confidence.

Implementation slice:

1. Model review loops as a node policy:
   - max rounds
   - quality threshold
   - convergence rule
   - budget limit
   - escalation condition
2. Record each review round as a receipt.
3. Show trend:
   - score improved / flat / regressed
   - cost per improvement
   - final acceptance reason
4. Add stop rules:
   - “no improvement after N rounds”
   - “budget exceeded”
   - “requires human decision”

### P2 — SellerFi application

Only after P0/P1 exists:

1. Create SellerFi deal-qualification golden set:
   - good seller financing candidate
   - weak candidate
   - missing data
   - risky terms
   - ambiguous buyer intent
2. Add judge rubrics:
   - qualification accuracy
   - risk flag completeness
   - financing structure quality
   - groundedness/citations
3. Use MissionControl to track:
   - eval pass rate
   - regression after prompt/model changes
   - cost per qualified deal
   - human override rate

## Recommended next move

Do not start by installing eval frameworks or adding credentials.

Start with P0:

> Add MissionControl fixture-backed graph/eval contracts and display graph/eval health in Factory Overview.

Reason:

- It compounds directly into the active software-factory work.
- It is safe without external credentials.
- It makes the current Pi/Hermes receipt gap visible instead of hand-waved.
- It creates the substrate for future SellerFi intelligence ownership.

## Ledger

| Source | Status | Action |
|---|---:|---|
| LangChain “Own Your Intelligence” | applied-to-plan | Converted into MissionControl owned-intelligence/eval/feedback-loop direction |
| Graph Engineering X cluster | applied-to-plan | Converted into MissionControl graph + loop policy model |
| Agent evals X thread | applied-to-plan | Converted into Agent Eval Catalog plan |
| Book-to-skill X post | already-covered | Hermes has book/skill workflows; next step is registry/eval linkage |
| Autoreview skill X post | applied-to-plan | Converted into review-loop governance plan |
| Google share redirects | applied-to-plan | Resolved to X posts before classification |
| YouTube Shorts | partially-applied | Metadata only; full video inaccessible through yt-dlp in this run |
| xAI X Search | blocked | Spending limit; local x-cli fallback used successfully |
