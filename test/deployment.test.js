import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server/index.js';
import { configuration, demoAccess, RateLimit } from '../server/security.js';

const password = 'test-only-demo-password-not-a-secret';
const origin = 'https://demo.example';
const envBase = {NODE_ENV:'production', APP_ORIGIN:origin, DEMO_ACCESS_PASSWORD:password, TINYFISH_TEAM_1_KEY:'test-provider-secret'};

test('production fails closed; development remains loopback; Railway domain is explicit', () => {
  assert.throws(()=>configuration({NODE_ENV:'production'}), /APP_ORIGIN/);
  assert.throws(()=>configuration({NODE_ENV:'production',APP_ORIGIN:origin}), /DEMO_ACCESS_PASSWORD/);
  for(const value of ['http://demo.example','https://user:pass@demo.example','https://demo.example/path']) assert.throws(()=>configuration({...envBase,APP_ORIGIN:value}),/HTTPS origin/);
  const local=configuration({}); assert.equal(local.bind,'127.0.0.1');assert.equal(local.port,5175);
  const prod=configuration({...envBase,APP_ORIGIN:'',RAILWAY_PUBLIC_DOMAIN:'demo.up.railway.app',PORT:'8080'});
  assert.equal(prod.bind,'0.0.0.0');assert.equal(prod.port,8080);assert.ok(prod.hosts.has('demo.up.railway.app'));
  assert.ok(!prod.hosts.has('other.up.railway.app'));
});

test('session is signed, expires, and is invalidated by password rotation', () => {
  const auth=demoAccess(configuration(envBase));const now=Date.now();
  const cookie=auth.cookie(now).split(';')[0];
  assert.equal(auth.authorized({headers:{cookie}},now),true);
  assert.equal(auth.authorized({headers:{cookie:cookie+'x'}},now),false);
  assert.equal(auth.authorized({headers:{cookie}},now+8*3600000),false);
  assert.equal(demoAccess(configuration({...envBase,DEMO_ACCESS_PASSWORD:password+'rotated'})).authorized({headers:{cookie}},now),false);
});

test('bounded rate counter recovers after its window', () => {
  const limiter=new RateLimit(2,100);assert.ok(limiter.allow(1));assert.ok(limiter.allow(2));assert.equal(limiter.allow(3),false);assert.ok(limiter.allow(101));
});

test('production HTTP access, lifecycle, persistence and rate limits (mock TinyFish)', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lighthouse-deploy-test-'));
  const calls=[];
  let researchStatus='RUNNING';
  const transport=async(url,options)=>{
    calls.push({url,method:options.method});
    const data=url.startsWith('https://api.search.')?{results:[{url:'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2099787'}]}:
      url.startsWith('https://api.fetch.')?{results:[{url:'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2099787',title:'Budget allocation',text:'For the financial year 2024-25, budget allocation of Rs. 86,000 crores have been made at Budget Estimate (BE) stage under Mahatma Gandhi NREGS.'}]}:
      url.includes('run-research-async')?{research_run_id:'provider-private-id'}:
      {status:url.endsWith('/cancel')?'CANCELLED':researchStatus,deep_result:{result:'Mock report',citations:['https://www.pib.gov.in/']}};
    return new Response(JSON.stringify(data),{status:200});
  };
  const env={...envBase,DATA_DIR:dir};
  let app=createApplication({env,transport});
  let server=app.server;server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  const send=(url,options={})=>new Promise((resolve,reject)=>{
    const {method='GET',headers={},body}=options;
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method,headers:{Host:'demo.example',...headers}},res=>{
      let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)}));
    });req.on('error',reject);req.end(body);
  });
  let cookie;
  const post=(url,data)=>send(url,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
  await t.test('health is public but healthcheck host cannot reach API; Host/Origin cannot be spoofed',async()=>{
    assert.equal((await send('/health')).status,200);
    assert.equal((await send('/health',{headers:{Host:'healthcheck.railway.app'}})).status,200);
    assert.equal((await send('/api/history',{headers:{Host:'healthcheck.railway.app'}})).status,403);
    assert.equal((await send('/health',{headers:{Host:'evil.example','X-Forwarded-Host':'demo.example'}})).status,403);
    assert.equal((await send('/health',{headers:{Origin:'https://evil.example'}})).status,403);
  });
  await t.test('anonymous API, reports, static assets and private paths are protected',async()=>{
    for(const url of ['/api/config','/api/history','/api/runs/1234','/api/runs/1234/cancel'])assert.equal((await send(url)).status,401);
    for(const url of ['/','/app.js','/.env','/.data/runs.json'])assert.equal((await send(url)).status,303);
    assert.equal((await send('/api/ask',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,401);
    assert.equal(calls.length,0);
  });
  await t.test('login requires origin and correct secret; cookie has security flags',async()=>{
    const page=await send('/login');assert.equal(page.headers['referrer-policy'],'same-origin');
    const login={method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password}).toString()};
    assert.equal((await send('/login',login)).status,403);
    assert.equal((await send('/login',{...login,headers:{...login.headers,Origin:'null'}})).status,403);
    assert.equal((await send('/login',{...login,headers:{...login.headers,Origin:'https://evil.example'}})).status,403);
    assert.equal((await send('/login',{...login,headers:{...login.headers,Origin:origin},body:'password=wrong'})).status,401);
    const result=await send('/login',{...login,headers:{...login.headers,Origin:origin}});assert.equal(result.status,303);
    const fullCookie=result.headers['set-cookie'][0];for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(fullCookie.includes(flag));
    cookie=fullCookie.split(';')[0];
  });
  await t.test('authorized HTML/assets/config work without exposing secrets or server files',async()=>{
    for(const url of ['/','/app.js','/style.css','/ui/logo.png','/ui/Aurora%20Lighthouse%20Over%20Tranquil%20Seas.png'])assert.equal((await send(url,{headers:{Cookie:cookie}})).status,200);
    const config=await send('/api/config',{headers:{Cookie:cookie}});assert.equal(config.status,200);assert.equal(config.json().accounts.length,1);assert.ok(!config.text.includes('test-provider-secret'));
    for(const url of ['/.env','/.data/runs.json','/server/index.js','/constructor'])assert.equal((await send(url,{headers:{Cookie:cookie}})).status,404);
  });
  await t.test('mutation origin and body limits apply before provider calls',async()=>{
    assert.equal((await send('/api/ask',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await post('/api/ask',{question:'x'.repeat(11000)})).status,413);
    assert.equal(calls.length,0);
  });
  await t.test('Normal and asynchronous Research start, poll, concurrency guard and cancel are preserved',async()=>{
    const normal=await post('/api/ask',{account:'team-1',mode:'normal',question:'What was the MGNREGS Budget Estimate for 2024-25?'});
    assert.equal(normal.status,200);assert.match(normal.text,/86,000/);assert.equal(normal.json().searchRequests,1);
    const start=await post('/api/ask',{account:'team-1',mode:'research',question:'Research the MGNREGS Budget Estimate.'});
    assert.equal(start.status,200);assert.equal(start.json().status,'QUEUED');assert.ok(!start.text.includes('provider-private-id'));
    const id=start.json().id;
    assert.equal((await post('/api/ask',{account:'team-1',mode:'research',question:'Do not start a duplicate Research run.'})).status,409);
    assert.equal((await send('/api/runs/'+id,{headers:{Cookie:cookie}})).json().status,'RUNNING');
    assert.equal((await post('/api/runs/'+id+'/cancel',{})).json().status,'CANCELLED');
    assert.equal(calls.filter(c=>c.url.includes('run-research-async')).length,1);
  });
  await t.test('start limiter rejects excess work before TinyFish',async()=>{
    for(let i=0;i<4;i++)assert.equal((await post('/api/ask',{account:'team-1',mode:'normal',question:'What is the MGNREGS Budget Estimate?'})).status,200);
    const before=calls.length;assert.equal((await post('/api/ask',{account:'team-1',mode:'normal',question:'What is the MGNREGS Budget Estimate?'})).status,429);assert.equal(calls.length,before);
  });
  await t.test('history and valid session survive process restart with the same directory and secret',async()=>{
    const before=(await send('/api/history',{headers:{Cookie:cookie}})).json();assert.equal(before.length,6);
    await new Promise(resolve=>server.close(resolve));app=createApplication({env,transport});server=app.server;server.listen(0,'127.0.0.1');await once(server,'listening');
    const after=await send('/api/history',{headers:{Cookie:cookie}});assert.equal(after.status,200);assert.deepEqual(after.json(),before);
  });
  await t.test('login and authenticated API request limits return 429',async()=>{
    for(let i=0;i<20;i++)assert.equal((await send('/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'password=wrong'})).status,401);
    assert.equal((await send('/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'password=wrong'})).status,429);
    for(let i=0;i<119;i++)assert.equal((await send('/api/config',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await send('/api/config',{headers:{Cookie:cookie}})).status,429);
  });
});
