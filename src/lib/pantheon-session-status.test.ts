import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from './agent-tasks';

test('failed inference is inserted atomically as error', async () => {
  let inserted: Record<string, unknown> = {};
  const db = { insert: () => ({ values: (v: Record<string, unknown>) => { inserted = v; return { returning: async () => [{ id: 1, ...v }] }; } }) };
  const row = await createSession(db as never, { question: 'test', answer: 'timeout', status: 'error', errorText: 'timeout' });
  assert.equal(row.status, 'error');
  assert.equal(inserted.errorText, 'timeout');
});

test('existing callers still insert successful completed sessions', async () => {
  const db = { insert: () => ({ values: (v: Record<string, unknown>) => ({ returning: async () => [{ id: 1, ...v }] }) }) };
  const row = await createSession(db as never, { question: 'test', answer: 'Advice' });
  assert.equal(row.status, 'done');
  assert.equal(row.errorText, null);
});

test('completed session endpoint rejects queue status', async () => {
  await assert.rejects(() => createSession({} as never, { question: 'test', answer: 'answer', status: 'processing' as never }), /status must be/);
});
