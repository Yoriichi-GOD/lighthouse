import { writeFile } from 'node:fs/promises';
import { normal } from '../server/provider.js';

const cases = [
  {
    id: 'pmjdy-launch-date', account: 1,
    question: 'When was the Pradhan Mantri Jan Dhan Yojana (PMJDY) launched nationally?',
    expected: [/28[^\d]{0,30}(?:August|Aug)[^\d]{0,12}2014/i, /28\.8\.2014/i], mode: 'any'
  },
  {
    id: 'mgnrega-release-as-of-date', account: 3,
    question: 'How much had been released under Mahatma Gandhi NREGS for FY 2024-25 as of 28 January 2025?',
    expected: [/82\s*,?\s*421(?:\s*\.\s*05)?/i], mode: 'any'
  },
  {
    id: 'pmjdy-account-features', account: 4,
    question: 'What basic account features and benefits does Pradhan Mantri Jan Dhan Yojana offer?',
    expected: [/zero balance|without any minimum balance/i, /RuPay/i, /10\s*,?\s*000/i], mode: 'all'
  }
];
const keys = Object.fromEntries([1, 2, 3, 4].map(i => [i, process.env[`TINYFISH_TEAM_${i}_KEY`]]));
const output = { startedAt: new Date().toISOString(), caveat: 'Repeat diagnostic to inspect excerpts for initial matcher misses; this is not independent benchmark data.', cases: [] };
for (const item of cases) {
  const t0 = Date.now();
  try {
    const result = await normal(item.question, keys[item.account]);
    const excerptText = result.sources.flatMap(source => source.excerpts);
    const evidenceFound = item.mode === 'all'
      ? item.expected.every(re => re.test(excerptText.join('\n')))
      : item.expected.some(re => re.test(excerptText.join('\n')));
    output.cases.push({
      id: item.id, account: item.account, latencyMs: Date.now() - t0,
      sourceCount: result.sources.length, failureCount: result.failures.length,
      evidenceFound, sources: result.sources.map(source => ({
        host: new URL(source.url).hostname, title: source.title,
        excerpts: source.excerpts.map(text => text.slice(0, 1400))
      })), failures: result.failures.map(({ reason }) => ({ reason }))
    });
  } catch (error) {
    output.cases.push({ id: item.id, account: item.account, latencyMs: Date.now() - t0, error: error.message, code: error.code || null });
  }
}
output.finishedAt = new Date().toISOString();
await writeFile(new URL('./normal-benchmark-recheck.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
