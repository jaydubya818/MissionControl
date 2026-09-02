---
date: 2026-08-30
topic: v2-operator-clarity
---

# V2 Operator Clarity

## What We're Building

Reorganize the V2 operator shell around the governed delivery lifecycle. The
interface should foreground the current decision, next safe action, and proof,
while keeping configuration and immutable history available on demand.

## Why This Approach

The current shell exposes too many product domains at once, and Work Order
detail renders every lifecycle record in one continuous page. A job-oriented
sidebar plus lifecycle tabs is the smallest change that materially improves
orientation without changing authoritative data or workflow behavior.

## Key Decisions

- Six primary domains: Overview, Plan, Delivery, Review, Knowledge, and System.
- Five Work Order views: Overview, Review, Scope, Tasks, and Audit trail.
- Review is the default Work Order view when a candidate package exists.
- Primary decisions stay visible; maintenance actions move into a More menu.
- Long background context and historical data use progressive disclosure.
- Shared detail layouts use compact two-column metrics and wrapped tab controls
  on constrained screens.

## Open Questions

- None blocking. Preview-only destinations remain routable but do not compete
  with the V1 golden path in primary navigation.

## Next Steps

Implement and verify the Mission and Work Order golden path in dark and light
themes at constrained and desktop widths.
