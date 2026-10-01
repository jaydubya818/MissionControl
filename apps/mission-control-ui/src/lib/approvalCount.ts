/**
 * Every surface that shows "how many approvals are pending" must read the same
 * window of data, otherwise the header, nav badge and Command Center disagree.
 */
export const PENDING_APPROVALS_LIMIT = 100;
