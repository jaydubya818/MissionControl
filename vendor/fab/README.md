# Fab archive provenance

These are pinned build inputs for the opt-in **Experimental** Fab executor. This
Mission Control repository is public; the archives are publicly retrievable when
the source branch is published. “Private package” in historical build records
describes the original packaging workflow, not repository access control.

The active archive is `fdlc-fab-0.1.0-experimental.2.tgz`, built from FDLC source
`1d1240c219d9bf3c1fa5fbb0a80ded96cf13df1f`. Its SHA-256 is
`b3a1af223e246208c01745678cbe48a91786070b016b9a1ad7bdb0ad274d8a8d`.
`apps/orchestration-server/src/fabRuntimePin.ts` records its exact installed
closure. The experimental.1 archive is retained as historical evidence.

The Fab source/package has no declared license. This vendoring change does not
relicense Fab under Mission Control's root MIT license or select a new Fab
license. Fab licensing remains an operator decision; public retrievability is
not a license grant. The archive bytes and original build metadata are preserved.

The native helpers have linker ad-hoc signatures only. These artifacts are not
Developer-ID signed, notarized, published to the npm registry, or qualified as a
Production release. See [executor integration](../../docs/architecture/fab-executor.md)
for platform, qualification and authority limits.
