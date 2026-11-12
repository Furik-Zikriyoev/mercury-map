// Общие функции сервера Mercury Map (файлы с "_" Vercel не публикует как отдельные адреса).
const crypto = require('crypto');

const RURL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const RTOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const P = 'mm:';
const TZ_OFF = 5 * 3600e3; // Ташкент, UTC+5, без перехода на летнее время
const WORK_START = +(process.env.WORK_START || 9);
const WORK_END = +(process.env.WORK_END || 18);

/* ---------- Redis (Upstash REST) ---------- */
async function redis(...cmd) {
  const r = await fetch(RURL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RTOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function pipe(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(RURL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RTOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j.error || 'pipeline');
  return j.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
const hashToObj = arr => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

/* ---------- время ---------- */
const dayOf = ms => new Date(ms + TZ_OFF).toISOString().slice(0, 10);
const hourOf = ms => { const d = new Date(ms + TZ_OFF); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const inWork = ms => { const h = hourOf(ms); return h >= WORK_START && h < WORK_END; };

/* ---------- пароли и сессии ---------- */
function hashPass(p, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(String(p), salt, 32).toString('hex');
}
function checkPass(p, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const x = crypto.scryptSync(String(p), salt, 32).toString('hex');
  return x.length === h.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h));
}
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('mm|' + (RTOKEN || '')).digest('hex');
const b64 = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(user) {
  const payload = b64(JSON.stringify({ u: user.u, r: user.role, v: user.tv || 0, e: Date.now() + 180 * 864e5 }));
  return payload + '.' + sign(payload);
}
function readToken(t) {
  if (!t || t.indexOf('.') < 0) return null;
  const [p, s] = t.split('.');
  const good = sign(p);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch (e) { return null; }
}

/* ---------- пользователи ---------- */
async function getUser(u) { const j = await redis('HGET', P + 'users', u); return j ? JSON.parse(j) : null; }
async function allUsers() { const o = hashToObj(await redis('HGETALL', P + 'users')); return Object.values(o).map(s => JSON.parse(s)); }
const pub = u => ({ u: u.u, name: u.name, role: u.role, color: u.color });

/* ---------- http ---------- */
function send(res, code, obj) { res.setHeader('Cache-Control', 'no-store'); res.status(code).json(obj); }
function body(req) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
function fail(status, msg) { const e = new Error(msg); e.status = status; throw e; }
function session(req) {
  const h = req.headers.authorization || '';
  const s = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!s) fail(401, 'auth');
  return { u: s.u, role: s.r };
}
function wrap(fn) {
  return async (req, res) => {
    if (!RURL || !RTOKEN) return send(res, 500, { error: 'storage_not_configured' });
    try { await fn(req, res); } catch (e) { send(res, e.status || 500, { error: (e && e.message) || String(e) }); }
  };
}

/* ---------- слияние данных сейлера ---------- */
const ver = x => x.u || x.ts || 0;
function merge(a, b) {
  a = a || {}; b = b || {};
  const deleted = { ...(a.deleted || {}) };
  for (const [id, t] of Object.entries(b.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const pick = (xs, ys) => {
    const m = new Map();
    for (const x of [...(xs || []), ...(ys || [])]) {
      if (!x || !x.id) continue;
      const cur = m.get(x.id);
      if (!cur || ver(x) >= ver(cur)) m.set(x.id, x);
    }
    return [...m.values()].filter(x => !(deleted[x.id] && deleted[x.id] >= ver(x)));
  };
  return { strokes: pick(a.strokes, b.strokes), partners: pick(a.partners, b.partners), deleted, saved: Date.now() };
}

/* ---------- GPS-трек ---------- */
const encPt = p => `${(+p[0]).toFixed(6)},${(+p[1]).toFixed(6)},${Math.round(p[2] / 1000)},${Math.round(p[3] || 0)}`;
const decPt = s => { const a = s.split(','); return [+a[0], +a[1], +a[2] * 1000, +a[3]]; };
function cleanTrack(list) {
  const pts = list.map(decPt).sort((a, b) => a[2] - b[2]);
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (l && p[2] - l[2] < 5000) continue; out.push(p); }
  return out;
}
function distM(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function trackKm(pts) { let d = 0; for (let i = 1; i < pts.length; i++) if (pts[i][2] - pts[i - 1][2] < 10 * 60e3) d += distM(pts[i - 1], pts[i]); return d; }
// Сохраняет точки трека (только в рабочее время) и обновляет «где сейчас»
async function storeTrack(u, points, extra = {}, maxAcc = 80) {
  const good = (points || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]) && inWork(p[2]) && (p[3] || 0) <= maxAcc);
  if (!good.length) return 0;
  const byDay = {};
  for (const p of good) (byDay[dayOf(p[2])] = byDay[dayOf(p[2])] || []).push(encPt(p));
  const last = good.reduce((a, b) => (b[2] > a[2] ? b : a));
  const cmds = [];
  for (const [d, list] of Object.entries(byDay)) {
    cmds.push(['RPUSH', `${P}track:${u}:${d}`, ...list]);
    cmds.push(['EXPIRE', `${P}track:${u}:${d}`, 400 * 86400]);
  }
  const live = { lat: last[0], lng: last[1], ts: last[2], acc: last[3] || 0, ...extra };
  cmds.push(['SET', `${P}live:${u}`, JSON.stringify(live), 'EX', 86400]);
  await pipe(cmds);
  return good.length;
}

/* ---------- push-уведомления ---------- */
let webpush;
function wp() {
  if (webpush !== undefined) return webpush;
  try {
    webpush = require('web-push');
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) webpush = null;
    else webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || ('https://' + (process.env.VERCEL_PROJECT_PRODUCTION_URL || 'mercury-map.vercel.app')),
      process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } catch (e) { webpush = null; }
  return webpush;
}
async function pushTo(usernames, payload) {
  const w = wp(); if (!w) return;
  for (const u of new Set(usernames)) {
    const subs = hashToObj(await redis('HGETALL', `${P}push:${u}`));
    for (const [k, v] of Object.entries(subs)) {
      try { await w.sendNotification(JSON.parse(v), JSON.stringify(payload)); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await redis('HDEL', `${P}push:${u}`, k); }
    }
  }
}

module.exports = { P, redis, pipe, hashToObj, dayOf, inWork, WORK_START, WORK_END, hashPass, checkPass, makeToken, readToken,
  getUser, allUsers, pub, send, body, fail, session, wrap, merge, decPt, cleanTrack, trackKm, distM, storeTrack, pushTo, wp };
