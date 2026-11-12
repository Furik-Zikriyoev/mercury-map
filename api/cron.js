// Отчёт дня: Vercel запускает этот адрес по расписанию (см. vercel.json) около 18:00 по Ташкенту.
const L = require('./_lib');

const fmtKm = m => (m < 1000 ? Math.round(m) + ' м' : (m / 1000).toFixed(1).replace('.', ',') + ' км');
const hm = ms => new Date(ms + 5 * 3600e3).toISOString().slice(11, 16);

module.exports = L.wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) L.fail(401, 'cron');
  const day = L.dayOf(Date.now());
  const users = await L.allUsers();
  const sellers = users.filter(x => x.role === 'seller');
  const leads = users.filter(x => x.role === 'lead').map(x => x.u);
  const r = await L.pipe(sellers.flatMap(x => [['LRANGE', `${L.P}track:${x.u}:${day}`, 0, -1], ['GET', `${L.P}data:${x.u}`]]));
  const lines = [];
  for (let i = 0; i < sellers.length; i++) {
    const x = sellers[i];
    const pts = L.cleanTrack(r[i * 2] || []);
    const data = r[i * 2 + 1] ? JSON.parse(r[i * 2 + 1]) : { partners: [] };
    const created = (data.partners || []).filter(p => p.day === day);
    const changed = (data.partners || []).filter(p => p.day !== day && (p.history || []).some(h => L.dayOf(h.ts) === day));
    const connected = (data.partners || []).filter(p => (p.history || []).some(h => h.s === 'connected' && L.dayOf(h.ts) === day)).length;
    const km = fmtKm(L.trackKm(pts));
    const time = pts.length ? `${hm(pts[0][2])}–${hm(pts[pts.length - 1][2])}` : 'нет трека';
    const text = `${km} · ${time} · новых ${created.length}, обновлено ${changed.length}, подключено ${connected}`;
    lines.push(`${x.name}: ${text}`);
    await L.pushTo([x.u], { title: 'Отчёт за день', body: text, tag: 'report-' + day, url: '/?report=' + day });
  }
  if (leads.length && lines.length) await L.pushTo(leads, { title: `Отчёт команды за ${day.slice(8)}.${day.slice(5, 7)}`, body: lines.join('\n'), tag: 'report-' + day, url: '/?report=' + day });
  L.send(res, 200, { day, lines });
});
