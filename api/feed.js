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
    // лёгкий опрос (2 команды Redis): версии, позиции и смены менеджеров + новые события ленты
    const sellers = s.role === 'lead' ? String(req.query.sellers || '').split(',').filter(okName).slice(0, 50) : [s.u];
    const keys = [L.P + 'ver', L.P + 'dver'];
    if (s.role === 'lead') sellers.forEach(u => keys.push(`${L.P}live:${u}`));
    sellers.forEach(u => keys.push(`${L.P}shift:${u}`));
    const evFrom = Math.max(0, parseInt(req.query.ev || '0', 10) || 0);
    const day = L.dayOf(Date.now());
    const cmds = [['MGET', ...keys]];
    if (s.role === 'lead') cmds.push(['LRANGE', `${L.P}events:${day}`, evFrom, -1]);
    const r = await L.pipe(cmds);
    const vals = r[0];
    const live = {}, shifts = {};
    let i = 2;
    if (s.role === 'lead') sellers.forEach(u => { if (vals[i]) live[u] = JSON.parse(vals[i]); i++; });
    sellers.forEach(u => { if (vals[i]) shifts[u] = JSON.parse(vals[i]); i++; });
    const events = s.role === 'lead' ? (r[1] || []).map(x => JSON.parse(x)) : [];
    return L.send(res, 200, { ver: +vals[0] || 0, dver: +vals[1] || 0, live, shifts, events, ev: evFrom + events.length, day, now: Date.now() });
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
      await L.addEvents([{ type: 'note', u: me.u, role: 'lead', nid: note.id, for: note.for, text: note.text.slice(0, 120), lat: note.lat, lng: note.lng }]);
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
      if (note.done && me.role !== 'lead') await L.addEvents([{ type: 'note_done', u: me.u, nid: note.id, text: note.text.slice(0, 120), lat: note.lat, lng: note.lng }]);
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
      await L.addEvents([{ type: 'comment', u: me.u, role: me.role, pid: c.pid, kind: c.kind, title: c.title, text: text.slice(0, 120), owner }]);
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
    case 'shiftStart': case 'shiftEnd': {
      if (me.role !== 'seller') L.fail(403, 'Только менеджер');
      const day = L.dayOf(Date.now());
      let sh = await L.getShift(me.u);
      if (!sh || sh.day !== day) sh = { day };
      if (b.action === 'shiftStart') {
        const resumed = !!sh.end;
        if (!sh.start) sh.start = Date.now();
        delete sh.end;
        await L.redis('SET', `${L.P}shift:${me.u}`, JSON.stringify(sh), 'EX', 3 * 86400);
        await L.addEvents([{ type: resumed ? 'shift_resume' : 'shift_start', u: me.u }]);
      } else {
        if (!sh.start) L.fail(400, 'День не начат');
        sh.end = Date.now();
        sh.summary = String(b.summary || '').slice(0, 300);
        await L.redis('SET', `${L.P}shift:${me.u}`, JSON.stringify(sh), 'EX', 3 * 86400);
        await L.addEvents([{ type: 'shift_end', u: me.u, summary: sh.summary }]);
        const leads = (await L.allUsers()).filter(x => x.role === 'lead').map(x => x.u);
        await L.pushTo(leads, { title: `${me.name} завершил(а) день`, body: sh.summary || '', tag: 'shift-' + me.u, url: '/' });
      }
      return L.send(res, 200, { shift: sh });
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
