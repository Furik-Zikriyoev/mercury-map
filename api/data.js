// Партнёры, визиты и нарисованные вручную линии каждого менеджера.
const L = require('./_lib');
const key = u => `${L.P}data:${u}`;
const LEGACY = process.env.DATA_KEY || 'mercury-map:data';
const empty = () => ({ strokes: [], partners: [], visits: [], deleted: {} });

async function load(u) {
  const raw = await L.redis('GET', key(u));
  if (raw) return JSON.parse(raw);
  // одноразовый перенос данных из версии без аккаунтов — первому вошедшему менеджеру
  const claimed = await L.redis('SET', L.P + 'legacy-claimed', u, 'NX');
  if (claimed) { const old = await L.redis('GET', LEGACY); if (old) return L.merge({}, JSON.parse(old)); }
  return empty();
}

// Сравнивает данные до и после синхронизации и формирует события для ленты руководителя
function diffEvents(u, before, after) {
  const ev = [];
  const old = new Map((before.visits || []).map(v => [v.id, v]));
  const pname = id => { const p = (after.partners || []).find(x => x.id === id); return p ? p.name : ''; };
  const pstat = id => { const p = (after.partners || []).find(x => x.id === id); return p ? p.status : ''; };
  for (const v of after.visits || []) {
    const b = old.get(v.id);
    if (!b) ev.push({ type: 'visit_start', u, pid: v.pid, pname: pname(v.pid), kind: v.kind, vid: v.id, lat: v.lat, lng: v.lng });
    if (v.end && !(b && b.end)) ev.push({ type: 'visit_end', u, pid: v.pid, pname: pname(v.pid), kind: v.kind, vid: v.id, status: v.statusAfter || pstat(v.pid), dur: v.end - v.start, lat: v.lat, lng: v.lng });
  }
  return ev.slice(0, 20);
}

module.exports = L.wrap(async (req, res) => {
  const s = L.session(req);

  if (req.method === 'GET') {
    if (s.role === 'lead') {
      const sellers = (await L.allUsers()).filter(x => x.role === 'seller');
      const raws = await L.pipe(sellers.map(x => ['GET', key(x.u)]));
      const out = {};
      sellers.forEach((x, i) => { const d = raws[i] ? JSON.parse(raws[i]) : empty(); out[x.u] = { strokes: d.strokes || [], partners: d.partners || [], visits: d.visits || [] }; });
      return L.send(res, 200, { sellers: out, dver: await L.redis('GET', L.P + 'dver') || 0 });
    }
    return L.send(res, 200, await load(s.u));
  }

  if (req.method !== 'POST') L.fail(405, 'method');
  if (s.role !== 'seller') L.fail(403, 'Только менеджер');
  const cur = await load(s.u);
  const merged = L.merge(cur, L.body(req));
  const json = JSON.stringify(merged);
  const changed = JSON.stringify([cur.strokes, cur.partners, cur.visits]) !== JSON.stringify([merged.strokes, merged.partners, merged.visits]);
  const cmds = [['SET', key(s.u), json]];
  if (changed) {
    cmds.push(['INCR', L.P + 'dver']);
    cmds.push(['SET', `${key(s.u)}:backup:${L.dayOf(Date.now())}`, json, 'EX', 60 * 86400]);
  }
  await L.pipe(cmds);
  if (changed) await L.addEvents(diffEvents(s.u, cur, merged));
  L.send(res, 200, merged);
});
