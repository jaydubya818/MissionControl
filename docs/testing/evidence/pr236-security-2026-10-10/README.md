# PR 236 security remediation evidence

Implementation commit: 56ea1ad. These local results cover its dependency graph
and SDK identity fixes. Final-SHA CI is linked from PR #236 after completion.

The complete workspace regression passed, including 1,503 Convex and 813
orchestration tests, with the new broker regression separately passing all 17
tests. Full workspace typechecking and unchanged release-security gates passed.
A second frozen offline installation left the lockfile unchanged. Lockfile
SHA256: 9df07b50f18679eb13657dd360088c76405e7bfd73f4a2edab4a60b41fb3d7d9.

All four real Research Lab Docker lifecycle cases passed using synthetic provider
responses and the archived full-repository fixture. Each cleanup receipt confirms
resource absence. No paid inference occurred. The standard-image Docker tests
could not qualify because pinned images 32951f1b… and 11ea5f88… are absent. Their
failed output is retained separately; no identity substitution or waived test.
The Research Lab image remains pinned at 7a36977d…. This is host-dependency
regression evidence, not a newly built image or live SDK/tool qualification.

The separate security reviewer approved after the SDK identity finding was
fixed. See independent-review.md. Existing live qualification and budget holds
remain unchanged. No merge or deployment was performed.
