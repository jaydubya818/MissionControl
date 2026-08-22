# Admission failure matrix

All expected failures are fail-closed.

| Case | Boundary/result |
| --- | --- |
| Missing GitHub App installation | readiness/dispatch/claim/publication blocked |
| Wrong installation or repository | canonical GitHub installation validation blocked |
| Model catalog identity mismatch | route digest/snapshot or Factory-version comparison blocked |
| Disabled or unqualified model | `modelRouteProductionEligible` false |
| Unpromoted Sandbox Profile | `QUALIFICATION_ONLY` is not production eligible |
| Wrong image digest | certified profile, route/profile match, or manifest binding blocked |
| Stale toolchain digest | certified profile or exact route/harness binding blocked |
| Unsupported risk/workload | promotion scope and Factory creation blocked |
| Malformed workflow status | compatibility status unresolved; execution ineligible |
| Legacy workflow record | preserved for reads; execution ineligible |
| Missing worker | readiness/dispatch blocked |
| Worker capability mismatch | existing harness/capability checks blocked |
| Worker Factory Version mismatch | `worker-factory-version-mismatch` |
| Repository mismatch | worker registration/admission and dispatch blocked |

Focused tests cover exact route mutation, qualification-only rejection,
promotion digest tampering, stale profile identity, exact worker mismatch,
legacy workflow projection, malformed terminal history, manifest route mismatch,
GitHub App readiness, and the full isolated Factory qualification.
