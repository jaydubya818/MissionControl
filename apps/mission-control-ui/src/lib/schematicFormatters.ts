/** Formatters mirroring waku-agent dashboard (render.js). */

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export function formatSeconds(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatRelativeSeconds(ts: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}
