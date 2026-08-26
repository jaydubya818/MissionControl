/**
 * Telegram control is disabled for V1 until Telegram accounts are durably
 * bound to Mission Control operators or a scoped signed service identity.
 */

console.error(
  "The Mission Control Telegram runtime is disabled for V1. Use the authenticated operator UI.",
);
process.exitCode = 1;
