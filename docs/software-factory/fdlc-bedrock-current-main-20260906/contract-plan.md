> Latest authoritative baseline: 4434cc5, runtime v46; candidate v47, six additions/one changed API. Earlier proposals below are retained planning history and superseded by the explicit advancement sections.

# Current-main Bedrock reconciliation contract plan

Authority: user continuation attachment 445ad340. Historical commits cb373ee36d1645cad4f277f59c75cb7b1cac57f5 and 683b9f04f1a235a8c007057d73cbe03a9c72e846 remain immutable. Fresh base e9d2f52720e634b79d2c614a7fb9812a6b986fe9 is authoritative, runtime v45. The old v43 is not a baseline. Every overlap is classified in overlap-classification.json before source application.

## Architecture audit

Current main adds governed physical inference intents/receipts, active price books, per-logical-request reservations and economics; Fab exact runtime/model enrollment; immutable prepublication candidates, independent verifier/publication bindings, recoverable publication intent and no-replay recovery; shared builder intent contribution lineage. Preserve every main API/table, route/currentness check, test and runtime identity. Candidate remote Docker profile/bridge additions remain separately versioned. No new primary platform abstraction.

The Bedrock aggregate maximum-liability reservation is still required: main's per-logical-request route/fallback accounting cannot replace its multi-call tool-loop cap. Integrate current ledger attribution with the hard-liability pre-send transaction. Each physical Bedrock request has one main logical reservation and ordinal 1, no fallback. Both ledgers must bind the exact Attempt/profile/route/price and retain unknown exposure. Nano-USD and micro-USD use explicit integer conversion, rounding liability upward. Missing governed accounting authority means no send. Producer cannot certify itself; current main verifier and acceptance/publication authority remain unchanged.

## Proposed public diff — written before changing runtime

Current version **45**. Proposed version **46**, exactly one increment, because seven missing public operations and one Docker profile argument expansion remain required. None of current main's APIs is removed. Exact historical validators are the implementation input; generated API is regenerated, never copied.

| Operation | Classification | Argument change | Result change | Reason / relationship to main |
|---|---|---|---|---|
| factory/providerLiability:registerPriceVersion | STILL_REQUIRED | New governed project + registration key + provider price snapshot | New price record ID | Aggregate hard-liability price qualification; reconcile with main active price book rather than replace it |
| factory/providerLiability:createReservation | STILL_REQUIRED | New project/WO/profile/price + idempotency key + aggregate limits | New reservation record ID | Multi-call hard cap absent from main per-logical-request accounting |
| factory/providerLiability:getReservation | STILL_REQUIRED | New reservation ID | New scoped reservation snapshot | Operator evidence for bounded aggregate holds |
| factory/providerLiability:reconcileUsage | STILL_REQUIRED | New reservation + corrected usage + evidenceReference | New canonical correction result | Preserve independent reconciliation and uncertainty; main physical receipt chain also retained |
| serviceCommands:reserveProviderRequest | MUST_BE_RESHAPED | New signed envelope + payloadJson; no broad credentials | New bounded canonical reserve proof | Internally compose hard-liability admission with main physical intent authority before send |
| serviceCommands:recordProviderUsage | MUST_BE_RESHAPED | New signed envelope + payloadJson | New canonical settlement result | Preserve both hard liability and main receipt attribution |
| workOrders:readiness | STILL_REQUIRED | New workOrderId, optional factoryDefinitionVersionId/expectedRevision/refreshToken | Read-only predicate projection | No mutation or manual READY state; current main dispatch remains authority |
| factory/configuration:createSandboxProfile | MUST_BE_RESHAPED | Optional provider DOCKER plus exact dockerQualification descriptor; retain old inputs | No existing result change | Distinct Docker qualification without weakening EXE_DEV/Fab |

The machine-readable exact public validator expressions will accompany the runtime guard result. Any further API change requires updating this plan before implementation. No account/role is hard-coded. Approved US Bedrock route and both Codex manifest identities remain preserved.

## Execution and gates

1. Apply audited nonoverlap changes and semantic unions; preserve all current-main runtime, recovery and inference contracts.
2. Connect bridge reservations/usage to current governed accounting; test no authority/no budget/no send and unknown/no replay.
3. Authoritative isolated Convex codegen; exact-main contract diff must be seven additions/one changed API/no removals unless this plan is revised first.
4. Full current suite, explicit Docker and old/new harness identities, UI evidence for carried readiness surface, independent architecture/security/data/simplicity/docs reviews.
5. Fetch/reconcile main before PR; commit, push, CI, fix, qualified merge and exact-main postmerge requalification when gates permit.
6. Consume only approved AWS handoff provenance. Currently audited handoff fields remain null; account 083665737366 is not bootstrap-confirmed. No AWS/model calls until the applicable identity and separate live-call authority exist. Continue every independent engineering task.

## Authoritative baseline advancement — f749b06, planned before implementation

Main advanced to f749b06c8ef39c5bd22c9e0ad76334482ec35b33, runtime **46**, via #183.
Its WorkOrder readiness query is ALREADY_PRESENT and REMOVED_AS_DUPLICATE from this
PR's new API list. Preserve its single parent-owned readiness clock and current
readiness/docs/test implementation. Six provider-liability/service-command additions
and the Docker createSandboxProfile argument expansion remain required: proposed
minimal version is now **47**, one increment from authoritative 46. No main API is
removed. The earlier v45→46 plan is retained above as superseded planning history.

Main also propagates the explicitly configured Corepack cache for frozen preparation;
retain it. Preserve main maturity and Phase 0 closure. Retain candidate Phase 1
pilot notes and new continuation as separate appendices where main touches the same
records. Exact validator declarations remain in proposed-public-validators.json;
workOrders:readiness is historical input now already present on main.

## Further main advancement — 4434cc5

Main advanced to 4434cc56448075f4804787325a9586c6290b2215 without changing v46.
Preserve its cumulative WorkOrder inference allocation check, including retained
spent/unknown allocation, concurrency evidence and handler regressions. Compose
with reciprocal aggregate-reservation exclusion. The minimal public diff stays
six additions/one changed API, candidate v47. No new API/version increment.
