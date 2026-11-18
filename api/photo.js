// Фото фасада и зала: сжатые на телефоне JPEG (~100–200 КБ) хранятся в Redis.
const crypto = require('crypto');
const L = require('./_lib');

module.exports = L.wrap(async (req, res) => {
  if (req.method === 'POST') {
    const s = L.session(req);
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(L.body(req).data || ''));
    if (!m) L.fail(400, 'Неверный формат фото');
    if (m[2].length > 900 * 1024) L.fail(413, 'Фото слишком большое');
    const id = s.u + '-' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    await L.redis('SET', `${L.P}photo:${id}`, `${m[1]};${m[2]}`);
    return L.send(res, 200, { id });
  }
  // GET ?id=…&t=<токен сессии> — токен в адресе, потому что <img> не умеет слать заголовки
  if (!L.readToken(String(req.query.t || ''))) L.fail(401, 'auth');
  const raw = await L.redis('GET', `${L.P}photo:${String(req.query.id || '')}`);
  if (!raw) L.fail(404, 'Нет фото');
  const [type, b64] = raw.split(';');
  res.setHeader('Content-Type', 'image/' + type);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.status(200).send(Buffer.from(b64, 'base64'));
});
