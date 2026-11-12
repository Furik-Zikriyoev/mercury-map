// Приём геопозиции из приложения OwnTracks (пишет маршрут в фоне, даже с выключенным экраном).
// Настройка в OwnTracks: Mode HTTP, URL https://<сайт>/api/owntracks, Authentication: логин + трек-токен из настроек Mercury Map.
const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 200, []);
  const h = req.headers.authorization || '';
  let u = '', tok = '';
  if (h.startsWith('Basic ')) { const raw = Buffer.from(h.slice(6), 'base64').toString(); const i = raw.indexOf(':'); u = raw.slice(0, i).trim().toLowerCase(); tok = raw.slice(i + 1).trim(); }
  const user = u && await L.getUser(u);
  if (!user || !user.trackToken || user.trackToken !== tok) { console.log(`[owntracks] 401: ${!u ? 'нет логина в запросе' : !user ? 'нет пользователя «' + u + '»' : 'неверный трек-токен для «' + u + '»'}`); res.setHeader('WWW-Authenticate', 'Basic realm="mercury-map"'); return L.send(res, 401, { error: 'auth' }); }
  let b; try { b = L.body(req); } catch (e) { b = {}; }
  const msgs = Array.isArray(b) ? b : [b];
  const pts = [];
  let batt;
  for (const m of msgs) {
    if (!m || m._type !== 'location' || !isFinite(m.lat) || !isFinite(m.lon) || !isFinite(m.tst)) continue;
    pts.push([+m.lat, +m.lon, m.tst * 1000, +m.acc || 0]);
    if (isFinite(m.batt)) batt = m.batt;
  }
  const types = msgs.map(m => (m && m._type) || '?').join(',');
  if (user.role !== 'seller') { console.log(`[owntracks] ${u}: не сейлер — точки не пишем`); return L.send(res, 200, []); }
  const saved = pts.length ? await L.storeTrack(user.u, pts, { batt, src: 'owntracks' }, 150) : 0;
  console.log(`[owntracks] ${u}: сообщений ${msgs.length} (${types}), точек ${pts.length}, сохранено ${saved}` + (pts.length && !saved ? ` — отброшено: точность ${pts.map(p => Math.round(p[3]) + 'м').join(',')} или вне рабочего времени` : ''));
  L.send(res, 200, []);
});
