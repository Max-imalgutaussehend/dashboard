// Dashboard server: static page + a small JSON API. No dependencies (Node >= 22).
//   Hermes (in-cluster):  Authorization: Bearer $DASHBOARD_API_TOKEN  -> read and write
//   Max (browser):        Cloudflare Access JWT (Cf-Access-Jwt-Assertion), verified here -> read, and tick off todos/reminders
// Fail closed: without token / team+aud configured the matching way in is closed. DASHBOARD_DEV=1 opens everything (local preview only).
import { createServer } from 'node:http';
import { createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateState, validateWidget, schemaDoc } from './schema.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA = process.env.DASHBOARD_DATA || '/data';
const PORT = parseInt(process.env.PORT || '8080', 10);
const TOKEN = process.env.DASHBOARD_API_TOKEN || '';
const TEAM = process.env.DASHBOARD_CF_TEAM || '';
const AUD = process.env.DASHBOARD_CF_AUD || '';
const DEV = process.env.DASHBOARD_DEV === '1';
const STATE = join(DATA, 'dashboard.json');
const HISTORY = join(DATA, 'history');
mkdirSync(HISTORY, { recursive: true });

// ---- state -----------------------------------------------------------------------------------------------------------------
let state;
try { state = JSON.parse(readFileSync(STATE, 'utf8')); }
catch { state = JSON.parse(readFileSync(join(ROOT, 'seed', 'dashboard.json'), 'utf8')); }
state.meta ??= { rev: 0 };

function save(by) {
  state.meta = { rev: (state.meta.rev || 0) + 1, updated_at: new Date().toISOString(), updated_by: by };
  const tmp = STATE + '.tmp';
  if (existsSync(STATE)) writeFileSync(join(HISTORY, `${Date.now()}.json`), readFileSync(STATE));
  writeFileSync(tmp, JSON.stringify(state)); renameSync(tmp, STATE);
  const old = readdirSync(HISTORY).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 50))) unlinkSync(join(HISTORY, f)); // keep the last 50 versions = the undo
}

// ---- auth ------------------------------------------------------------------------------------------------------------------
const b64 = (s) => Buffer.from(s, 'base64url');
let jwks = { at: 0, keys: [] };
async function accessKeys() {
  if (Date.now() - jwks.at < 3_600_000 && jwks.keys.length) return jwks.keys;
  const r = await fetch(`https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(8000) });
  jwks = { at: Date.now(), keys: (await r.json()).keys ?? [] };
  return jwks.keys;
}
async function validAccessJwt(req) {
  const jwt = req.headers['cf-access-jwt-assertion'];
  if (!TEAM || !AUD || typeof jwt !== 'string') return false;
  try {
    const [h, p, s] = jwt.split('.');
    const head = JSON.parse(b64(h)), claims = JSON.parse(b64(p));
    if (head.alg !== 'RS256') return false;
    const jwk = (await accessKeys()).find((k) => k.kid === head.kid);
    if (!jwk) return false;
    if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), b64(s))) return false;
    const aud = [].concat(claims.aud ?? []);
    return aud.includes(AUD) && claims.iss === `https://${TEAM}.cloudflareaccess.com` && claims.exp * 1000 > Date.now();
  } catch { return false; }
}
function validBearer(req) {
  const h = req.headers.authorization ?? '';
  if (!TOKEN || TOKEN.length < 24 || !h.startsWith('Bearer ')) return false;
  const a = Buffer.from(h.slice(7)), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
// who: 'hermes' | 'max' | null
async function whoIs(req) {
  if (validBearer(req)) return 'hermes';
  if (await validAccessJwt(req)) return 'max';
  return DEV ? 'max' : null;
}

// ---- http ------------------------------------------------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const SEC = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
const send = (res, code, body, type = 'application/json', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readJson = async (req) => {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > 512_000) throw new Error('body too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
};
const publicState = () => state;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    if (path === '/healthz') return send(res, 200, 'ok', 'text/plain');
    const who = await whoIs(req);
    if (!who) return send(res, 401, { error: 'unauthorized' });

    if (path.startsWith('/api/')) {
      if (path === '/api/state' && req.method === 'GET') return send(res, 200, publicState());
      if (path === '/api/schema' && req.method === 'GET') return send(res, 200, schemaDoc());
      // Writes that change structure are Hermes' (bearer); Max may only tick items off.
      const toggle = path.match(/^\/api\/widgets\/([a-z0-9_-]+)\/toggle$/);
      if (toggle && req.method === 'POST') {
        const w = state.widgets.find((x) => x.id === toggle[1]);
        const b = await readJson(req);
        const it = w && ['todo', 'reminders'].includes(w.type) && w.items.find((i) => i.id === b?.item_id);
        if (!it) return send(res, 404, { error: 'item not found' });
        it.done = typeof b.done === 'boolean' ? b.done : !it.done;
        save(who);
        return send(res, 200, { ok: true, done: it.done, rev: state.meta.rev });
      }
      if (who !== 'hermes' && !DEV) return send(res, 403, { error: 'read-only for browsers' });
      if (path === '/api/state' && req.method === 'PUT') {
        const b = await readJson(req); const errors = validateState(b);
        if (errors.length) return send(res, 422, { errors });
        state = { ...b, meta: state.meta }; save(who);
        return send(res, 200, { ok: true, rev: state.meta.rev });
      }
      const one = path.match(/^\/api\/widgets\/([a-z0-9_-]+)$/);
      if (one && req.method === 'PUT') { // upsert; optional ?after=<id> or ?pos=0 to place a new widget
        const b = await readJson(req); const w = { ...b, id: one[1] };
        const errors = validateWidget(w); if (errors.length) return send(res, 422, { errors });
        const i = state.widgets.findIndex((x) => x.id === w.id);
        if (i >= 0) state.widgets[i] = w;
        else {
          if (state.widgets.length >= 60) return send(res, 422, { errors: ['at most 60 widgets'] });
          const after = state.widgets.findIndex((x) => x.id === url.searchParams.get('after'));
          state.widgets.splice(after >= 0 ? after + 1 : state.widgets.length, 0, w);
        }
        save(who); return send(res, 200, { ok: true, rev: state.meta.rev });
      }
      if (one && req.method === 'DELETE') {
        const i = state.widgets.findIndex((x) => x.id === one[1]);
        if (i < 0) return send(res, 404, { error: 'not found' });
        state.widgets.splice(i, 1); save(who); return send(res, 200, { ok: true, rev: state.meta.rev });
      }
      if (path === '/api/meta' && req.method === 'PATCH') { // title, subtitle, briefing only
        const b = await readJson(req); const next = { ...state };
        for (const k of ['title', 'subtitle', 'briefing']) if (k in (b ?? {})) next[k] = b[k];
        const errors = validateState(next); if (errors.length) return send(res, 422, { errors });
        state = next; save(who); return send(res, 200, { ok: true, rev: state.meta.rev });
      }
      return send(res, 404, { error: 'not found' });
    }

    if (req.method !== 'GET') return send(res, 405, 'Method Not Allowed', 'text/plain');
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not Found', 'text/plain');
    return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
  } catch (e) {
    return send(res, e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'invalid JSON' : 'internal error' });
  }
}).listen(PORT, () => console.log(`dashboard on :${PORT}${DEV ? ' (DEV: auth open)' : ''}`));
