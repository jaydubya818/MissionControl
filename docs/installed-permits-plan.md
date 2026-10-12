# Installed MissionControl permit integration

Base af521c92c05a1c79d1aff11510efea8dcf23e350. Exclusive checkout codex/unified-beta-installed-permits. No canonical installed owner/connection/key records available; no real binding created.

- [x] how over affected subsystem. Existing Sofie connection is fixture-only; canonical Mission/Plan/WorkOrder and owner checks remain authoritative.
- [x] architect skipped: sequential ownership directed by user; supplied contract and existing admission architecture determine placement. No new ledger or Factory ingress.
- [x] Blocking first steps. Read instructions and strict consumer contract; define challenge ordering boundary before caller integration.
- [x] Independent workstreams. Coordinator four defects owned by qualification chat; MyEve/Factory by integration chat. This checkout alone is owned here.
- [x] Shared mutable state. Convex transactions serialize permit approval, revocation, currentness receipt. Work authority/accounting remains MyEve/Factory.
- [x] Smallest safe decomposition. One source owner; typed permit/enrollment, DB gate, signing action, owner UI, tests.
- [x] Implement boundary validators and crypto parity tests.
- [x] Implement authenticated current owner permit approval, stale/revoked denial and duplicate-safe admission receipt.
- [x] Integrate explicit installed readiness while retaining isolated deterministic mode.
- [ ] Bind existing independently verified Result/Proof to permit Work; no asserted PASS projection.
- [x] Verify on matching surface. Unit, local Convex, browser. Installed endpoints remain NOT_RUN without actual records.
- [ ] Commit meaningful validated units, verify nondeploying publication controls before push.
- [ ] Independent review; handoff exact source and limitations.

Model the Domain principle: permit and receipt are typed signed documents bound to existing Mission/Plan/WorkOrder/approval rows, not new execution authority. An immutable approved document and explicit revoked timestamp determine validity.

## Permit slice qualification (2026-10-11)

Full Convex unit suite: 185 files / 1719 tests passed. Owner UI regressions: 2 files / 17 tests passed. Convex and UI typechecks passed. Authorization ratchet passed without baseline suppression. Disposable local Convex passed 12 checks covering concurrent approval/admission, exact dual-policy references, restart durability, terminal Mission/WorkOrder denial, disable preservation, expired/revoked connection owner lifecycle access, foreign owner denial, control-sequence replay and truthful cleanup acknowledgment. Chromium component qualification and axe accessibility passed; this is synthetic component qualification, not installed authentication or the composed Golden Journey.

Independent review found and corrected four permit-slice issues: lifecycle access after connection expiry/revocation (including parent owner view), explicit revoke after plan disable-new, stale ACK returned on control upgrade, and new admission for DONE native records. Final committed-source review remains required.

The original coordinator 89e60d2 findings belong to the qualification owner; this source does not claim to correct or qualify that package. Actual installation identities, custody FactoryVersions, installed authentication and composed cross-system execution remain NOT_RUN. No real enrollment, secret, runtime grant or spending limit is created.
