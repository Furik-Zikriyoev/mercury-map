// Лайв-позиции, заметки руководителя, комментарии и подписки на уведомления.
const crypto = require('crypto');
const L = require('./_lib');
const NOTES = L.P + 'notes', COMMENTS = L.P + 'comments';
const id = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const okName = u => /^[a-z0-9_.-]{3,24}$/.test(u);

const parseAll = h => Object.values(L.hashToObj(h)).map(s => JSON.parse(s));

module.exports = L.wrap(async (req, res) => {
  const s = L.session(req);

  if (req.method === 'GET') {
    if (req.query.full) {
      const [n, c, v] = await L.pipe([['HGETALL', NOTES], ['HGETALL', COMMENTS], ['GET', L.P + 'ver']]);
      let notes = parseAll(n), comments = parseAll(c);
      if (s.role !== 'lead') {
        notes = notes.filter(x => x.for === s.u || x.for === 'all');
        comments = comments.filter(x => x.owner === s.u || x.owner === 'all');
      }
      return L.send(res, 200, { notes, comments, ver: +v || 0, now: Date.now() });
    }
    // лёгкий опрос: номера версий (+ позиции сейлеров для руководителя)
    const cmds = [['MGET', L.P + 'ver', L.P + 'dver']];
    const sellers = s.role === 'lead' ? String(req.query.sellers || '').split(',').filter(okName).slice(0, 50) : [];
    if (sellers.length) cmds.push(['MGET', ...sellers.map(u => `${L.P}live:${u}`)]);
    const r = await L.pipe(cmds);
    const live = {};
    sellers.forEach((u, i) => { if (r[1] && r[1][i]) live[u] = JSON.parse(r[1][i]); });
    return L.send(res, 200, { ver: +r[0][0] || 0, dver: +r[0][1] || 0, live, now: Date.now() });
  }

  if (req.method !== 'POST') L.fail(405, 'method');
  const b = L.body(req);
  const me = await L.getUser(s.u);
  if (!me) L.fail(401, 'auth');
  const bump = ['INCR', L.P + 'ver'];

  switch (b.action) {
    case 'note': {
      if (me.role !== 'lead') L.fail(403, 'Только руководитель');
      if (!isFinite(b.lat) || !isFinite(b.lng)) L.fail(400, 'coords');
      const note = { id: id(), lat: +(+b.lat).toFixed(6), lng: +(+b.lng).toFixed(6), text: String(b.text || '').slice(0, 500),
        for: okName(b.for || '') ? b.for : 'all', author: me.u, authorName: me.name, ts: Date.now(), done: false };
      await L.pipe([['HSET', NOTES, note.id, JSON.stringify(note)], bump]);
      const targets = note.for === 'all' ? (await L.allUsers()).filter(x => x.role === 'seller').map(x => x.u) : [note.for];
      await L.pushTo(targets, { title: 'Новая заметка от руководителя', body: note.text || 'Метка на карте', tag: 'note-' + note.id, url: '/?note=' + note.id });
      return L.send(res, 200, { note });
    }
    case 'noteDone': case 'noteDelete': {
      const raw = await L.redis('HGET', NOTES, String(b.id || ''));
      if (!raw) L.fail(404, 'Заметка не найдена');
      const note = JSON.parse(raw);
      if (b.action === 'noteDelete') {
        if (me.role !== 'lead') L.fail(403, 'Только руководитель');
        await L.pipe([['HDEL', NOTES, note.id], bump]);
        return L.send(res, 200, { ok: true });
      }
      if (me.role !== 'lead' && note.for !== me.u && note.for !== 'all') L.fail(403, 'Нет доступа');
      note.done = !!b.done; note.doneBy = me.u; note.doneName = me.name; note.doneTs = Date.now();
      await L.pipe([['HSET', NOTES, note.id, JSON.stringify(note)], bump]);
      if (note.done && me.role !== 'lead') await L.pushTo([note.author], { title: `${me.name} выполнил(а) заметку`, body: note.text || '', tag: 'note-' + note.id, url: '/?note=' + note.id });
      return L.send(res, 200, { note });
    }
    case 'comment': {
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!text) L.fail(400, 'Пустой комментарий');
      let owner;
      if (b.kind === 'note') {
        const raw = await L.redis('HGET', NOTES, String(b.pid || ''));
        if (!raw) L.fail(404, 'Заметка не найдена');
        owner = JSON.parse(raw).for;
      } else {
        owner = me.role === 'lead' ? String(b.owner || '') : me.u;
        if (!okName(owner)) L.fail(400, 'owner');
      }
      if (me.role !== 'lead' && owner !== me.u && owner !== 'all') L.fail(403, 'Нет доступа');
      const c = { id: id(), pid: String(b.pid || ''), kind: b.kind === 'note' ? 'note' : 'partner', owner, author: me.u, authorName: me.name, role: me.role,
        title: String(b.title || '').slice(0, 80), text, ts: Date.now() };
      await L.pipe([['HSET', COMMENTS, c.id, JSON.stringify(c)], bump]);
      const leads = (await L.allUsers()).filter(x => x.role === 'lead').map(x => x.u);
      let targets = me.role === 'lead' ? (owner === 'all' ? [] : [owner]) : leads;
      if (owner === 'all' && me.role === 'lead') targets = (await L.allUsers()).filter(x => x.role === 'seller').map(x => x.u);
      await L.pushTo(targets.filter(u => u !== me.u), { title: `💬 ${me.name}${c.title ? ' · ' + c.title : ''}`, body: text, tag: 'c-' + c.pid, url: `/?${c.kind}=${c.pid}` });
      return L.send(res, 200, { comment: c });
    }
    case 'commentDelete': {
      const raw = await L.redis('HGET', COMMENTS, String(b.id || ''));
      if (!raw) return L.send(res, 200, { ok: true });
      if (JSON.parse(raw).author !== me.u) L.fail(403, 'Можно удалить только свой комментарий');
      await L.pipe([['HDEL', COMMENTS, String(b.id)], bump]);
      return L.send(res, 200, { ok: true });
    }
    case 'subscribe': {
      const sub = b.sub;
      if (!sub || !sub.endpoint) L.fail(400, 'sub');
      const k = crypto.createHash('sha1').update(sub.endpoint).digest('hex');
      await L.redis('HSET', `${L.P}push:${me.u}`, k, JSON.stringify(sub));
      return L.send(res, 200, { ok: true, push: !!L.wp() });
    }
    case 'testPush': {
      await L.pushTo([me.u], { title: 'Mercury Map', body: 'Уведомления работают ✓', tag: 'test' });
      return L.send(res, 200, { ok: true, push: !!L.wp() });
    }
  }
  L.fail(400, 'unknown action');
});
