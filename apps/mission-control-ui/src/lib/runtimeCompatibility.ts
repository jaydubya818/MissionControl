export type RuntimeCompatibility =
  | { status: "CHECKING" }
  | { status: "COMPATIBLE" }
  | {
      status: "RELOAD_REQUIRED";
      clientVersion: number;
      serverVersion: number;
    };

export function evaluateRuntimeCompatibility(
  clientVersion: number,
  serverVersion: number | undefined,
): RuntimeCompatibility {
  if (serverVersion === undefined) return { status: "CHECKING" };
  if (clientVersion === serverVersion) return { status: "COMPATIBLE" };
  return { status: "RELOAD_REQUIRED", clientVersion, serverVersion };
}

export function isRuntimeContractError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [
    "ArgumentValidationError",
    "Object contains extra field",
    "Could not find public function",
    "does not match the table name in validator",
    "does not match validator",
  ].some((marker) => message.includes(marker));
}
