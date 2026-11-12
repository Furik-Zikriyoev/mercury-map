/* Mercury Map — полевые продажи: маршруты, партнёры, контроль руководителя */
(() => {
'use strict';

/* ================= константы ================= */
const STATUSES = {
  refused:   {label:'Отказался',                 short:'Отказ',      color:'#ff4d5e'},
  contacts:  {label:'Взял контакты, жду ответа', short:'Жду ответа', color:'#ffb020'},
  agreed:    {label:'Согласился, жду документы', short:'Жду доки',   color:'#4c8dff'},
  connected: {label:'Подключён',                 short:'Подключён',  color:'#2fd07a'}
};
const ST_ORDER = ['refused','contacts','agreed','connected'];
const PEN_COLORS = ['#7c6cff','#ff3b7f','#00b8a9','#ff8a00','#1f2937'];
const USER_COLORS = ['#7c6cff','#ff3b7f','#00b8a9','#ff8a00','#2f8cff','#e83fd1','#20c05c','#ff5a36'];
const WEIGHTS = [4,6,9];
const ERASERS = [12,22,38];
const STYLES = {
  osm:{name:'Улицы', url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max:19, attr:'© OpenStreetMap'},
  esri:{name:'Esri', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', max:19, attr:'© Esri, © OpenStreetMap'},
  sat:{name:'Спутник', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max:19, attr:'© Esri'},
  dark:{name:'Ночь', url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', max:16, attr:'© Esri'}
};
const TASHKENT = [41.3111, 69.2797];
const BOUNDS = [[41.13, 69.03], [41.48, 69.53]];
const GAP = 10 * 60e3; // разрыв трека, если точек не было 10 минут
const I = {
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  pen:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><path d="M12 7v6M9 10h6"/>',
  eraser:'<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  me:'<path d="M3 11 22 2l-9 19-2-8-8-2z"/>',
  note:'<path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/>',
  team:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.3.2 4.1 1.6 4.8 4"/>',
  report:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'
};
const svg = (k, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

/* ================= помощники ================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey = d => { const x = new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const parseDay = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const shiftDay = (k, n) => { const d = parseDay(k); d.setDate(d.getDate()+n); return dayKey(d); };
const today = () => dayKey(Date.now());
const TZ = {timeZone:'Asia/Tashkent'};
const fmtDay = k => {
  if (k === today()) return 'Сегодня';
  if (k === shiftDay(today(), -1)) return 'Вчера';
  const s = new Intl.DateTimeFormat('ru-RU',{weekday:'short', day:'numeric', month:'long'}).format(parseDay(k));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtShort = k => new Intl.DateTimeFormat('ru-RU',{day:'numeric', month:'short'}).format(parseDay(k));
const fmtTime = ts => new Intl.DateTimeFormat('ru-RU',{...TZ, day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(ts));
const fmtHM = ts => new Intl.DateTimeFormat('ru-RU',{...TZ, hour:'2-digit', minute:'2-digit'}).format(new Date(ts));
const fmtKm = m => m < 1000 ? Math.round(m)+' м' : (m/1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',')+' км';
const plural = (n, a, b, c) => { const m10 = n%10, m100 = n%100; return m10===1&&m100!==11 ? a : (m10>=2&&m10<=4&&(m100<10||m100>=20) ? b : c); };
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'только что'; if (s < 3600) return Math.round(s/60)+' мин назад'; if (s < 86400) return Math.round(s/3600)+' ч назад'; return fmtTime(ts); };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
const tashHour = (ms = Date.now()) => { const d = new Date(ms + 5*3600e3); return d.getUTCHours() + d.getUTCMinutes()/60; };
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch(e){ return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
function distM(a, b){ return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1])); }
function trackKm(pts){ let d = 0; for (let i = 1; i < pts.length; i++) if (pts[i][2] - pts[i-1][2] < GAP) d += distM(pts[i-1], pts[i]); return d; }
function mergePts(a, b){ const all = (a||[]).concat(b||[]).sort((x,y) => x[2]-y[2]); const out = []; for (const p of all){ const l = out[out.length-1]; if (l && p[2]-l[2] < 5000) continue; out.push(p); } return out; }
let toastT;
function toast(msg, ms = 2400){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

/* ================= состояние ================= */
let session = lsGet('mm-session', null);
const me = () => session && session.user;
const isLead = () => !!me() && me().role === 'lead';
const isSeller = () => !!me() && me().role === 'seller';
const cfg = Object.assign({style:'osm', color:PEN_COLORS[0], weight:6, eraser:22, district:true, view:null, rec:true, wake:true}, lsGet('mm-settings', {}));
const saveCfg = () => lsSet('mm-settings', cfg);

let DKEY = null;
let db = {strokes:[], partners:[], deleted:{}};
let teamData = {};            // руководитель: данные всех сейлеров
let tracks = {};              // tracks[day][u] = [[lat,lng,ts,acc],…]
let live = {};                // руководитель: последние позиции
let notes = [], comments = [];
let feedVer = -1, dataVer = -1;
let seen = {};
let mode = 'hand', day = today(), allDays = false, focus = null;
let undoStack = [], cur = null, erasing = null, pendingRemote = null, ghost = null;

/* ================= API ================= */
async function api(path, {method = 'GET', body} = {}){
  const headers = {'Content-Type':'application/json'};
  if (session && session.token) headers.Authorization = 'Bearer ' + session.token;
  const r = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined});
  let j = {}; try { j = await r.json(); } catch(e){}
  if (r.status === 401 && session && !(body && body.action === 'login')){ logout(true); throw new Error('Войдите заново'); }
  if (!r.ok) throw new Error(j.error === 'storage_not_configured' ? 'Облако не подключено в Vercel' : (j.error || ('Ошибка ' + r.status)));
  return j;
}

/* ================= карта ================= */
const map = L.map('map', {minZoom:11, maxBounds:BOUNDS, maxBoundsViscosity:.9, zoomControl:false, tap:false, zoomSnap:.25, wheelPxPerZoomLevel:90});
const vOk = cfg.view && L.latLngBounds(BOUNDS).contains([cfg.view[0], cfg.view[1]]);
map.setView(vOk ? [cfg.view[0], cfg.view[1]] : TASHKENT, vOk ? Math.max(cfg.view[2], 11) : 13);
map.attributionControl.setPrefix(false);
let tiles;
function setStyle(key){
  if (!STYLES[key]) key = 'osm';
  const s = STYLES[key];
  if (tiles) map.removeLayer(tiles);
  tiles = L.tileLayer(s.url, {maxZoom:20, maxNativeZoom:s.max, attribution:s.attr, bounds:BOUNDS, updateWhenIdle:true, updateWhenZooming:false, keepBuffer:3}).addTo(map);
  cfg.style = key; saveCfg();
}
setStyle(cfg.style);
map.createPane('district'); map.getPane('district').style.zIndex = 350; map.getPane('district').style.pointerEvents = 'none';
const renderer = L.canvas({padding:.5, tolerance:12});
const routeLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const noteLayer = L.layerGroup().addTo(map);
const liveLayer = L.layerGroup().addTo(map);
let meMarker = null;
map.on('moveend', () => { const c = map.getCenter(); cfg.view = [+c.lat.toFixed(5), +c.lng.toFixed(5), map.getZoom()]; saveCfg(); });
const zoomCls = () => map.getContainer().classList.toggle('lowzoom', map.getZoom() < 15.5);
map.on('zoomend', zoomCls); zoomCls();

/* ---------- Мирзо-Улугбекский район ---------- */
const GEOKEY = 'mirzo-ulugbek-geo-v1';
const DQUERIES = ['Мирзо-Улугбекский район, Ташкент', 'Mirzo Ulugbek district, Tashkent', 'Mirzo Ulugʻbek tumani'];
let districtLayer = null, districtBounds = null;
function pickGeom(gj){
  if (!gj) return null;
  const fs = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [{geometry:gj}];
  const f = (fs || []).find(f => f && f.geometry && /Polygon/.test(f.geometry.type));
  return f ? f.geometry : null;
}
function drawDistrict(geom){
  if (districtLayer) map.removeLayer(districtLayer);
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const outer = polys.map(pg => pg[0].map(([x, y]) => [y, x]));
  const world = [[85,-180],[85,180],[-85,180],[-85,-180]];
  districtLayer = L.layerGroup([
    L.polygon([world, ...outer], {pane:'district', stroke:false, fillColor:'#141626', fillOpacity:.18, interactive:false}),
    L.polygon(outer, {pane:'district', color:'#fff', weight:7, opacity:.9, fill:false, interactive:false}),
    L.polygon(outer, {pane:'district', color:'#7c6cff', weight:3.5, fill:true, fillColor:'#7c6cff', fillOpacity:.04, interactive:false})
  ]);
  districtBounds = L.latLngBounds(outer.flat());
  if (cfg.district) districtLayer.addTo(map);
}
async function loadDistrict(force){
  let geom = null;
  if (!force) geom = lsGet(GEOKEY, null);
  if (!geom && !force){ try { const r = await fetch('mirzo-ulugbek.geojson', {cache:'no-cache'}); if (r.ok) geom = pickGeom(await r.json()); } catch(e){} }
  if (!geom){
    for (const q of DQUERIES){
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({q, countrycodes:'uz', format:'geojson', polygon_geojson:'1', polygon_threshold:'0.00003', limit:'5', 'accept-language':'ru'}));
        if (r.ok){ geom = pickGeom(await r.json()); if (geom) break; }
      } catch(e){}
    }
  }
  if (!geom){ if (force) toast('Не удалось загрузить границу района'); return false; }
  lsSet(GEOKEY, geom);
  const first = !districtLayer;
  drawDistrict(geom);
  if ((first && !cfg.view) || force) map.flyToBounds(districtBounds, {padding:[20,20], duration:.7});
  return true;
}
loadDistrict();

/* ================= данные ================= */
const sellers = () => (session && session.team || []).filter(x => x.role === 'seller');
const userOf = u => (session && session.team || []).find(x => x.u === u) || {u, name:u, color:'#7c6cff'};
const visibleSellers = () => isLead() ? (focus ? [focus] : sellers().map(x => x.u)) : (me() ? [me().u] : []);
const dataOf = u => isLead() ? (teamData[u] || {strokes:[], partners:[]}) : db;
const trackOf = (u, k) => (tracks[k] && tracks[k][u]) || [];
const pDays = p => new Set([p.day, ...(p.history || []).map(h => dayKey(h.ts))]);
const onDay = (p, k) => pDays(p).has(k);
function findPartner(id){
  for (const u of isLead() ? Object.keys(teamData) : [me().u]){ const p = dataOf(u).partners.find(x => x.id === id); if (p) return {p, owner:u}; }
  return null;
}
const strokeLen = s => { let d = 0; for (let i=1;i<s.pts.length;i++) d += map.distance(s.pts[i-1], s.pts[i]); return d; };
const manualKm = (u, k) => dataOf(u).strokes.filter(s => s.day === k).reduce((a,s) => a + strokeLen(s), 0);

/* ---------- сохранение и синхронизация (сейлер) ---------- */
const store = {
  save(localOnly){
    if (!DKEY) return;
    if (!localOnly){ trackDeletes(); scheduleSync(); }
    lsSet(DKEY, db);
  }
};
const allItems = () => db.strokes.concat(db.partners);
let lastIds = new Set();
function trackDeletes(){
  const now = Date.now(), curIds = new Set();
  allItems().forEach(x => { curIds.add(x.id); if (db.deleted[x.id]){ delete db.deleted[x.id]; x.u = now; } });
  lastIds.forEach(id => { if (!curIds.has(id)) db.deleted[id] = now; });
  lastIds = curIds;
}
let syncTimer = null, syncing = false, syncDirty = false, syncState = 'idle', syncMsg = 'Ещё не синхронизировано', retryTimer = null;
function setSync(st, msg){
  syncState = st; if (msg) syncMsg = msg;
  $('#syncDot').dataset.s = st;
  const c = document.getElementById('cloudState'); if (c) c.innerHTML = cloudHtml();
}
const cloudHtml = () => `<span class="sync" data-s="${syncState}"></span><div><b>${syncState==='ok' ? 'Сохранено в облаке' : syncState==='pending' ? 'Сохраняю…' : syncState==='error' ? 'Нет связи с облаком' : 'Облако'}</b><div class="sub">${esc(syncMsg)}</div></div>`;
function scheduleSync(){ if (!isSeller()) return; syncDirty = true; setSync('pending'); clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 600); }
async function syncNow(){
  if (!isSeller()) return;
  if (syncing){ syncDirty = true; return; }
  syncing = true; syncDirty = false; clearTimeout(retryTimer);
  try {
    const j = await api('api/data', {method:'POST', body:{strokes:db.strokes, partners:db.partners, deleted:db.deleted}});
    if (!syncDirty) applyRemote(j);
    setSync('ok', 'Последнее сохранение: ' + fmtHM(Date.now()));
  } catch(e){
    setSync('error', /fetch|network|load/i.test(e.message) ? 'Нет интернета — сохраню, как только появится связь' : e.message);
    retryTimer = setTimeout(syncNow, 15000);
  } finally { syncing = false; if (syncDirty) syncNow(); }
}
function applyRemote(j){
  if (!j || !Array.isArray(j.strokes)) return;
  if (cur || erasing){ pendingRemote = j; return; }
  const before = JSON.stringify({s:db.strokes, p:db.partners});
  db.strokes = j.strokes; db.partners = j.partners; db.deleted = j.deleted || {};
  lastIds = new Set(allItems().map(x => x.id));
  store.save(true);
  if (JSON.stringify({s:db.strokes, p:db.partners}) !== before){ undoStack.length = 0; render(); }
}
async function loadTeamData(){
  try { const j = await api('api/data'); teamData = j.sellers || {}; dataVer = +j.dver || dataVer; setSync('ok', 'Обновлено: ' + fmtHM(Date.now())); render(); }
  catch(e){ setSync('error', e.message); }
}

/* ---------- треки ---------- */
async function ensureTracks(k, force){
  if (!force && tracks[k] && tracks[k].__loaded) return;
  try {
    const j = await api('api/track?day=' + k);
    const t = tracks[k] || (tracks[k] = {});
    for (const [u, pts] of Object.entries(j.tracks || {})) t[u] = mergePts(t[u], pts);
    t.__loaded = Date.now();
  } catch(e){}
}

/* ---------- заметки и комментарии ---------- */
async function loadFeed(){
  try {
    const j = await api('api/feed?full=1');
    const prev = new Set(comments.map(c => c.id).concat(notes.map(n => n.id)));
    const fresh = feedVer >= 0 ? [...j.comments.filter(c => !prev.has(c.id) && c.author !== me().u), ...j.notes.filter(n => !prev.has(n.id) && n.author !== me().u)] : [];
    notes = j.notes; comments = j.comments; feedVer = j.ver;
    if (fresh.length){ const f = fresh[fresh.length-1]; toast(f.pid ? `💬 ${f.authorName}: ${f.text}` : `📌 Новая заметка: ${f.text || 'метка на карте'}`, 4000); }
    render();
    const open = document.getElementById('thread'); if (open) open.dispatchEvent(new Event('refresh'));
  } catch(e){}
}
const seenKey = () => 'mm-seen-' + (me() ? me().u : '');
const markSeen = id => { seen[id] = Date.now(); lsSet(seenKey(), seen); };
const unread = id => comments.some(c => c.pid === id && c.author !== me().u && c.ts > (seen[id] || 0)) || notes.some(n => n.id === id && n.author !== me().u && n.ts > (seen[id] || 0));

/* ================= отрисовка ================= */
function pinIcon(color, ghostPin, dot){
  return L.divIcon({className:'', iconSize:[34,44], iconAnchor:[17,42],
    html:`<div class="pin${ghostPin?' ghost':''}"><svg viewBox="0 0 34 44" width="34" height="44"><path d="M17 1C8.2 1 1 8 1 16.6 1 28 17 43 17 43s16-15 16-26.4C33 8 25.8 1 17 1z" fill="${color}" stroke="#fff" stroke-width="2"/></svg><i></i>${dot?'<span class="unread"></span>':''}</div>`});
}
function noteIcon(done, ghostNote, dot){
  return L.divIcon({className:'', iconSize:[36,40], iconAnchor:[18,39],
    html:`<div class="note${done?' done':''}${ghostNote?' ghost':''}"><span class="dia"></span><span class="stem"></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${done ? '<path d="M5 12l5 5 9-10"/>' : I.note}</svg>${dot?'<span class="unread"></span>':''}</div>`});
}
function segments(pts){
  const out = []; let seg = [];
  for (const p of pts){ const l = seg[seg.length-1]; if (l && p[2] - l[2] > GAP){ if (seg.length > 1) out.push(seg); seg = []; } seg.push(p); }
  if (seg.length > 1) out.push(seg);
  return out;
}
function render(){ renderRoutes(); renderPins(); renderNotes(); renderLive(); updateHeader(); renderPeople(); }
function renderRoutes(){
  routeLayer.clearLayers();
  for (const u of visibleSellers()){
    const color = userOf(u).color;
    if (!allDays){
      for (const seg of segments(trackOf(u, day))){
        const ll = seg.map(p => [p[0], p[1]]);
        L.polyline(ll, {renderer, color:'#fff', weight:9, opacity:.9, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer);
        L.polyline(ll, {renderer, color, weight:5, opacity:.95, lineCap:'round', lineJoin:'round'}).addTo(routeLayer)
          .on('click', () => { if (mode === 'hand') toast(`${isLead() ? userOf(u).name + ' · ' : ''}GPS ${fmtHM(seg[0][2])}–${fmtHM(seg[seg.length-1][2])} · ${fmtKm(trackKm(seg))}`); });
        L.circleMarker(ll[0], {renderer, radius:5, color:'#fff', weight:2, fillColor:color, fillOpacity:1, interactive:false}).addTo(routeLayer);
      }
    }
    const strokes = dataOf(u).strokes.filter(s => allDays || s.day === day);
    strokes.forEach(s => {
      const op = allDays && s.day !== day ? .6 : 1;
      L.polyline(s.pts, {renderer, color:'#fff', weight:s.w+4, opacity:.85*op, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer);
      L.polyline(s.pts, {renderer, color:s.c, weight:s.w, opacity:op, lineCap:'round', lineJoin:'round'}).addTo(routeLayer)
        .on('click', () => { if (mode === 'hand') toast(fmtDay(s.day)+' · нарисовано · '+fmtKm(strokeLen(s))); });
    });
  }
}
function renderPins(){
  pinLayer.clearLayers();
  for (const u of visibleSellers()){
    const ps = dataOf(u).partners.filter(p => allDays || onDay(p, day));
    ps.forEach(p => {
      const m = L.marker([p.lat, p.lng], {icon: pinIcon(STATUSES[p.status].color, false, unread(p.id))}).addTo(pinLayer);
      m.bindTooltip(esc(p.name) + (isLead() && !focus ? ` · ${esc(userOf(u).name)}` : ''), {permanent:true, direction:'bottom', offset:[0,2], className:'pin-label'});
      m.on('click', e => { L.DomEvent.stop(e); if (mode === 'pen' || mode === 'eraser') return; openPartner(p.id); });
    });
  }
}
function renderNotes(){
  noteLayer.clearLayers();
  notes.filter(n => allDays || !n.done || dayKey(n.ts) === day || (n.doneTs && dayKey(n.doneTs) === day))
    .filter(n => !isLead() || !focus || n.for === focus || n.for === 'all')
    .forEach(n => {
      const m = L.marker([n.lat, n.lng], {icon: noteIcon(n.done, false, unread(n.id)), zIndexOffset:500}).addTo(noteLayer);
      if (n.text) m.bindTooltip(esc(n.text.length > 26 ? n.text.slice(0,25)+'…' : n.text), {permanent:true, direction:'bottom', offset:[0,0], className:'pin-label'});
      m.on('click', e => { L.DomEvent.stop(e); if (mode === 'pen' || mode === 'eraser') return; openNote(n.id); });
    });
}
function renderLive(){
  liveLayer.clearLayers();
  if (!isLead() || allDays || day !== today()) return;
  for (const u of visibleSellers()){
    const p = live[u]; if (!p || dayKey(p.ts) !== today()) continue;
    const usr = userOf(u), stale = Date.now() - p.ts > 3*60e3;
    const m = L.marker([p.lat, p.lng], {zIndexOffset:1000, icon: L.divIcon({className:'', iconSize:[40,40], iconAnchor:[20,20],
      html:`<div class="live${stale?' stale':''}" style="--c:${usr.color}"><span class="ring"></span><span class="core">${esc(initials(usr.name))}</span></div>`})}).addTo(liveLayer);
    m.bindTooltip(`${esc(usr.name)} · ${ago(p.ts)}`, {direction:'top', offset:[0,-18]});
    m.on('click', e => { L.DomEvent.stop(e); openSeller(u); });
  }
}
function updateHeader(){
  $('#dateTitle').textContent = allDays ? 'Вся история' : fmtDay(day);
  $('#scDay').classList.toggle('sel', !allDays); $('#scAll').classList.toggle('sel', allDays);
  let gps = 0, manual = 0, np = 0;
  for (const u of visibleSellers()){
    if (!allDays) gps += trackKm(trackOf(u, day));
    manual += allDays ? dataOf(u).strokes.reduce((a,s) => a + strokeLen(s), 0) : manualKm(u, day);
    np += dataOf(u).partners.filter(p => allDays || onDay(p, day)).length;
  }
  const km = gps > 0 ? `<span class="km">${fmtKm(gps)}</span> GPS` : `<span class="km">${fmtKm(manual)}</span>`;
  $('#dateSub').innerHTML = `${km} · ${np} ${plural(np,'метка','метки','меток')}${isLead() ? (focus ? ' · ' + esc(userOf(focus).name) : ' · команда') : ''}`;
  const total = visibleSellers().reduce((a,u) => a + dataOf(u).partners.length, 0);
  $('#pCount').textContent = total; $('#pCount').style.display = total ? '' : 'none';
  $('#nextDay').style.opacity = (!allDays && day >= today()) ? .3 : 1;
}
function renderPeople(){
  const box = $('#people');
  if (!isLead()){ box.innerHTML = ''; return; }
  const online = u => live[u] && Date.now() - live[u].ts < 3*60e3;
  box.innerHTML = `<button class="person glass${!focus?' sel':''}" data-u=""><span class="av" style="--c:#5b4bff">${sellers().length}</span>Вся команда</button>`
    + sellers().map(s => `<button class="person glass${focus===s.u?' sel':''}" data-u="${esc(s.u)}"><span class="av${online(s.u)?' on':''}" style="--c:${s.color}">${esc(initials(s.name))}</span>${esc(s.name)}</button>`).join('');
  box.querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
    focus = b.dataset.u || null; render();
    if (focus && live[focus] && day === today()) map.flyTo([live[focus].lat, live[focus].lng], Math.max(map.getZoom(), 15), {duration:.7});
  });
}

/* ================= инструменты ================= */
function buildDock(){
  const tools = isLead()
    ? [['hand','Карта'],['note','Заметка'],['|'],['#teamBtn','team','Команда'],['#reportBtn','report','Отчёт'],['#locateBtn','me','Я']]
    : [['hand','Карта'],['pen','Маршрут'],['pin','Метка'],['eraser','Ластик'],['|'],['#undoBtn','undo','Назад'],['#reportBtn','report','Отчёт']];
  $('#dock').innerHTML = tools.map(t => t[0] === '|' ? '<div class="sep"></div>'
    : t[0][0] === '#' ? `<button class="tool" id="${t[0].slice(1)}">${svg(t[1])}<span>${t[2]}</span></button>`
    : `<button class="tool t-${t[0]}${t[0]===mode?' active':''}" data-mode="${t[0]}">${svg(t[0] === 'note' ? 'note' : t[0])}<span>${t[1]}</span></button>`).join('');
  document.querySelectorAll('.tool[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const on = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
  on('undoBtn', undo); on('reportBtn', () => openReport()); on('teamBtn', openTeam); on('locateBtn', locateMe);
}
function setMode(m){
  if ((m === 'pen' || m === 'pin') && allDays){ allDays = false; day = today(); render(); toast('Работаем с сегодняшним днём'); }
  mode = m;
  document.body.classList.remove('mode-hand','mode-pen','mode-pin','mode-eraser','mode-note');
  document.body.classList.add('mode-' + m);
  document.querySelectorAll('.tool[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  renderPalette();
  $('#palette').classList.toggle('show', m === 'pen' || m === 'eraser');
  $('#ring').style.display = 'none';
  if (m === 'pen' || m === 'eraser') map.dragging.disable(); else map.dragging.enable();
  if (m === 'pen') toast('Ведите пальцем по улицам · двумя пальцами — масштаб');
  if (m === 'pin') toast('Нажмите на место, где находится партнёр');
  if (m === 'note') toast('Нажмите на карту — оставьте заметку сейлеру');
  if (m === 'eraser') toast('Проведите по линии, чтобы стереть кусок');
}
function renderPalette(){
  const p = $('#palette');
  if (mode === 'eraser'){
    p.innerHTML = '<span class="sub" style="align-self:center;margin-right:2px">Размер</span>' + ERASERS.map(r => `<button class="wbtn${r===cfg.eraser?' sel':''}" data-r="${r}" style="width:42px;height:42px;color:#ff7584"><span class="ering" style="width:${Math.round(r*0.8)+6}px;height:${Math.round(r*0.8)+6}px"></span></button>`).join('');
    p.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { cfg.eraser = +b.dataset.r; saveCfg(); renderPalette(); });
    return;
  }
  p.innerHTML = PEN_COLORS.map(c => `<button class="swatch${c===cfg.color?' sel':''}" style="--c:${c}" data-c="${c}"></button>`).join('')
    + '<span class="w"></span>' + WEIGHTS.map(w => `<button class="wbtn${w===cfg.weight?' sel':''}" data-w="${w}"><span style="display:block;width:${w+4}px;height:${w+4}px;border-radius:50%;background:currentColor"></span></button>`).join('');
  p.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cfg.color = b.dataset.c; saveCfg(); renderPalette(); });
  p.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { cfg.weight = +b.dataset.w; saveCfg(); renderPalette(); });
}

/* ---------- рисование и ластик (сейлер) ---------- */
const el = map.getContainer();
const pointers = new Map();
const cpt = e => { const r = el.getBoundingClientRect(); return L.point(e.clientX - r.left, e.clientY - r.top); };
const ring = $('#ring');
const snap = () => { undoStack.push(JSON.stringify(db.strokes)); if (undoStack.length > 50) undoStack.shift(); };
function cancelStroke(){ if (cur){ routeLayer.removeLayer(cur.casing); routeLayer.removeLayer(cur.line); cur = null; } }
function showRing(e){ const r = cfg.eraser; ring.style.width = ring.style.height = (r*2)+'px'; ring.style.transform = `translate(${e.clientX - r}px, ${e.clientY - r}px)`; ring.style.display = 'block'; }
const r6 = ll => [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
function eraseAt(p){
  const R = cfg.eraser, step = Math.max(2, R/3);
  const visible = allDays ? db.strokes : db.strokes.filter(s => s.day === day);
  let changed = false;
  for (const s of visible){
    const cps = s.pts.map(ll => map.latLngToContainerPoint(ll));
    let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
    for (const c of cps){ if(c.x<minX)minX=c.x; if(c.x>maxX)maxX=c.x; if(c.y<minY)minY=c.y; if(c.y>maxY)maxY=c.y; }
    if (p.x < minX-R || p.x > maxX+R || p.y < minY-R || p.y > maxY+R) continue;
    const runs = []; let run = []; let hit = false;
    const add = (pt, ll) => { if (pt.distanceTo(p) <= R){ hit = true; if (run.length > 1) runs.push(run); run = []; } else run.push(ll); };
    add(cps[0], s.pts[0]);
    for (let i = 1; i < cps.length; i++){
      const a = cps[i-1], b = cps[i];
      if (L.LineUtil.pointToSegmentDistance(p, a, b) <= R + step){
        const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
        for (let k = 1; k <= n; k++){ const t = k/n, pt = L.point(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t); add(pt, k === n ? s.pts[i] : r6(map.containerPointToLatLng(pt))); }
      } else add(b, s.pts[i]);
    }
    if (!hit) continue;
    if (run.length > 1) runs.push(run);
    changed = true;
    db.strokes.splice(db.strokes.indexOf(s), 1, ...runs.map(r => ({id:uid(), day:s.day, c:s.c, w:s.w, ts:s.ts, u:Date.now(), pts:r})));
  }
  if (changed){ erasing.changed = true; renderRoutes(); }
}
el.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, true);
  if (!isSeller()) return;
  if (mode === 'eraser'){
    if (pointers.size > 1){ if (erasing && !erasing.changed) undoStack.pop(); erasing = null; ring.style.display = 'none'; return; }
    if (e.target.closest('.leaflet-control')) return;
    e.preventDefault(); snap(); erasing = {changed:false}; showRing(e); eraseAt(cpt(e));
    return;
  }
  if (mode !== 'pen') return;
  if (pointers.size > 1){ cancelStroke(); return; }
  if (e.target.closest('.leaflet-marker-icon, .leaflet-control')) return;
  e.preventDefault(); window.getSelection && window.getSelection().removeAllRanges();
  const p = cpt(e), ll = map.containerPointToLatLng(p), c = cfg.color, w = cfg.weight;
  cur = {pts:[ll], last:p, c, w,
    casing: L.polyline([ll], {renderer, color:'#fff', weight:w+4, opacity:.85, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer),
    line: L.polyline([ll], {renderer, color:c, weight:w, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer)};
}, true);
el.addEventListener('pointermove', e => {
  if (mode === 'eraser' && isSeller()){
    if (e.pointerType === 'mouse' || erasing) showRing(e);
    if (erasing && pointers.size === 1) eraseAt(cpt(e));
    return;
  }
  if (!cur || mode !== 'pen' || pointers.size > 1) return;
  const p = cpt(e); if (p.distanceTo(cur.last) < 3) return;
  cur.last = p; const ll = map.containerPointToLatLng(p);
  cur.pts.push(ll); cur.line.addLatLng(ll); cur.casing.addLatLng(ll);
}, true);
function endPointer(e){
  pointers.delete(e.pointerId);
  if (erasing){
    if (erasing.changed){ store.save(); render(); } else undoStack.pop();
    erasing = null;
    if (e.pointerType !== 'mouse') ring.style.display = 'none';
    if (pendingRemote){ const pr = pendingRemote; pendingRemote = null; applyRemote(pr); }
    return;
  }
  if (!cur) return;
  const s = cur; cur = null;
  routeLayer.removeLayer(s.casing); routeLayer.removeLayer(s.line);
  if (s.pts.length >= 2){
    const simp = L.LineUtil.simplify(s.pts.map(ll => map.latLngToLayerPoint(ll)), 1.2).map(pt => map.layerPointToLatLng(pt));
    snap();
    db.strokes.push({id:uid(), day, c:s.c, w:s.w, ts:Date.now(), u:Date.now(), pts: simp.map(r6)});
    store.save(); render();
  }
  if (pendingRemote){ const pr = pendingRemote; pendingRemote = null; applyRemote(pr); }
}
el.addEventListener('pointerup', endPointer, true);
el.addEventListener('dragstart', e => e.preventDefault(), true);
el.addEventListener('selectstart', e => { if (mode === 'pen' || mode === 'eraser') e.preventDefault(); }, true);
el.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); cancelStroke(); }, true);
el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse'){ endPointer(e); ring.style.display = 'none'; } }, true);
function undo(){
  if (undoStack.length){ db.strokes = JSON.parse(undoStack.pop()); store.save(); render(); return toast('Отменено'); }
  const mine = db.strokes.filter(s => s.day === (allDays ? today() : day));
  if (!mine.length) return toast('Нечего отменять');
  const last = mine.reduce((a,b) => a.ts > b.ts ? a : b);
  db.strokes = db.strokes.filter(s => s.id !== last.id); store.save(); render(); toast('Последняя линия удалена');
}

/* ================= автозапись маршрута (сейлер) ================= */
let watchId = null, wakeLock = null, recState = 'off', lastRec = null, lastFix = null, buf = [], flushing = false, lastRouteDraw = 0;
const BUFKEY = () => 'mm-buf-' + me().u;
const workHours = () => (session && session.work) || [9, 18];
const inWork = (ms = Date.now()) => { const h = tashHour(ms), [a, b] = workHours(); return h >= a && h < b; };
function recTick(){
  if (!isSeller()) return;
  let st;
  if (!cfg.rec) st = 'off';
  else if (!navigator.geolocation) st = 'nogps';
  else if (!inWork()) st = 'wait';
  else st = recState === 'denied' ? 'denied' : 'on';
  if (st === 'on' && watchId === null){
    watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:3000, timeout:30000});
  }
  if (st !== 'on' && st !== 'denied' && watchId !== null){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  recState = st;
  keepAwake(st === 'on' && cfg.wake);
  const chip = $('#recChip'), [a, b] = workHours();
  chip.classList.toggle('on', st === 'on'); chip.classList.toggle('wait', st === 'wait');
  $('#recText').textContent = st === 'on' ? (lastFix ? 'Запись · ' + fmtKm(trackKm(trackOf(me().u, today()))) : 'Запись · ищу GPS…')
    : st === 'wait' ? `Запись с ${a}:00 до ${b}:00` : st === 'denied' ? 'Нет доступа к GPS' : st === 'nogps' ? 'GPS недоступен' : 'Запись выключена';
}
function onPos(pos){
  const c = pos.coords, ts = pos.timestamp || Date.now();
  const p = [+c.latitude.toFixed(6), +c.longitude.toFixed(6), ts, Math.round(c.accuracy || 0)];
  lastFix = p; if (recState === 'denied') recState = 'on';
  showMe(p);
  if (!cfg.rec || !inWork(ts) || p[3] > 60) return;
  if (lastRec && distM(lastRec, p) < 8 && ts - lastRec[2] < 60000) return;
  lastRec = p;
  buf.push(p); lsSet(BUFKEY(), buf);
  const k = dayKey(ts); const t = tracks[k] || (tracks[k] = {});
  t[me().u] = mergePts(t[me().u], [p]);
  if (day === k && !allDays){ if (Date.now() - lastRouteDraw > 4000){ lastRouteDraw = Date.now(); renderRoutes(); } updateHeader(); }
  recTick();
  if (buf.length >= 20) flushTrack();
}
function onPosErr(err){ if (err.code === 1){ recState = 'denied'; recTick(); toast('Разрешите доступ к геопозиции для записи маршрута', 4000); } }
async function flushTrack(){
  if (!isSeller() || flushing) return;
  flushing = true;
  const sending = buf.slice();
  try {
    const j = await api('api/track', {method:'POST', body:{points:sending}});
    buf = buf.slice(sending.length); lsSet(BUFKEY(), buf);
    if (j.ver !== undefined && j.ver !== feedVer) loadFeed();
  } catch(e){} finally { flushing = false; }
}
async function keepAwake(on){
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible'){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; }
  } catch(e){ wakeLock = null; }
}
function showMe(p){
  const ll = [p[0], p[1]];
  if (meMarker) meMarker.setLatLng(ll);
  else meMarker = L.marker(ll, {icon: L.divIcon({className:'', html:'<div class="me-dot"></div>', iconSize:[18,18], iconAnchor:[9,9]}), interactive:false, zIndexOffset:900}).addTo(map);
}
function locateMe(){
  if (isLead()){
    const pts = sellers().map(s => live[s.u]).filter(p => p && dayKey(p.ts) === today()).map(p => [p.lat, p.lng]);
    if (pts.length) return map.flyToBounds(L.latLngBounds(pts).pad(.3), {maxZoom:16, duration:.7});
  }
  if (lastFix && Date.now() - lastFix[2] < 60000) return map.flyTo([lastFix[0], lastFix[1]], Math.max(map.getZoom(), 17), {duration:.8});
  if (!navigator.geolocation) return toast('Геолокация недоступна');
  toast('Ищу вас…');
  navigator.geolocation.getCurrentPosition(pos => {
    const p = [pos.coords.latitude, pos.coords.longitude, Date.now(), pos.coords.accuracy]; lastFix = p; showMe(p);
    map.flyTo([p[0], p[1]], Math.max(map.getZoom(), 17), {duration:.8});
  }, () => toast('Разрешите доступ к геопозиции'), {enableHighAccuracy:true, timeout:10000});
}
$('#recChip').onclick = () => openRecording();

/* ================= нижние листы ================= */
function openSheet(html, mount){
  $('#sheetBody').innerHTML = html; $('#sheetBody').scrollTop = 0;
  $('#sheet').classList.add('open'); $('#backdrop').classList.add('show');
  if (mount) mount($('#sheetBody'));
}
function closeSheet(){
  $('#sheet').classList.remove('open'); $('#backdrop').classList.remove('show');
  if (ghost){ map.removeLayer(ghost); ghost = null; }
  const t = document.getElementById('thread'); if (t) t.remove();
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
}
$('#backdrop').onclick = closeSheet;
(() => { let y0 = null; const sh = $('#sheet');
  sh.addEventListener('touchstart', e => { if ($('#sheetBody').scrollTop <= 0 && !e.target.closest('input,textarea,select')) y0 = e.touches[0].clientY; }, {passive:true});
  sh.addEventListener('touchmove', e => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, {passive:true});
  sh.addEventListener('touchend', e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; sh.style.transform = ''; y0 = null; if (dy > 90) closeSheet(); });
})();
const statusPicker = sel => `<div class="statuses">${ST_ORDER.map(k => `<button type="button" class="st${k===sel?' sel':''}" data-st="${k}" style="--c:${STATUSES[k].color}"><span class="dot"></span>${STATUSES[k].label}</button>`).join('')}</div>`;
const sellerOptions = (sel, withAll) => (withAll ? `<option value="all"${sel==='all'?' selected':''}>Всем сейлерам</option>` : '') + sellers().map(s => `<option value="${esc(s.u)}"${sel===s.u?' selected':''}>${esc(s.name)}</option>`).join('');

/* ---------- клик по карте ---------- */
map.on('click', e => {
  if (mode === 'pin' && isSeller()){
    if (ghost) map.removeLayer(ghost);
    ghost = L.marker(e.latlng, {icon: pinIcon('#7c6cff', true), interactive:false}).addTo(map);
    partnerForm(null, e.latlng);
  } else if (mode === 'note' && isLead()){
    if (ghost) map.removeLayer(ghost);
    ghost = L.marker(e.latlng, {icon: noteIcon(false, true), interactive:false}).addTo(map);
    noteForm(e.latlng);
  }
});

/* ---------- партнёр ---------- */
function partnerForm(id, latlng){
  const p = id ? db.partners.find(x => x.id === id) : null;
  let status = p ? p.status : 'contacts';
  openSheet(`
    <h2>${p ? 'Изменить партнёра' : 'Новый партнёр'}</h2>
    <div class="sub">${p ? 'Добавлен '+fmtTime(p.ts) : fmtDay(allDays ? today() : day)}</div>
    <div class="field"><label>Название партнёра *</label><input id="fName" maxlength="80" placeholder="Например, «Техно Маркет»" value="${esc(p?.name)}"></div>
    <div class="field"><label>Что это — магазин чего / какие услуги</label><input id="fDesc" maxlength="120" placeholder="Бытовая техника, телефоны" value="${esc(p?.desc)}"></div>
    <div class="field"><label>Контакт (телефон, Telegram, имя)</label><input id="fContact" maxlength="80" placeholder="+998 90 123 45 67 · Алишер" value="${esc(p?.contact)}"></div>
    <div class="field"><label>Статус</label>${statusPicker(status)}</div>
    <div class="field"><label>Заметка</label><textarea id="fNote" maxlength="500" placeholder="Что обсудили, когда перезвонить…">${esc(p?.note)}</textarea></div>
    <div class="row"><button class="btn" id="fCancel">Отмена</button><button class="btn primary" id="fSave">Сохранить</button></div>
  `, b => {
    b.querySelectorAll('[data-st]').forEach(x => x.onclick = () => { status = x.dataset.st; b.querySelectorAll('[data-st]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelector('#fCancel').onclick = closeSheet;
    b.querySelector('#fSave').onclick = () => {
      const name = b.querySelector('#fName').value.trim();
      if (!name){ b.querySelector('#fName').focus(); return toast('Введите название'); }
      const data = {name, desc:b.querySelector('#fDesc').value.trim(), contact:b.querySelector('#fContact').value.trim(), note:b.querySelector('#fNote').value.trim()};
      if (p){ if (p.status !== status) p.history.push({s:status, ts:Date.now()}); Object.assign(p, data, {status, u:Date.now()}); }
      else {
        db.partners.push(Object.assign({id:uid(), lat:+latlng.lat.toFixed(6), lng:+latlng.lng.toFixed(6), day: allDays ? today() : day, ts:Date.now(), u:Date.now(), status, history:[{s:status, ts:Date.now()}]}, data));
        setMode('hand');
      }
      store.save(); closeSheet(); render(); toast(p ? 'Сохранено' : 'Метка добавлена');
    };
    if (!p) setTimeout(() => b.querySelector('#fName').focus(), 350);
  });
}
function telLink(c){ const digits = c.replace(/[^\d+]/g,''); return digits.length >= 7 ? `<a href="tel:${esc(digits)}">${esc(c)}</a>` : esc(c); }
function threadHtml(){ return `<h3>Комментарии</h3><div class="thread" id="threadList"></div><div class="compose"><input id="cText" maxlength="1000" placeholder="${isLead() ? 'Комментарий сейлеру…' : 'Ответить руководителю…'}"><button id="cSend" aria-label="Отправить">${svg('send', 20)}</button></div>`; }
function mountThread(b, kind, pid, owner, title){
  const list = b.querySelector('#threadList');
  const draw = () => {
    const items = comments.filter(c => c.pid === pid).sort((a,c) => a.ts - c.ts);
    list.innerHTML = items.length ? items.map(c => `<div class="msg${c.author===me().u?' mine':''}${c.role==='lead'?' lead':''}"><small>${c.role==='lead' ? '<b>Руководитель</b> · ' : ''}${esc(c.authorName)} · ${fmtTime(c.ts)}</small>${esc(c.text).replace(/\n/g,'<br>')}</div>`).join('')
      : '<div class="sub">Пока нет комментариев</div>';
    markSeen(pid);
  };
  let hook = document.getElementById('thread');
  if (!hook){ hook = document.createElement('span'); hook.id = 'thread'; hook.hidden = true; document.body.appendChild(hook); }
  hook.replaceWith(hook = hook.cloneNode()); hook.addEventListener('refresh', () => { if (b.contains(list)) draw(); });
  draw();
  const send = async () => {
    const inp = b.querySelector('#cText'); const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    try { const j = await api('api/feed', {method:'POST', body:{action:'comment', kind, pid, owner, title, text}}); comments.push(j.comment); draw(); render(); }
    catch(e){ inp.value = text; toast(e.message); }
  };
  b.querySelector('#cSend').onclick = send;
  b.querySelector('#cText').onkeydown = e => { if (e.key === 'Enter') send(); };
}
function openPartner(id){
  const f = findPartner(id); if (!f) return;
  const {p, owner} = f, st = STATUSES[p.status], mine = isSeller();
  openSheet(`
    <span class="chip" style="--c:${st.color}">${st.label}</span>
    <h2 style="margin-top:10px">${esc(p.name)}</h2>
    ${p.desc ? `<div class="sub">${esc(p.desc)}</div>` : ''}
    ${isLead() ? `<div class="sub" style="margin-top:4px">Сейлер: <b style="color:${userOf(owner).color}">${esc(userOf(owner).name)}</b></div>` : ''}
    ${mine ? `<h3>Сменить статус</h3>${statusPicker(p.status)}` : ''}
    <div class="kv">
      ${p.contact ? `<div><small>Контакт</small>${telLink(p.contact)}</div>` : ''}
      ${p.note ? `<div><small>Заметка</small>${esc(p.note).replace(/\n/g,'<br>')}</div>` : ''}
      <div><small>Добавлен</small>${fmtTime(p.ts)}</div>
    </div>
    ${threadHtml()}
    <h3>История</h3>
    <ul class="timeline">${(p.history||[]).slice().reverse().map(h => `<li><span class="dot" style="--c:${STATUSES[h.s].color}"></span><b>${STATUSES[h.s].short}</b> · ${fmtTime(h.ts)}</li>`).join('')}</ul>
    <div class="row">${mine ? '<button class="btn danger" id="pDel">Удалить</button>' : ''}<button class="btn" id="pRoute">В Яндекс Картах</button>${mine ? '<button class="btn primary" id="pEdit">Изменить</button>' : ''}</div>
  `, b => {
    mountThread(b, 'partner', p.id, owner, p.name);
    renderPins();
    b.querySelectorAll('[data-st]').forEach(x => x.onclick = () => {
      if (x.dataset.st === p.status) return;
      p.status = x.dataset.st; p.u = Date.now(); p.history.push({s:p.status, ts:Date.now()}); store.save(); render(); openPartner(p.id); toast('Статус: '+STATUSES[p.status].short);
    });
    b.querySelector('#pRoute').onclick = () => window.open(`https://yandex.uz/maps/?pt=${p.lng},${p.lat}&z=18&l=map`, '_blank');
    if (mine){
      b.querySelector('#pEdit').onclick = () => partnerForm(p.id);
      b.querySelector('#pDel').onclick = () => {
        const btn = b.querySelector('#pDel');
        if (btn.dataset.sure){ db.partners = db.partners.filter(x => x.id !== p.id); store.save(); closeSheet(); render(); toast('Метка удалена'); }
        else { btn.dataset.sure = 1; btn.textContent = 'Точно?'; }
      };
    }
  });
}

/* ---------- заметки руководителя ---------- */
function noteForm(latlng){
  openSheet(`
    <span class="leadtag">${svg('note', 14)} Заметка руководителя</span>
    <h2 style="margin-top:10px">Новая заметка</h2>
    <div class="sub">Сейлер увидит её на карте через несколько секунд</div>
    <div class="field"><label>Кому</label><select class="sel" id="nFor">${sellerOptions(focus || 'all', true)}</select></div>
    <div class="field"><label>Текст</label><textarea id="nText" maxlength="500" placeholder="Зайди сюда — новый магазин техники, спроси владельца"></textarea></div>
    <div class="row"><button class="btn" id="nCancel">Отмена</button><button class="btn primary" id="nSave">Отправить</button></div>
  `, b => {
    b.querySelector('#nCancel').onclick = closeSheet;
    b.querySelector('#nSave').onclick = async () => {
      const btn = b.querySelector('#nSave'); btn.disabled = true;
      try {
        const j = await api('api/feed', {method:'POST', body:{action:'note', lat:latlng.lat, lng:latlng.lng, text:b.querySelector('#nText').value.trim(), for:b.querySelector('#nFor').value}});
        notes.push(j.note); markSeen(j.note.id); closeSheet(); setMode('hand'); render(); toast('Заметка отправлена');
      } catch(e){ btn.disabled = false; toast(e.message); }
    };
    setTimeout(() => b.querySelector('#nText').focus(), 350);
  });
}
function openNote(id){
  const n = notes.find(x => x.id === id); if (!n) return;
  openSheet(`
    <span class="leadtag">${svg('note', 14)} Заметка руководителя</span>
    <h2 style="margin-top:10px">${esc(n.text || 'Метка на карте')}</h2>
    <div class="kv">
      <div><small>От</small>${esc(n.authorName)} · ${fmtTime(n.ts)}</div>
      <div><small>Кому</small>${n.for === 'all' ? 'Всем сейлерам' : esc(userOf(n.for).name)}</div>
      <div><small>Статус</small>${n.done ? `✅ Выполнено${n.doneName ? ' · ' + esc(n.doneName) : ''} · ${fmtTime(n.doneTs)}` : '⏳ Не выполнено'}</div>
    </div>
    ${threadHtml()}
    <div class="row">
      ${isLead() ? '<button class="btn danger" id="nDel">Удалить</button>' : ''}
      <button class="btn" id="nGo">В Яндекс Картах</button>
      <button class="btn ${n.done ? '' : 'primary'}" id="nDone">${n.done ? 'Вернуть в работу' : 'Выполнено'}</button>
    </div>
  `, b => {
    mountThread(b, 'note', n.id, n.for, 'Заметка');
    renderNotes();
    b.querySelector('#nGo').onclick = () => window.open(`https://yandex.uz/maps/?pt=${n.lng},${n.lat}&z=18&l=map`, '_blank');
    b.querySelector('#nDone').onclick = async () => {
      try { const j = await api('api/feed', {method:'POST', body:{action:'noteDone', id:n.id, done:!n.done}}); Object.assign(n, j.note); render(); openNote(n.id); toast(n.done ? 'Отмечено выполненным' : 'Вернули в работу'); }
      catch(e){ toast(e.message); }
    };
    const del = b.querySelector('#nDel');
    if (del) del.onclick = async () => {
      if (!del.dataset.sure){ del.dataset.sure = 1; del.textContent = 'Точно?'; return; }
      try { await api('api/feed', {method:'POST', body:{action:'noteDelete', id:n.id}}); notes = notes.filter(x => x.id !== n.id); closeSheet(); render(); toast('Заметка удалена'); }
      catch(e){ toast(e.message); }
    };
  });
}

/* ---------- список партнёров и заметок ---------- */
let listFilter = null, listQuery = '', listTab = 'partners';
function openList(){
  const owners = visibleSellers();
  const all = owners.flatMap(u => dataOf(u).partners.map(p => ({p, u})));
  const counts = Object.fromEntries(ST_ORDER.map(k => [k, all.filter(x => x.p.status === k).length]));
  const myNotes = notes.filter(n => !isLead() || !focus || n.for === focus || n.for === 'all');
  openSheet(`
    <h2>${isLead() ? (focus ? esc(userOf(focus).name) : 'Команда') : 'Мои партнёры'}</h2>
    <div class="seg" style="margin-top:10px"><button data-t="partners" class="${listTab==='partners'?'sel':''}">Партнёры · ${all.length}</button><button data-t="notes" class="${listTab==='notes'?'sel':''}">Заметки · ${myNotes.filter(n => !n.done).length}</button></div>
    <div id="lBody"></div>
  `, b => {
    const drawPartners = () => {
      b.querySelector('#lBody').innerHTML = `
        <div class="stats">${ST_ORDER.map(k => `<button class="stat${listFilter===k?' sel':''}" data-f="${k}" style="--c:${STATUSES[k].color}"><b>${counts[k]}</b><small>${STATUSES[k].short}</small></button>`).join('')}</div>
        <input class="search" id="q" placeholder="Поиск по названию, описанию, контакту" value="${esc(listQuery)}">
        <div class="list" id="lst"></div>`;
      const draw = () => {
        const q = listQuery.toLowerCase();
        const items = all.filter(({p}) => (!listFilter || p.status === listFilter) && (!q || (p.name+' '+(p.desc||'')+' '+(p.contact||'')+' '+(p.note||'')).toLowerCase().includes(q))).sort((a,c) => (c.p.u||c.p.ts) - (a.p.u||a.p.ts));
        b.querySelector('#lst').innerHTML = items.length ? items.map(({p, u}) => `<button class="item" data-id="${p.id}" style="--c:${STATUSES[p.status].color}"><span class="dot"></span><span class="t"><b>${unread(p.id)?'💬 ':''}${esc(p.name)}</b><small>${esc(p.desc || STATUSES[p.status].label)}${isLead() && !focus ? ' · ' + esc(userOf(u).name) : ''}</small></span><span class="d">${fmtShort(p.day)}</span></button>`).join('')
          : `<div class="empty">${all.length ? 'Ничего не найдено' : (isLead() ? 'Сейлеры ещё не добавили партнёров' : 'Пока нет меток.<br>Выберите «Метка» и нажмите на карту.')}</div>`;
        b.querySelectorAll('.item').forEach(x => x.onclick = () => {
          const {p} = findPartner(x.dataset.id);
          if (!allDays && !onDay(p, day)){ day = p.day; ensureTracks(day).then(render); render(); }
          closeSheet(); map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 17), {duration:.7});
          setTimeout(() => openPartner(p.id), 750);
        });
      };
      b.querySelectorAll('[data-f]').forEach(x => x.onclick = () => { listFilter = listFilter === x.dataset.f ? null : x.dataset.f; b.querySelectorAll('[data-f]').forEach(y => y.classList.toggle('sel', y.dataset.f === listFilter)); draw(); });
      b.querySelector('#q').oninput = e => { listQuery = e.target.value; draw(); };
      draw();
    };
    const drawNotes = () => {
      const items = myNotes.slice().sort((a,c) => (a.done - c.done) || (c.ts - a.ts));
      b.querySelector('#lBody').innerHTML = `<div class="list">${items.length ? items.map(n => `<button class="item" data-n="${n.id}" style="--c:${n.done?'#6b7088':'#ffb020'}"><span class="dot"></span><span class="t"><b>${unread(n.id)?'💬 ':''}${esc(n.text || 'Метка на карте')}</b><small>${n.done ? '✅ выполнено' : '⏳ в работе'} · ${n.for === 'all' ? 'всем' : esc(userOf(n.for).name)}</small></span><span class="d">${fmtShort(dayKey(n.ts))}</span></button>`).join('')
        : `<div class="empty">${isLead() ? 'Выберите «Заметка» и нажмите на карту, чтобы оставить задание' : 'Заметок от руководителя пока нет'}</div>`}</div>`;
      b.querySelectorAll('[data-n]').forEach(x => x.onclick = () => { const n = notes.find(y => y.id === x.dataset.n); closeSheet(); map.flyTo([n.lat, n.lng], Math.max(map.getZoom(), 17), {duration:.7}); setTimeout(() => openNote(n.id), 750); });
    };
    b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { listTab = x.dataset.t; b.querySelectorAll('[data-t]').forEach(y => y.classList.toggle('sel', y === x)); listTab === 'notes' ? drawNotes() : drawPartners(); });
    listTab === 'notes' ? drawNotes() : drawPartners();
  });
}
$('#listBtn').onclick = openList;

/* ---------- дни ---------- */
function openDays(){
  const keys = new Set();
  visibleSellers().forEach(u => { dataOf(u).strokes.forEach(s => keys.add(s.day)); dataOf(u).partners.forEach(p => keys.add(p.day)); });
  Object.keys(tracks).forEach(k => { if (visibleSellers().some(u => trackOf(u, k).length)) keys.add(k); });
  const days = [...keys].sort().reverse();
  openSheet(`
    <h2>История по дням</h2><div class="sub">${days.length} ${plural(days.length,'день','дня','дней')} с маршрутами или метками</div>
    <div class="seg" style="margin-top:14px"><button id="dOne" class="${allDays?'':'sel'}">Один день</button><button id="dAll" class="${allDays?'sel':''}">Вся история</button></div>
    <h3>Выбрать дату</h3>
    <input type="date" class="native" id="dPick" value="${day}" max="${today()}">
    <div class="row"><button class="btn sm" id="dReport">${svg('report', 18)} Отчёт за ${fmtShort(day)}</button></div>
    <h3>Дни</h3>
    <div class="list days">${days.length ? days.map(k => { const n = visibleSellers().reduce((a,u) => a + dataOf(u).partners.filter(p => p.day === k).length, 0); const km = visibleSellers().reduce((a,u) => a + (trackKm(trackOf(u, k)) || manualKm(u, k)), 0); return `<button class="item" data-d="${k}" style="--c:${k===day&&!allDays?'#7c6cff':'rgba(255,255,255,.25)'}"><span class="dot"></span><span class="t"><b>${fmtDay(k)}</b><small>${fmtShort(k)} · ${n} ${plural(n,'новая метка','новые метки','новых меток')}</small></span><span class="d"><b>${km ? fmtKm(km) : ''}</b></span></button>`; }).join('') : '<div class="empty">Здесь появятся дни с маршрутами.</div>'}</div>
  `, b => {
    const go = async k => { allDays = false; day = k; closeSheet(); render(); await ensureTracks(k); render(); fitDay(); };
    b.querySelector('#dAll').onclick = () => { allDays = true; render(); closeSheet(); fitDay(); };
    b.querySelector('#dOne').onclick = () => go(day);
    b.querySelector('#dPick').onchange = e => e.target.value && go(e.target.value);
    b.querySelector('#dReport').onclick = () => openReport(day);
    b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => go(x.dataset.d));
  });
}
function fitDay(){
  const pts = [];
  visibleSellers().forEach(u => {
    (allDays ? dataOf(u).strokes : dataOf(u).strokes.filter(s => s.day === day)).forEach(s => pts.push(...s.pts));
    if (!allDays) trackOf(u, day).forEach(p => pts.push([p[0], p[1]]));
  });
  if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.15), {duration:.7, maxZoom:17});
}
$('#dateLabel').onclick = openDays;
const changeDay = async k => { day = k; render(); await ensureTracks(k); render(); };
$('#prevDay').onclick = () => { if (allDays){ allDays = false; render(); } else changeDay(shiftDay(day, -1)); };
$('#nextDay').onclick = () => { if (allDays){ allDays = false; changeDay(today()); } else if (day < today()) changeDay(shiftDay(day, 1)); };
$('#scDay').onclick = () => { if (!allDays) return; allDays = false; render(); };
$('#scAll').onclick = () => { if (allDays) return; allDays = true; render(); fitDay(); };

/* ---------- отчёт ---------- */
function stats(u, k){
  const pts = trackOf(u, k), d = dataOf(u);
  const created = d.partners.filter(p => p.day === k);
  const touched = d.partners.filter(p => p.day !== k && (p.history||[]).some(h => dayKey(h.ts) === k));
  const connected = d.partners.filter(p => (p.history||[]).some(h => h.s === 'connected' && dayKey(h.ts) === k)).length;
  const byStatus = Object.fromEntries(ST_ORDER.map(s => [s, created.filter(p => p.status === s).length]));
  const gps = trackKm(pts), manual = manualKm(u, k);
  const workMs = segments(pts).reduce((a, s) => a + (s[s.length-1][2] - s[0][2]), 0);
  return {gps, manual, km: gps || manual, from: pts[0] && pts[0][2], to: pts.length ? pts[pts.length-1][2] : null, workMs,
    created: created.length, touched: touched.length, connected, byStatus,
    notesDone: notes.filter(n => n.done && n.doneBy === u && n.doneTs && dayKey(n.doneTs) === k).length};
}
const fmtDur = ms => { const m = Math.round(ms/60000); return m < 60 ? m + ' мин' : Math.floor(m/60) + ' ч ' + String(m%60).padStart(2,'0') + ' мин'; };
async function openReport(k = day){
  openSheet('<h2>Отчёт</h2><div class="sub">Загружаю…</div>');
  await ensureTracks(k, k === today());
  const list = isLead() ? sellers() : [me()];
  const rows = list.map(s => ({s, r: stats(s.u, k)}));
  const tot = rows.reduce((a, {r}) => ({km:a.km+r.km, created:a.created+r.created, touched:a.touched+r.touched, connected:a.connected+r.connected}), {km:0, created:0, touched:0, connected:0});
  const statusLine = r => ST_ORDER.filter(s => r.byStatus[s]).map(s => `<span class="chip" style="--c:${STATUSES[s].color};margin:4px 4px 0 0">${STATUSES[s].short}: ${r.byStatus[s]}</span>`).join('');
  let html = `<h2>Отчёт · ${fmtDay(k)}</h2><div class="sub">${fmtShort(k)} · рабочее время ${workHours()[0]}:00–${workHours()[1]}:00</div>`;
  if (!isLead()){
    const r = rows[0].r;
    html += `<div class="kpis">
      <div class="kpi"><b>${fmtKm(r.km)}</b><small>${r.gps ? 'пройдено (GPS)' : 'нарисовано'}</small></div>
      <div class="kpi"><b>${r.workMs ? fmtDur(r.workMs) : '—'}</b><small>${r.from ? fmtHM(r.from)+'–'+fmtHM(r.to) : 'в движении'}</small></div>
      <div class="kpi"><b>${r.created}</b><small>новых партнёров</small></div>
      <div class="kpi"><b>${r.touched}</b><small>обновлено статусов</small></div>
      <div class="kpi"><b style="color:#2fd07a">${r.connected}</b><small>подключено</small></div>
      <div class="kpi"><b>${r.notesDone}</b><small>заметок выполнено</small></div></div>
      ${r.created ? `<h3>Новые по статусам</h3>${statusLine(r)}` : ''}`;
  } else {
    html += `<div class="kpis"><div class="kpi"><b>${fmtKm(tot.km)}</b><small>команда прошла</small></div><div class="kpi"><b>${tot.created}</b><small>новых партнёров</small></div><div class="kpi"><b style="color:#2fd07a">${tot.connected}</b><small>подключено</small></div></div>
      <table class="report"><tr><th>Сейлер</th><th>Путь</th><th>Партнёры</th></tr>
      ${rows.map(({s, r}) => `<tr><td><b style="color:${s.color}">${esc(s.name)}</b><span class="sub">${r.from ? fmtHM(r.from)+'–'+fmtHM(r.to) : 'нет трека'}</span></td><td><b>${fmtKm(r.km)}</b><span class="sub">${r.workMs ? fmtDur(r.workMs) : '—'}</span></td><td><b>+${r.created}</b><span class="sub">обновл. ${r.touched} · подкл. ${r.connected}</span>${statusLine(r)}</td></tr>`).join('')}
      </table>${!rows.length ? '<div class="empty">В команде пока нет сейлеров</div>' : ''}`;
  }
  html += `<div class="row"><button class="btn" id="rPrev">← ${fmtShort(shiftDay(k,-1))}</button>${k < today() ? `<button class="btn" id="rNext">${fmtShort(shiftDay(k,1))} →</button>` : ''}</div>`;
  openSheet(html, b => {
    b.querySelector('#rPrev').onclick = () => openReport(shiftDay(k, -1));
    const n = b.querySelector('#rNext'); if (n) n.onclick = () => openReport(shiftDay(k, 1));
  });
}

/* ---------- сейлер на карте (для руководителя) ---------- */
function openSeller(u){
  const s = userOf(u), p = live[u], r = stats(u, today());
  openSheet(`
    <h2 style="color:${s.color}">${esc(s.name)}</h2>
    <div class="sub">${p ? `${Date.now() - p.ts < 3*60e3 ? '🟢 На связи' : '⚪️ Был(а) в сети'} · ${ago(p.ts)}${p.batt != null ? ' · 🔋 ' + p.batt + '%' : ''}${p.src === 'owntracks' ? ' · фоновая запись' : ''}` : 'Сегодня ещё не было геопозиции'}</div>
    <div class="kpis"><div class="kpi"><b>${fmtKm(r.km)}</b><small>сегодня</small></div><div class="kpi"><b>+${r.created}</b><small>новых партнёров</small></div><div class="kpi"><b style="color:#2fd07a">${r.connected}</b><small>подключено</small></div></div>
    <div class="row"><button class="btn" id="sAll">Вся команда</button><button class="btn primary" id="sOnly">Только ${esc(s.name.split(' ')[0])}</button></div>
  `, b => {
    b.querySelector('#sAll').onclick = () => { focus = null; closeSheet(); render(); };
    b.querySelector('#sOnly').onclick = () => { focus = u; closeSheet(); render(); fitDay(); };
  });
}

/* ---------- команда (руководитель) ---------- */
function openTeam(){
  const team = session.team || [];
  openSheet(`
    <h2>Команда</h2><div class="sub">${sellers().length} ${plural(sellers().length,'сейлер','сейлера','сейлеров')} · ${team.length - sellers().length} ${plural(team.length - sellers().length,'руководитель','руководителя','руководителей')}</div>
    <div class="list">${team.map(t => { const p = live[t.u]; return `<div class="item"><span class="dot" style="--c:${t.color}"></span><span class="t"><b>${esc(t.name)}</b><small>${t.role === 'lead' ? 'Руководитель' : 'Сейлер'} · @${esc(t.u)}${t.role === 'seller' ? (p ? ' · ' + ago(p.ts) : ' · нет геопозиции') : ''}</small></span></div>`; }).join('')}</div>
    <h3>Добавить в команду</h3>
    ${registerFields('t')}
    <div class="err" id="tErr" style="color:#ff7584;font-size:13px;min-height:18px;margin-top:8px"></div>
    <div class="row" style="margin-top:6px"><button class="btn primary" id="tAdd">Создать аккаунт</button></div>
  `, b => {
    mountRegister(b, 't');
    b.querySelector('#tAdd').onclick = async () => {
      try { await api('api/auth', {method:'POST', body:readRegister(b, 't')}); await refreshMe(); toast('Аккаунт создан — передайте логин и пароль'); openTeam(); }
      catch(e){ b.querySelector('#tErr').textContent = e.message; }
    };
  });
}

/* ---------- настройки ---------- */
const PREVIEW = k => STYLES[k].url.replace('{z}', 13).replace('{x}', 5673).replace('{y}', 3061);
function openSettings(){
  const u = me();
  openSheet(`
    <h2>Настройки</h2>
    <div class="cloud" style="margin-top:10px"><span class="dot" style="width:34px;height:34px;border-radius:50%;background:${u.color};display:grid;place-items:center;font-weight:800;font-size:13px">${esc(initials(u.name))}</span><div style="flex:1"><b>${esc(u.name)}</b><div class="sub">${isLead() ? 'Руководитель' : 'Сейлер'} · @${esc(u.u)}</div></div><button class="btn sm" id="logout" style="flex:none;padding:0 14px">Выйти</button></div>
    ${isSeller() ? `<h3>Запись маршрута</h3><button class="cloud" id="recOpen" style="width:100%;text-align:left"><span class="sync" data-s="${recState==='on'?'ok':recState==='wait'?'pending':'error'}"></span><div><b>${$('#recText').textContent}</b><div class="sub">Автоматически ${workHours()[0]}:00–${workHours()[1]}:00 · фоновая запись через OwnTracks</div></div></button>` : ''}
    <h3>Облако</h3>
    <div class="cloud" id="cloudState">${cloudHtml()}</div>
    <h3>Уведомления</h3>
    <div class="row" style="margin-top:0"><button class="btn sm" id="pushOn">Включить уведомления</button><button class="btn sm" id="pushTest">Проверить</button></div>
    <h3>Стиль карты</h3>
    <div class="styles">${Object.keys(STYLES).map(k => `<button class="style${cfg.style===k?' sel':''}" data-s="${k}"><img loading="lazy" alt="" src="${PREVIEW(k)}">${STYLES[k].name}</button>`).join('')}</div>
    <h3>Мирзо-Улугбекский район</h3>
    <div class="seg"><button data-dz="1" class="${cfg.district?'sel':''}">Показывать границу</button><button data-dz="0" class="${cfg.district?'':'sel'}">Скрыть</button></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" id="dzFit">Показать район</button><button class="btn sm" id="dzReload">Обновить границу</button></div>
    ${isSeller() ? `<h3>Очистка</h3><div class="row" style="margin-top:0"><button class="btn sm danger" id="clr">Стереть нарисованное за ${allDays ? 'сегодня' : fmtShort(day)}</button></div>` : ''}
  `, b => {
    b.querySelector('#logout').onclick = () => logout();
    const ro = b.querySelector('#recOpen'); if (ro) ro.onclick = openRecording;
    b.querySelector('#pushOn').onclick = enablePush;
    b.querySelector('#pushTest').onclick = async () => { try { const j = await api('api/feed', {method:'POST', body:{action:'testPush'}}); toast(j.push ? 'Отправил тестовое уведомление' : 'Уведомления не настроены на сервере (VAPID)'); } catch(e){ toast(e.message); } };
    b.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { setStyle(x.dataset.s); b.querySelectorAll('[data-s]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelectorAll('[data-dz]').forEach(x => x.onclick = () => {
      cfg.district = x.dataset.dz === '1'; saveCfg();
      if (districtLayer){ if (cfg.district) districtLayer.addTo(map); else map.removeLayer(districtLayer); }
      b.querySelectorAll('[data-dz]').forEach(y => y.classList.toggle('sel', y === x));
    });
    b.querySelector('#dzFit').onclick = async () => { if (!districtBounds && !(await loadDistrict())) return toast('Граница ещё не загружена'); closeSheet(); map.flyToBounds(districtBounds, {padding:[20,20], duration:.7}); };
    b.querySelector('#dzReload').onclick = async () => { toast('Загружаю границу…'); if (await loadDistrict(true)){ closeSheet(); toast('Граница обновлена'); } };
    const clr = b.querySelector('#clr');
    if (clr) clr.onclick = () => {
      const k = allDays ? today() : day;
      if (!clr.dataset.sure){ clr.dataset.sure = 1; clr.textContent = 'Нажмите ещё раз для подтверждения'; return; }
      snap(); db.strokes = db.strokes.filter(s => s.day !== k); store.save(); render(); closeSheet(); toast('Нарисованное стёрто');
    };
  });
}
$('#layersBtn').onclick = openSettings;

function copyRow(label, value){ return `<div class="copyrow"><span><small>${label}</small><span class="mono">${esc(value)}</span></span><button data-copy="${esc(value)}">Копировать</button></div>`; }
function openRecording(){
  const url = location.origin + '/api/owntracks';
  openSheet(`
    <h2>Запись маршрута</h2>
    <div class="sub">Маршрут пишется сам с ${workHours()[0]}:00 до ${workHours()[1]}:00 по Ташкенту. Вне этого времени геопозиция не записывается и руководителю не видна.</div>
    <h3>В этом приложении</h3>
    <div class="seg"><button data-rec="1" class="${cfg.rec?'sel':''}">Записывать</button><button data-rec="0" class="${cfg.rec?'':'sel'}">Не записывать</button></div>
    <div class="seg" style="margin-top:8px"><button data-wake="1" class="${cfg.wake?'sel':''}">Не гасить экран</button><button data-wake="0" class="${cfg.wake?'':'sel'}">Как обычно</button></div>
    <div class="sub" style="margin-top:8px">iPhone не даёт сайтам писать геопозицию при выключенном экране. Пока приложение открыто, экран не погаснет и маршрут пишется точно.</div>
    <h3>Фоновая запись — экран можно выключить</h3>
    <div class="sub">Бесплатное приложение <b>OwnTracks</b> пишет маршрут в фоне и отправляет его сюда.</div>
    <ol class="steps">
      <li>Установите <a href="https://apps.apple.com/app/id692424691" target="_blank" style="color:var(--accent-2)">OwnTracks</a> из App Store.</li>
      <li>Нажмите «Файл настроек для OwnTracks» ниже и откройте его в OwnTracks — или введите данные вручную: <i>Settings → Mode: HTTP, URL, Authentication вкл., UserID, Password</i>.</li>
      <li>В OwnTracks включите режим <b>Move</b> (кнопка режима вверху карты).</li>
      <li>Настройки iPhone → OwnTracks → Геопозиция → <b>Всегда</b>, «Точная геопозиция» включена.</li>
    </ol>
    ${copyRow('URL', url)}${copyRow('UserID (логин)', me().u)}${copyRow('Password (трек-токен)', session.trackToken || '')}
    <div class="row"><button class="btn sm" id="otrc">Файл настроек для OwnTracks</button><button class="btn sm" id="newTok">Новый токен</button></div>
  `, b => {
    b.querySelectorAll('[data-rec]').forEach(x => x.onclick = () => { cfg.rec = x.dataset.rec === '1'; saveCfg(); recTick(); b.querySelectorAll('[data-rec]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelectorAll('[data-wake]').forEach(x => x.onclick = () => { cfg.wake = x.dataset.wake === '1'; saveCfg(); recTick(); b.querySelectorAll('[data-wake]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelectorAll('[data-copy]').forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.copy); toast('Скопировано'); } catch(e){ toast('Не удалось скопировать'); } });
    b.querySelector('#otrc').onclick = () => downloadFile('mercury-map.otrc', JSON.stringify({_type:'configuration', mode:3, url, auth:true, username:me().u, password:session.trackToken, deviceId:'iphone', tid:initials(me().name).padEnd(2,'X').slice(0,2), monitoring:2, locatorInterval:30, locatorDisplacement:25, ignoreInaccurateLocations:60, extendedData:true}, null, 1), 'application/octet-stream');
    b.querySelector('#newTok').onclick = async () => {
      const btn = b.querySelector('#newTok');
      if (!btn.dataset.sure){ btn.dataset.sure = 1; btn.textContent = 'Старый токен перестанет работать. Точно?'; return; }
      try { const j = await api('api/auth', {method:'POST', body:{action:'newTrackToken'}}); session.trackToken = j.trackToken; lsSet('mm-session', session); openRecording(); toast('Новый токен — обновите его в OwnTracks'); }
      catch(e){ toast(e.message); }
    };
  });
}
async function downloadFile(name, text, type){
  const blob = new Blob([text], {type});
  try { const file = new File([blob], name, {type}); if (navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return; } } catch(e){ if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- push ---------- */
function b64ToU8(s){ const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); }
async function enablePush(){
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Добавьте приложение на экран «Домой» и откройте его оттуда (iOS 16.4+)', 4500);
  if (!session.vapid) return toast('Уведомления ещё не настроены на сервере (VAPID-ключи)', 4000);
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Уведомления запрещены в настройках iPhone');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToU8(session.vapid)});
    await api('api/feed', {method:'POST', body:{action:'subscribe', sub:sub.toJSON()}});
    toast('Уведомления включены ✓');
  } catch(e){ toast('Не удалось включить: ' + e.message, 4000); }
}

/* ================= вход ================= */
function registerFields(p, first){
  return `
    ${first ? '' : `<div class="field"><label>Код администратора (APP_PIN из Vercel)</label><input id="${p}Code" type="password" inputmode="numeric" placeholder="Код"></div>`}
    <div class="field"><label>Имя и фамилия</label><input id="${p}Name" maxlength="40" placeholder="Фуркат Зикриёев"></div>
    <div class="field"><label>Логин (латиницей)</label><input id="${p}U" maxlength="24" autocapitalize="none" autocomplete="off" placeholder="furkat"></div>
    <div class="field"><label>Пароль (от 6 символов)</label><input id="${p}Pass" type="password" autocomplete="new-password"></div>
    <div class="field"><label>Роль</label><div class="seg" style="margin-top:0"><button type="button" data-role="seller" class="sel">Сейлер</button><button type="button" data-role="lead">Руководитель</button></div></div>
    <div class="field"><label>Цвет на карте</label><div class="colors">${USER_COLORS.map((c,i) => `<button type="button" data-col="${c}" style="--c:${c}" class="${i===0?'sel':''}"></button>`).join('')}</div></div>`;
}
function mountRegister(b, p){
  b.querySelectorAll('[data-role]').forEach(x => x.onclick = () => b.querySelectorAll('[data-role]').forEach(y => y.classList.toggle('sel', y === x)));
  b.querySelectorAll('[data-col]').forEach(x => x.onclick = () => b.querySelectorAll('[data-col]').forEach(y => y.classList.toggle('sel', y === x)));
}
function readRegister(b, p){
  const v = id => { const e = b.querySelector('#' + p + id); return e ? e.value.trim() : ''; };
  return {action:'register', adminCode:v('Code'), name:v('Name'), u:v('U').toLowerCase(), pass:b.querySelector('#'+p+'Pass').value,
    role:(b.querySelector('[data-role].sel')||{}).dataset.role || 'seller', color:(b.querySelector('[data-col].sel')||{}).dataset.col};
}
async function showAuth(view){
  const box = $('#authCard'); $('#auth').classList.add('show');
  let st = {hasUsers:true, adminCode:true};
  try { st = await api('api/auth?action=status'); } catch(e){ if (/облако/i.test(e.message)) st.error = e.message; }
  if (!view) view = st.hasUsers ? 'login' : 'register';
  const head = `<div class="auth-logo"><img src="icon-180.png" alt=""><div><b>Mercury Map</b><small>Маршруты и партнёры команды</small></div></div>`;
  if (view === 'login'){
    box.innerHTML = head + `
      <div class="field"><label>Логин</label><input id="lU" autocapitalize="none" autocomplete="username" placeholder="furkat"></div>
      <div class="field"><label>Пароль</label><input id="lPass" type="password" autocomplete="current-password"></div>
      <div class="err" id="lErr">${esc(st.error || '')}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="lGo">Войти</button></div>
      <button class="link" id="toReg">Создать аккаунт</button>`;
    const go = async () => {
      const btn = box.querySelector('#lGo'); btn.disabled = true;
      try { await login(box.querySelector('#lU').value.trim().toLowerCase(), box.querySelector('#lPass').value); }
      catch(e){ box.querySelector('#lErr').textContent = e.message; btn.disabled = false; }
    };
    box.querySelector('#lGo').onclick = go;
    box.querySelector('#lPass').onkeydown = e => { if (e.key === 'Enter') go(); };
    box.querySelector('#toReg').onclick = () => showAuth('register');
  } else {
    const first = !st.hasUsers && !st.adminCode;
    box.innerHTML = head + `<h2 style="margin:0 0 4px">${st.hasUsers ? 'Новый аккаунт' : 'Первый запуск'}</h2>
      <div class="sub">${st.hasUsers ? 'Нужен код администратора — его знает тот, кто настраивал Vercel.' : 'Создайте свой аккаунт. Остальных добавите потом в разделе «Команда» или здесь же.'}</div>
      ${registerFields('r', first)}
      <div class="err" id="rErr">${esc(st.error || '')}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="rGo">Создать и войти</button></div>
      ${st.hasUsers ? '<button class="link" id="toLogin">У меня уже есть аккаунт</button>' : ''}`;
    mountRegister(box, 'r');
    box.querySelector('#rGo').onclick = async () => {
      const btn = box.querySelector('#rGo'); btn.disabled = true;
      const data = readRegister(box, 'r');
      try { await api('api/auth', {method:'POST', body:data}); await login(data.u, data.pass); }
      catch(e){ box.querySelector('#rErr').textContent = e.message; btn.disabled = false; }
    };
    const tl = box.querySelector('#toLogin'); if (tl) tl.onclick = () => showAuth('login');
  }
}
async function login(u, pass){
  const j = await api('api/auth', {method:'POST', body:{action:'login', u, pass}});
  session = {token:j.token, user:j.user, trackToken:j.trackToken};
  lsSet('mm-session', session);
  await refreshMe();
  $('#auth').classList.remove('show');
  start();
}
async function refreshMe(){
  const j = await api('api/auth?action=me');
  Object.assign(session, {user:j.user, team:j.team, work:j.work, vapid:j.vapid, trackToken:j.trackToken});
  lsSet('mm-session', session);
}
function logout(expired){
  try { localStorage.removeItem('mm-session'); } catch(e){}
  session = null;
  location.href = location.pathname + (expired ? '?expired=1' : '');
}

/* ================= запуск ================= */
let started = false, pollTimer = null;
function start(){
  if (started) return; started = true;
  document.body.classList.add(isLead() ? 'lead' : 'seller');
  buildDock(); setMode('hand');
  seen = lsGet(seenKey(), {});
  if (isSeller()){
    DKEY = 'mm-data-' + me().u;
    db = Object.assign({strokes:[], partners:[], deleted:{}}, lsGet(DKEY, {}));
    // перенос данных из версии без аккаунтов, если они остались на этом устройстве
    const legacy = lsGet('tashkent-route-v1', null);
    if (legacy && !lsGet('mm-legacy-done', false) && (legacy.strokes||[]).length + (legacy.partners||[]).length){
      db.strokes = db.strokes.concat(legacy.strokes || []); db.partners = db.partners.concat(legacy.partners || []);
      lsSet('mm-legacy-done', true);
    }
    lastIds = new Set();  // всё локальное считается новым и уйдёт в облако
    buf = lsGet(BUFKEY(), []);
    const t = tracks[today()] || (tracks[today()] = {}); t[me().u] = mergePts(t[me().u], buf);
    store.save();
    syncNow();
  }
  render();
  loadFeed();
  if (isLead()) loadTeamData();
  ensureTracks(day, true).then(render);
  tick(); pollTimer = setInterval(tick, 15000);
  openFromUrl();
}
let tickN = 0, firstFit = false;
async function tick(){
  tickN++;
  if (document.visibilityState !== 'visible' && tickN % 4) return;
  if (isSeller()){
    recTick();
    if (buf.length && tickN % 2 === 0) flushTrack();
    if (!buf.length && tickN % 4 === 0){ try { const j = await api('api/feed'); if (j.ver !== feedVer) loadFeed(); } catch(e){} }
    if (tickN % 20 === 0) ensureTracks(today(), true).then(() => { if (day === today()) render(); });
    if (tickN % 4 === 0) syncNow();
  } else if (isLead()){
    try {
      const j = await api('api/feed?sellers=' + sellers().map(s => s.u).join(','));
      let moved = false;
      for (const [u, p] of Object.entries(j.live || {})){
        const old = live[u]; live[u] = p;
        if (!old || old.ts !== p.ts){ moved = true; const k = dayKey(p.ts); const t = tracks[k] || (tracks[k] = {}); t[u] = mergePts(t[u], [[p.lat, p.lng, p.ts, p.acc]]); }
      }
      if (j.ver !== feedVer) loadFeed();
      if (j.dver !== dataVer) loadTeamData();
      if (moved && !firstFit && Object.keys(live).length){ firstFit = true; setTimeout(locateMe, 300); }
      if (moved){ renderLive(); renderPeople(); if (day === today() && !allDays){ renderRoutes(); updateHeader(); } }
      else if (tickN % 4 === 0){ renderLive(); renderPeople(); }
      if (tickN % 20 === 0) ensureTracks(today(), true).then(() => { if (day === today()) render(); });
      if (tickN % 40 === 0) refreshMe().catch(() => {});
    } catch(e){ setSync('error', e.message); }
  }
}
function openFromUrl(){
  const q = new URLSearchParams(location.search);
  if (q.get('note')) setTimeout(() => { const n = notes.find(x => x.id === q.get('note')); if (n){ map.flyTo([n.lat, n.lng], 17); openNote(n.id); } }, 1500);
  if (q.get('partner')) setTimeout(() => { if (findPartner(q.get('partner'))) openPartner(q.get('partner')); }, 2500);
  if (q.get('report')) setTimeout(() => openReport(q.get('report')), 1200);
  if (q.toString()) history.replaceState(null, '', location.pathname);
}
let openedOn = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !started) return;
  if (today() !== openedOn){ openedOn = today(); allDays = false; day = today(); render(); }
  tick();
  if (isSeller()){ syncNow(); flushTrack(); }
});
window.addEventListener('online', () => { if (started){ syncNow(); flushTrack(); } });
window.addEventListener('pagehide', () => { if (isSeller() && buf.length) flushTrack(); });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
if (session && session.token){
  refreshMe().then(start).catch(e => { if (!session) return; if (session.team) start(); else showAuth(); });
} else showAuth();
window.__app = {get db(){ return db; }, map, get tracks(){ return tracks; }, get notes(){ return notes; }, get comments(){ return comments; }, get live(){ return live; }, setMode, openPartner, openNote};
})();
