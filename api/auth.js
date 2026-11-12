// Аккаунты: вход, регистрация (по коду администратора APP_PIN), команда.
const crypto = require('crypto');
const L = require('./_lib');

const COLORS = ['#7c6cff', '#ff3b7f', '#00b8a9', '#ff8a00', '#2f8cff', '#e83fd1', '#20c05c', '#ff5a36'];

module.exports = L.wrap(async (req, res) => {
  const b = req.method === 'POST' ? L.body(req) : {};
  const action = b.action || req.query.action || 'me';

  if (action === 'status') {
    const n = await L.redis('HLEN', L.P + 'users');
    return L.send(res, 200, { hasUsers: n > 0, adminCode: !!process.env.APP_PIN });
  }

  if (action === 'login') {
    const u = String(b.u || '').trim().toLowerCase();
    const user = await L.getUser(u);
    if (!user || !L.checkPass(b.pass, user.pass)) L.fail(403, 'Неверный логин или пароль');
    return L.send(res, 200, { token: L.makeToken(user), user: L.pub(user), trackToken: user.trackToken });
  }

  if (action === 'register') {
    const n = await L.redis('HLEN', L.P + 'users');
    const code = process.env.APP_PIN;
    if (code ? String(b.adminCode || '') !== code : n > 0) L.fail(403, 'Неверный код администратора');
    const u = String(b.u || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,24}$/.test(u)) L.fail(400, 'Логин: 3–24 символа, латиница, цифры, точка, дефис');
    if (String(b.pass || '').length < 6) L.fail(400, 'Пароль — минимум 6 символов');
    const name = String(b.name || '').trim().slice(0, 40) || u;
    const role = b.role === 'lead' ? 'lead' : 'seller';
    const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : COLORS[n % COLORS.length];
    const user = { u, name, role, color, pass: L.hashPass(b.pass), trackToken: crypto.randomBytes(12).toString('hex'), created: Date.now() };
    const ok = await L.redis('HSETNX', L.P + 'users', u, JSON.stringify(user));
    if (!ok) L.fail(409, 'Такой логин уже занят');
    return L.send(res, 200, { ok: true, user: L.pub(user) });
  }

  // дальше — только для вошедших
  const s = L.session(req);
  const me = await L.getUser(s.u);
  if (!me) L.fail(401, 'auth');

  if (action === 'me') {
    const team = (await L.allUsers()).map(L.pub);
    return L.send(res, 200, { user: L.pub(me), trackToken: me.trackToken, team, work: [L.WORK_START, L.WORK_END],
      vapid: process.env.VAPID_PUBLIC_KEY || null });
  }

  if (action === 'password') {
    if (!L.checkPass(b.old, me.pass)) L.fail(403, 'Старый пароль неверный');
    if (String(b.pass || '').length < 6) L.fail(400, 'Пароль — минимум 6 символов');
    me.pass = L.hashPass(b.pass);
    await L.redis('HSET', L.P + 'users', me.u, JSON.stringify(me));
    return L.send(res, 200, { ok: true });
  }

  if (action === 'newTrackToken') {
    me.trackToken = crypto.randomBytes(12).toString('hex');
    await L.redis('HSET', L.P + 'users', me.u, JSON.stringify(me));
    return L.send(res, 200, { trackToken: me.trackToken });
  }

  if (action === 'removeUser') {
    if (me.role !== 'lead') L.fail(403, 'Только руководитель');
    if (process.env.APP_PIN && String(b.adminCode || '') !== process.env.APP_PIN) L.fail(403, 'Неверный код администратора');
    if (b.u === me.u) L.fail(400, 'Нельзя удалить себя');
    await L.redis('HDEL', L.P + 'users', String(b.u || ''));
    return L.send(res, 200, { ok: true });
  }

  L.fail(400, 'unknown action');
});
