// Метки партнёров и нарисованные вручную линии каждого сейлера.
const L = require('./_lib');
const key = u => `${L.P}data:${u}`;
const LEGACY = process.env.DATA_KEY || 'mercury-map:data';

async function load(u) {
  const raw = await L.redis('GET', key(u));
  if (raw) return JSON.parse(raw);
  // одноразовый перенос данных из версии без аккаунтов — первому вошедшему сейлеру
  const claimed = await L.redis('SET', L.P + 'legacy-claimed', u, 'NX');
  if (claimed) { const old = await L.redis('GET', LEGACY); if (old) return L.merge({}, JSON.parse(old)); }
  return { strokes: [], partners: [], deleted: {} };
}

module.exports = L.wrap(async (req, res) => {
  const s = L.session(req);

  if (req.method === 'GET') {
    if (s.role === 'lead') {
      const sellers = (await L.allUsers()).filter(x => x.role === 'seller');
      const raws = await L.pipe(sellers.map(x => ['GET', key(x.u)]));
      const out = {};
      sellers.forEach((x, i) => { const d = raws[i] ? JSON.parse(raws[i]) : { strokes: [], partners: [] }; out[x.u] = { strokes: d.strokes || [], partners: d.partners || [] }; });
      return L.send(res, 200, { sellers: out, dver: await L.redis('GET', L.P + 'dver') || 0 });
    }
    return L.send(res, 200, await load(s.u));
  }

  if (req.method !== 'POST') L.fail(405, 'method');
  if (s.role !== 'seller') L.fail(403, 'Только сейлер');
  const cur = await load(s.u);
  const merged = L.merge(cur, L.body(req));
  const json = JSON.stringify(merged);
  const changed = JSON.stringify({ a: cur.strokes, b: cur.partners }) !== JSON.stringify({ a: merged.strokes, b: merged.partners });
  const cmds = [['SET', key(s.u), json]];
  if (changed) {
    cmds.push(['INCR', L.P + 'dver']);
    cmds.push(['SET', `${key(s.u)}:backup:${L.dayOf(Date.now())}`, json, 'EX', 60 * 86400]);
  }
  await L.pipe(cmds);
  L.send(res, 200, merged);
});
