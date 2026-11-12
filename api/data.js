// Облачное хранилище Mercury Map: Vercel Function + Upstash Redis (REST).
const KEY = process.env.DATA_KEY || 'mercury-map:data';
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(RURL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RTOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const ver = x => x.u || x.ts || 0;

// Объединяет данные двух устройств: ничего не теряется, удаления учитываются.
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!RURL || !RTOKEN) return res.status(500).json({ error: 'storage_not_configured' });
  if (process.env.APP_PIN && req.headers['x-pin'] !== process.env.APP_PIN) return res.status(401).json({ error: 'pin' });
  try {
    const raw = await redis(['GET', KEY]);
    const cur = raw ? JSON.parse(raw) : { strokes: [], partners: [], deleted: {} };
    if (req.method === 'GET') return res.status(200).json(cur);
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const merged = merge(cur, body);
    const json = JSON.stringify(merged);
    await redis(['SET', KEY, json]);
    // ежедневная страховочная копия на сервере (хранится 60 дней)
    await redis(['SET', `${KEY}:backup:${new Date().toISOString().slice(0, 10)}`, json, 'EX', 60 * 60 * 24 * 60]);
    return res.status(200).json(merged);
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
module.exports.merge = merge;
