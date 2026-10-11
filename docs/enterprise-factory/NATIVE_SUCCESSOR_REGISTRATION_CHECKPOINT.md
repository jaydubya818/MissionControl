# Native runtime successor registration

Original image: UNAVAILABLE. Historical v1/v2 identities and evidence are unchanged.

The successor is explicitly version 3, sourced from 912e26ebd2b08c2c58f7cbfc1b903c1d52c4851e (pushed and remotely verified). The archive inspector verified:

| Identity | Exact value |
| --- | --- |
| OCI manifest | sha256:bddbcca962226a60fe962ccd5812b04b480064004b97e04a97f7166bc3be233a |
| Image configuration | sha256:dadde9fff32581d2ebad5eda80c675f4e69a0805c7dbd3952119735db0a6da0b |
| Retained archive | sha256:4b93462b2a5c8ac6408d613b0f01a8729cd15834caea08ca555727105e1634d0 |
| Bridge bundle | sha256:c914e0511e5781b0cd6822a312d2a129f5327e29d95adbf552aadcb4a011ffbd |
| Backend bundle | sha256:5b2a8f9beae65b309dd1852da4e2e1a524b92104d9a1d477192c1b2e8111f652 |
| Architecture / Node | linux/amd64 / v24.21.0 |
| Runtime / harness | 3 / 3 |

The exact source contains infra/native-runtime/Dockerfile and the context generator. Build used pinned base public.ecr.aws/docker/library/node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0, linux/amd64, network none, SOURCE_DATE_EPOCH=0, SOURCE_REVISION equal to the source above, provenance/SBOM disabled for a single directly inspectable OCI manifest. Context consists of Dockerfile, bridge.mjs and invocation-binding.json, with exact hashes retained in the artifact manifest. No registry publication occurred. No binary equivalence claim is made.

Registration selects v3 only when explicitly requested. Legacy defaults remain v2. The wrapper verifies the captured backend bytes and platform-specific Docker executable before use. Worker registry, frozen execution profiles and local sandbox admission require a matching exact versioned tuple. Canonical evidence consistency validation rejects v3 downgrade, mixed runtime identities, mutable aliases, changed source or configuration, and successful results without captured runtime/container image proof. Authenticated historical lease ingestion remains the separate authority boundary.

Four actual component controls passed through the built backend; all four also passed through the registered wrapper, exact host executable pin, registry and canonical evidence validator: exact verifier success, byte mismatch, cancellation and stale-result fencing. Cleanup was verified. These are COMPONENT_CONTROL records, not canonical Attempts or profile admission proof. Native admission, executed settlement, hybrid composition and hosted Linux Docker remain pending.

Affected checks: 29 Convex profile/evidence/local-sandbox tests and 56 orchestration composition/registry/loader/worker tests passed; orchestration TypeScript passed. Independent security review reproduced 67 targeted tests and inspected all eight actual control records; architecture review reproduced 58 targeted tests. Both found no blocker for this registration checkpoint. Bedrock has not been rerun at this checkpoint and its accepted baseline is preserved.

Next checkpoint uses the real disposable database and canonical WorkOrder dispatch, service-authenticated producer/verifier workers, retained execution evidence and enterprise reservation/settlement. Incomplete diagnostic image evidence cannot justify releasing executed exposure. Production integration NOT_RUN; paid operations 0; external-alpha changes 0; executable production grants 0.
