// Usage: node --env-file=.env.demo verification/deployment-smoke.mjs HTTPS_ORIGIN [--normal]
// --normal spends one Search request and up to three Fetch URLs. Never starts Research.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {safeURL} from '../server/provider.js';
const origin=new URL(process.argv[2]).origin;
assert.ok(origin.startsWith('https://'),'Use the public HTTPS origin.');
const secret=process.env.DEMO_ACCESS_PASSWORD;
assert.ok(secret,'Set DEMO_ACCESS_PASSWORD locally without committing it.');
const report={checkedAt:new Date().toISOString(),origin,checks:[],researchCreditConsumed:false};
const knownSecrets=[secret,...[1,2,3,4].map(i=>process.env[`TINYFISH_TEAM_${i}_KEY`]).filter(Boolean)];
async function check(label,path,status,options={}) {
  const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(135000),...options});
  const text=await response.text();
  assert.equal(response.status,status,label);
  assert.ok(!knownSecrets.some(value=>text.includes(value)),label+': secret must not appear in response');
  report.checks.push({label,status:response.status});
  return {response,text,json:()=>JSON.parse(text)};
}
await check('Public health','/health',200);
await check('Anonymous home redirects to login','/',303);
for(const path of ['/api/config','/api/history','/api/runs/00000000-0000-0000-0000-000000000000'])await check('Anonymous '+path,path,401);
await check('Anonymous Research start blocked','/api/ask',401,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({account:'team-1',mode:'research',question:'Must never start without authentication.'})});
await check('Anonymous cancel blocked','/api/runs/00000000-0000-0000-0000-000000000000/cancel',401,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
await check('Login page','/login',200);
await check('Incorrect password rejected','/login',401,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'password=invalid-demo-test'});
const login=await check('Correct password signs in','/login',303,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:secret}).toString()});
const fullCookie=login.response.headers.get('set-cookie');
for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(fullCookie.includes(flag),'Cookie '+flag);
const cookie=fullCookie.split(';')[0],headers={Cookie:cookie};
for(const path of ['/','/app.js','/style.css','/ui/logo.png','/ui/Aurora%20Lighthouse%20Over%20Tranquil%20Seas.png'])await check('Authenticated asset '+path,path,200,{headers});
for(const path of ['/.env','/.data/runs.json','/server/index.js'])await check('No file exposure '+path,path,404,{headers});
const config=(await check('Authenticated config','/api/config',200,{headers})).json();
assert.equal(config.accounts.length,4);assert.equal(config.hosted,true);
await check('Forged origin rejected','/api/history',403,{headers:{...headers,Origin:'https://untrusted.example'}});
await check('Missing mutation origin rejected','/api/ask',403,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
await check('Research input validation without starting a run','/api/ask',400,{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({account:'invalid',mode:'research',question:'Must never call the provider.'})});
await check('Research polling route validates missing ID','/api/runs/00000000-0000-0000-0000-000000000000',404,{headers});
await check('Research cancellation route validates missing ID','/api/runs/00000000-0000-0000-0000-000000000000/cancel',404,{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:'{}'});
if(process.argv.includes('--normal')) {
  const started=Date.now();
  const result=(await check('Live Normal MGNREGS benchmark','/api/ask',200,{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({account:'team-2',mode:'normal',question:'What was the Mahatma Gandhi NREGS budget estimate for FY 2024-25 in crore rupees?'})})).json();
  report.normal={id:result.id,status:result.status,latencyMs:Date.now()-started,searchRequests:result.searchRequests,fetchedUrls:result.fetchedUrls,sources:result.result?.sources};
  assert.equal(result.status,'COMPLETED');
  assert.ok(result.result.sources.length>0);
  assert.ok(result.result.sources.every(source=>safeURL(source.url,true)));
  report.normal.expectedEvidenceFound=result.result.sources.some(source=>source.excerpts.some(text=>/86,?000(?:\.00)?/i.test(text)));
}
const history=(await check('Authenticated shared history','/api/history',200,{headers})).json();
report.historyIds=history.map(row=>row.id);
if(report.normal)assert.ok(report.historyIds.includes(report.normal.id));
await fs.writeFile(new URL('./deployment-smoke.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,normal:report.normal?{...report.normal,sources:report.normal.sources.map(s=>({url:s.url,title:s.title,excerptCount:s.excerpts.length}))}:undefined},null,2));
