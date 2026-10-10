import { it, expect, vi } from 'vitest';
import { pollQualificationWorker } from './qualification-worker-poll.mjs';

it('does not traverse Git state while any worker attempt is active', async () => {
  let active = ['verifier'];
  const worker = { status: () => ({ activeRunIds: active }), tick: vi.fn() };
  const reportHost = vi.fn();
  await pollQualificationWorker({ worker, reportHost, refreshHost: true });
  expect(reportHost).not.toHaveBeenCalled(); expect(worker.tick).toHaveBeenCalledTimes(1);
  active = [];
  await pollQualificationWorker({ worker, reportHost, refreshHost: true });
  expect(reportHost).toHaveBeenCalledTimes(1); expect(worker.tick).toHaveBeenCalledTimes(2);
});
it('holds new attempt admission until the complete idle attestation resolves', async () => {
  let complete;
  const order = [], worker = { status: () => ({ activeRunIds: [] }), tick: vi.fn(async () => { order.push('tick'); }) };
  const reportHost = vi.fn(() => new Promise(resolve => { complete = () => { order.push('attested'); resolve(); }; }));
  const polling = pollQualificationWorker({ worker, reportHost, refreshHost: true });
  expect(reportHost).toHaveBeenCalledTimes(1); expect(worker.tick).not.toHaveBeenCalled();
  complete(); await polling; expect(order).toEqual(['attested', 'tick']);
});
it('preserves attestation failure and does not admit another attempt', async () => {
  const worker = { status: () => ({ activeRunIds: [] }), tick: vi.fn() };
  await expect(pollQualificationWorker({ worker, refreshHost: true,
    reportHost: async () => { throw Error('UNADMITTED_GIT_CONFIG'); } })).rejects.toThrow('UNADMITTED_GIT_CONFIG');
  expect(worker.tick).not.toHaveBeenCalled();
});
it('preserves the recovery cut and existing heartbeat cadence', async () => {
  const worker = { status: () => ({ activeRunIds: [] }), tick: vi.fn() }, reportHost = vi.fn();
  await pollQualificationWorker({ worker, reportHost, refreshHost: false });
  expect(reportHost).not.toHaveBeenCalled(); expect(worker.tick).toHaveBeenCalledTimes(1);
  await pollQualificationWorker({ worker, reportHost, refreshHost: true, poll: false });
  expect(reportHost).toHaveBeenCalledTimes(1); expect(worker.tick).toHaveBeenCalledTimes(1);
});
