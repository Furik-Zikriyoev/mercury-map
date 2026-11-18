// GPS-трек: приём точек из приложения, выдача трека за период и покрытия района.
const L = require('./_lib');
const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d);

module.exports = L.wrap(async (req, res) => {
  const s = L.session(req);
  if (req.method === 'POST') {
    if (s.role !== 'seller') L.fail(403, 'Только менеджер');
    const b = L.body(req);
    const n = await L.storeTrack(s.u, b.points, { src: 'app' }, 100);
    const ver = await L.redis('GET', L.P + 'ver');
    return L.send(res, 200, { accepted: n, ver: +ver || 0 });
  }
  let users = [s.u];
  if (s.role === 'lead') users = (await L.allUsers()).filter(x => x.role === 'seller').map(x => x.u);

  if (req.query.cov) {
    const sets = await L.pipe(users.map(u => ['SMEMBERS', `${L.P}cov:${u}`]));
    const out = {}; users.forEach((u, i) => { out[u] = sets[i] || []; });
    return L.send(res, 200, { cov: out, grid: [L.GRID_LAT, L.GRID_LNG] });
  }

  // один день (?day=) или период (?from=&to=, не больше 7 дней)
  const from = String(req.query.from || req.query.day || L.dayOf(Date.now()));
  const to = String(req.query.to || from);
  if (!okDay(from) || !okDay(to)) L.fail(400, 'day');
  const days = [];
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z') && days.length < 7; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const cmds = [];
  for (const d of days) for (const u of users) cmds.push(['LRANGE', `${L.P}track:${u}:${d}`, 0, -1]);
  const lists = await L.pipe(cmds);
  const tracks = {}; let i = 0;
  for (const d of days) { tracks[d] = {}; for (const u of users) tracks[d][u] = L.cleanTrack(lists[i++] || []); }
  L.send(res, 200, { day: from, tracks: tracks[from], days: tracks });
});
