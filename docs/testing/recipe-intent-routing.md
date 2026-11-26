# Recipe recommendations preserve the requested action

## Scope

`recommendFactoryRecipe(request)` returns the existing
`FactoryRecipeRecommendation` shape: recipe ID, rationale, and signals. It
advises the Mission draft dialog. It does not dispatch a worker, approve a
Plan, or grant acceptance or publication authority.

Sensitive subject matter must not turn an answer-only or plan-only request into
an implementation recommendation. The requested action determines the
non-mutating recipe first. A request that also asks for a real change retains
the stronger sensitive-change workflow.

## Bounded routing rules

Keep the existing recipe catalog and fallback behavior. Recognize the existing
research, planning, and known-check cues before applying subject-matter risk.
When looking for requested changes, distinguish a separate action clause from
verbs inside an explanation or the subject of a plan. Common explicit negation
must not count as a positive change request. Separate positive change clauses
still take precedence over those non-mutating cues.

This remains an advisory heuristic. It does not claim complete natural-language
understanding. Mixed or unusual language can still require an operator override.
The existing draft-only write contract and override provenance remain unchanged.

## Verification plan

First run the added intent-collision cases against the original source and
retain the failure log. Then run the same cases after the repair, the existing
catalog cases, and the Mission draft component test. The component test proves
the payload remains a draft; it is not browser proof.

The parent task owns browser verification of the visible recommendation. Live
factory dispatch and the requested to-do application remain outside this
bounded regression check.

## Observed regression results

The new catalog collision cases were run against the original implementation
before editing it. The focused run reported **9 failed and 16 passed**. The
failed cases all returned `full-sdlc` where the declared request required Scout,
Plan, or Quality. Mixed sensitive-change cases already returned `full-sdlc`.
The raw result is `.audit/recipe-intent-before.log`.

The first repair passed all **27 tests** in the catalog and Mission draft
component suites. Two additional component cases verify that answer-only and
plan-only requests retain their recommended selection in the actual draft
payload, with no automatic dispatch, approval, or acceptance. The raw result
is `.audit/recipe-intent-after.log`.

```sh
npx --yes pnpm@9.0.0 --filter mission-control-ui exec vitest run \
  src/factoryExperience/recipeCatalog.test.ts \
  src/factoryExperience/CreateFactoryMissionDialog.test.tsx
```

The change recognizes separate positive change clauses, common explicit
negation, and verbs inside an explanation or plan subject. It retains the
existing non-mutating recommendations and applies sensitive-subject handling
after those routes. This is a bounded recommendation improvement, not an
execution-policy change or a guarantee for arbitrary language.

The UI package's `typecheck` command passes with exit code zero. Its raw log is
`.audit/recipe-intent-typecheck.log`. `git diff --check` also passes.

Visible browser behavior remains **UNVERIFIED**. The parent task reported that
the available Playwright installation has no Chromium binary and that the cloud
browser could not reach the isolated local fixture. The passing component
checks use jsdom. They do not close the repository's browser-verification gate
or establish merge readiness.

## Independent-review correction

The reviewer identified three mixed requests that the first repair incorrectly
routed to Scout. Each combined a research instruction with an explicit change
after `before you`, `while you`, or a colon. The reproduction in
`.audit/recipe-intent-review-before.log` records **3 failed and 29 passed**.
Those three cases returned Scout instead of the required full development
workflow.

The correction recognizes the two explicit action connectors and a positive
action verb at the start of the directive after a research colon. It retains
answer-only `how to` explanations and verbs used as the subject of a plan.
All **32 tests** now pass in `.audit/recipe-intent-review-after.log`. Earlier
logs remain unchanged. This correction stays within the advisory heuristic;
it does not establish complete understanding of arbitrary request grammar.
