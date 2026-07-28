# 2026 Software Factory Landscape

**Research date:** 2026-07-28  
**Coverage window:** 2024-01-01 through 2026-07-28, with older foundational material included where necessary  
**Decision context:** Mission Control / Software Factory planning for a governed, evidence-producing, continuously improving delivery system

## Executive conclusion

The credible 2026 software-factory model is not an unattended collection of coding agents. It is a governed delivery system in which humans define intent and policy, agents execute inside isolated environments, lifecycle hooks constrain tools, durable checkpoints preserve state, independent verification determines acceptance, and every important action is correlated to evidence.

Mission Control already contains useful pieces of this model: Missions, WorkOrders, Tasks, execution records, approvals, activity, policies, memory surfaces, a graph view, and cost fields. The main gap is not another dashboard. The gap is a complete, truthful lifecycle connecting those pieces:

`Mission → approved plan → released blueprint → WorkOrders → Tasks → executions → evidence → review → accepted outcome → learning`

The recommended strategy is therefore:

1. Repair the governed Mission lifecycle and misleading UI states first.
2. Make acceptance evidence, approval, and audit correlation cross-cutting primitives.
3. Turn the operator UI into exception and evidence queues.
4. Add durable execution, budgets, and retry lineage before expanding autonomy.
5. Treat memory and GraphRAG as benchmarked infrastructure behind an adapter, not as the initial product center.
6. Run continuous research as a bounded, approval-gated loop whose recommendations become versioned Missions rather than silent self-modification.

## Methodology

This review used:

- Official product and framework documentation for current capabilities.
- Primary standards and risk publications for governance, observability, and security.
- The official SWE-bench materials for verification context.
- Direct inspection of the Mission Control repository and focused browser evidence from the Software Factory Research Lab workspace.
- Focused automated tests for Mission governance, WorkOrder governance and dispatch, route synchronization, task routing, lifecycle models, and the knowledge graph panel.

Marketing claims and third-party comparison posts were excluded. Documentation without a visible publication or update date is classified as **Unknown**, even when accessed recently.

## Freshness policy

| Classification | Definition as of 2026-07-28 |
|---|---|
| Current | Published or updated during the previous six months |
| Recent | Six to twelve months old |
| Relevant | Twelve to twenty-four months old and still applicable |
| Foundational | Older than twenty-four months but necessary for context |
| Stale | Superseded or no longer representative |
| Unknown | Date or continued validity cannot be established |

Access date alone does not establish freshness.

## Landscape findings

### 1. Software factories are becoming controlled execution systems

OpenAI Codex cloud describes isolated cloud environments, repository checkout, setup, agent execution, diff review, and pull-request handoff. It also documents internet controls and separation of setup-time secrets from the agent phase. This supports an operating model in which parallel agent work is disposable, reviewable, and constrained rather than sharing an operator's unrestricted workstation. [Codex cloud](https://developers.openai.com/codex/cloud), [Codex cloud environments](https://developers.openai.com/codex/cloud/environments)

Anthropic's Agent SDK exposes tools, hooks, permissions, sessions, subagents, MCP integration, telemetry, and cost tracking. Its agent-loop documentation makes turn and budget limits explicit, while its hosting guidance warns that cooperating agents in one shared container can overwrite each other's work. [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview), [agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop), [hosting](https://code.claude.com/docs/en/agent-sdk/hosting)

**Implication for Mission Control:** an execution is not merely an activity entry. It needs an environment identity, repository snapshot, branch or worktree, permissions, limits, lifecycle hooks, receipts, and an outcome.

### 2. “Dark factory” is an aspiration, not a safe default

Current harnesses can execute substantial repository work autonomously, but their own documentation emphasizes permissions, hooks, isolation, limits, and human review. The safe near-term model is progressive autonomy:

- Human-led for intent, policy, irreversible decisions, and final accountability.
- Agent-orchestrated for decomposition, execution, research, and verification.
- Automatically accepted only for low-risk actions covered by explicit policy and deterministic checks.

No reviewed primary source supports silent, unlimited self-modification as a production default.

**Implication for Mission Control:** “autonomous” should be a policy level attached to action classes, not a global squad switch.

### 3. Harness quality depends on the control loop around the model

GitHub Copilot hooks provide deterministic lifecycle interception for logging, command validation, and blocking dangerous actions. GitHub custom agents provide specialized profiles with scoped tools and instructions. Anthropic offers similar pre/post tool hooks, approval hooks, and execution limits. [GitHub Copilot hooks](https://docs.github.com/en/copilot/concepts/agents/hooks), [custom agents](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents), [Anthropic hooks](https://code.claude.com/docs/en/agent-sdk/hooks)

This convergence suggests a minimum harness contract:

- Declared objective and acceptance conditions.
- Allowed tools and data boundaries.
- Pre-tool policy checks.
- Post-tool receipts and redaction.
- Time, turn, token, and monetary limits.
- Pause, cancel, retry, and escalation semantics.
- Immutable attempt lineage.
- Independent verification before acceptance.

**Implication for Mission Control:** normalize these fields into execution and policy records instead of encoding provider-specific behavior in UI components.

### 4. Durable execution and idempotency are prerequisites for long-running work

LangGraph documents checkpointed durable execution, human-in-the-loop interrupts, memory, and deterministic resume. Its functional API specifically cautions that resumed workflows require deterministic and idempotent task structure. [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview), [functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api)

**Implication for Mission Control:** retry must create a new attempt linked to the original failure; refresh must reconstruct state from durable records; duplicate submissions need idempotency keys; approval must resume from a named checkpoint rather than replaying the whole workflow.

### 5. Verification must judge outcomes, not agent confidence

SWE-bench Verified contains 500 engineer-validated repository tasks and evaluates patches in reproducible test environments. It demonstrates the value of task-specific acceptance tests and containerized evaluation, but it is not a complete model for product quality, governance, accessibility, or live operations. [SWE-bench Verified](https://www.swebench.com/verified.html), [evaluation harness](https://www.swebench.com/SWE-bench/reference/harness/)

Mission Control needs layered verification:

1. Static and deterministic checks.
2. Focused unit/integration tests.
3. Browser journeys with screenshot, console, network, and trace evidence.
4. Independent review against acceptance assertions.
5. Post-deployment health and rollback signals where deployment is in scope.

**Implication for Mission Control:** “execution completed” and “work accepted” must remain distinct states.

### 6. Memory is useful only when provenance, scope, and invalidation are explicit

Agent memory can improve continuity, but the OWASP Agentic Top 10 identifies memory and context poisoning as a material risk. A useful memory item therefore needs source provenance, workspace scope, freshness, sensitivity, confidence, supersession, and usage history. [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)

**Implication for Mission Control:** retrieval should return a citation bundle and policy decision, not inject opaque text directly into an execution.

### 7. GraphRAG can help complex synthesis, but should earn its cost

Microsoft GraphRAG offers local, global, DRIFT, and basic search modes. Its own documentation notes that global search is resource intensive, and its repository describes the project as a methodology/demonstration rather than a supported Microsoft product. [GraphRAG query overview](https://microsoft.github.io/graphrag/query/overview/), [Microsoft GraphRAG repository](https://github.com/microsoft/graphrag)

Neo4j provides a first-party GraphRAG package, but its current documentation contains version-specific compatibility constraints and reflects the rename/deprecation of the earlier `neo4j-genai` package. [Neo4j GraphRAG documentation](https://neo4j.com/docs/neo4j-graphrag-python/current/)

**Implication for Mission Control:** start with a graph-provider interface, an in-memory implementation for tests, and a Convex-backed implementation for product data. Consider Neo4j only after a benchmark shows retrieval-quality or traversal needs that justify another operational system.

### 8. Observability must correlate intent, tools, cost, evidence, and outcome

OpenTelemetry's generative AI semantic conventions include agent, conversation, tool, workflow, model, and token-usage attributes. The specification also warns that tool arguments and results may contain sensitive information, and parts of the convention remain under development. [OpenTelemetry generative AI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/), [semantic conventions](https://opentelemetry.io/docs/specs/semconv/)

**Implication for Mission Control:** use stable internal correlation identifiers and map provider telemetry into them. Default to redacted summaries; store raw payloads only under an explicit retention and access policy.

### 9. Agent interoperability is emerging, but internal contracts should lead

Google introduced Agent2Agent (A2A) in April 2025 to support capability discovery and cross-agent collaboration. It is directionally useful for multi-vendor systems, but Mission Control should not make a still-evolving external protocol its core domain model. [Google A2A announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

**Implication for Mission Control:** define an internal execution adapter and receipt schema first; add protocol adapters at the boundary.

### 10. Governance is a system property

The NIST AI Risk Management Framework resources emphasize govern, map, measure, and manage activities. OWASP's agentic risks include goal hijacking, tool misuse, identity and privilege abuse, supply-chain vulnerabilities, unexpected code execution, and poisoned context. [NIST AI Resource Center](https://airc.nist.gov/), [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf), [OWASP Agentic Top 10](https://genai.owasp.org/download/52117/?tmstv=1765059207)

**Implication for Mission Control:** approvals, evidence, authorization, redaction, and audit cannot be optional tabs added after execution. They must participate in every governed transition.

### 11. Economics must measure accepted work

Anthropic documents token and cost telemetry but cautions that client-side estimates are not authoritative billing records and that failed calls can still incur cost. Its cost guidance recommends measuring actual usage and starting with bounded pilots. [Agent SDK cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking), [Claude Code costs](https://code.claude.com/docs/en/costs)

The useful unit is not cost per agent turn. It is:

- Cost per accepted WorkOrder.
- Cost per verified assertion.
- Cost of retries and failed attempts.
- Human review time per accepted outcome.
- Cost avoided or time saved relative to a baseline.

**Implication for Mission Control:** preserve provider estimates and billing reconciliations separately, deduplicate usage events, and associate cost with attempt and accepted outcome.

## Conflicting findings and resolution

| Tension | Evidence | Mission Control resolution |
|---|---|---|
| More autonomy increases throughput; more gates slow work | Agent systems support autonomous loops, while their own hook and permissions systems emphasize control | Use risk-tiered policy. Auto-accept only low-risk actions with deterministic evidence |
| Shared agent teams simplify collaboration; isolation prevents interference | Anthropic supports teams but warns about shared-container overwrite risk; Codex emphasizes isolated environments | Default to one isolated branch/worktree per execution unit; coordinate through versioned records |
| GraphRAG improves cross-document synthesis; it adds indexing and query cost | Microsoft supports global/local/DRIFT search but flags resource intensity | Benchmark graph retrieval against simpler hybrid retrieval before adopting new infrastructure |
| Client cost telemetry is immediate; it is not billing truth | SDKs report estimates, while provider invoices remain authoritative | Store estimated and reconciled cost as different measures |
| Provider-native schemas accelerate integration; they create lock-in | Providers expose different hooks, sessions, and telemetry | Normalize a small internal contract and retain provider payload references |
| Benchmark success is objective; benchmarks cover only a subset of product quality | SWE-bench verifies repository patches but not governance, accessibility, or operator UX | Use benchmarks as one verification layer, not the release decision |

## Recommended Mission Control capabilities

### P0 — Trust and lifecycle correctness

- Truthful Mission status labels and reachable Mission detail.
- Complete draft editing for objective, scope, stop conditions, risk, budget, owner, and repositories.
- Plan and assertion builder with versioned revisions.
- Explicit submit, reject-with-reason, revise, approve, and release transitions.
- Immutable approver, decision timestamp, reason, policy version, and evidence references.
- Idempotency protection for transitions and dispatch.
- Separate execution completion, verification result, review decision, and accepted outcome.

### P1 — Operator control and evidence

- Attention queues for blockers, approvals, failed attempts, policy exceptions, and stale work.
- Relationship trace from Mission to blueprint, WorkOrder, Task, execution, evidence, review, deployment, and learning.
- Durable attempt state with pause, cancel, retry, resume, and escalation.
- Execution limits and provider-neutral policy hooks.
- Evidence packages containing commit, tests, browser artifacts, console and network results, cost, and cleanup status.
- Cost and token ledger tied to attempts and accepted outcomes.
- Memory provenance, retrieval receipts, supersession, and access policy.

### P2 — Measured intelligence

- Graph-provider interface with InMemory and Convex implementations.
- Retrieval evaluation set covering correctness, provenance, latency, and cost.
- Research source ledger with publication date, retrieval date, freshness, acceptance decision, and claim links.
- Recommendation confidence and conflict tracking.
- Continuous research cadence that creates proposed Missions but cannot approve or deploy itself.
- Benchmark and regression dashboard for outcome quality, not agent activity volume.

## Continuous Loop Engineering model

Each loop should be a finite, auditable lifecycle:

1. **Observe:** collect product, execution, test, cost, research, and operator evidence.
2. **Frame:** create a versioned research question or improvement Mission.
3. **Research:** gather dated sources and record conflicting findings and limitations.
4. **Recommend:** produce options, expected benefit, risk, benchmark, and stop condition.
5. **Approve plan:** a permitted reviewer accepts or rejects the proposed change.
6. **Implement:** dispatch isolated WorkOrders with bounded tools and budgets.
7. **Verify:** run focused deterministic and browser checks; preserve evidence.
8. **Review:** accept, reject with reason, or request revision.
9. **Release:** apply the change through a governed deployment path.
10. **Measure:** compare outcome against the predeclared benchmark.
11. **Learn:** store a provenance-bearing learning and create the next proposed Mission if justified.

The loop must stop on budget exhaustion, missing evidence, failed policy, conflicting high-severity results, repeated failure, or explicit operator pause. Learning may recommend a change; it must not silently alter policy, approval rules, or production code.

## Failure modes and safeguards

| Failure mode | Safeguard |
|---|---|
| Goal or prompt hijacking | Treat retrieved content as untrusted; isolate instructions from evidence; require policy checks |
| Tool misuse or excessive privilege | Least-privilege tool grants, pre-tool hooks, sandboxing, approval by action class |
| Duplicate dispatch or transition | Client disablement plus server-side idempotency key and unique receipt |
| Retry erases failure | Immutable attempts linked by retry lineage |
| Agent reports success without acceptance | Independent assertions and verifier identity |
| Shared workspace corruption | Isolated branch/worktree/container per execution unit |
| Poisoned or stale memory | Provenance, freshness, supersession, confidence, scope, and retrieval receipt |
| Cost runaway | Per-attempt time, token, turn, and spend ceilings; aggregate Mission budget |
| Sensitive data in telemetry | Field allowlist, redaction, retention policy, access control |
| Graph infrastructure sprawl | Adapter-first design and benchmark-driven adoption |
| Self-improvement bypasses governance | Recommendations become draft Missions; humans retain plan and release approval |
| Activity feed becomes noise | Deduplicated domain events and exception-first projections |

## Limitations

- Vendor documentation describes supported mechanisms, not independently measured reliability.
- Documentation without a visible update date is classified as Unknown.
- SWE-bench results do not predict Mission Control's browser, governance, accessibility, or operational quality.
- No GraphRAG provider was benchmarked against Mission Control's actual corpus during this planning cycle.
- The UI audit used the local demo environment and focused journeys, not every role, route, browser, or failure condition.
- Focused tests were run to control cost; the complete test suite and accessibility suite were not rerun in this planning cycle.
- Pricing can change and provider-side billing remains the source of truth for reconciled spend.

## Source register

| Source | Publisher | Published/updated | Freshness | Relevance |
|---|---|---:|---|---|
| [Codex cloud](https://developers.openai.com/codex/cloud) | OpenAI | Not shown | Unknown | Isolated parallel coding workflow |
| [Codex cloud environments](https://developers.openai.com/codex/cloud/environments) | OpenAI | Not shown | Unknown | Setup, agent phase, network, secrets |
| [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview) | Anthropic | Not shown | Unknown | Tools, permissions, sessions, telemetry |
| [Agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop) | Anthropic | Not shown | Unknown | Turns and budget limits |
| [Hooks](https://code.claude.com/docs/en/agent-sdk/hooks) | Anthropic | Not shown | Unknown | Deterministic lifecycle controls |
| [Hosting](https://code.claude.com/docs/en/agent-sdk/hosting) | Anthropic | Not shown | Unknown | Isolation and shared-container risks |
| [Cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking) | Anthropic | Not shown | Unknown | Cost estimates and deduplication |
| [Claude Code costs](https://code.claude.com/docs/en/costs) | Anthropic | Not shown | Unknown | Cost measurement guidance |
| [Copilot hooks](https://docs.github.com/en/copilot/concepts/agents/hooks) | GitHub | Not shown | Unknown | Command blocking and audit hooks |
| [Custom agents](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents) | GitHub | Not shown | Unknown | Specialized agent profiles |
| [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview) | LangChain | Not shown | Unknown | Durable execution and HITL |
| [LangGraph functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api) | LangChain | Not shown | Unknown | Checkpointing and idempotent resume |
| [GraphRAG repository](https://github.com/microsoft/graphrag) | Microsoft | 2026-05-28 release observed | Current | GraphRAG implementation maturity |
| [GraphRAG query overview](https://microsoft.github.io/graphrag/query/overview/) | Microsoft | Not shown | Unknown | Search modes and resource tradeoffs |
| [Neo4j GraphRAG](https://neo4j.com/docs/neo4j-graphrag-python/current/) | Neo4j | Current docs reference 2026.01 | Current | Provider and compatibility constraints |
| [OpenTelemetry GenAI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) | OpenTelemetry | Version 1.43 observed | Current | Correlation and sensitive fields |
| [NIST AI Resource Center](https://airc.nist.gov/) | NIST | Not shown | Unknown | Govern, map, measure, manage |
| [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | NIST | 2024-07 | Foundational | Generative AI risk management |
| [OWASP Agentic Top 10 announcement](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) | OWASP | 2025-12-09 | Recent | Agentic risk taxonomy |
| [SWE-bench Verified](https://www.swebench.com/verified.html) | SWE-bench | 2024 | Foundational | Engineer-validated repository tasks |
| [SWE-bench harness](https://www.swebench.com/SWE-bench/reference/harness/) | SWE-bench | Not shown | Unknown | Reproducible evaluation mechanics |
| [A2A announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) | Google | 2025-04-09 | Relevant | Cross-agent interoperability direction |

## Decision summary

The near-term architecture should remain Convex-centered and adapter-driven. Mission Control should first make its existing lifecycle complete, enforceable, and visible. GraphRAG, multi-provider interoperability, and greater autonomy are valuable only after the system can prove who authorized work, what executed, what evidence was produced, why it was accepted, how much it cost, and what changed as a result.
