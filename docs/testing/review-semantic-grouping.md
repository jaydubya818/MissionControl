# Advisory review grouping for application files

## Contract

Semantic change groups help a reviewer inspect the delivered diff. They are
deterministic, advisory projections. They do not grant acceptance authority or
replace planned risk and exact-candidate verification.

A file must not be classified as UI solely because it lives in an application's
`src` directory. UI file extensions and explicit component, view, page, UI, or
style directories remain useful indicators. Ambiguous files can stay in the
existing Other group. No new taxonomy is needed for this repair.

## Reproduction and coverage

At baseline `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`, the UI rule includes
`apps?\/[^/]+\/src`. That classifies orchestration workers and dependency
preparation as UI. The regression uses two actual orchestration source paths
and a representative API server path. It also preserves real UI indicators,
the higher-priority Authentication group, raw diff lineage, and advisory status.

Run the focused suite from the repository root.

```sh
npx --yes pnpm@9.0.0 exec vitest run convex/__tests__/reviewIntelligence.test.ts
```

The before and after logs are retained with the delivery evidence. This is a
backend projection repair. It does not establish live application generation,
browser acceptance, or any change to the hosted installation.
