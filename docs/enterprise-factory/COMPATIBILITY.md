# Interoperability crosswalk

| Concept | MissionControl | MyFactory | MyEve | Required translation |
| --- | --- | --- | --- | --- |
| Principal | tenant/company membership and project/workspace | authenticated client and owner scope | personal/business scope and owner principal | Explicit trusted tenant/workspace to client/owner mapping; IDs are not authorization. |
| Objective | Mission and specification revision | intake objective | canonical Work objective | Correlate; do not copy lifecycle ownership. |
| Plan | missionPlans ID/revision/digest | admitted execution configuration | proposed route and Work criteria | Preserve each identity; no universal Plan record. |
| Work | WorkOrder ID/revision ID/revision number | separately admitted WorkOrder UUID | Work UUID/version/generation | Store all IDs separately. Never synthesize a MyEve Work for enterprise delegation without its owning authority. |
| Attempt | workflowRuns ID and manifest digest | Run UUID, attempt number, writer lease | route Run and Work generation | Exact subordinate mapping with immutable admission identity. |
| Source | workspaceRepository ID, base commit, tree, snapshot | repository slug, exact commit/tree, custody | source grant and Work repository | Private snapshot handoff requires the merged partner extension. |
| Factory | native definition/version row/configuration digest | factoryId and SHA-256 FactoryVersion | qualified provider reference | Independent version namespaces. Registration and health are separate from qualification. |
| Candidate | verification subject, Git commit/tree, custody | candidate manifest and artifact hashes | retained candidate/result reference | Verify bytes and provenance; never use mutable branch heads. |
| Verification | Quality Contract and verificationReceipts | independent verifier Result evidence | Proof projection | Preserve scope, evidence class, independence, UNKNOWN, freshness; no automatic enterprise PASS. |
| Budget | enterprise allowance/provider reservation | WORK_LEDGER_V2 and local enforcement | owner/Work/model accounting | Unique paying allowance, delegated sub-reservation, integer micro-USD, transactional settlement. |
| Acceptance | enterprise decision | execution outcome | Needs You projection | Decision is recorded by the owning authority. |
| Publication | governed publisher and release controls | restricted effects | exact owner publication approval | None inferred from Result or acceptance. |
| Agent/Role/Skill | enterprise agent/harness and local Skills | qualified harness/Skills | persistent Agents, Role Packs, bounded subagents | Pin configuration/digest and intersect authority. MySkills integration waits on merge. |
| Recovery | canonical Attempt and incident controls | Run/lease/accounting reconciliation | Work/route generation and owner action | Preserve original Attempts; no implicit reassignment or UNKNOWN retry. |

## First contract boundary

`factoryDelegationBinding.ts` represents immutable correlation, not a transport credential, authorization token, registry, or lifecycle. It binds enterprise identities, partner identities, exact source, policy digests, budget reservation, and deadlines. Parsing does not authenticate a caller. Comparing an incoming binding to a trusted stored binding does not replace current authority or revocation checks.

Candidate/result identity is intentionally not invented before the partner creates it. The next contract versioned boundary must add an authenticated execution receipt and exact candidate/result binding after admission.

Alternative A was to inject enterprise fields into `MYFACTORY_EXECUTION_V2`. Source inspection rules this out because `parseCloudPrepare` rejects unknown keys. Alternative B retains the existing payload and puts its digest and identities in a separate MissionControl binding. This checkpoint uses B. No cross-repository source import or copied partner lifecycle is introduced.

## Logical route projection

| Requested classification | Canonical integration point | Admission requirement |
| --- | --- | --- |
| CHAT_ONLY | ordinary chat | No Work execution authority created. |
| SOFIE_NATIVE_DIRECT | current native/direct provider chosen by existing router | Exact Work, qualified environment/harness, scoped tools. |
| SOFIE_NATIVE_MULTI_AGENT | existing workflow coordinator plus bounded child Tasks | Parent/child authority, Role/Skill pins, transactional budget, scoped context, cancellation and aggregation. Agent count does not select enterprise tier. |
| MYFACTORY | current MYFACTORY route | Dedicated Factory admission and verifier/candidate requirements. Coding alone is insufficient to select this tier. |
| MISSIONCONTROL_NATIVE | enterprise proposal, then MissionControl native engine | Planning authorization, Plan approval, WorkOrder release and native admission remain distinct. |
| MISSIONCONTROL_HYBRID | enterprise proposal and exact delegated WorkOrders | MissionControl acceptance and budget authority retained. |

These are logical classifications. Do not replace MyEve's existing route enum until canonical consumers and persisted data have an explicit versioned migration.
