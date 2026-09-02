# Factory Vocabulary

Canonical terms for the agentic software factory concepts Mission Control
implements. Each definition names the responsibility a concept owns and states
what it does **not** prove or authorize — the distinction that keeps capability
separate from authority.

This file is the implementation-side companion to the canonical glossary in
`ai-software-factory-mastery` (`guide/00-overview/02-canonical-glossary.md`),
which defines the same concepts at the operating-model level. Where the two
differ, the guide describes the general model and this file describes what
Mission Control actually enforces today.

Every enumerated value below is taken from source, not from intent. File
references are given so a reader can confirm them rather than trust them.

## Governing principle

Mission Control's central invariant is that **agent completion does not equal
verified success**. Capability, confidence, and completion are all distinct from
authority. Concretely: executors do not self-certify acceptance, humans merge
pull requests, and `workOrders.accept` remains the canonical human WorkOrder
acceptance transition. Terms below are written to make that separation explicit
rather than implied.

## Context and configuration

**Context Package** — A versioned, addressable unit of supplied context an agent
may load during execution, identified by a `scope/name` slug (for example
`anthropic/skill-creator` or `mission-control/arm.policy`). Declared types are
`SKILL`, `RULES`, `DOCUMENTATION`, `SOUL`, `WORKFLOW`, `TOOL_GUIDE`,
`PROMPT_TEMPLATE`, `POLICY`, `ARCHITECTURE_GUIDE`, and `EVALUATION_GUIDE`
(`convex/schema.ts`, `convex/context/packages.ts`). A package supplies material
to reason with. It does not grant authority, and loading one does not certify
its contents are current.

**Context policy** — The collective rules deciding which Context Packages and
versions are eligible to enter a repository or run, including manifest and lock
resolution, published-version status, and content-hash matching
(`packages/context-tools/src/manifest.ts`, `convex/context/manifests.ts`,
`convex/context/activation.ts`). The current schema does not persist a single
`ContextPolicy` record; the
`UPDATE_CONTEXT_POLICY` Improvement candidate names a change to these rules.
Context policy constrains eligible material but does not establish that an agent
used what it loaded.

**Factory Memory** — The governed retrieval surface over the factory's own
artifacts, decisions, traces, and outcomes. It is a first-class subsystem
serving factory execution, not a sidecar chatbot or generic enterprise search.
Retrieval from it is context, not evidence.

**Recipe** — A reusable catalog entry describing how a class of work is normally
composed, including phases, workflow candidates, routing intent, deterministic
gates, and verification intent. The catalog lives in
`apps/mission-control-ui/src/factoryExperience/recipeCatalog.ts`. A selected
recipe resolves to an existing canonical workflow; the recipe does not create
another execution engine, authorize execution, or accept a result.

**Factory Version** — A versioned, digested factory configuration that binds a
repository and workflow to execution inputs such as the executor, model route,
sandbox, agents, policy envelope, environment, budgets, verifiers, risk
boundary, and recovery controls (`convex/schema.ts`,
`convex/factory/configuration.ts`). An active Factory Version makes execution
configuration reproducible and attributable; creating a version is not itself
activation or approval.

## Factory learning

Source of record: `convex/lib/factoryLearning.ts` (types and enumerations),
`convex/factory/learning.ts` (the scanner), `convex/factory/metaLoop.ts`
(inbox, resolution, and signal ingestion), and `convex/observability.ts`
(canonical experiments and outcomes).

**Learning signal** — An observed, attributable indication that the factory's
own configuration, context, routing, or process underperformed. The seventeen
recorded types are `HUMAN_CORRECTION`, `REPEATED_INSTRUCTION`,
`VERIFICATION_FAILURE`, `DETERMINISTIC_GATE_FAILURE`, `RETRY_REQUIRED`,
`RECOVERY_REQUIRED`, `CONTEXT_MISS`, `CONTEXT_OVERLOAD`,
`MODEL_ROUTING_MISMATCH`, `TOOL_SELECTION_MISMATCH`, `RECIPE_MISMATCH`,
`PROMPT_AMBIGUITY`, `AGENT_CONFIG_DRIFT`, `UNNECESSARY_AGENT_USAGE`,
`TOKEN_WASTE`, `HUMAN_INTERVENTION`, and `REPEATED_REVIEW_FINDING`.

A signal carries evidence references, a deterministic key, an evidence
fingerprint, a confidence, and a severity. It carries **no acceptance
authority** — `LearningSignalInput.acceptanceAuthority` is typed as the literal
`false`, so the type system itself refuses a signal that claims otherwise. A
signal cannot by itself change Factory configuration or satisfy acceptance.

**Signal severity** — `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. Severity orders
attention. It does not determine whether a change is permitted.

**Deterministic key** — The stable signature used with workspace, repository,
and signal type to group repeated occurrences into one Learning cluster.
Volatile revision, UUID, line-number, run, and large-number fragments are
normalized before grouping; semantic similarity is not inferred.

**Evidence fingerprint** — The stable evidence identity used to suppress a
repeat within a cluster. It may be supplied by a source projection or default to
the source type, source ID, and signal type; it is not necessarily a content
hash.

**Learning cluster** — A deterministic grouping of signals with the same
normalized key over a bounded window, used to separate a recurring pattern from
an isolated incident. The scanner runs over a 30-day window and caps each
relevant source query at 200 rows (`WINDOW_DAYS`, `MAX_SOURCE_ROWS`), under the
scanner version `factory-learning-v1`. The cap is per query, not a total row
limit for the whole refresh. Clustering is an analytical projection: it creates
no obligation and proves no cause.

**Improvement candidate** — A specific, typed proposal derived from clustered
signals. The twelve types are `ADD_DETERMINISTIC_GATE`, `MODIFY_GATE`,
`UPDATE_PROMPT`, `UPDATE_AGENT_RULE`, `ADD_OR_UPDATE_SKILL`,
`UPDATE_CONTEXT_POLICY`, `CHANGE_RECIPE`, `CHANGE_RETRY_POLICY`,
`CHANGE_MODEL_ROUTING`, `CHANGE_TOOL_CONFIG`, `REPLACE_AGENT_WITH_CODE`, and
`ADD_DOCUMENTATION`.

Note that `REPLACE_AGENT_WITH_CODE` is a first-class outcome: the learning loop
is permitted to conclude that the correct improvement is to stop using an agent
for a task. A candidate is a proposal for human review, not a decision, and
generating one grants no authority to apply it.

**Governed experiment** — A human-approved, workspace-scoped canonical
experiment linked to an open or snoozed Improvement candidate. Factory Learning
creates exactly two attributed variants — `Current baseline` and `Proposed
candidate` — against one frozen dataset version and one or more enabled,
workspace-scoped evaluator definitions (`convex/factory/learning.ts`,
`convex/observability.ts`). The action requires Factory approval permission;
datasets, evaluators, and optional Factory Versions must belong to the same
workspace. Approving the experiment marks the candidate `ACCEPTED`, but does
not change the live Factory or authorize implementation. Outcomes must cover
the same two variants and are retained as bounded aggregates.

**Promotion recommendation** — The deterministic, advisory comparison used
after a two-variant experiment is completed. Its states are
`PROMOTION_RECOMMENDED`, `HOLD_RECOMMENDED`, and `REJECT_RECOMMENDED`: any
observed regression recommends rejection, one or more improvements with no
regression recommends promotion, and no difference recommends a hold. If either
variant has fewer than 30 samples, the comparison is labeled `LOW_SAMPLE`;
otherwise it is labeled `OBSERVED_COMPARISON`. The result always reports
`statisticallySignificant: false` and `autoPromote: false`
(`convex/lib/factoryLearning.ts`). A recommendation does not approve itself,
change production configuration, or authorize implementation.

**Meta-loop** — The governed loop by which the factory improves its own
configuration: signals are ingested, clustered, turned into candidates, placed
in a review inbox, tested through a human-approved canonical experiment, and
compared through an advisory Promotion recommendation. After the experiment is
complete, a human with Factory approval permission may promote the candidate
into a submitted Mission plan; a separate human plan approval still gates
implementation. The loop may not self-authorize, mutate governance, bypass
verification, or become a token sink.

**Recursive improvement boundary** — The invariant that the system improving the
factory is subject to the same policy, verification, and acceptance controls as
the work the factory performs. A learning subsystem is not exempt from the
governance it informs.

## Related documents

- `docs/ARCHITECTURE.md` — system structure and the control/execution split
- `docs/CONTEXT_MANIFESTS.md` — how context is assembled for a run
- `docs/DECISIONS.md` — recorded architectural decisions
- `docs/NIGHTLY-BACKLOG.md` — open factory work, including Factory Learning V1
  and Factory Memory phases
