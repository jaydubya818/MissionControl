import { it, expect } from 'vitest';
import { installedMaxDurationSeconds } from '../../packages/shared/src/executionPermit';
it('defaults to the existing 180 s installed cap', () => { expect(installedMaxDurationSeconds(undefined)).toBe(180); expect(installedMaxDurationSeconds('')).toBe(180); });
it('an operator may raise it up to the 600 s owner-local Work cap', () => { expect(installedMaxDurationSeconds('600')).toBe(600); expect(installedMaxDurationSeconds('300')).toBe(300); });
it('refuses anything above 600 s, non-integers and malformed values', () => {
  for (const raw of ['601', '3600', '0', '-1', '180.5', '1e3', ' 600', 'abc', '0600']) expect(() => installedMaxDurationSeconds(raw), raw).toThrow();
});
