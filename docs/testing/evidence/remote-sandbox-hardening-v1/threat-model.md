# Remote Sandbox restricted-candidate threat model

## Scope and assumptions

This model covers the existing host `RemoteSandboxRuntime`, `SandboxProvider`, exe.dev adapter, uploaded root bootstrap/supervisor, one disposable VM per Attempt, Attempt-scoped OpenRouter credential, and returned result bundle. Repository content, prompts, model output, executor output, and the result bundle are adversarial inputs.

Validated assumptions:

- the sandbox receives only an expiring, cost-limited Attempt inference key;
- OpenRouter management, exe.dev administration, GitHub App, Mission Control service, verification, acceptance, publication, merge, and deployment authority remain host-only;
- exe.dev supports custom OCI images but currently exposes no provider-level egress/firewall control in the inspected interfaces;
- guest nftables is defense in depth and cannot be treated as a provider boundary;
- the provider and guest kernel remain trusted for VM isolation and teardown; and
- the candidate image is not certifiable while High/Critical findings remain.

## Assets

- repository source and authorized patch scope;
- WorkOrder/Attempt/lease/manifest identity;
- inference credential and spend cap;
- host-only credentials and governance authority;
- verification and acceptance integrity;
- provider resources, inventory, and cleanup proof;
- terminal diagnostics, result provenance, and audit records.

## Trust boundaries

1. **Mission Control host → exe.dev control plane:** authenticated provisioning, inspection, SSH transport, and exact deletion.
2. **Host → disposable VM root bootstrap:** frozen image, source bundle, manifest, supervisor, schema, and the one Attempt credential.
3. **Trusted guest root → untrusted UID 10001 executor:** toolchain verification, workspace ownership, nftables, `setpriv`, and `no_new_privs`.
4. **Untrusted VM → host validator:** diagnostics, structured result, binary diff, timing, and usage are untrusted until exact identity/content validation.
5. **Host validator → independent verifier/governance:** materialized candidate is independently verified; acceptance and publication remain separate host decisions.

## Threats, controls, and residual risk

| Threat | Control | Residual risk |
| --- | --- | --- |
| Arbitrary data exfiltration | UID-scoped deny-by-default nftables; only frozen OpenRouter IPs:443; DNS denied | Guest root/kernel escape can alter policy; provider does not enforce egress. |
| Cloud metadata/private-network access | Reserved-address rejection plus UID catch-all deny; negative probes | Cannot claim provider network segmentation independently of guest policy. |
| DNS rebinding | Root resolves before work, rejects reserved results, writes `/etc/hosts`, then denies executor DNS | OpenRouter/CDN IP rotation during an Attempt can cause availability failure; startup fails closed. |
| Toolchain substitution | Exact provider image string, Node/Codex versions, native Codex SHA, toolchain-input SHA, UID/GID checked before work | Provider-reported image identity was not live-tested with the unpublished candidate. |
| Malicious runtime installation | Codex and Git are image-baked; npm/npx removed; no package-registry egress | Candidate build itself depends on external package repositories and must pass provenance/scan gates. |
| Host credential theft | Only two inference variables cross the boundary; automatic integrations block allocation; manifest grants no GitHub/provider authority | A model can spend the bounded Attempt key until expiry/revocation. |
| Cross-Attempt data retention | One Attempt per resource, fresh workspace, deletion with exact absence proof; local fresh-container negative test | Candidate-specific exe.dev reuse/absence was not live-qualified. |
| Process survival after cancel | Dedicated process group, TERM/KILL fallback, typed cancellation result, exact VM deletion | Provider/guest failure can still require host reconciliation and deletion. |
| Result spoofing | Exact Attempt/WorkOrder/run/manifest/profile/source/harness/environment binding plus content digest and independent verification | VM output remains untrusted; validation bugs remain in host trusted computing base. |
| Log-based secret disclosure/DoS | Stream capture bounded to 1 MiB tails, full byte counts/digests, redaction before 16 KiB persistence | Unrecognized secret formats can evade pattern redaction; secret values must not be logged. |
| Vulnerable base/toolchain | Pinned base/image candidate, SBOM, Grype High gate before push, provenance workflow | Current candidate fails with seven High findings and is not publishable. |
| Unauthorized acceptance/publication | Sandbox manifest grants none; canonical host paths unchanged; qualification-only routing exclusion | Host-side authority implementation remains security-critical and was regression-tested, not redesigned. |

## Decision-driving residuals

The provider-enforcement gap and seven unresolved High findings independently prevent promotion. Even after image fixes, live proof must still establish exact provider-reported digest behavior, one-Attempt-per-resource isolation, credential revocation, process-group cancellation, exact teardown, zero inventory, and three representative first-pass workloads.
