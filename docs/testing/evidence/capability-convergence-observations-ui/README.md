# Inference observation inspector proof

Ten local component browser/accessibility checks pass across loading, empty,
stopped spending, stopped spending without an Attempt reservation and UNKNOWN
aggregate cost, at 1440px and
390px. The mobile receipt region supports keyboard scrolling. Desktop and
mobile screenshots were inspected. The report binds the exact component source
hash. Thirteen component tests and UI typecheck also pass.

Eight additional checks query actual persisted local Convex records through
`gateway:getAttemptEconomics` and render the returned data. UNKNOWN aggregate
money and a spending fence beside an older complete projection pass at both
widths in light/dark themes, with keyboard focus/scrolling, no page errors,
accessibility violations or page overflow. Query snapshots, source-bound report
and screenshots are retained under `persisted-browser/`. The backend uses
synthetic qualifications and an explicit fixture-project permission shim; it
does not prove full application authorization or real provider observations.

Two initial component regressions reproduced the missing spending stop. Browser
qualification then caught the existing scrolling region's missing keyboard
focus; adding a labeled, focusable region corrected it. Historical complete
outcome projections remain visible while the WorkOrder spending stop takes
precedence. A review regression added historical metric labels and a caveat.
Three further regressions reproduced unsafe totals and resurrection of older
estimates; aggregate money now stays Unknown. Rate-derived receipt money is
explicitly ESTIMATED.

The fixture renders the existing exported component with synthetic data. It
does not establish live service authority, real provider observations or human
acceptance. To reproduce, copy `fixture` to
`apps/mission-control-ui/.fdlc-observation-preview`, run the existing Vite server
on loopback port 5231, and run the retained browser proof with its repository
path updated for the qualification host. The persisted proof runs through the
backend harness's optional `--persisted-browser` callback before backend cleanup;
its initial trailing-slash URL failure remains in the backend evidence. The
temporary fixture was removed from
the application tree and its server stopped after qualification.

Raw red/green, typecheck and browser logs remain under
`/private/tmp/fdlc-observations-inspector-*` on the qualification host. The older
formula v1 projection in the fixture is intentional: a historical completed
projection must not hide a later WorkOrder spending stop.
