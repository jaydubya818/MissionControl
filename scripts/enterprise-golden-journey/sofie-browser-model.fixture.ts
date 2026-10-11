// Isolated source-copy overlay only. Never a deployable model selection.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { defineAgent, defineDynamic } from 'eve';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
export default defineAgent({
  build: { externalDependencies: ['@remotion/bundler', '@remotion/renderer', 'heif2jpeg'] },
  model: defineDynamic({ events: {
    'turn.started': () => ({ model: 'openai/gpt-4o', modelContextWindowTokens: 128000 }),
    'step.started': () => ({ modelContextWindowTokens: 128000, model: new MockLanguageModelV4({
      modelId: 'composed-golden-deterministic-fixture',
      doStream: async ({ prompt }) => {
        const last = prompt.at(-1), answer = last?.role === 'tool';
        const parts = answer ? [
          { type: 'text-start' as const, id: 'result' },
          { type: 'text-delta' as const, id: 'result', delta: 'Deterministic Sofie readback from the actual tool: ' + JSON.stringify(last.content) },
          { type: 'text-end' as const, id: 'result' },
        ] : [{ type: 'tool-call' as const, toolCallId: randomUUID(), toolName: 'mission_control', input: await readFile(process.env.MC_COMPOSED_BROWSER_INPUT!, 'utf8') }];
        return { stream: convertArrayToReadableStream([{ type: 'stream-start', warnings: [] }, ...parts,
          { type: 'finish', finishReason: { unified: answer ? 'stop' : 'tool-calls', raw: answer ? 'stop' : 'tool_calls' }, usage }]) };
      },
    }) }),
  } }),
});
