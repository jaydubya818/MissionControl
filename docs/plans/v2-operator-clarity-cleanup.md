# V2 Operator Clarity Cleanup

## Goal

Make the V2 shell calm, decision-first, and navigable without removing
governance evidence or changing lifecycle semantics.

## Implementation

1. Consolidate the EOS navigation configuration into six job-oriented groups.
2. Add Work Order lifecycle tabs and default review-ready work to Review.
3. Keep exception banners above tabs and group every detail section by job.
4. Move destructive or infrequent lifecycle controls into a More menu.
5. Collapse long background context and normalize escaped newline text for
   display.
6. Improve shared detail metrics and tab wrapping on constrained screens.

## Acceptance criteria

- A user can identify the next Work Order action without scrolling.
- Approval, verification, PR review, and acceptance controls are in Review.
- Execution setup, tasks, and runs are in Tasks.
- Approvals, revisions, and events are in Audit trail.
- The primary sidebar contains no more than six domains.
- Mission metrics do not render as a long single-column stack on a constrained
  viewport.
- Literal escaped newline sequences do not appear in Mission or Work Order
  narrative text.
- Dark and light browser verification shows no console errors or failed
  requests introduced by the change.
