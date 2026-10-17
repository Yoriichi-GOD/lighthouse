import test from 'node:test';
import assert from 'node:assert/strict';
import { normal, researchView, safeURL } from '../server/provider.js';

test('source policy accepts only HTTPS institutional hosts', () => {
  assert.equal(safeURL('https://www.rbi.org.in/page'), true);
  assert.equal(safeURL('https://fakegov.in.example.com/page', true), false);
  assert.equal(safeURL('http://rbi.org.in/page', true), false);
  assert.equal(safeURL('https://evil.example/page', true), false);
  assert.equal(safeURL('https://user:pass@prsindia.org/page', true), false);
});

test('Normal returns source excerpts and never accepts off-policy search or redirect URLs', async () => {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('https://api.search.tinyfish.ai')) return new Response(JSON.stringify({ results: [
      { title: 'PRS source', url: 'https://prsindia.org/billtrack/example' },
      { title: 'Off-policy result', url: 'https://example.com/not-official' },
      { title: 'Unsafe scheme', url: 'http://rbi.org.in/page' }
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ results: [
      { url: 'https://prsindia.org/billtrack/example', final_url: 'https://prsindia.org/billtrack/example', title: 'PRS source', text: 'The policy requirement is described here in detail. The proposed policy requirement applies to all listed departments and public bodies.' },
      { url: 'https://prsindia.org/redirected', final_url: 'https://example.com/redirected', title: 'Redirected source', text: 'This is enough text to pass the minimum text length check, but the destination must be rejected.' }
    ], errors: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const usage = [];
  const result = await normal('What is the policy requirement?', 'test-key', transport, delta => usage.push(delta));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].init.body).urls, ['https://prsindia.org/billtrack/example']);
  assert.equal(result.sources.length, 1);
  assert.ok(result.sources[0].excerpts[0].includes('policy requirement'));
  assert.match(result.message, /not a generated answer/);
  assert.deepEqual(usage, [{ searchRequests: 1 }, { fetchedUrls: 2 }]);
});

test('Research keeps every safe HTTPS citation and drops unsafe schemes', () => {
  const result = researchView({
    status: 'COMPLETED',
    deep_result: { result: 'Report text', citations: ['https://rbi.org.in/page', 'https://news.example/article', 'javascript:alert(1)'] },
    iterations: 3
  });
  assert.equal(result.report, 'Report text');
  assert.deepEqual(result.citations, ['https://rbi.org.in/page', 'https://news.example/article']);
  assert.equal(result.iterations, 3);
});
