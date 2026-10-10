import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'vitest';
const require = createRequire(import.meta.url);
const taskmaster = createRequire(require.resolve('@taskmasterai/cli'));
const anthropic = createRequire(taskmaster.resolve('@ai-sdk/anthropic'));
const utils = anthropic('@ai-sdk/provider-utils');
const handlers = [
  ['JSON success', utils.createJsonResponseHandler({})],
  ['JSON error', utils.createJsonErrorResponseHandler({ errorSchema: {}, errorToMessage: () => 'error' })],
  ['status error', utils.createStatusCodeErrorResponseHandler()],
];
for (const [name, handler] of handlers) {
  test(`Taskmaster ${name} rejects an oversized provider body before reading it`, async () => {
    let read = false;
    const body = new ReadableStream({ pull() { read = true; throw Error('body must not be read'); } }, { highWaterMark: 0 });
    const response = new Response(body, { status: 500, headers: { 'content-length': '2147483649' } });
    await assert.rejects(handler({ response, url: 'https://offline.invalid', requestBodyValues: {} }), /exceeded maximum size/);
    assert.equal(read, false);
  });
}
