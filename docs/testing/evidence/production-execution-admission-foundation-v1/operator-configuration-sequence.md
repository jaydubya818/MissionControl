# Operator configuration sequence

Run this sequence only after the admission implementation has passed review,
merged, and deployed. All mutations must be performed by the authenticated
human roles required by the functions; do not use a service identity to
simulate human promotion.

1. Complete the GitHub App action in `github-app-readiness.md` and verify a
   canonical connected installation record for the controlled repository.
2. Register new workspace-owned production workflows through
   `workflows.registerProduction`. Every non-gate output schema must require a
   string `status`. Do not alter any of the 13 historical runs.
3. Register the two exact snapshots from `model-catalog-identities.json` with
   `modelCatalog.registerExactRoute`. Confirm that both records are
   `enabled: false`, `UNQUALIFIED`, and `DISABLED` after registration.
4. As a human approver, call `modelCatalog.promoteExactRoute` with the reviewed
   evidence reference/digest and explicit workload/risk scope. Record the two
   returned catalog IDs, route digests, and qualification digests. Registration
   alone is not evidence.
5. Create the certified hardened profile with
   `factory/configuration.createSandboxProfile`, using the exact image and
   security/toolchain data in the prior qualification packet, evidence packet
   digest, guest policy digest, 30,000 ms revocation bound, workload timeouts,
   and GREEN/YELLOW scope. Confirm `qualificationOnly: true`,
   `admissionState: QUALIFICATION_ONLY`, provider enforcement false, and guest
   enforcement true.
6. As a human approver, call
   `factory/configuration.promoteSandboxProfile` with the exact returned
   profile digest. Record the immutable admission digest and promoting human.
7. Configure the remaining canonical repository code scopes, approved agent
   versions, policy envelope, and independent verifiers. Create one Local and
   one Hardened Remote Factory Version, explicitly supplying the applicable
   `modelCatalogId` and remote `sandboxProfileId`. Record the returned IDs and
   verify their frozen configuration payloads.
8. Configure the worker with `CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON`.
   Each array entry must copy these exact server-created fields:

   ```json
   {
     "factoryDefinitionVersionId": "<server ID>",
     "factoryConfigurationDigest": "factory-v1-<8 hex>",
     "adapter": "codex",
     "version": "v1",
     "provider": "openai",
     "model": "<exact model>",
     "capabilityManifestSha256": "sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06",
     "effectiveConfigSha256": "94daa9e3e1ee5ce2e3d8ca9116ec29c1a1eb8d78e232d1abb383cbdf2e7d6081",
     "executionBackend": "persistent-worker or remote-sandbox",
     "modelRouteDigest": "<exact route digest>",
     "sandboxProfileDigest": "<remote only>",
     "repositoryId": "<canonical repository ID>"
   }
   ```

   The report fails if any value differs from the canonical Factory Version.
9. Assess readiness and activate only exact passing versions. Factory Version
   creation alone does not authorize execution.
10. Have a human select at most one exact Local canary and, if it passes, one
    exact Hardened Remote canary. Require WorkOrder → version → worker → Attempt
    → structured result → candidate → independent verification → acceptance
    eligibility. Stop on failure.
11. Only with the legitimate App installation, run the disposable controlled
    publication canary through the existing post-verification boundary. Do not
    merge it.

After each remote Attempt, require credential invalidation within 30 seconds,
exact VM absence, and final inventory zero. Do not enable Guarded Auto or begin
5+5 routing evidence until these bounded canaries pass.
