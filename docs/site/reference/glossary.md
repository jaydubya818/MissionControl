# Glossary

| Term | Definition |
| --- | --- |
| **Company / Tenant** | Human membership and authorization boundary above one or more workspaces (`tenants`) |
| **Workspace / Project** | Company-scoped operating context for Missions, repositories, work, and evidence (`projects`) |
| **Repository** | Explicitly authorized source-code target, code scope, and host binding (`workspaceRepositories`) |
| **Software Factory** | Thin, versioned configuration that references approved repositories, workflows, executors, agents, policies, budgets, and verifiers; not a second execution lifecycle |
| **Factory Version** | Immutable, qualified composition of Factory capabilities used to govern a class of execution; qualification alone does not activate it or authorize a WorkOrder |
| **Execution Profile** | Governed execution composition binding runtime, harness, model/tool capabilities, backend, environment, and policy for an Attempt |
| **Mission** | Desired outcome with constraints, sources, stop condition, budget, and a versioned plan (`missions`) |
| **Plan** | Versioned Mission proposal whose approved revision materializes governed WorkOrders (`missionPlans`) |
| **WorkOrder** | Canonical governed unit of approved work, bound to an exact revision and Factory Version (`workOrders`) |
| **Readiness** | Derived determination that required identities, qualifications, authorities, resources, currentness, and policies are satisfied; never a manually asserted `READY` flag |
| **Task** | Bounded executable portion of an admitted WorkOrder; completion does not accept the WorkOrder (`tasks`) |
| **Attempt / WorkflowRun** | One authoritative execution of a Task with durable identity, authority, runtime, evidence, and outcome lineage (`workflowRuns`, linked `runs`) |
| **Unpublished Candidate** | Exact producer output that has not received independent verification, acceptance, or publication authority |
| **Verification Subject** | Frozen candidate identity and verification contract describing exactly what a verifier evaluates |
| **Verifier Attempt** | Separate canonical Attempt that independently evaluates a Verification Subject and cannot inherit producer or human authority |
| **Evidence** | Durable, attributable record of what was authorized, executed, observed, verified, or decided |
| **VerificationReceipt** | Criterion-level evidence with producer/verifier and execution lineage |
| **Human Authority** | Explicit authority retained for consequential decisions such as acceptance, publication, release, restoration, or policy promotion |
| **Pull request** | External review artifact correlated to exact repository, branch/head, WorkOrder, and Attempt lineage |
| **Merge** | Separate human/GitHub decision that does not imply deployment or production verification |
| **Deployment** | Environment action for a merged version; distinct from activation and verification |
| **Activation** | Decision to expose or enable a deployed version for an intended scope |
| **Production verification** | Post-activation evidence that determines retain, disable, or rollback recommendation |
| **Context package** | Versioned skill, rule, or doc in the registry (`scope/name`) |
| **Context CDL** | Draft → publish → install → deprecate lifecycle for packages |
| **Harness** | Change review, merge gates, mutation testing, and wizard flows |
| **Meta-loop** | Feedback from production runs into new verifiers, scenarios, or skill updates |
| **ARM** | Agent Runtime Management — templates, versions, instances, identities |
| **EOS** | Engineering OS — outcome-oriented sidebar (Command Center preview) |
| **Human touch** | Manual override, approval, or takeover during agent execution |
| **Merge gate** | Composite PR readiness check (CI + lenses + mutation + policy) |
| **Receipt packet** | Pi/Hermes artifact bundle proving execution within envelope |

The authoritative hierarchy and current contract mapping are maintained in
[Mission Control Existing-System Assessment](../../mission-control-existing-system-assessment.md).

The bounded reference proof for these admission records is
[Context & Skills canonical Factory admission](../../testing/evidence/context-skills-factory-admission-v1/README.md).
Its status is `SYNTHETIC_FACTORY_ADMISSION_QUALIFIED`: it used zero external
model calls, publications, and Production mutations, and grants no acceptance,
publication, or production authority.

See also Tessl glossary for shared agentic vocabulary: https://docs.tessl.io/reference/glossary
