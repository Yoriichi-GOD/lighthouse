export const ROOTS = ['gov.in', 'nic.in', 'rbi.org.in', 'prsindia.org', 'sansad.in'];
export const LIMITS = Object.freeze({ searchPerDay: 12000, fetchUrlsPerDay: 1000, researchRunsPerDay: 5 });
export function safeURL(value, institutional = false) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (!institutional || ROOTS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))); } catch { return false; }
}
export class ProviderError extends Error {
  constructor(status, code, resetAt) {
    super(status === 401 ? 'This team credential was rejected.' : status === 403 ? 'This account is not permitted to use this service.' : [402,429].includes(status) ? 'This account has reached a provider limit. Wait for its reset; no account was switched.' : 'TinyFish could not complete the request.');
    this.status = status; this.code = code; this.resetAt = resetAt;
  }
}
export async function request(url, key, body, transport = fetch) {
  let response;
  try { response = await transport(url, { method: body ? 'POST' : 'GET', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) }); }
  catch { throw new Error('Connection interrupted. A Research start may still have been accepted; do not submit it again.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('TinyFish returned an unreadable response.'); }
  if (!response.ok) throw new ProviderError(response.status, /^[A-Z_]+$/.test(data.error?.code || '') ? data.error.code : 'UPSTREAM_ERROR', data.error?.details?.resets_at);
  return data;
}
export function excerpts(text, question) {
  const words = [...new Set(question.toLowerCase().match(/[a-z]{4,}/g) || [])];
  return text.split(/\n\s*\n/).filter(p => p.trim().length >= 40).map((p,i) => ({ text: p.slice(0,1400), i, score: words.filter(w=>p.toLowerCase().includes(w)).length }))
    .filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,3).map(p=>p.text);
}
export async function normal(question, key, transport = fetch, onUsage = () => {}) {
  const query = new URLSearchParams({ query: question, include_domains: ROOTS.join(','), location: 'IN', language: 'en' });
  onUsage({ searchRequests: 1 });
  const search = await request('https://api.search.tinyfish.ai?' + query, key, undefined, transport);
  if (!Array.isArray(search.results)) throw new Error('TinyFish search returned an unreadable result.');
  const candidates = [...new Map(search.results.filter(r=>safeURL(r.url,true)).map(r=>[r.url,r])).values()].slice(0,3);
  if (!candidates.length) return { sources: [], failures: [], message: 'No matching institutional sources were found. This does not establish that a claim is false.' };
  const fetched = await request('https://api.fetch.tinyfish.ai',key,{urls:candidates.map(r=>r.url),format:'markdown',ttl:0,per_url_timeout_ms:40000},transport);
  if (!Array.isArray(fetched.results)) throw new Error('TinyFish fetch returned an unreadable result.');
  onUsage({ fetchedUrls: fetched.results.length });
  const sources=[], failures=(fetched.errors||[]).map(r=>({url:candidates.find(c=>c.url===r.url)?.url||'',reason:'Source could not be retrieved.'}));
  for(const r of fetched.results) {
    if(!candidates.some(c=>c.url===r.url))continue;
    const url=r.final_url||r.url;
    if(!safeURL(url,true)||typeof r.text!=='string'||r.text.length<100){failures.push({url:r.url,reason:'Source redirected outside policy or returned insufficient text.'});continue;}
    if(sources.some(s=>s.url===url))continue;
    sources.push({url,title:String(r.title||url).slice(0,250),publishedAt:r.published_date||null,retrievedAt:new Date().toISOString(),excerpts:excerpts(r.text,question),truncated:r.text.length>40000});
  }
  return {sources,failures,message:'Source excerpts, not a generated answer. Matching keywords do not prove that a passage answers your question.'};
}
export function researchView(data) {
  const statuses=['QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED','TIMED_OUT'];
  if(!statuses.includes(data.status))throw new Error('Unknown Research status; no new run was started.');
  return {status:data.status,report:data.status==='COMPLETED'?String(data.deep_result?.result||''):null,
    citations:data.status==='COMPLETED'?(data.deep_result?.citations||[]).filter(u=>safeURL(u)):[],iterations:Number(data.iterations)||0,
    message:data.status==='COMPLETED'?'TinyFish-generated report. Citations and interpretations require review; quotations have not been independently verified.':'Research is not complete. No final answer is available.'};
}
