/** Normalize escaped newlines found in imported narrative fields for display. */
export function normalizeNarrativeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\\n/g, "\n");
}
