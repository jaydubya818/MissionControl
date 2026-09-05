# Independent verification

Date: 2026-09-05

## Disposition

`PASS`

The source implementation Attempt did not certify itself. A separate
Verification Attempt ran under the separately qualified verification Factory
and bound its checks to the exact immutable `LOCAL_GIT` subject.

- source Attempt: `ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg`
- verification Attempt: `ys726g569gsxcb65f1nxhzdjwd8dt39h`
- verification run: `nh7gt75yvpdckn9cgwzhhex3wn8dtw81`
- verification plan: `verification-plan:8fbec046c9cd2732700cef0d5aac6af871b254b4e751ed0b2824955aa60b26f4`
- candidate commit: `9111c11f00b85690a4bcf160e0fd32a6800208db`
- subject: `verification-subject:fa65de1665d100612a4a6464e95b7c768229484f95041135c4327c8d0704edfb`
- verdict: `VERIFIED`
- independence: `true`
- historical runtime currentness projection: `true` (superseded by release hardening)
- release acceptance currentness: `false`
- release acceptance eligibility: `false`
- WorkOrder receipt: `xh7ehfyk2evkh9wpq7ah1m645x8dv0f5`
- criterion receipt: `xh73mvyksay3pe4veyfece3xfs8dv990`
- decision-input digest: `sha256:a512648d62fb4815d898922fc31e4dd4e8151680897675b040c2e7c8cfe54a66`
- evidence-set digest: `sha256:f27210e66ab35ddefb20991c4175658e486223ce6ae68fb9d2b1e6159a8b5d4d`

The four independent evidence envelopes are
`nd7gxh3856pane6v62h4ajd07n8dvc2m`,
`nd7g67wsen0zamf1m4k61bxasd8dt2ky`,
`nd7h9kf1va0a7jvg44dq38qk6h8dv5t1`, and
`nd7x4wgg5f159jhv9nqxhta3c98dvrwa`.

The historical isolated runtime projected the result as immutable-local-current.
Independent review rejected that as insufficient reachability evidence. The
release evaluator preserves the `VERIFIED` outcome but returns non-current and
non-eligible for every `LOCAL_GIT` subject until a trusted publication
projection exists. This receipt therefore proves independent verification of
the exact candidate and carries no acceptance authority.
