# Hardened Sandbox Profile lifecycle

Production profile ID: not configured.

Production state: no `factorySandboxProfiles` record exists, so no profile was
promoted and no admission was inferred from historical evidence.

The implemented lifecycle is additive:

1. `createSandboxProfile` records a faithful certified profile with immutable
   image, resource floor, Node/Codex/Git/BusyBox identities, SBOM, guest policy,
   UID/GID, no-new-privileges, empty-capability policy, credential policy,
   workload/risk scope, timeout scope, revocation bound, and evidence identity.
2. Its security snapshot retains `qualificationOnly: true` and the database
   admission state starts at `QUALIFICATION_ONLY`.
3. `promoteSandboxProfile` requires a human with Factory approval authority and
   the exact profile digest. It creates one immutable
   `PRODUCTION_PILOT_ELIGIBLE` admission record.
4. Promotion grants execution eligibility only. Routing, verification,
   acceptance, publication, and merge authority remain false.

The expected exact image is
`ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`.
The evidence packet is
`docs/testing/evidence/remote-sandbox-final-blocker-qualification-v1/qualification-summary.json`
with file digest
`sha256:daeae46917adef8e0b5c83a52943f265321c8f84c16fc3e449c799a3089de82e`.
The guest egress-policy digest is
`sha256:9786bfac28a3a6ab4803c6aea27172a97b38e43ae2290945226a4ae7174530e0`
and the qualified revocation confirmation bound is 30,000 ms.

Provider-enforced egress is unavailable. Guest nftables remains defense in
depth, represented as `providerEnforced: false`, `guestEnforced: true`, and
`PROVIDER_ENFORCEMENT_UNAVAILABLE`; it is not collapsed into a success boolean.
