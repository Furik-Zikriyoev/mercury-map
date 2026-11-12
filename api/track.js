// GPS-трек: приём точек из приложения и выдача трека за день.
const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  const s = L.session(req);
  if (req.method === 'POST') {
    if (s.role !== 'seller') L.fail(403, 'Только сейлер');
    const b = L.body(req);
    const extra = {};
    if (isFinite(b.batt)) extra.batt = Math.round(b.batt);
    extra.src = 'app';
    const n = await L.storeTrack(s.u, b.points, extra);
    const [ver] = await L.pipe([['GET', L.P + 'ver']]);
    return L.send(res, 200, { accepted: n, ver: +ver || 0 });
  }
  const day = String(req.query.day || L.dayOf(Date.now()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) L.fail(400, 'day');
  let users = [s.u];
  if (s.role === 'lead') users = (await L.allUsers()).filter(x => x.role === 'seller').map(x => x.u);
  const lists = await L.pipe(users.map(u => ['LRANGE', `${L.P}track:${u}:${day}`, 0, -1]));
  const out = {};
  users.forEach((u, i) => { out[u] = L.cleanTrack(lists[i] || []); });
  L.send(res, 200, { day, tracks: out });
});
