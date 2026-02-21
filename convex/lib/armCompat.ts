export function isArmCompatMode(): boolean {
  const raw = (process.env.ARM_COMPAT_MODE ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

export function preferInstanceRefs(): boolean {
  return !isArmCompatMode();
}
