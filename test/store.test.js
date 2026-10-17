import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';

function memoryStore() {
  const store = new Store('not-written-by-this-test.json');
  store.save = () => {};
  return store;
}

test('Research allowance is tracked per account and releases failed runs', () => {
  const store = memoryStore();
  const rows = Array.from({ length: 5 }, (_, index) => store.reserve('team-1', 'research', `Question ${index}`));
  assert.equal(store.usage('team-1'), 5);
  assert.equal(store.usage('team-2'), 0);
  assert.throws(() => store.reserve('team-1', 'research', 'One too many'), /local Research limit/);
  store.update(rows[0], { status: 'FAILED' });
  assert.equal(store.usage('team-1'), 4);
  assert.equal(store.reserve('team-1', 'research', 'Replacement run').status, 'STARTING');
  assert.equal(store.usage('team-1'), 5);
});

test('Normal usage separates search calls and successfully fetched URLs by account', () => {
  const store = memoryStore();
  const row = store.reserve('team-1', 'normal', 'Question about policy');
  store.update(row, { searchRequests: 1, fetchedUrls: 2 });
  assert.deepEqual(store.normalUsage('team-1'), { searchRequests: 1, fetchedUrls: 2 });
  assert.deepEqual(store.normalUsage('team-2'), { searchRequests: 0, fetchedUrls: 0 });
});

test('Local history survives a Store restart and can be updated', t => {
  const dataRoot = path.resolve(process.cwd(), '.data');
  const directory = path.join(dataRoot, `persistence-${randomUUID()}`);
  fs.mkdirSync(directory, { recursive: true });
  t.after(() => {
    if (directory.startsWith(dataRoot + path.sep)) fs.rmSync(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'runs.json');
  const first = new Store(file);
  const row = first.reserve('team-1', 'normal', 'Where is the source?');
  first.update(row, { status: 'COMPLETED', searchRequests: 1, fetchedUrls: 1 });
  const restarted = new Store(file);
  assert.equal(restarted.rows[0].question, 'Where is the source?');
  assert.deepEqual(restarted.normalUsage('team-1'), { searchRequests: 1, fetchedUrls: 1 });
  restarted.update(restarted.rows[0], { fetchedUrls: 2 });
  assert.equal(new Store(file).rows[0].fetchedUrls, 2);
});
