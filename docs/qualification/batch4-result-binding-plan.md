# Batch 4 Result binding correction

Base: b2b1958f28e8aae2b2c24089534e4c40cbe890cb. Scope: MC-2 result readback, stored admission correlation, observation cache and presentation. No execution authority or accounting state changes.

The authenticated MyEve readback will carry the original signed MissionControl admission receipt already held in PostgreSQL. MissionControl will look up its canonical receipt using the exact connection and command, compare the document, verify its original signature and envelope digest, and bind retention/readback to that canonical receipt. Receipt expiry limits new admission; it does not erase evidence of previously admitted Work. Revoked keys remain invalid. Missing historical envelopes fail closed until evidence is available; no replacement receipt is issued.

Owner-path status will distinguish verified producer Result from MyEve-reported settlement. The independently signed alpha readback contract is unchanged. Cache observations predating this binding are stale on the owner path.

Qualification: original Claude substitutions; genuine signed receipt; missing, foreign and altered receipt; retention/cache races; affected Convex and UI tests; browser presentation; independent exact-source review. Hosted CI follows verified deployment exclusions. No merge, deployment, real migration, custody operation or tester activation.

Evidence from the isolated successor: Claude's seven original reproduction tests pass on the vulnerable base (including acceptance of substituted command/receipt). The regression suite now rejects those substitutions. Full Convex: 190 files, 1791 tests passed. Permit UI: 8 passed. Actual component browser and WCAG 2.1 AA axe checks pass, with synthetic state; authenticated installed journey remains a separate gate.

Admission-key validity is evaluated at the original receipt's issue/expiry interval. An expired but unrevoked key can still authenticate historical evidence; current enrollment changes invalidate cached observations. A revoked or removed key cannot verify refreshed evidence. Historical receipt/key validity never authorizes new execution.
