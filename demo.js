/* Mercury Map — демо-режим.
 * Открывается по ссылке ?demo=lead (пульт руководителя) или ?demo=seller (менеджер).
 * Подменяет только слой api(): вымышленная команда, маршруты, визиты и «живые» события
 * хранятся в памяти страницы. Реальные данные и сервер не затрагиваются, после перезагрузки всё сбрасывается. */
(function(){
'use strict';
const q = new URLSearchParams(location.search);
const MODE = q.get('demo');
const GRID_LAT = 0.0009, GRID_LNG = 0.0012;
const MIN = 60e3, HOUR = 3600e3;
const dayKey = d => { const x = new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const cellOf = (lat, lng) => Math.floor(lat/GRID_LAT) + ':' + Math.floor(lng/GRID_LNG);
function mDist(a, b){ const R = 6371000, r = Math.PI/180, dLa = (b[0]-a[0])*r, dLo = (b[1]-a[1])*r; const h = Math.sin(dLa/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const NAMES = ['Техно Маркет','Мир Электроники','Smart Phone Center','Дом Мебели Люкс','Стройдвор','Детский Мир','Олтин Бозор','Мобайл Сити','Бытовая Техника 24','Fashion House','Евро Мебель','Строй Маркет Север','Samarqand Textile','Gadget Zone','Mega Tools','Телеком Плаза','Уют Дом','Kids Planet','Электро Плюс','Home Style','Аль-Хорезми Техника','Бунёдкор Мебель','Cosmo Phone','Мастер Инструмент','Sport Zone','Ипак Йули Тексиль','Digital Hub','Зарафшон Строй'];
const CATS = ['Техника','Телефоны','Мебель','Одежда','Стройматериалы','Детские товары','Другое'];
const PEOPLE = ['Рустам Каримов','Нигора Алиева','Жавлон Юсупов','Сабина Рахимова','Отабек Саидов','Малика Турсунова','Шерзод Хасанов','Дилдора Эргашева'];
const TURN = ['до 50 млн','50–200 млн','200–500 млн','500 млн – 1 млрд','более 1 млрд'];
const PURPOSES = ['Сбор документов','Подписание договора','Обучение кассиров','Реанимация','Повторная встреча'];
const RESULTS = ['Обсудили условия рассрочки, владелец попросил расчёт','Забрали пакет документов, ждём подпись директора','Показал личный кабинет, кассир прошёл обучение','Вежливо отказались — работают с другим банком','Договорились созвониться в четверг','Оставил листовки и контакты, владельца не было до вечера','Подписали договор, подключаем кассу на этой неделе'];
const TEAM = [
  {u:'aziz',    name:'Азиз Назаров',      color:'#7c6cff', role:'seller', profile:'field',  from:4.2},
  {u:'dilnora', name:'Дилнора Мирзаева',  color:'#ff3b7f', role:'seller', profile:'visit',  from:4.6},
  {u:'bekzod',  name:'Бекзод Рустамов',   color:'#00b8a9', role:'seller', profile:'field',  from:3.1},
  {u:'madina',  name:'Мадина Каримова',   color:'#ff8a00', role:'seller', profile:'off',    from:0}
];
const LEAD = {u:'lead', name:'Тимлид (демо)', color:'#5b4bff', role:'lead'};

function active(){ return MODE === 'lead' || MODE === 'seller'; }

/* ---------- состояние ---------- */
const S = {inD: () => true, base:[41.3385,69.3345], rnd: rng(20260), users:{}, tracks:{}, live:{}, shifts:{}, data:{}, notes:[], comments:[], events:[], ver:1, dver:1, photos:{}, walkers:{}, timers:[], t0:0};
const me = () => MODE === 'seller' ? S.users.aziz : LEAD;
const rr = (a, b) => a + S.rnd() * (b - a);
const pick = arr => arr[Math.floor(S.rnd() * arr.length)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mv = (p, dn, de) => [p[0] + dn / 111320, p[1] + de / (111320 * Math.cos(p[0] * Math.PI / 180))];
const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]];

function nearInside(p){
  if (S.inD(p[0], p[1])) return p;
  for (let r = 100; r < 4000; r += 100) for (let a = 0; a < 360; a += 30){
    const c = mv(p, Math.sin(a * Math.PI/180) * r, Math.cos(a * Math.PI/180) * r);
    if (S.inD(c[0], c[1])) return c;
  }
  return S.base;
}
// шаг «по улицам»: перпендикулярные ходы, не выходя за район
function stepFrom(p, dir){
  for (let i = 0; i < 14; i++){
    const d = i === 0 && S.rnd() < .4 ? dir : pick(DIRS), len = rr(70, 150);
    const n = mv(p, d[0] * len, d[1] * len);
    if (S.inD(n[0], n[1])) return {p:n, dir:d};
  }
  return {p, dir:pick(DIRS)};
}
const fix = (p, ts, jit = 0) => { const q = jit ? mv(p, rr(-jit, jit), rr(-jit, jit)) : p; return [+q[0].toFixed(6), +q[1].toFixed(6), ts, Math.round(rr(6, 22))]; };

// пешая прогулка: из точки p выпускает точки трека каждые ~20 м до цели
function walk(pts, from, to, t, speed){
  const d = mDist(from, to), n = Math.max(1, Math.round(d / 22));
  for (let i = 1; i <= n; i++){ t += d / n / speed * 1000; pts.push(fix([from[0] + (to[0]-from[0]) * i / n, from[1] + (to[1]-from[1]) * i / n], Math.round(t), 1.5)); }
  return t;
}

/* ---------- генерация дней ---------- */
function newPartner(u, day, ts, pos, status, k){
  const id = uid() + k;
  const nm = NAMES[(S.nameIdx = (S.nameIdx || 0) + 1) % NAMES.length] + (S.nameIdx >= NAMES.length ? ' ' + Math.ceil(S.nameIdx / NAMES.length) : '');
  const connected = status === 'connected', refused = status === 'refused';
  const p = {id, name:nm, category:pick(CATS), lat:+pos[0].toFixed(6), lng:+pos[1].toFixed(6), day, ts, u:ts, status, photos:{facade:'demo-f-' + id, ...(refused ? {} : {inside:'demo-i-' + id})}, history:[]};
  if (status !== 'new'){
    p.person = pick(PEOPLE); p.phone = '+998 9' + Math.floor(rr(0, 10)) + ' ' + Math.floor(rr(100, 999)) + ' ' + Math.floor(rr(10, 99)) + ' ' + Math.floor(rr(10, 99));
    p.inn = String(Math.floor(rr(300000000, 309999999))); p.turnover = pick(TURN);
    if (connected) p.nextStep = 'Обучить кассиров, проверить первые продажи';
    else if (!refused) p.nextStep = pick(['Перезвонить в пятницу', 'Привезти договор', 'Уточнить документы по ИНН']);
  }
  return p;
}
function genDay(u, dayIdx, profile, fromH){
  const now = Date.now();
  const d = new Date(); d.setDate(d.getDate() - dayIdx); const day = dayKey(d);
  const start = dayIdx === 0 ? now - fromH * HOUR : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, Math.floor(rr(0, 25))).getTime();
  const endLimit = dayIdx === 0 ? now : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 17, 40).getTime();
  const D = S.data[u], pts = [];
  const seedPos = S.users[u].home;
  let pos = seedPos, t = start, dir = pick(DIRS), k = 0;
  pts.push(fix(pos, t));
  const partners = D.partners.filter(p => p.day !== day);
  let activeDone = false;
  while (t < endLimit - 4 * MIN){
    // цель: 2–4 шага по улицам
    let tgt = pos; const steps = 2 + Math.floor(rr(0, 3));
    for (let i = 0; i < steps; i++){ const s = stepFrom(tgt, dir); tgt = s.p; dir = s.dir; }
    // повторный визит к старому партнёру — иногда
    let repeat = null;
    if (partners.length && S.rnd() < .18 && dayIdx > 0){ repeat = pick(partners); tgt = [repeat.lat, repeat.lng]; }
    t = walk(pts, pos, tgt, t, rr(1.0, 1.35)); pos = tgt;
    if (t >= endLimit - 4 * MIN) break;
    const isLast = dayIdx === 0 && profile === 'visit' && t > endLimit - 22 * MIN;
    const vStart = isLast ? endLimit - 9 * MIN : t;
    let vDur = Math.round(rr(7, 22)) * MIN;
    if (!isLast && vStart + vDur > endLimit - 2 * MIN) vDur = Math.max(4 * MIN, endLimit - 2 * MIN - vStart);
    const vEnd = vStart + vDur;
    const roll = S.rnd(), status = roll < .24 ? 'refused' : roll < .55 ? 'contacts' : roll < .8 ? 'agreed' : 'connected';
    let p, v;
    if (repeat){
      p = repeat;
      v = {id:uid() + k, pid:p.id, kind:'repeat', purpose:pick(PURPOSES), day, start:vStart, ts:vStart, u:vEnd, lat:+pos[0].toFixed(6), lng:+pos[1].toFixed(6), photos:[], statusBefore:p.status};
      if (!isLast){ v.end = vEnd; v.result = pick(RESULTS); const ns = p.status === 'agreed' && S.rnd() < .6 ? 'connected' : p.status; v.statusAfter = ns; if (ns !== p.status){ p.history.push({s:ns, ts:vEnd, vid:v.id}); p.status = ns; p.u = vEnd; } }
    } else {
      p = newPartner(u, day, vStart, pos, isLast ? 'new' : status, k);
      if (!isLast){ p.history.push({s:status, ts:vEnd}); p.note = pick(RESULTS); p.u = vEnd; }
      v = {id:uid() + k, pid:p.id, kind:'new', day, start:vStart, ts:vStart, u:vEnd, lat:p.lat, lng:p.lng, photos:[]};
      if (!isLast){ v.end = vEnd; v.result = p.note; v.statusAfter = status; }
      D.partners.push(p);
    }
    D.visits.push(v); k++;
    // пока идёт визит — редкие точки с дрожанием GPS
    const stopEnd = isLast ? now : vEnd;
    for (let tt = vStart + 60e3; tt < stopEnd && tt < endLimit; tt += 60e3) pts.push(fix(pos, tt, 3));
    t = Math.min(stopEnd, endLimit);
    if (isLast){ activeDone = true; break; }
    if (S.rnd() < .12 && dayIdx > 0) t += 40 * MIN;           // обед
    if (D.visits.filter(x => x.day === day).length >= (dayIdx === 0 ? 5 : 7)) break;
  }
  if (dayIdx === 0 && profile === 'visit' && !activeDone){            // гарантируем идущий визит
    const p = newPartner(u, day, now - 9 * MIN, pos, 'new', 'x');
    D.partners.push(p);
    D.visits.push({id:uid() + 'x', pid:p.id, kind:'new', day, start:now - 9 * MIN, ts:now - 9 * MIN, u:now - 9 * MIN, lat:p.lat, lng:p.lng, photos:[]});
  }
  const arr = (S.tracks[day] = S.tracks[day] || {}); arr[u] = pts;
  return {pos, t: pts.length ? pts[pts.length - 1][2] : t, day, start, endLimit};
}

function buildWorld(){
  const base = S.base;
  const offs = {aziz:[-900, -700], dilnora:[800, -600], bekzod:[-500, 800], madina:[900, 900]};
  TEAM.forEach(m => {
    const o = offs[m.u], home = nearInside(mv(base, o[0], o[1]));
    S.users[m.u] = Object.assign({}, m, {home});
    S.data[m.u] = {strokes:[], partners:[], visits:[]};
  });
  TEAM.forEach(m => {
    const days = m.u === 'madina' ? 6 : 6;
    for (let di = days - 1; di >= 0; di--){
      if (di === 0 && m.profile === 'off') continue;
      if (di === 1 && m.u === 'bekzod') continue;                   // у Бекзода вчера выходной — для разнообразия
      const r = genDay(m.u, di, m.profile, m.from);
      if (di === 0){
        S.walkers[m.u] = {pos:r.pos, dir:pick(DIRS), tgt:null, stop:m.profile === 'visit'};
        S.live[m.u] = {lat:r.pos[0], lng:r.pos[1], ts:r.t, acc:12};
        S.shifts[m.u] = {day:dayKey(Date.now()), start:r.start};
      }
    }
  });
  // события дня из сгенерированных визитов
  const evs = [];
  const today = dayKey(Date.now());
  TEAM.forEach(m => {
    const sh = S.shifts[m.u]; if (sh) evs.push({ts:sh.start, type:'shift_start', u:m.u});
    S.data[m.u].visits.filter(v => v.day === today).forEach(v => {
      const p = S.data[m.u].partners.find(x => x.id === v.pid) || {};
      evs.push({ts:v.start, type:'visit_start', u:m.u, pid:v.pid, pname:p.name, kind:v.kind, vid:v.id, lat:v.lat, lng:v.lng});
      if (v.end) evs.push({ts:v.end, type:'visit_end', u:m.u, pid:v.pid, pname:p.name, kind:v.kind, status:v.statusAfter, dur:v.end - v.start, lat:v.lat, lng:v.lng});
    });
  });
  S.events = evs.sort((a, b) => a.ts - b.ts);
  if (MODE === 'seller'){                                              // менеджер-демо: «сегодня» чистое, день ещё не начат
    const a = S.data.aziz; a.visits = a.visits.filter(v => v.day !== today); a.partners = a.partners.filter(p => p.day !== today);
    delete S.shifts.aziz; delete S.walkers.aziz; delete S.live.aziz; if (S.tracks[today]) delete S.tracks[today].aziz;
    S.events = S.events.filter(e => e.u !== 'aziz');
  }
  // заметка руководителя и комментарии
  const bz = S.live.bekzod, az = S.data.aziz.partners.slice(-1)[0];
  const nowT = Date.now();
  S.notes.push({id:'n1', lat:+(bz.lat + .0016).toFixed(6), lng:+(bz.lng + .0012).toFixed(6), text:'Зайди в новый салон связи напротив — поговори с владельцем про рассрочку', for:'bekzod', author:'lead', authorName:LEAD.name, ts:nowT - 40 * MIN, done:false});
  S.notes.push({id:'n2', lat:+((S.live.aziz || S.live.bekzod).lat - .002).toFixed(6), lng:+((S.live.aziz || S.live.bekzod).lng - .0018).toFixed(6), text:'Забрать подписанные договоры', for:'aziz', author:'lead', authorName:LEAD.name, ts:nowT - 3 * HOUR, done:true, doneBy:'aziz', doneName:TEAM[0].name, doneTs:nowT - 2 * HOUR});
  if (az){
    S.comments.push({id:'c1', pid:az.id, kind:'partner', owner:'aziz', author:'lead', authorName:LEAD.name, role:'lead', title:az.name, text:'Хороший контакт — вернись завтра с договором, владелец готов смотреть.', ts:nowT - 55 * MIN});
    S.comments.push({id:'c2', pid:az.id, kind:'partner', owner:'aziz', author:'aziz', authorName:TEAM[0].name, role:'seller', title:az.name, text:'Принял, завтра с утра зайду.', ts:nowT - 48 * MIN});
  }
}

/* ---------- «живая» симуляция ---------- */
function addEvent(e){ S.events.push(Object.assign({ts:Date.now()}, e)); }
function moveWalkers(dtSec){
  const now = Date.now(), today = dayKey(now);
  for (const u of Object.keys(S.walkers)){
    const sh = S.shifts[u]; if (!sh || sh.end) continue;
    const w = S.walkers[u];
    if (w.stop){ S.live[u] = Object.assign({}, S.live[u], {ts:now}); continue; }
    if (!w.tgt || mDist(w.pos, w.tgt) < 12){ const s = stepFrom(w.pos, w.dir); w.tgt = s.p; w.dir = s.dir; }
    const dist = Math.min(mDist(w.pos, w.tgt), 1.25 * dtSec * 6);               // ускоряем ×6, чтобы движение было видно
    const f = dist / Math.max(1, mDist(w.pos, w.tgt));
    w.pos = [w.pos[0] + (w.tgt[0] - w.pos[0]) * f, w.pos[1] + (w.tgt[1] - w.pos[1]) * f];
    const p = fix(w.pos, now, 0.8);
    S.live[u] = {lat:p[0], lng:p[1], ts:now, acc:p[3]};
    ((S.tracks[today] = S.tracks[today] || {})[u] = S.tracks[today][u] || []).push(p);
  }
}
function script(n){
  const now = Date.now(), today = dayKey(now);
  if (n === 2){                                                        // Мадина «выезжает из офиса»
    const m = S.users.madina; S.shifts.madina = {day:today, start:now};
    S.walkers.madina = {pos:m.home, dir:pick(DIRS), tgt:null, stop:false};
    S.live.madina = {lat:m.home[0], lng:m.home[1], ts:now, acc:10};
    (S.tracks[today] = S.tracks[today] || {}).madina = [fix(m.home, now)];
    addEvent({type:'shift_start', u:'madina'});
    return;
  }
  if (n < 5 || n % 4 !== 1) return;
  const field = Object.keys(S.walkers).filter(u => S.shifts[u] && !S.shifts[u].end);
  const u = field[Math.floor(n / 4) % field.length], w = S.walkers[u], D = S.data[u];
  const act = D.visits.find(v => !v.end && v.day === today);
  if (act){
    const p = D.partners.find(x => x.id === act.pid);
    const roll = S.rnd(), status = roll < .2 ? 'refused' : roll < .5 ? 'contacts' : roll < .8 ? 'agreed' : 'connected';
    const res = pick(RESULTS);
    Object.assign(act, {end:now, u:now, statusAfter:status, result:res});
    if (p){ p.status = status; p.u = now; p.history.push({s:status, ts:now, vid:act.id}); p.person = pick(PEOPLE); p.phone = '+998 9' + Math.floor(rr(0, 10)) + ' ' + Math.floor(rr(100, 999)) + ' ' + Math.floor(rr(10, 99)) + ' ' + Math.floor(rr(10, 99)); p.inn = String(Math.floor(rr(300000000, 309999999))); p.turnover = pick(TURN); p.note = res; }
    addEvent({type:'visit_end', u, pid:act.pid, pname:p && p.name, kind:act.kind, status, dur:now - act.start, lat:act.lat, lng:act.lng});
    w.stop = false; S.dver++;
  } else {
    const pos = w.pos, p = newPartner(u, today, now - Math.round(rr(5, 12)) * MIN, pos, 'new', 'l' + n);
    D.partners.push(p);
    const v = {id:uid() + 'l' + n, pid:p.id, kind:'new', day:today, start:p.ts, ts:p.ts, u:now, lat:p.lat, lng:p.lng, photos:[]};
    D.visits.push(v);
    addEvent({type:'visit_start', u, pid:p.id, pname:p.name, kind:'new', vid:v.id, lat:p.lat, lng:p.lng});
    w.stop = true; S.dver++;
  }
}

/* ---------- эмуляция API ---------- */
const cellsOf = pts => { const s = new Set(); pts.forEach((p, i) => { s.add(cellOf(p[0], p[1])); const q0 = pts[i-1]; if (q0 && Math.abs(p[2] - q0[2]) < 10 * MIN){ const n = Math.min(40, Math.ceil(mDist(q0, p) / 40)); for (let k = 1; k < n; k++) s.add(cellOf(q0[0] + (p[0]-q0[0]) * k / n, q0[1] + (p[1]-q0[1]) * k / n)); } }); return [...s]; };
const lead = () => MODE === 'lead';
const ok = (o) => Promise.resolve(JSON.parse(JSON.stringify(o)));
async function api(path, {method = 'GET', body} = {}){
  const url = new URL(path, location.href), p = url.pathname.replace(/^.*\/api\//, 'api/'), qs = url.searchParams;
  const tm = new Promise(r => setTimeout(r, 60 + Math.random() * 90));    // небольшая задержка — как у настоящего сервера
  await tm;
  switch (p){
    case 'api/auth': {
      if (qs.get('action') === 'me' || (body && body.action === 'me')) return ok({user:pubUser(me()), trackToken:'demo-token', team:team(), shift:S.shifts[me().u] || null, work:[7, 21], vapid:null});
      if (body && body.action === 'register') return {ok:true};
      if (body && body.action === 'newTrackToken') return {trackToken:'demo-' + Math.random().toString(36).slice(2, 8)};
      return {ok:true};
    }
    case 'api/data': {
      if (method === 'POST'){ const D = S.data[me().u]; Object.assign(D, {strokes:body.strokes || [], partners:body.partners || [], visits:body.visits || []}); S.dver++; return ok(Object.assign({}, D, {deleted:body.deleted || {}})); }
      if (lead()){ const out = {}; TEAM.forEach(m => out[m.u] = S.data[m.u]); return ok({sellers:out, dver:S.dver}); }
      return ok(Object.assign({deleted:{}}, S.data[me().u]));
    }
    case 'api/feed': {
      if (method === 'POST'){
        const a = body.action, now = Date.now(), L = me();
        if (a === 'shiftStart'){ const sh = S.shifts[L.u] && S.shifts[L.u].day === dayKey(now) ? S.shifts[L.u] : {day:dayKey(now), start:now}; delete sh.end; S.shifts[L.u] = sh; addEvent({type:'shift_start', u:L.u}); return ok({shift:sh}); }
        if (a === 'shiftEnd'){ const sh = S.shifts[L.u]; sh.end = now; sh.summary = body.summary || ''; addEvent({type:'shift_end', u:L.u, summary:sh.summary}); return ok({shift:sh}); }
        if (a === 'note'){
          const n = {id:uid(), lat:body.lat, lng:body.lng, text:body.text || '', for:body.for || 'all', author:'lead', authorName:LEAD.name, ts:now, done:false};
          S.notes.push(n); S.ver++; addEvent({type:'note', u:'lead', role:'lead', nid:n.id, for:n.for, text:n.text, lat:n.lat, lng:n.lng});
          const target = n.for === 'all' ? 'aziz' : n.for;
          setTimeout(() => { n.done = true; n.doneBy = target; n.doneName = S.users[target].name; n.doneTs = Date.now(); S.ver++; addEvent({type:'note_done', u:target, nid:n.id, text:n.text, lat:n.lat, lng:n.lng}); }, 14000);
          return ok({note:n});
        }
        if (a === 'noteDone'){ const n = S.notes.find(x => x.id === body.id); if (n){ n.done = !!body.done; n.doneBy = L.u; n.doneName = L.name; n.doneTs = now; S.ver++; } return ok({note:n}); }
        if (a === 'noteDelete'){ S.notes = S.notes.filter(x => x.id !== body.id); S.ver++; return ok({ok:true}); }
        if (a === 'comment'){
          const c = {id:uid(), pid:body.pid, kind:body.kind === 'note' ? 'note' : 'partner', owner:body.owner || L.u, author:L.u, authorName:L.name, role:L.role, title:body.title || '', text:body.text, ts:now};
          S.comments.push(c); S.ver++; addEvent({type:'comment', u:L.u, role:L.role, pid:c.pid, kind:c.kind, title:c.title, text:c.text, owner:c.owner});
          if (L.role === 'lead' && S.users[c.owner]) setTimeout(() => {
            const r = {id:uid(), pid:c.pid, kind:c.kind, owner:c.owner, author:c.owner, authorName:S.users[c.owner].name, role:'seller', title:c.title, text:pick(['Принял, сделаю.', 'Понял, зайду после обеда.', 'Ок, уточню у владельца и отпишусь.']), ts:Date.now()};
            S.comments.push(r); S.ver++; addEvent({type:'comment', u:c.owner, role:'seller', pid:r.pid, kind:r.kind, title:r.title, text:r.text, owner:r.owner});
          }, 6000);
          return ok({comment:c});
        }
        if (a === 'testPush') return {ok:true, push:false};
        return {ok:true};
      }
      if (qs.get('full')) return ok({notes:lead() ? S.notes : S.notes.filter(n => n.for === me().u || n.for === 'all'), comments:lead() ? S.comments : S.comments.filter(c => c.owner === me().u), ver:S.ver, now:Date.now()});
      const out = {ver:S.ver, dver:S.dver, day:dayKey(Date.now()), now:Date.now(), live:{}, shifts:{}, events:[], ev:0};
      if (lead()){
        const sel = (qs.get('sellers') || '').split(',').filter(Boolean);
        sel.forEach(u => { if (S.live[u]) out.live[u] = S.live[u]; if (S.shifts[u]) out.shifts[u] = S.shifts[u]; });
        const from = Math.max(0, +qs.get('ev') || 0); out.events = S.events.slice(from); out.ev = from + out.events.length;
      } else if (S.shifts[me().u]) out.shifts[me().u] = S.shifts[me().u];
      return ok(out);
    }
    case 'api/track': {
      if (method === 'POST') return {ok:true, n:(body.points || []).length, ver:S.ver};
      if (qs.get('cov')){
        const cov = {}; TEAM.forEach(m => { if (!lead() && m.u !== me().u) return; const all = []; Object.keys(S.tracks).forEach(k => all.push(...((S.tracks[k][m.u]) || []))); cov[m.u] = cellsOf(all.sort((a, b) => a[2] - b[2])); });
        return ok({cov, grid:[GRID_LAT, GRID_LNG]});
      }
      const from = qs.get('from') || dayKey(Date.now()), to = qs.get('to') || from, days = {};
      for (let k = from; k <= to; ){ const t = S.tracks[k] || {}; days[k] = {}; TEAM.forEach(m => { if ((lead() || m.u === me().u) && t[m.u]) days[k][m.u] = t[m.u]; }); const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + 1); k = dayKey(d); }
      return ok({day:dayKey(Date.now()), days});
    }
    case 'api/photo': { const id = 'up-' + uid(); S.photos[id] = body.data; return {id}; }
  }
  return {ok:true};
}
const pubUser = u => ({u:u.u, name:u.name, role:u.role, color:u.color});
const team = () => [pubUser(LEAD)].concat(TEAM.map(pubUser));

// фасады и залы партнёров — простые иллюстрации (без внешних картинок)
function photoUrl(id){
  if (S.photos[id]) return S.photos[id];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360, inside = id.startsWith('demo-i');
  const svg = inside
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="hsl(${hue} 25% 30%)"/><rect y="150" width="320" height="90" fill="hsl(${hue} 20% 22%)"/>${[0,1,2].map(i => `<rect x="${24 + i * 100}" y="60" width="84" height="110" rx="6" fill="hsl(${(hue + i * 40) % 360} 45% 55%)"/><rect x="${32 + i * 100}" y="70" width="68" height="14" rx="3" fill="rgba(255,255,255,.35)"/>`).join('')}<rect x="90" y="176" width="140" height="34" rx="6" fill="hsl(${hue} 30% 45%)"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="hsl(${hue} 20% 78%)"/><rect y="170" width="320" height="70" fill="#8d93a5"/><rect x="30" y="40" width="260" height="140" fill="hsl(${hue} 25% 92%)"/><rect x="30" y="40" width="260" height="34" fill="hsl(${hue} 60% 45%)"/>${[0,1,2,3,4,5,6,7].map(i => `<path d="M${30 + i * 32.5} 74 h32.5 l-6 18 h-20.5z" fill="${i % 2 ? '#fff' : `hsl(${hue} 60% 55%)`}"/>`).join('')}<rect x="50" y="104" width="90" height="76" rx="4" fill="hsl(${hue} 30% 35%)" opacity=".85"/><rect x="160" y="104" width="50" height="76" rx="4" fill="hsl(${hue} 30% 35%)" opacity=".85"/><rect x="226" y="104" width="46" height="76" rx="4" fill="hsl(${hue} 40% 60%)"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* ---------- запуск ---------- */
async function boot(ctx){
  try { await ctx.districtReady; } catch(e){}
  S.inD = ctx.inDistrict;
  const b = ctx.getBounds && ctx.getBounds();
  if (b){ const c = b.getCenter(); S.base = nearInside([c.lat, c.lng]); } else S.base = nearInside(S.base);
  buildWorld();
  const exit = document.getElementById('demoExit'); if (exit) exit.onclick = () => { location.href = location.pathname; };
  document.body.classList.add('demo');
  return {token:'demo', user:pubUser(me()), team:team(), trackToken:'demo-token', vapid:null};
}
function mounted(){
  let n = 0, last = Date.now();
  setInterval(() => { n++; const now = Date.now(), dt = (now - last) / 1000; last = now; moveWalkers(dt); script(n); }, 3000);
}

window.MMDemo = {active, api, boot, mounted, photoUrl, realGps:false};
})();
