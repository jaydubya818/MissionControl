# Checkpoint H owner recovery

Approved Option A uses the existing MissionControl Clerk session. Bases: MC74ccd15b, MyEve b5a6ceca, MyFactory e498c31. Qualified originals stay unchanged. No federation, deployment, paid operations, external-alpha changes, production grants, dependency merges or publication.

## Contract and design

The owner review is addressed by canonical proposal ID and digest. Its state is pending, authorized, rejected, expired, or linked to exactly one Mission. The authenticated owner reviews and decides through existing MissionControl authority. Sofie can only submit an explicitly authorized draft. The same proposal-to-Mission binding anchors Plan, WorkOrders and current Result. Result acceptance must re-evaluate canonical evidence inside the owner transaction, bind the reviewed Plan and proof digest, and derive audit identity from the session. Rejection records the owner's reason and leaves the Mission unaccepted. No service credentials reach owner endpoints.

Use the existing Missions navigation with a proposal review panel. A configured MyEve owner-review link carries identifiers only, never credentials. Status and proof come from canonical records; the model cannot establish PASS. The existing isolated-only integration remains isolated-only.

## Throughput checkpoint

- Blocking first steps: inspect owner contracts and real Clerk availability; pull and verify exact private GHCR digest.
- Independent workstreams: owner backend/UI, Sofie link, and runtime qualification; executed sequentially per user tool mapping.
- Shared mutable state: serialize changes in the two assigned checkouts; canonical owner decisions remain transactional.
- Smallest safe decomposition: one implementer preserves the cross-repository identity contract. Independent Claude review is a separate gate, never self-certified.

## Work steps

- [x] Ground authentication, proposal and acceptance contracts.
- [x] Architect: existing review panel selected over a new identity bridge, per explicit Option A. Parallel exploration skipped per user instruction to execute sequentially.
- [x] Implement owner review, exact decision binding, and Sofie handoff.
- [x] Verify backend denial/replay/concurrency and browser states.
- [ ] Verify recovered runtime and hosted read access; stop that gate if denied.
- [ ] Run one-Mission browser execution if an actual approved Clerk session is available. No fixture identity may count as real login.
- [ ] Run fresh clone, CI, prepare independent review package.
- [ ] Commit/push checkpoint and verify exact remote SHAs. No merges or deployment.

Live Clerk login is currently unavailable in the checkout; the existing-session choice was requested. All independent implementation and qualification continues. Full browser qualification must remain NOT_RUN if real owner authentication cannot be exercised.

## Qualification observations

The exact GHCR manifest and config, linux/amd64 architecture, pinned provenance, runtime bytes and source revision pass local checks. Four existing runtime controls pass. One canonical proposal creates one Mission under concurrency, executes three native/delegated WorkOrders, and accepts the current Result once under concurrent owner decisions. Same-owner Plan/Result mismatch, foreign owner, foreign tenant and replay denials pass. This is a synthetic API fixture, not Clerk login. All 1,546 backend tests and nine affected UI tests pass. The UI component browser fixture passes dark/light, 390px, keyboard and automated accessibility checks.

A real Clerk owner session has not been supplied; the connected-browser inventory has no open MissionControl tab. Claude CLI authentication reports loggedIn false. These required gates remain NOT_RUN. Local fresh clones and dependency installation are temporarily held for coordinated disk recovery; hosted checkouts will provide fresh-source coverage.
