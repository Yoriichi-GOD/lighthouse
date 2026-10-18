import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function configuration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 5175);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  const origin = production ? env.APP_ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '') : `http://127.0.0.1:${port}`;
  let publicURL;
  try { publicURL = new URL(origin); } catch { throw new Error('Set APP_ORIGIN or RAILWAY_PUBLIC_DOMAIN before production startup.'); }
  if (production && (publicURL.protocol !== 'https:' || publicURL.username || publicURL.password || publicURL.pathname !== '/' || publicURL.search || publicURL.hash)) throw new Error('APP_ORIGIN must be an HTTPS origin without a path or credentials.');
  const password = env.DEMO_ACCESS_PASSWORD || '';
  if (production && password.length < 24) throw new Error('Production requires DEMO_ACCESS_PASSWORD with at least 24 characters.');
  return {
    production, port, origin: publicURL.origin, bind: production ? '0.0.0.0' : '127.0.0.1', password,
    hosts: new Set(production ? [publicURL.host] : [`127.0.0.1:${port}`, `localhost:${port}`]),
    origins: new Set(production ? [publicURL.origin] : [`http://127.0.0.1:${port}`, `http://localhost:${port}`]),
    dataFile: path.join(env.DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url)), 'runs.json'),
  };
}

const hash = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(hash(a), hash(b));

// Shared, bounded counters deliberately do not trust client-supplied proxy/IP headers.
export class RateLimit {
  constructor(max, windowMs = 60000) { this.max = max; this.windowMs = windowMs; this.reset = 0; this.count = 0; }
  allow(now = Date.now()) {
    if (now >= this.reset) { this.count = 0; this.reset = now + this.windowMs; }
    return ++this.count <= this.max;
  }
}

export function demoAccess(config) {
  const lifetime = 8 * 60 * 60;
  const cookieName = '__Host-lighthouse-demo';
  const signature = value => createHmac('sha256', config.password).update(value).digest('base64url');
  return {
    validPassword: value => equal(String(value), config.password),
    cookie(now = Date.now()) {
      const payload = `${Math.floor(now / 1000) + lifetime}.${randomUUID()}`;
      return `${cookieName}=${payload}.${signature(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${lifetime}`;
    },
    authorized(req, now = Date.now()) {
      if (!config.production) return true;
      const token = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      if (!token || token.length > 200) return false;
      const parts = token.split('.');
      if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
      const expiry = Number(parts[0]);
      return expiry > now / 1000 && expiry <= now / 1000 + lifetime && equal(parts[2], signature(parts.slice(0, 2).join('.')));
    },
  };
}

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10000) { const error = new Error('Request too large.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const loginPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lighthouse · Demo access</title><link rel="stylesheet" href="/login.css"></head><body><main><h1>Lighthouse</h1><p>Private AZINHACK demonstration</p><form method="post" action="/login"><label for="password">Demo access password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Enter Lighthouse</button></form><p>Access is shared with the demo team. Questions and reports are visible to everyone with demo access.</p></main></body></html>`;
export const loginCSS = `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:#081a35 url('/login-background.png') center/cover fixed no-repeat;color:#edf4ff;font:20px Calibri,Arial,sans-serif}main{width:min(484px,calc(100% - 32px));margin:24px 0;padding:32px;background:rgba(14,36,76,.15);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:24px;box-shadow:0 16px 60px rgba(3,12,30,.2)}h1{font:italic 40px Georgia,serif}form{display:grid;gap:14px}input,button{width:100%;min-width:0;font:inherit;padding:14px;border-radius:12px;border:0}input{background:rgba(19,47,96,.20);color:#edf4ff;backdrop-filter:blur(14px)}input:focus-visible,button:focus-visible{outline:3px solid #70dfca;outline-offset:3px}button{background:#a4e1e4;color:#10243c;cursor:pointer}p{line-height:1.5;color:#edf4ff;text-shadow:0 1px 4px rgba(3,12,30,.5)}`;
