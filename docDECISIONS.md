# docDECISIONS

Date: 2026-02-12
Branch: `feat/prd-roadmap-impl-20260212`

## A-001: PRD file path mismatch

- Context: Requested source file `docs/PRD.md` is not present in this repository.
- Decision: Use `docs/PRD_V2.md` as the authoritative PRD for this implementation cycle.
- Why: It is the only complete PRD in the repo and is referenced directly by `README.md`.
- Risk: If a different PRD was intended, scope could drift.
- Mitigation: Keep Milestone 1 tightly aligned to `docs/ROADMAP.md` "Now" + "Control Plane Hardening" items.

## A-002: Target repository naming mismatch

- Context: Request referenced `github.com/jaydubya818/ARM`, but current workspace remote is `github.com/jaydubya818/MissionControl`.
- Decision: Execute all work against the current checked-out repository and branch.
- Why: This is the active local workspace and contains the referenced docs and implementation.
- Risk: Work could land in the wrong repository if naming was intentional.
- Mitigation: All planning docs explicitly reference current repo structure before Milestone 1 coding.
