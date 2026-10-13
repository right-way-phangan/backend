import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, updateSession } from './agent-tasks';

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

test('session endpoint rejects pending (queue belongs to /ask — poller would run it twice)', async () => {
  await assert.rejects(() => createSession({} as never, { question: 'test', answer: 'answer', status: 'pending' as never }), /status must be/);
});

test('bot may open a live session as processing without answer (agents patched during council)', async () => {
  let inserted: Record<string, unknown> = {};
  const db = { insert: () => ({ values: (v: Record<string, unknown>) => { inserted = v; return { returning: async () => [{ id: 1, ...v }] }; } }) };
  const row = await createSession(db as never, { question: 'test', answer: '', status: 'processing' });
  assert.equal(row.status, 'processing');
  assert.equal(inserted.answeredAt, null);
  await assert.rejects(() => createSession({} as never, { question: 'test', answer: '' }), /answer are required/);
});

test('agents patch is validated: id rw-…, status pending|working|done|error', async () => {
  let set: Record<string, unknown> = {};
  const db = { update: () => ({ set: (v: Record<string, unknown>) => { set = v; return { where: () => ({ returning: async () => [{ id: 1, ...v }] }) }; } }) };
  const agents = [{ id: 'rw-strategy', status: 'working' }, { id: 'rw-critic', status: 'pending' }];
  await updateSession(db as never, 1, { agents });
  assert.deepEqual(set.agents, agents);
  await assert.rejects(() => updateSession(db as never, 1, { agents: [{ id: 'zeus', status: 'done' }] }), /agents/);
  await assert.rejects(() => updateSession(db as never, 1, { agents: [{ id: 'rw-data', status: 'sleeping' }] }), /agents/);
});
