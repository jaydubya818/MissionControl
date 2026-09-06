# Fab archive provenance

These are pinned build inputs for the opt-in **Experimental** Fab executor. This
Mission Control repository is public; the archives are publicly retrievable when
the source branch is published. “Private package” in historical build records
describes the original packaging workflow, not repository access control.

The active archive is `fdlc-fab-0.1.0-experimental.4.tgz`, built from FDLC source
`2708126850b591f089bde228b775be8172ba9df9`. Its SHA-256 is
`58a4409139e686dc0e132debd3130d7951a4bef6b37c2d3c557d2282ba6c4150`.
`apps/orchestration-server/src/fabRuntimePin.ts` records its exact installed
43-file closure. Earlier archives are retained as historical evidence.

The Fab source/package has no declared license. This vendoring change does not
relicense Fab under Mission Control's root MIT license or select a new Fab
license. Fab licensing remains an operator decision; public retrievability is
not a license grant. The archive bytes and original build metadata are preserved.

The native helpers have linker ad-hoc signatures only. These artifacts are not
Developer-ID signed, notarized, published to the npm registry, or qualified as a
Production release. See [executor integration](../../docs/architecture/fab-executor.md)
for platform, qualification and authority limits.
