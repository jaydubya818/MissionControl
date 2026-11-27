// Classify only explicit registry authorization failures. Do not publish Docker
// stderr, which may contain credential-helper details or private environment data.
export function runtimePullFailure(error) {
  const stderr = String(error?.stderr ?? '');
  const authorizationDenied = /(?:unauthorized: authentication required|denied: denied|denied: permission_denied|unexpected status[^\n]*: (?:401 Unauthorized|403 Forbidden))/i.test(stderr);
  return authorizationDenied
    ? { status: 'NOT_RUN', reason: 'GHCR explicitly denied registry authorization. The invoking repository requires package-level Actions Read access and workflow packages:read for its GITHUB_TOKEN. No package write or administration permission is required.' }
    : { status: 'FAIL', reason: 'Pinned runtime pull failed without a confirmed registry authorization denial. Digest, transport, Docker availability, and other retrieval failures require investigation; package permission is not established as the cause.' };
}
