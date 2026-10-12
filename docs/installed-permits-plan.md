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
- [x] Bind existing independently verified Result/Proof to permit Work; no asserted PASS projection.
- [x] Verify on matching surface. Unit, local Convex, browser. Installed endpoints remain NOT_RUN without actual records.
- [ ] Commit meaningful validated units, verify nondeploying publication controls before push.
- [ ] Independent review; handoff exact source and limitations.

Model the Domain principle: permit and receipt are typed signed documents bound to existing Mission/Plan/WorkOrder/approval rows, not new execution authority. An immutable approved document and explicit revoked timestamp determine validity.

## Permit slice qualification (2026-10-11)

Full Convex unit suite: 185 files / 1719 tests passed. Owner UI regressions: 2 files / 17 tests passed. Convex and UI typechecks passed. Authorization ratchet passed without baseline suppression. Disposable local Convex passed 12 checks covering concurrent approval/admission, exact dual-policy references, restart durability, terminal Mission/WorkOrder denial, disable preservation, expired/revoked connection owner lifecycle access, foreign owner denial, control-sequence replay and truthful cleanup acknowledgment. Chromium component qualification and axe accessibility passed; this is synthetic component qualification, not installed authentication or the composed Golden Journey.

Independent review found and corrected four permit-slice issues: lifecycle access after connection expiry/revocation (including parent owner view), explicit revoke after plan disable-new, stale ACK returned on control upgrade, and new admission for DONE native records. Final committed-source review remains required.

The original coordinator 89e60d2 findings belong to the qualification owner; this source does not claim to correct or qualify that package. Actual installation identities, custody FactoryVersions, installed authentication and composed cross-system execution remain NOT_RUN. No real enrollment, secret, runtime grant or spending limit is created.

## Independent Factory Result readback

The owner action `sofieFactoryResults:refresh` reads the exact enrolled MyEve origin through the dedicated 30-second HMAC request contract. It independently verifies the original Factory receipt and current readback signatures, exact authority and admitted request/run, original Result signature, artifact bytes, source/configuration/FactoryVersion, verifier policy and immutable per-criterion Proof. The canonical Work ledger V2 parser and invariants are reused without changes. `packages/shared/src/factoryResult/PROVENANCE.json` records verified upstream commit and original/local file digests plus the import/ES2021 compatibility transformations. Zod4.3.6 is explicitly declared using the existing lockfile version.

`MC_SOFIE_FACTORY_RESULT_PINS` is an operator-installed object keyed by exact connectionId, containing factoryId,sourceDigest,configurationDigest,verifierPolicySha256,resultKeys,receiptKeys,checkCommands,allowedFiles. No fallback pins exist. Actual installed pins remain unavailable and no values were installed.

The post-network transaction rechecks authenticated owner, current Mission Plan/WorkOrder revision, retained positive admission, permit digest, Result pins and service-key identity. The existing permit record stores an observation cache only. Every read revalidates cache currentness; stale keys/Plan/revision suppress current verdict and cleanup claims. No execution, accounting settlement, native Quality Gate or owner-acceptance records are created. Contradictory cleanup/exposure evidence is conservatively pending. UNKNOWN exposure and original PARTIAL Proof remain intact.

Qualification:27 signed Result/Proof/ledger tamper tests;2 owner action/transport tests;full backend suite passed before the2 added action tests (1719+27), and the2 new tests passed separately.18 affected UI tests passed.14 disposable Convex checks passed, including service-key rotation, Plan and pin changes across network I/O and stale cache suppression. Actual Chromium/axe checks cover evidence expiry and UNKNOWN states; authenticated installed Golden Journey remains NOT_RUN. Final exact-source review and hosted CI are required.

## Signed control delivery

The existing durable permit control sequence is the outbox. With the explicit `MC_SOFIE_CONTROL_DELIVERY_ENABLED=true` installation gate, creation schedules one signed POST to the exact enrolled MyEve `/api/missioncontrol/control` origin. The flag is unset and no installed delivery was activated. Requests are bounded to8KiB, responses1KiB,5seconds, no redirects. HTTP200 `{received:true}` records delivery only; authority fencing and cleanup require the existing authenticated exact-sequence ACK. Failed delivery remains PENDING_BACKEND for the existing pull recovery. Stale delivery cannot update a newer sequence. Ordinary disable-new retains its distinct operation and preserves existing Work.

Final local source checks for this slice:188Convex files/1756tests PASS,15disposable Convex checks PASS,Convex typecheck PASS. This also includes the signing-key natural-expiry correction after Result review. No provider operation, deployment, actual identity binding or installed Golden Journey was run. Final committed-source review/publication controls/hosted CI remain required.
