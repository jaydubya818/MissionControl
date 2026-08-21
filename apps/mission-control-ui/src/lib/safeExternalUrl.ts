/**
 * Safe rendering of externally-sourced URLs.
 *
 * Pull-request links, CI run links, evidence locations, artifact
 * `externalLocation` values, and research source URLs all originate outside
 * Mission Control — from a harness, a repository, a webhook payload, or an
 * operator-typed field. React does not sanitize `href`, so a `javascript:` or
 * `data:` value there executes in the operator's authenticated session.
 *
 * `safeExternalUrl` returns `undefined` for anything that is not an absolute
 * http(s) URL, so the caller renders no link instead of a dangerous one.
 */
export function safeExternalUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(String(value).trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return url.toString();
}

/** `safeExternalUrl` restricted to HTTPS, for destinations that must be TLS. */
export function safeHttpsUrl(value: string | null | undefined): string | undefined {
  const url = safeExternalUrl(value);
  return url?.startsWith("https:") ? url : undefined;
}

/**
 * Open an externally-sourced URL in a new tab, or do nothing when the value is
 * not a safe http(s) destination. Always applies `noopener,noreferrer`.
 */
export function openExternalUrl(value: string | null | undefined): boolean {
  const safe = safeExternalUrl(value);
  if (!safe) return false;
  window.open(safe, "_blank", "noopener,noreferrer");
  return true;
}
