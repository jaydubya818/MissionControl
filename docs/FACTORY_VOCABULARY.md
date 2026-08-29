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
pull requests, and `workOrders.accept` remains the only WorkOrder acceptance
authority. Terms below are written to make that separation explicit rather than
implied.

## Context and configuration

**Context Package** — A versioned, addressable unit of supplied context an agent
may load during execution, identified by a `scope/name` slug (for example
`anthropic/skill-creator` or `mission-control/arm.policy`). Declared types are
`SKILL`, `RULES`, `DOCUMENTATION`, `SOUL`, `WORKFLOW`, `TOOL_GUIDE`, and
`PROMPT_TEMPLATE` (`convex/schema.ts`, `convex/context/packages.ts`). A package
supplies material to reason with. It does not grant authority, and loading one
does not certify its contents are current.

**Context policy** — The rules deciding which Context Packages an agent is
eligible to load for a task, and under what budget. It constrains what may enter
the working set; it does not establish that the agent used what it loaded.

**Factory Memory** — The governed retrieval surface over the factory's own
artifacts, decisions, traces, and outcomes. It is a first-class subsystem
serving factory execution, not a sidecar chatbot or generic enterprise search.
Retrieval from it is context, not evidence.

**Recipe** — A reusable, versioned execution pattern describing how a class of
work is normally carried out. A recipe proposes an approach; it does not
authorize execution or accept a result.

**Factory Version** — The versioned, resolved factory configuration in force for
a unit of work, binding the applicable policy, recipes, context policy, and
routing. It makes an execution reproducible and attributable; it is not itself
an approval.

## Factory learning

Source of record: `convex/lib/factoryLearning.ts` (types and enumerations),
`convex/factory/learning.ts` (the scanner), `convex/factory/metaLoop.ts`
(inbox, resolution, and signal ingestion).

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
signal cannot by itself change any governed record.

**Signal severity** — `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. Severity orders
attention. It does not determine whether a change is permitted.

**Deterministic key** — The stable identity under which repeated occurrences of
the same underlying condition collapse to one signal, so that a recurring
problem is counted once per cause rather than once per observation.

**Evidence fingerprint** — The content-derived identity of the evidence behind a
signal, distinguishing a genuinely new observation from a re-report of one
already recorded.

**Learning cluster** — A grouping of related signals over a bounded window,
used to separate a recurring systemic pattern from an isolated incident. The
scanner runs over a 30-day window and reads at most 200 source rows per pass
(`WINDOW_DAYS`, `MAX_SOURCE_ROWS`), under the scanner version
`factory-learning-v1`. Clustering is an analytical projection: it creates no
obligation and proves no cause.

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

**Meta-loop** — The governed loop by which the factory improves its own
configuration: signals are ingested, clustered, turned into candidates, placed
in a review inbox, resolved by a human, and only then applied. Its defining
constraint is that it may not self-authorize, mutate governance, bypass
verification, or become a token sink.

**Recursive improvement boundary** — The invariant that the system improving the
factory is subject to the same policy, verification, and acceptance controls as
the work the factory performs. A learning subsystem is not exempt from the
governance it informs.

## Terms deliberately not defined here

**Governed experiment** and **promotion recommendation** appear in the factory
learning design discussion and in the canonical glossary, but have no
implementation in this repository at the time of writing — a search for
`GovernedExperiment` returns no matches. They are defined in the guide as part
of the target model. They are omitted here rather than described as though they
exist, so that this file stays a description of what Mission Control enforces
rather than what it intends.

## Related documents

- `docs/ARCHITECTURE.md` — system structure and the control/execution split
- `docs/CONTEXT_MANIFESTS.md` — how context is assembled for a run
- `docs/DECISIONS.md` — recorded architectural decisions
- `docs/NIGHTLY-BACKLOG.md` — open factory work, including Factory Learning V1
  and Factory Memory phases
