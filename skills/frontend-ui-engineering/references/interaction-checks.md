# Interaction checks

Choose cases from the changed interaction, not a fixed ceremony for every edit.

| Situation | Observable result |
| --- | --- |
| Initial load or slow response | Layout remains usable, pending state is clear, no false empty result. |
| Empty authorized result | Explains what is empty and offers an available next step. |
| Validation failure | Preserves input, identifies the field, associates its error, and exposes it to assistive technology. |
| Request failure or expired session | Gives an honest recoverable action without losing unsaved work or exposing protected data. |
| Rapid repeated submission | Produces one intended effect and a clear pending or completed state. |
| Mutation timeout | Shows uncertainty and reconciles status before retrying an irreversible effect. |
| Navigation during a request | Old results cannot overwrite the new screen or another user's state. |
| Keyboard-only use | Logical order, visible unobscured focus, every action reachable, no accidental trap. |
| Modal open and close | Focus enters appropriately, stays inside while modal, then returns sensibly. |
| Zoom and narrow layout | Content reflows, important actions remain reachable, no clipped error messages. |
| Long names, translations, or large values | Layout remains readable with realistic wrapping and number formatting. |
| Screen-reader use | Names, roles, values, headings, and status changes convey the flow. |
| Reduced motion or touch input | Essential feedback remains available; controls do not depend on hover or animation. |

Record the browser, viewport, input method, fixture, and actual result for the
cases exercised. An unavailable test is a limitation, not a pass. Screenshots
show appearance; they cannot prove keyboard behavior or mutation correctness.
