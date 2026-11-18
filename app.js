/* Mercury Map — полевые продажи: рабочий день, визиты, маршруты, пульт руководителя.
 * Один файл без сборки: Leaflet + ванильный JS. Сервер — Vercel Functions (api/*) + Upstash Redis.
 * Демо-режим (demo.js) подменяет api() локальной симуляцией — тот же код интерфейса. */
(() => {
'use strict';

/* ================= константы ================= */
const STATUSES = {
  new:       {label:'Визит идёт',                short:'Визит идёт', color:'#a78bfa'},
  refused:   {label:'Отказался',                 short:'Отказ',      color:'#ff4d5e'},
  contacts:  {label:'Взял контакты, жду ответа', short:'Жду ответа', color:'#ffb020'},
  agreed:    {label:'Согласился, жду документы', short:'Жду доки',   color:'#4c8dff'},
  connected: {label:'Подключён',                 short:'Подключён',  color:'#2fd07a'}
};
const ST_ORDER = ['refused','contacts','agreed','connected'];
const CATEGORIES = ['Техника','Телефоны','Мебель','Одежда','Стройматериалы','Детские товары','Другое'];
const PURPOSES = ['Повторная встреча','Сбор документов','Подписание договора','Обучение кассиров','Реанимация','Другое'];
const TURNOVERS = ['до 50 млн','50–200 млн','200–500 млн','500 млн – 1 млрд','более 1 млрд'];
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
const TASHKENT = [41.3361, 69.3398];
const BOUNDS = [[41.13, 69.03], [41.48, 69.53]];
const GAP = 10 * 60e3;               // разрыв трека, если точек не было 10 минут
const GRID_LAT = 0.0009, GRID_LNG = 0.0012;   // сетка покрытия ~100 м (как на сервере)
const PERIODS = [['today','Сегодня'],['yesterday','Вчера'],['dby','Позавчера'],['week','7 дней'],['all','Всё']];
const I = {
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  pen:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  plus:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><path d="M12 7v6M9 10h6"/>',
  visit:'<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M10 21v-6h4v6"/>',
  eraser:'<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  me:'<path d="M3 11 22 2l-9 19-2-8-8-2z"/>',
  note:'<path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/>',
  team:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.3.2 4.1 1.6 4.8 4"/>',
  report:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  grid:'<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  camera:'<path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  play:'<path d="M7 4v16l13-8z"/>',
  stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  layers:'<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'
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
  if (k === shiftDay(today(), -2)) return 'Позавчера';
  const s = new Intl.DateTimeFormat('ru-RU',{weekday:'short', day:'numeric', month:'long'}).format(parseDay(k));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtShort = k => new Intl.DateTimeFormat('ru-RU',{day:'numeric', month:'short'}).format(parseDay(k));
const fmtTime = ts => new Intl.DateTimeFormat('ru-RU',{...TZ, day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(ts));
const fmtHM = ts => new Intl.DateTimeFormat('ru-RU',{...TZ, hour:'2-digit', minute:'2-digit'}).format(new Date(ts));
const fmtKm = m => m < 1000 ? Math.round(m)+' м' : (m/1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')+' км';
const fmtDur = ms => { const m = Math.max(0, Math.round(ms/60000)); return m < 60 ? m + ' мин' : Math.floor(m/60) + ' ч ' + String(m%60).padStart(2,'0') + ' мин'; };
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms/1000)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h ? h + ':' + String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); };
const plural = (n, a, b, c) => { const m10 = n%10, m100 = n%100; return m10===1&&m100!==11 ? a : (m10>=2&&m10<=4&&(m100<10||m100>=20) ? b : c); };
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'только что'; if (s < 3600) return Math.round(s/60)+' мин назад'; if (s < 86400) return Math.round(s/3600)+' ч назад'; return fmtTime(ts); };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
const firstName = n => String(n || '').trim().split(/\s+/)[0];
const tashHour = (ms = Date.now()) => { const d = new Date(ms + 5*3600e3); return d.getUTCHours() + d.getUTCMinutes()/60; };
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch(e){ return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
function distM(a, b){ return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1])); }
function trackKm(pts){ let d = 0; for (let i = 1; i < pts.length; i++) if (pts[i][2] - pts[i-1][2] < GAP) d += distM(pts[i-1], pts[i]); return d; }
function mergePts(a, b){ const all = (a||[]).concat(b||[]).sort((x,y) => x[2]-y[2]); const out = []; for (const p of all){ const l = out[out.length-1]; if (l && p[2]-l[2] < 5000) continue; out.push(p); } return out; }
let toastT;
function toast(msg, ms = 2600){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

/* ================= состояние ================= */
const DEMO = window.MMDemo && window.MMDemo.active() ? window.MMDemo : null;
let session = DEMO ? null : lsGet('mm-session', null);
const me = () => session && session.user;
const isLead = () => !!me() && me().role === 'lead';
const isSeller = () => !!me() && me().role === 'seller';
const cfg = Object.assign({style:'osm', color:PEN_COLORS[0], weight:6, eraser:22, district:true, view:null, wake:true, cov:false, track:true, statuses:null}, DEMO ? {} : lsGet('mm-settings', {}));
const saveCfg = () => { if (!DEMO) lsSet('mm-settings', cfg); };

let DKEY = null;
let db = {strokes:[], partners:[], visits:[], deleted:{}};
let teamData = {};            // руководитель: данные всех менеджеров
let tracks = {};              // tracks[day][u] = [[lat,lng,ts,acc],…]
let tracksLoaded = {};        // tracksLoaded[day] = время загрузки
let live = {}, shifts = {}, cov = {};
let notes = [], comments = [], events = [], evN = 0, evInit = false;
let feedVer = -1, dataVer = -1;
let seen = {};
let mode = 'hand', period = 'today', day = today(), focus = null, penSub = 'pen';
let undoStack = [], cur = null, erasing = null, pendingRemote = null, ghost = null;

/* ================= API ================= */
async function api(path, {method = 'GET', body} = {}){
  if (DEMO) return DEMO.api(path, {method, body});
  const headers = {'Content-Type':'application/json'};
  if (session && session.token) headers.Authorization = 'Bearer ' + session.token;
  const r = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined});
  let j = {}; try { j = await r.json(); } catch(e){}
  if (r.status === 401 && session && !(body && body.action === 'login')){ logout(true); throw new Error('Войдите заново'); }
  if (!r.ok) throw new Error(j.error === 'storage_not_configured' ? 'Облако не подключено в Vercel' : (j.error || ('Ошибка ' + r.status)));
  return j;
}
const photoUrl = id => !id ? '' : DEMO ? DEMO.photoUrl(id) : `api/photo?id=${encodeURIComponent(id)}&t=${encodeURIComponent(session.token)}`;

/* ================= карта ================= */
const map = L.map('map', {minZoom:11, maxBounds:BOUNDS, maxBoundsViscosity:.9, zoomControl:false, tap:false, zoomSnap:.25, wheelPxPerZoomLevel:90});
const vOk = cfg.view && L.latLngBounds(BOUNDS).contains([cfg.view[0], cfg.view[1]]);
map.setView(vOk ? [cfg.view[0], cfg.view[1]] : TASHKENT, vOk ? Math.max(cfg.view[2], 11) : 14);
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
map.createPane('cov'); map.getPane('cov').style.zIndex = 360; map.getPane('cov').style.pointerEvents = 'none';
const renderer = L.canvas({padding:.5, tolerance:12});
const covRenderer = L.canvas({padding:.5, pane:'cov'});
const covLayer = L.layerGroup().addTo(map);
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
let districtLayer = null, districtBounds = null, districtRings = [], districtCells = null;
function pickGeom(gj){
  if (!gj) return null;
  const fs = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [{geometry:gj}];
  const f = (fs || []).find(f => f && f.geometry && /Polygon/.test(f.geometry.type));
  return f ? f.geometry : null;
}
function inRing(lat, lng, ring){ let ins = false; for (let i = 0, j = ring.length-1; i < ring.length; j = i++){ const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
const inDistrict = (lat, lng) => districtRings.some(r => inRing(lat, lng, r));
function drawDistrict(geom){
  if (districtLayer) map.removeLayer(districtLayer);
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  districtRings = polys.map(pg => pg[0]);
  const outer = polys.map(pg => pg[0].map(([x, y]) => [y, x]));
  const world = [[85,-180],[85,180],[-85,180],[-85,-180]];
  districtLayer = L.layerGroup([
    L.polygon([world, ...outer], {pane:'district', stroke:false, fillColor:'#141626', fillOpacity:.16, interactive:false}),
    L.polygon(outer, {pane:'district', color:'#fff', weight:7, opacity:.9, fill:false, interactive:false}),
    L.polygon(outer, {pane:'district', color:'#7c6cff', weight:3.5, fill:true, fillColor:'#7c6cff', fillOpacity:.03, interactive:false})
  ]);
  districtBounds = L.latLngBounds(outer.flat());
  if (cfg.district) districtLayer.addTo(map);
  // клетки сетки покрытия внутри района
  districtCells = new Set();
  const sw = districtBounds.getSouthWest(), ne = districtBounds.getNorthEast();
  for (let i = Math.floor(sw.lat/GRID_LAT); i <= Math.floor(ne.lat/GRID_LAT); i++)
    for (let j = Math.floor(sw.lng/GRID_LNG); j <= Math.floor(ne.lng/GRID_LNG); j++)
      if (inDistrict((i+.5)*GRID_LAT, (j+.5)*GRID_LNG)) districtCells.add(i+':'+j);
  if (window.__onDistrict) window.__onDistrict();
  renderCoverage(); updateCovChip();
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
window.MM_districtReady = loadDistrict();

/* ================= данные ================= */
const sellers = () => (session && session.team || []).filter(x => x.role === 'seller');
const userOf = u => (session && session.team || []).find(x => x.u === u) || {u, name:u, color:'#7c6cff'};
const visibleSellers = () => isLead() ? (focus ? [focus] : sellers().map(x => x.u)) : (me() ? [me().u] : []);
const EMPTY = {strokes:[], partners:[], visits:[]};
const dataOf = u => isLead() ? (teamData[u] || EMPTY) : db;
const trackOf = (u, k) => (tracks[k] && tracks[k][u]) || [];
function findPartner(id){
  for (const u of isLead() ? Object.keys(teamData) : [me().u]){ const p = (dataOf(u).partners || []).find(x => x.id === id); if (p) return {p, owner:u}; }
  return null;
}
const visitsOf = u => dataOf(u).visits || [];
const strokeLen = s => { let d = 0; for (let i=1;i<s.pts.length;i++) d += map.distance(s.pts[i-1], s.pts[i]); return d; };
const manualKm = (u, k) => dataOf(u).strokes.filter(s => s.day === k).reduce((a,s) => a + strokeLen(s), 0);
const activeVisit = (u = me() && me().u) => visitsOf(u).find(v => !v.end && v.day === today());

/* ---------- период ---------- */
function range(){
  const t = today();
  switch (period){
    case 'today': return [t, t];
    case 'yesterday': return [shiftDay(t,-1), shiftDay(t,-1)];
    case 'dby': return [shiftDay(t,-2), shiftDay(t,-2)];
    case 'week': return [shiftDay(t,-6), t];
    case 'all': return null;
    default: return [day, day];
  }
}
const inRange = k => { const r = range(); return !r || (k >= r[0] && k <= r[1]); };
const singleDay = () => { const r = range(); return r && r[0] === r[1] ? r[0] : null; };
const rangeDays = () => { const r = range(); if (!r) return []; const out = []; for (let k = r[0]; k <= r[1]; k = shiftDay(k, 1)) out.push(k); return out; };
function periodLabel(){
  const p = PERIODS.find(x => x[0] === period);
  if (p && period !== 'today') return p[0] === 'all' ? 'Вся история' : p[0] === 'week' ? 'Последние 7 дней' : p[1];
  return fmtDay(singleDay() || today());
}
function setPeriod(p, k){
  period = p; if (p === 'day') day = k;
  const s = singleDay(); if (s === today()) period = 'today'; else if (s === shiftDay(today(),-1)) period = 'yesterday'; else if (s === shiftDay(today(),-2)) period = 'dby';
  render(); ensureTracks().then(render);
}
const partnerVisible = p => {
  if (cfg.statuses && !cfg.statuses.includes(p.status) && p.status !== 'new') return false;
  if (!range()) return true;
  return inRange(p.day) || (p.history || []).some(h => inRange(dayKey(h.ts)));
};

/* ---------- сохранение и синхронизация (менеджер) ---------- */
const store = {
  save(localOnly){
    if (!DKEY) return;
    if (!localOnly){ trackDeletes(); scheduleSync(); }
    lsSet(DKEY, db);
  }
};
const allItems = () => db.strokes.concat(db.partners, db.visits);
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
function scheduleSync(){ if (!isSeller()) return; syncDirty = true; setSync('pending'); clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 500); }
async function syncNow(){
  if (!isSeller()) return;
  if (syncing){ syncDirty = true; return; }
  syncing = true; syncDirty = false; clearTimeout(retryTimer);
  try {
    const j = await api('api/data', {method:'POST', body:{strokes:db.strokes, partners:db.partners, visits:db.visits, deleted:db.deleted}});
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
  const before = JSON.stringify([db.strokes, db.partners, db.visits]);
  db.strokes = j.strokes; db.partners = j.partners; db.visits = j.visits || []; db.deleted = j.deleted || {};
  lastIds = new Set(allItems().map(x => x.id));
  store.save(true);
  if (JSON.stringify([db.strokes, db.partners, db.visits]) !== before){ undoStack.length = 0; render(); }
}
async function loadTeamData(){
  try { const j = await api('api/data'); teamData = j.sellers || {}; dataVer = +j.dver || dataVer; setSync('ok', 'Обновлено: ' + fmtHM(Date.now())); render(); }
  catch(e){ setSync('error', e.message); }
}

/* ---------- треки и покрытие ---------- */
async function ensureTracks(force){
  const days = rangeDays().filter(k => force || !tracksLoaded[k] || (k === today() && Date.now() - tracksLoaded[k] > 5*60e3));
  if (!days.length) return;
  try {
    const j = await api(`api/track?from=${days[0]}&to=${days[days.length-1]}`);
    for (const [k, byU] of Object.entries(j.days || {})){
      const t = tracks[k] || (tracks[k] = {});
      for (const [u, pts] of Object.entries(byU)) t[u] = mergePts(t[u], pts);
      tracksLoaded[k] = Date.now();
    }
  } catch(e){}
}
async function loadCoverage(){
  try { const j = await api('api/track?cov=1'); cov = {}; for (const [u, cells] of Object.entries(j.cov || {})) cov[u] = new Set(cells); renderCoverage(); updateCovChip(); } catch(e){}
}
const cellOf = (lat, lng) => Math.floor(lat/GRID_LAT) + ':' + Math.floor(lng/GRID_LNG);
function addCellsFromLine(set, pts){
  for (let i = 0; i < pts.length; i++){
    const p = pts[i]; set.add(cellOf(p[0], p[1]));
    const q = pts[i-1];
    if (q){ const n = Math.min(40, Math.ceil(distM(q, p) / 40)); for (let k = 1; k < n; k++) set.add(cellOf(q[0] + (p[0]-q[0])*k/n, q[1] + (p[1]-q[1])*k/n)); }
  }
}
function coveredCells(){
  const set = new Set();
  for (const u of visibleSellers()){
    (cov[u] || []).forEach(c => set.add(c));
    trackOf(u, today()).length && addCellsFromLine(set, trackOf(u, today()));
    dataOf(u).partners.forEach(p => set.add(cellOf(p.lat, p.lng)));
  }
  return set;
}
function coveragePct(){
  if (!districtCells || !districtCells.size) return null;
  let n = 0; for (const c of coveredCells()) if (districtCells.has(c)) n++;
  return Math.round(n / districtCells.size * 1000) / 10;
}
function renderCoverage(){
  covLayer.clearLayers();
  if (!cfg.cov || !districtCells || !me()) return;
  for (const c of coveredCells()){
    if (!districtCells.has(c)) continue;
    const [i, j] = c.split(':').map(Number);
    L.rectangle([[i*GRID_LAT, j*GRID_LNG], [(i+1)*GRID_LAT, (j+1)*GRID_LNG]], {renderer:covRenderer, pane:'cov', stroke:false, fillColor:'#20c997', fillOpacity:.32, interactive:false}).addTo(covLayer);
  }
}
function updateCovChip(){
  const c = $('#covChip'); if (!c || !me()) return;
  const pct = coveragePct();
  c.innerHTML = `${svg('grid', 16)}<span>${pct === null ? 'Покрытие' : 'Покрытие ' + String(pct).replace('.', ',') + '%'}</span>`;
  c.classList.toggle('on', !!cfg.cov);
}

/* ---------- заметки, комментарии ---------- */
async function loadFeed(){
  try {
    const j = await api('api/feed?full=1');
    const prev = new Set(comments.map(c => c.id).concat(notes.map(n => n.id)));
    const fresh = feedVer >= 0 && isSeller() ? [...j.comments.filter(c => !prev.has(c.id) && c.author !== me().u), ...j.notes.filter(n => !prev.has(n.id) && n.author !== me().u)] : [];
    notes = j.notes; comments = j.comments; feedVer = j.ver;
    fresh.forEach(f => pushToast({icon: f.pid ? '💬' : '📌', title: f.pid ? f.authorName : 'Заметка от руководителя', text: f.text || 'Метка на карте', color:'#ffb020',
      onClick: () => { if (f.pid){ if (f.kind === 'note') openNote(f.pid); else openPartner(f.pid); } else { map.flyTo([f.lat, f.lng], 17); openNote(f.id); } }}));
    render();
    const open = document.getElementById('thread'); if (open) open.dispatchEvent(new Event('refresh'));
  } catch(e){}
}
const seenKey = () => 'mm-seen-' + (me() ? me().u : '');
const markSeen = id => { seen[id] = Date.now(); if (!DEMO) lsSet(seenKey(), seen); };
const unread = id => comments.some(c => c.pid === id && c.author !== me().u && c.ts > (seen[id] || 0)) || notes.some(n => n.id === id && n.author !== me().u && n.ts > (seen[id] || 0));

/* ================= отрисовка ================= */
function pinIcon(color, opts = {}){
  const inner = opts.num ? `<b class="num">${opts.num}</b>` : '<i></i>';
  return L.divIcon({className:'', iconSize:[34,44], iconAnchor:[17,42],
    html:`<div class="pin${opts.ghost?' ghost':''}${opts.active?' active':''}"><svg viewBox="0 0 34 44" width="34" height="44"><path d="M17 1C8.2 1 1 8 1 16.6 1 28 17 43 17 43s16-15 16-26.4C33 8 25.8 1 17 1z" fill="${color}" stroke="#fff" stroke-width="2"/></svg>${inner}${opts.dot?'<span class="unread"></span>':''}</div>`});
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
// порядок визитов за день: {partnerId: номер}
function visitOrder(u, k){
  const vs = visitsOf(u).filter(v => v.day === k).sort((a,b) => a.start - b.start);
  const num = {}; vs.forEach((v, i) => { num[v.pid] = i + 1; });
  return {vs, num};
}
let renderQueued = false;
function render(){ renderRoutes(); renderPins(); renderNotes(); renderLive(); updateHeader(); renderPeople(); renderPeriods(); renderCoverage(); updateCovChip(); renderVisitBar(); renderShiftChip(); renderSide(); }
function renderRoutes(){
  routeLayer.clearLayers();
  const days = rangeDays(), sd = singleDay();
  for (const u of visibleSellers()){
    const color = userOf(u).color;
    if (cfg.track && days.length <= 7){
      days.forEach(k => {
        const old = k !== (sd || today()) && days.length > 1 ? .55 : 1;
        for (const seg of segments(trackOf(u, k))){
          const ll = seg.map(p => [p[0], p[1]]);
          L.polyline(ll, {renderer, color:'#fff', weight:8, opacity:.85*old, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer);
          L.polyline(ll, {renderer, color, weight:4.5, opacity:.95*old, lineCap:'round', lineJoin:'round'}).addTo(routeLayer)
            .on('click', () => { if (mode === 'hand') toast(`${isLead() ? userOf(u).name + ' · ' : ''}GPS ${fmtHM(seg[0][2])}–${fmtHM(seg[seg.length-1][2])} · ${fmtKm(trackKm(seg))}`); });
        }
      });
    }
    // визиты по порядку — пунктир как в Variant Go
    if (sd){
      const {vs} = visitOrder(u, sd);
      if (vs.length > 1) L.polyline(vs.map(v => [v.lat, v.lng]), {renderer, color, weight:2.5, opacity:.9, dashArray:'2 9', lineCap:'round', interactive:false}).addTo(routeLayer);
    }
    const strokes = dataOf(u).strokes.filter(s => inRange(s.day));
    strokes.forEach(s => {
      L.polyline(s.pts, {renderer, color:'#fff', weight:s.w+4, opacity:.85, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer);
      L.polyline(s.pts, {renderer, color:s.c, weight:s.w, opacity:1, lineCap:'round', lineJoin:'round'}).addTo(routeLayer)
        .on('click', () => { if (mode === 'hand') toast(fmtDay(s.day)+' · нарисовано · '+fmtKm(strokeLen(s))); });
    });
  }
}
function renderPins(){
  pinLayer.clearLayers();
  const sd = singleDay();
  for (const u of visibleSellers()){
    const {num} = sd ? visitOrder(u, sd) : {num:{}};
    const act = activeVisit(u);
    dataOf(u).partners.filter(partnerVisible).forEach(p => {
      const m = L.marker([p.lat, p.lng], {icon: pinIcon(STATUSES[p.status] ? STATUSES[p.status].color : '#888', {num: num[p.id], active: act && act.pid === p.id, dot: unread(p.id)}), zIndexOffset: act && act.pid === p.id ? 400 : 0}).addTo(pinLayer);
      m.bindTooltip(esc(p.name) + (isLead() && !focus ? ` · ${esc(initials(userOf(u).name))}` : ''), {permanent:true, direction:'bottom', offset:[0,2], className:'pin-label'});
      m.on('click', e => { L.DomEvent.stop(e); if (mode === 'pen') return; openPartner(p.id); });
    });
  }
}
function renderNotes(){
  noteLayer.clearLayers();
  notes.filter(n => !n.done || inRange(dayKey(n.ts)) || (n.doneTs && inRange(dayKey(n.doneTs))))
    .filter(n => !isLead() || !focus || n.for === focus || n.for === 'all')
    .forEach(n => {
      const m = L.marker([n.lat, n.lng], {icon: noteIcon(n.done, false, unread(n.id)), zIndexOffset:500}).addTo(noteLayer);
      if (n.text) m.bindTooltip(esc(n.text.length > 26 ? n.text.slice(0,25)+'…' : n.text), {permanent:true, direction:'bottom', offset:[0,0], className:'pin-label'});
      m.on('click', e => { L.DomEvent.stop(e); if (mode === 'pen') return; openNote(n.id); });
    });
}
function sellerState(u){
  const sh = shifts[u], p = live[u], v = activeVisit(u);
  const t = today();
  if (!sh || sh.day !== t || !sh.start) return {k:'off', icon:'⚪️', text:'Не начал(а) день'};
  if (sh.end) return {k:'done', icon:'✓', text:'Завершил(а) день в ' + fmtHM(sh.end)};
  if (v){ const pt = (dataOf(u).partners.find(x => x.id === v.pid) || {}).name || 'партнёр'; return {k:'visit', icon:'🟣', text:`На визите · ${pt} · ${fmtDur(Date.now() - v.start)}`, v}; }
  if (p && Date.now() - p.ts > 15*60e3) return {k:'lost', icon:'🟠', text:'Нет сигнала ' + fmtDur(Date.now() - p.ts)};
  return {k:'field', icon:'🟢', text:'В поле с ' + fmtHM(sh.start) + (p ? ' · ' + ago(p.ts) : '')};
}
function renderLive(){
  liveLayer.clearLayers();
  if (!isLead() || singleDay() !== today()) return;
  for (const u of visibleSellers()){
    const p = live[u]; if (!p || dayKey(p.ts) !== today()) continue;
    const usr = userOf(u), st = sellerState(u), stale = st.k === 'lost' || st.k === 'done' || st.k === 'off';
    const m = L.marker([p.lat, p.lng], {zIndexOffset:1000, icon: L.divIcon({className:'', iconSize:[44,44], iconAnchor:[22,22],
      html:`<div class="live${stale?' stale':''}${st.k==='visit'?' visiting':''}" style="--c:${usr.color}"><span class="ring"></span><span class="core">${esc(initials(usr.name))}</span></div>`})}).addTo(liveLayer);
    m.bindTooltip(`<b>${esc(usr.name)}</b><br>${esc(st.text)}`, {direction:'top', offset:[0,-20], className:'live-tip'});
    m.on('click', e => { L.DomEvent.stop(e); openSeller(u); });
  }
}
function dayStats(u, k){
  const pts = trackOf(u, k), d = dataOf(u);
  const vs = (d.visits || []).filter(v => v.day === k);
  const created = d.partners.filter(p => p.day === k);
  const connected = d.partners.filter(p => (p.history||[]).some(h => h.s === 'connected' && dayKey(h.ts) === k)).length;
  const byStatus = Object.fromEntries(ST_ORDER.map(s => [s, created.filter(p => p.status === s).length]));
  const done = vs.filter(v => v.end);
  const gps = trackKm(pts), manual = manualKm(u, k);
  const sh = shifts[u] && shifts[u].day === k ? shifts[u] : null;
  return {gps, manual, km: gps || manual, visits: vs.length, repeat: vs.filter(v => v.kind === 'repeat').length,
    avgVisit: done.length ? done.reduce((a,v) => a + (v.end - v.start), 0) / done.length : 0,
    from: sh ? sh.start : (pts[0] && pts[0][2]), to: sh && sh.end ? sh.end : (pts.length ? pts[pts.length-1][2] : null),
    created: created.length, connected, byStatus,
    notesDone: notes.filter(n => n.done && n.doneBy === u && n.doneTs && dayKey(n.doneTs) === k).length};
}
function updateHeader(){
  $('#dateTitle').textContent = periodLabel();
  let km = 0, np = 0, nv = 0;
  const days = rangeDays();
  for (const u of visibleSellers()){
    days.forEach(k => { km += trackKm(trackOf(u, k)) || manualKm(u, k); nv += visitsOf(u).filter(v => v.day === k).length; });
    np += dataOf(u).partners.filter(partnerVisible).length;
  }
  $('#dateSub').innerHTML = (range() ? `<span class="km">${fmtKm(km)}</span> · ${nv} ${plural(nv,'визит','визита','визитов')}` : `${np} ${plural(np,'партнёр','партнёра','партнёров')}`) + (isLead() && focus ? ' · ' + esc(firstName(userOf(focus).name)) : '');
  const total = visibleSellers().reduce((a,u) => a + dataOf(u).partners.length, 0);
  $('#pCount').textContent = total; $('#pCount').style.display = total ? '' : 'none';
  const sd = singleDay();
  $('#nextDay').style.opacity = (sd && sd >= today()) ? .3 : 1;
}
function renderPeriods(){
  const box = $('#periods');
  box.innerHTML = PERIODS.map(([k, t]) => `<button data-p="${k}" class="${period===k?'sel':''}">${t}</button>`).join('') + (period === 'day' ? `<button class="sel" data-p="day">${fmtShort(day)}</button>` : `<button data-p="pick">${svg('report', 14).replace('M4 20V10M10 20V4M16 20v-7M22 20H2','M3 9h18M7 3v4M17 3v4M5 5h14v16H5z')}</button>`);
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const p = b.dataset.p; if (p === 'pick' || p === 'day') return openDays(); setPeriod(p); });
}
function renderPeople(){
  const box = $('#people');
  if (!isLead()){ box.innerHTML = ''; return; }
  box.innerHTML = `<button class="person glass${!focus?' sel':''}" data-u=""><span class="av" style="--c:#5b4bff">${sellers().length}</span>Все</button>`
    + sellers().map(s => { const st = sellerState(s.u); return `<button class="person glass${focus===s.u?' sel':''}" data-u="${esc(s.u)}"><span class="av ${st.k}" style="--c:${s.color}">${esc(initials(s.name))}</span>${esc(firstName(s.name))}</button>`; }).join('');
  box.querySelectorAll('[data-u]').forEach(b => b.onclick = () => focusSeller(b.dataset.u || null));
}
function focusSeller(u, fly = true){
  focus = u; render();
  if (u && fly){ if (live[u] && singleDay() === today()) map.flyTo([live[u].lat, live[u].lng], Math.max(map.getZoom(), 15), {duration:.7}); else fitPeriod(); }
}

/* ================= инструменты ================= */
function buildDock(){
  const tools = isLead()
    ? [['hand','Карта'],['note','Заметка'],['|'],['#teamBtn','team','Команда'],['#reportBtn','report','Отчёт'],['#locateBtn','me','Где все']]
    : [['hand','Карта'],['#newBtn','plus','Партнёр'],['#visitBtn','visit','Визит'],['|'],['#reportBtn','report','Отчёт'],['#locateBtn','me','Я']];
  $('#dock').innerHTML = tools.map(t => t[0] === '|' ? '<div class="sep"></div>'
    : t[0][0] === '#' ? `<button class="tool${t[0]==='#newBtn'?' t-new':''}" id="${t[0].slice(1)}">${svg(t[1])}<span>${t[2]}</span></button>`
    : `<button class="tool t-${t[0]}${t[0]===mode?' active':''}" data-mode="${t[0]}">${svg(t[0])}<span>${t[1]}</span></button>`).join('');
  document.querySelectorAll('.tool[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const on = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
  on('reportBtn', () => openReport()); on('teamBtn', openTeam); on('locateBtn', locateMe);
  on('newBtn', startNewPartner); on('visitBtn', startRepeatVisit);
}
function setMode(m){
  if (m === 'pen' && period !== 'today'){ setPeriod('today'); toast('Рисуем на сегодняшний день'); }
  mode = m;
  document.body.classList.remove('mode-hand','mode-pen','mode-note');
  document.body.classList.add('mode-' + m);
  document.querySelectorAll('.tool[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  if (m !== 'pen') penSub = 'pen';
  renderPalette();
  $('#palette').classList.toggle('show', m === 'pen');
  $('#ring').style.display = 'none';
  if (m === 'pen') map.dragging.disable(); else map.dragging.enable();
  if (m === 'pen') toast('Отметьте пальцем, где прошли · двумя пальцами — масштаб');
  if (m === 'note') toast('Нажмите на карту — оставьте заметку менеджеру');
}
function renderPalette(){
  const p = $('#palette');
  const sub = `<button class="wbtn${penSub==='pen'?' sel':''}" data-sub="pen" title="Карандаш">${svg('pen', 18)}</button><button class="wbtn${penSub==='eraser'?' sel':''}" data-sub="eraser" title="Ластик">${svg('eraser', 18)}</button><button class="wbtn" data-undo title="Отменить">${svg('undo', 18)}</button><span class="w"></span>`;
  if (penSub === 'eraser'){
    p.innerHTML = sub + ERASERS.map(r => `<button class="wbtn${r===cfg.eraser?' sel':''}" data-r="${r}" style="color:#ff7584"><span class="ering" style="width:${Math.round(r*0.6)+6}px;height:${Math.round(r*0.6)+6}px"></span></button>`).join('');
  } else {
    p.innerHTML = sub + PEN_COLORS.map(c => `<button class="swatch${c===cfg.color?' sel':''}" style="--c:${c}" data-c="${c}"></button>`).join('')
      + WEIGHTS.map(w => `<button class="wbtn${w===cfg.weight?' sel':''}" data-w="${w}"><span style="display:block;width:${w+3}px;height:${w+3}px;border-radius:50%;background:currentColor"></span></button>`).join('');
  }
  p.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { penSub = b.dataset.sub; renderPalette(); if (penSub === 'eraser') toast('Проведите по линии, чтобы стереть кусок'); });
  p.querySelectorAll('[data-undo]').forEach(b => b.onclick = undo);
  p.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { cfg.eraser = +b.dataset.r; saveCfg(); renderPalette(); });
  p.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cfg.color = b.dataset.c; saveCfg(); renderPalette(); });
  p.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { cfg.weight = +b.dataset.w; saveCfg(); renderPalette(); });
}

/* ---------- рисование и ластик (менеджер) ---------- */
const el = map.getContainer();
const pointers = new Map();
const cpt = e => { const r = el.getBoundingClientRect(); return L.point(e.clientX - r.left, e.clientY - r.top); };
const ring = $('#ring');
const snap = () => { undoStack.push(JSON.stringify(db.strokes)); if (undoStack.length > 50) undoStack.shift(); };
function cancelStroke(){ if (cur){ routeLayer.removeLayer(cur.casing); routeLayer.removeLayer(cur.line); cur = null; } }
function showRing(e){ const r = cfg.eraser; ring.style.width = ring.style.height = (r*2)+'px'; ring.style.transform = `translate(${e.clientX - r}px, ${e.clientY - r}px)`; ring.style.display = 'block'; }
const r6 = ll => [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
const erasing_ = () => mode === 'pen' && penSub === 'eraser';
function eraseAt(p){
  const R = cfg.eraser, step = Math.max(2, R/3);
  const visible = db.strokes.filter(s => inRange(s.day));
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
  if (!isSeller() || mode !== 'pen') return;
  if (erasing_()){
    if (pointers.size > 1){ if (erasing && !erasing.changed) undoStack.pop(); erasing = null; ring.style.display = 'none'; return; }
    if (e.target.closest('.leaflet-control')) return;
    e.preventDefault(); snap(); erasing = {changed:false}; showRing(e); eraseAt(cpt(e));
    return;
  }
  if (pointers.size > 1){ cancelStroke(); return; }
  if (e.target.closest('.leaflet-marker-icon, .leaflet-control')) return;
  e.preventDefault(); window.getSelection && window.getSelection().removeAllRanges();
  const p = cpt(e), ll = map.containerPointToLatLng(p), c = cfg.color, w = cfg.weight;
  cur = {pts:[ll], last:p, c, w,
    casing: L.polyline([ll], {renderer, color:'#fff', weight:w+4, opacity:.85, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer),
    line: L.polyline([ll], {renderer, color:c, weight:w, lineCap:'round', lineJoin:'round', interactive:false}).addTo(routeLayer)};
}, true);
el.addEventListener('pointermove', e => {
  if (erasing_() && isSeller()){
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
    db.strokes.push({id:uid(), day:today(), c:s.c, w:s.w, ts:Date.now(), u:Date.now(), pts: simp.map(r6)});
    store.save(); render();
  }
  if (pendingRemote){ const pr = pendingRemote; pendingRemote = null; applyRemote(pr); }
}
el.addEventListener('pointerup', endPointer, true);
el.addEventListener('dragstart', e => e.preventDefault(), true);
el.addEventListener('selectstart', e => { if (mode === 'pen') e.preventDefault(); }, true);
el.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); cancelStroke(); }, true);
el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse'){ endPointer(e); ring.style.display = 'none'; } }, true);
function undo(){
  if (undoStack.length){ db.strokes = JSON.parse(undoStack.pop()); store.save(); render(); return toast('Отменено'); }
  const mine = db.strokes.filter(s => s.day === today());
  if (!mine.length) return toast('Нечего отменять');
  const last = mine.reduce((a,b) => a.ts > b.ts ? a : b);
  db.strokes = db.strokes.filter(s => s.id !== last.id); store.save(); render(); toast('Последняя линия удалена');
}

/* ================= рабочий день и GPS (менеджер) ================= */
let watchId = null, wakeLock = null, gpsDenied = false, lastRec = null, lastFix = null, buf = [], flushing = false, lastRouteDraw = 0;
const BUFKEY = () => 'mm-buf-' + me().u;
const myShift = () => { const s = isSeller() && shifts[me().u]; return s && s.day === today() ? s : null; };
const shiftActive = () => { const s = myShift(); return !!(s && s.start && !s.end); };
function gpsTick(){
  if (!isSeller() || (DEMO && !DEMO.realGps)) return;
  const want = shiftActive() && !!navigator.geolocation;
  if (want && watchId === null) watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:3000, timeout:30000});
  if (!want && watchId !== null){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  keepAwake(want && cfg.wake);
}
function renderShiftChip(){
  const c = $('#shiftChip'); if (!c) return;
  if (!isSeller()){ c.style.display = 'none'; return; }
  c.style.display = '';
  const s = myShift();
  c.className = 'shift glass ' + (!s || !s.start ? 'start' : s.end ? 'ended' : 'on');
  c.innerHTML = !s || !s.start ? `${svg('play', 16)}<span>Начать день</span>`
    : s.end ? `<i></i><span>День завершён · ${fmtHM(s.end)}</span>`
    : `<i></i><span>В поле с ${fmtHM(s.start)}${gpsDenied ? ' · нет GPS' : ' · ' + fmtKm(trackKm(trackOf(me().u, today())))}</span>`;
}
async function startShift(){
  try {
    const j = await api('api/feed', {method:'POST', body:{action:'shiftStart'}});
    shifts[me().u] = j.shift; gpsTick(); render();
    toast(`День начат в ${fmtHM(j.shift.start)} · GPS-маршрут записывается`, 3500);
    return true;
  } catch(e){ toast(e.message); return false; }
}
async function endShift(){
  const s = dayStats(me().u, today());
  const summary = `${fmtKm(s.km)} · ${s.visits} ${plural(s.visits,'визит','визита','визитов')} · новых ${s.created} · подключено ${s.connected}`;
  try {
    await flushTrack();
    const j = await api('api/feed', {method:'POST', body:{action:'shiftEnd', summary}});
    shifts[me().u] = j.shift; gpsTick(); render(); closeSheet();
    toast('День завершён · ' + summary, 4000);
  } catch(e){ toast(e.message); }
}
function onPos(pos){
  const c = pos.coords, ts = pos.timestamp || Date.now();
  const p = [+c.latitude.toFixed(6), +c.longitude.toFixed(6), ts, Math.round(c.accuracy || 0)];
  lastFix = p; gpsDenied = false;
  showMe(p);
  if (!shiftActive() || p[3] > 80) return;
  if (lastRec && distM(lastRec, p) < 8 && ts - lastRec[2] < 60000) return;
  lastRec = p;
  buf.push(p); lsSet(BUFKEY(), buf);
  const k = dayKey(ts); const t = tracks[k] || (tracks[k] = {});
  t[me().u] = mergePts(t[me().u], [p]);
  if (singleDay() === k){ if (Date.now() - lastRouteDraw > 4000){ lastRouteDraw = Date.now(); renderRoutes(); } updateHeader(); renderShiftChip(); }
  if (buf.length >= 20) flushTrack();
}
function onPosErr(err){ if (err.code === 1){ gpsDenied = true; renderShiftChip(); toast('Разрешите доступ к геопозиции для записи маршрута', 4000); } }
async function flushTrack(){
  if (!isSeller() || flushing || !buf.length) return;
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
function getHere(timeout = 6000){
  return new Promise(res => {
    if (lastFix && Date.now() - lastFix[2] < 120000) return res(lastFix);
    if (!navigator.geolocation || (DEMO && !DEMO.realGps)) return res(null);
    navigator.geolocation.getCurrentPosition(pos => { const p = [pos.coords.latitude, pos.coords.longitude, Date.now(), pos.coords.accuracy]; lastFix = p; showMe(p); res(p); }, () => res(null), {enableHighAccuracy:true, timeout, maximumAge:30000});
  });
}
function locateMe(){
  if (isLead()){
    const pts = visibleSellers().map(u => live[u]).filter(p => p && dayKey(p.ts) === today()).map(p => [p.lat, p.lng]);
    if (pts.length) return map.flyToBounds(L.latLngBounds(pts).pad(.35), {maxZoom:16, duration:.7});
    return toast('Сейчас никого нет на связи');
  }
  toast('Ищу вас…');
  getHere(10000).then(p => { if (p) map.flyTo([p[0], p[1]], Math.max(map.getZoom(), 17), {duration:.8}); else toast('Разрешите доступ к геопозиции'); });
}

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
  sh.addEventListener('touchstart', e => { if ($('#sheetBody').scrollTop <= 0 && !e.target.closest('input,textarea,select,.photos')) y0 = e.touches[0].clientY; }, {passive:true});
  sh.addEventListener('touchmove', e => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, {passive:true});
  sh.addEventListener('touchend', e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; sh.style.transform = ''; y0 = null; if (dy > 90) closeSheet(); });
})();
const statusPicker = sel => `<div class="statuses">${ST_ORDER.map(k => `<button type="button" class="st${k===sel?' sel':''}" data-st="${k}" style="--c:${STATUSES[k].color}"><span class="dot"></span>${STATUSES[k].label}</button>`).join('')}</div>`;
const chips = (name, list, sel) => `<div class="chips" data-chips="${name}">${list.map(x => `<button type="button" class="chipbtn${x===sel?' sel':''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
function mountChips(b){ b.querySelectorAll('[data-chips]').forEach(box => box.querySelectorAll('[data-v]').forEach(x => x.onclick = () => { const was = x.classList.contains('sel'); box.querySelectorAll('[data-v]').forEach(y => y.classList.remove('sel')); if (!was || box.dataset.req) x.classList.add('sel'); })); }
const chipVal = (b, name) => { const x = b.querySelector(`[data-chips="${name}"] .sel`); return x ? x.dataset.v : ''; };
const sellerOptions = (sel, withAll) => (withAll ? `<option value="all"${sel==='all'?' selected':''}>Всем менеджерам</option>` : '') + sellers().map(s => `<option value="${esc(s.u)}"${sel===s.u?' selected':''}>${esc(s.name)}</option>`).join('');

/* ---------- фото ---------- */
function compressImage(file, max = 1280){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let q = .74, data = c.toDataURL('image/jpeg', q);
      while (data.length > 650*1024 && q > .35){ q -= .1; data = c.toDataURL('image/jpeg', q); }
      res(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть фото')); };
    img.src = url;
  });
}
const photoField = (key, label, req, existing) => `<label class="photo${existing?' has':''}" data-photo="${key}"${req?' data-req="1"':''}>
  <input type="file" accept="image/*" capture="environment" hidden>
  ${existing ? `<img src="${photoUrl(existing)}" alt="">` : ''}
  <span class="ph-label">${svg('camera', 22)}<b>${label}${req ? ' *' : ''}</b><small>${existing ? 'Нажмите, чтобы заменить' : 'Сделать снимок'}</small></span>
  <span class="ph-state"></span></label>`;
function mountPhotos(b, store){
  b.querySelectorAll('[data-photo]').forEach(box => {
    const key = box.dataset.photo, inp = box.querySelector('input');
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      box.classList.add('has', 'busy'); box.querySelector('.ph-state').textContent = 'Загружаю…';
      let img = box.querySelector('img'); if (!img){ img = document.createElement('img'); box.prepend(img); }
      const p = (async () => {
        const data = await compressImage(f); img.src = data;
        const j = await api('api/photo', {method:'POST', body:{data}});
        return j.id;
      })();
      store[key] = p;
      try { store[key] = await p; box.querySelector('.ph-state').textContent = '✓'; }
      catch(e){ delete store[key]; box.classList.remove('has'); box.querySelector('.ph-state').textContent = ''; toast('Фото не загрузилось: ' + e.message); }
      box.classList.remove('busy');
    };
  });
}
async function photosReady(b, store){
  for (const box of b.querySelectorAll('[data-photo][data-req]')){ if (!store[box.dataset.photo] && !box.classList.contains('has')){ box.classList.add('shake'); setTimeout(() => box.classList.remove('shake'), 600); toast('Сделайте обязательное фото'); return false; } }
  for (const k of Object.keys(store)) store[k] = await store[k];
  return true;
}

/* ================= визиты (менеджер) ================= */
async function requireShift(){
  if (shiftActive()) return true;
  const s = myShift();
  return new Promise(res => openSheet(`
    <h2>${s && s.end ? 'День уже завершён' : 'Сначала начните день'}</h2>
    <div class="sub">${s && s.end ? 'Чтобы записать визит, продолжите рабочий день.' : '«Начать день» — это выезд из офиса: включается запись GPS-маршрута, руководитель видит, что вы в поле.'}</div>
    <div class="row"><button class="btn" id="rsNo">Отмена</button><button class="btn primary" id="rsYes">${svg('play', 16)} ${s && s.end ? 'Продолжить день' : 'Начать день'}</button></div>
  `, b => {
    b.querySelector('#rsNo').onclick = () => { closeSheet(); res(false); };
    b.querySelector('#rsYes').onclick = async () => { closeSheet(); res(await startShift()); };
  }));
}
async function startNewPartner(){
  if (activeVisit()) return openActiveVisit();
  if (!(await requireShift())) return;
  const here = await getHere();
  const ll = here ? L.latLng(here[0], here[1]) : map.getCenter();
  if (ghost) map.removeLayer(ghost);
  ghost = L.marker(ll, {icon: pinIcon('#a78bfa', {ghost:true}), draggable:true, zIndexOffset:1500}).addTo(map);
  map.setView(ll, Math.max(map.getZoom(), 17), {animate:false}); map.panBy([0, Math.round(innerHeight * .25)], {animate:false});
  const ph = {};
  openSheet(`
    <span class="stepper"><b>1</b> на улице <i></i> <span>2</span> после разговора</span>
    <h2 style="margin-top:8px">Новый партнёр</h2>
    <div class="sub">${here ? `📍 Точка по GPS · точность ${Math.round(here[3] || 0)} м` : '📍 GPS недоступен — метка в центре карты'}. Метку можно перетащить.</div>
    <div class="field"><label>Название *</label><input id="nName" maxlength="80" placeholder="Например, «Техно Маркет»" autocomplete="off"></div>
    <div class="field"><label>Сфера</label>${chips('cat', CATEGORIES, '')}</div>
    <div class="photos">${photoField('facade', 'Фасад снаружи', true)}</div>
    <div class="hint">ИНН, оборот, телефон и контакт заполните <b>после разговора</b> — при завершении визита.</div>
    <div class="row"><button class="btn" id="nCancel">Отмена</button><button class="btn primary" id="nGo">Я на месте — начать визит</button></div>
  `, b => {
    mountChips(b); mountPhotos(b, ph);
    b.querySelector('#nCancel').onclick = closeSheet;
    b.querySelector('#nGo').onclick = async () => {
      const name = b.querySelector('#nName').value.trim();
      if (!name){ b.querySelector('#nName').focus(); return toast('Введите название'); }
      const btn = b.querySelector('#nGo'); btn.disabled = true; btn.textContent = 'Сохраняю…';
      if (!(await photosReady(b, ph))){ btn.disabled = false; btn.textContent = 'Я на месте — начать визит'; return; }
      const pos = ghost ? ghost.getLatLng() : ll, now = Date.now();
      const p = {id:uid(), name, category:chipVal(b, 'cat'), lat:+pos.lat.toFixed(6), lng:+pos.lng.toFixed(6), day:today(), ts:now, u:now, status:'new', photos:{facade:ph.facade}, history:[]};
      const v = {id:uid(), pid:p.id, kind:'new', day:today(), start:now, ts:now, u:now, lat:p.lat, lng:p.lng, photos:[]};
      db.partners.push(p); db.visits.push(v);
      store.save(); closeSheet(); render(); toast('Визит начат · таймер идёт');
    };
    setTimeout(() => b.querySelector('#nName').focus(), 350);
  });
}
async function startRepeatVisit(pid){
  if (activeVisit()) return openActiveVisit();
  if (!(await requireShift())) return;
  const here = await getHere(3000);
  const go = p => {
    openSheet(`
      <span class="chip" style="--c:${STATUSES[p.status].color}">${STATUSES[p.status].label}</span>
      <h2 style="margin-top:10px">Визит · ${esc(p.name)}</h2>
      <div class="sub">${here ? 'Вы в ' + fmtKm(distM(here, [p.lat, p.lng])) + ' от партнёра' : 'Повторный визит'}</div>
      <div class="field"><label>Цель визита *</label>${chips('purpose', PURPOSES, PURPOSES[0])}</div>
      <div class="row"><button class="btn" id="rCancel">Отмена</button><button class="btn primary" id="rGo">Я на месте — начать визит</button></div>
    `, b => {
      const pb = b.querySelector('[data-chips=purpose]'); pb.dataset.req = 1; mountChips(b);
      b.querySelector('#rCancel').onclick = closeSheet;
      b.querySelector('#rGo').onclick = () => {
        const now = Date.now();
        db.visits.push({id:uid(), pid:p.id, kind:'repeat', purpose:chipVal(b, 'purpose'), day:today(), start:now, ts:now, u:now,
          lat: here ? +here[0].toFixed(6) : p.lat, lng: here ? +here[1].toFixed(6) : p.lng, statusBefore:p.status, photos:[]});
        store.save(); closeSheet(); render(); toast('Визит начат · таймер идёт');
      };
    });
  };
  if (pid){ const f = findPartner(pid); if (f) return go(f.p); }
  let q = '';
  openSheet(`<h2>Визит к партнёру</h2><div class="sub">Выберите партнёра — ближайшие сверху. Поиск по названию, ИНН или телефону.</div>
    <input class="search" id="rq" placeholder="Название, ИНН или телефон" autocomplete="off"><div class="list" id="rl"></div>`, b => {
    const draw = () => {
      const s = q.toLowerCase().replace(/\s+/g, '');
      let items = db.partners.filter(p => p.status !== 'new' && (!s || [p.name, p.inn, p.phone, p.person].join(' ').toLowerCase().replace(/\s+/g, '').includes(s)));
      items = items.map(p => ({p, d: here ? distM(here, [p.lat, p.lng]) : null})).sort((a, c) => (a.d ?? 1e12) - (c.d ?? 1e12) || (c.p.u || 0) - (a.p.u || 0)).slice(0, 60);
      b.querySelector('#rl').innerHTML = items.length ? items.map(({p, d}) => `<button class="item" data-id="${p.id}" style="--c:${STATUSES[p.status].color}"><span class="dot"></span><span class="t"><b>${esc(p.name)}</b><small>${esc([p.category, p.inn ? 'ИНН ' + p.inn : '', p.phone].filter(Boolean).join(' · ') || STATUSES[p.status].label)}</small></span><span class="d">${d !== null ? fmtKm(d) : fmtShort(p.day)}</span></button>`).join('')
        : `<div class="empty">${db.partners.length ? 'Ничего не найдено' : 'Пока нет партнёров. Нажмите «Партнёр», чтобы добавить первого.'}</div>`;
      b.querySelectorAll('[data-id]').forEach(x => x.onclick = () => go(db.partners.find(p => p.id === x.dataset.id)));
    };
    b.querySelector('#rq').oninput = e => { q = e.target.value; draw(); };
    draw();
  });
}
function renderVisitBar(){
  const bar = $('#visitBar'); const v = isSeller() && activeVisit();
  if (!v){ bar.classList.remove('show'); return; }
  const p = db.partners.find(x => x.id === v.pid) || {name:'Партнёр'};
  bar.classList.add('show');
  bar.innerHTML = `<span class="vb-dot"></span><span class="vb-t"><small>${v.kind === 'new' ? 'Новый партнёр' : esc(v.purpose || 'Визит')}</small><b>${esc(p.name)}</b></span><span class="vb-clock" id="vbClock">${fmtClock(Date.now() - v.start)}</span><button class="btn primary sm" id="vbEnd">Завершить</button>`;
  bar.querySelector('#vbEnd').onclick = openActiveVisit;
  bar.querySelector('.vb-t').onclick = () => map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 17));
}
setInterval(() => { const c = document.getElementById('vbClock'); const v = isSeller() && activeVisit(); if (c && v) c.textContent = fmtClock(Date.now() - v.start); }, 1000);
function openActiveVisit(){
  const v = activeVisit(); if (!v) return;
  const p = db.partners.find(x => x.id === v.pid); if (!p) return;
  const isNew = v.kind === 'new', ph = {};
  let status = isNew ? '' : p.status;
  openSheet(`
    ${isNew ? '<span class="stepper"><span>1</span> на улице <i></i> <b>2</b> после разговора</span>' : `<span class="chip" style="--c:#a78bfa">${esc(v.purpose || 'Визит')}</span>`}
    <h2 style="margin-top:8px">Итог визита · ${esc(p.name)}</h2>
    <div class="sub">Начат в ${fmtHM(v.start)} · идёт ${fmtDur(Date.now() - v.start)}</div>
    <div class="field"><label>Статус *</label>${statusPicker(status)}</div>
    ${isNew ? `
    <div class="grid2">
      <div class="field"><label>Контактное лицо</label><input id="fPerson" maxlength="60" placeholder="Имя, должность" value="${esc(p.person)}"></div>
      <div class="field"><label>Телефон</label><input id="fPhone" type="tel" inputmode="tel" maxlength="20" placeholder="+998 90 123 45 67" value="${esc(p.phone)}"></div>
      <div class="field"><label>ИНН</label><input id="fInn" inputmode="numeric" maxlength="14" placeholder="9 цифр" value="${esc(p.inn)}"></div>
      <div class="field"><label>Оборот в месяц, сум</label><select class="sel" id="fTurn"><option value="">—</option>${TURNOVERS.map(t => `<option${p.turnover===t?' selected':''}>${t}</option>`).join('')}</select></div>
    </div>
    <div class="photos">${photoField('inside', 'Зал внутри', false, p.photos && p.photos.inside)}</div>` : `
    <div class="photos">${photoField('extra', 'Фото (по желанию)', false)}</div>`}
    <div class="field"><label>${isNew ? 'Комментарий' : 'Что сделали *'}</label><textarea id="fRes" maxlength="600" placeholder="${isNew ? 'О чём договорились, что важно знать' : 'Например: забрал документы, обучил 2 кассиров'}"></textarea></div>
    <div class="field"><label>Следующий шаг</label><input id="fNext" maxlength="120" placeholder="Например: перезвонить в пятницу" value="${esc(p.nextStep)}"></div>
    <div class="row"><button class="btn primary" id="fDone">Завершить визит</button></div>
    <div class="row" style="margin-top:8px"><button class="btn danger sm" id="fDrop">Отменить визит</button></div>
  `, b => {
    mountPhotos(b, ph);
    b.querySelectorAll('[data-st]').forEach(x => x.onclick = () => {
      status = x.dataset.st; b.querySelectorAll('[data-st]').forEach(y => y.classList.toggle('sel', y === x));
      const ins = b.querySelector('[data-photo=inside]'); if (ins){ if (status === 'refused') delete ins.dataset.req; else ins.dataset.req = '1'; ins.querySelector('b').textContent = 'Зал внутри' + (status === 'refused' ? '' : ' *'); }
    });
    b.querySelector('#fDone').onclick = async () => {
      if (!status) return toast('Выберите статус');
      const res = b.querySelector('#fRes').value.trim();
      if (!isNew && !res){ b.querySelector('#fRes').focus(); return toast('Опишите, что сделали'); }
      const btn = b.querySelector('#fDone'); btn.disabled = true; btn.textContent = 'Сохраняю…';
      if (!(await photosReady(b, ph))){ btn.disabled = false; btn.textContent = 'Завершить визит'; return; }
      const now = Date.now(), here = lastFix && now - lastFix[2] < 120000 ? lastFix : null;
      if (isNew){
        const val = id => b.querySelector(id).value.trim();
        Object.assign(p, {person:val('#fPerson'), phone:val('#fPhone'), inn:val('#fInn'), turnover:val('#fTurn')});
        p.photos = Object.assign({}, p.photos, ph.inside ? {inside:ph.inside} : {});
        if (res) p.note = res;
      }
      p.nextStep = b.querySelector('#fNext').value.trim();
      if (p.status !== status) p.history.push({s:status, ts:now, vid:v.id});
      p.status = status; p.u = now;
      Object.assign(v, {end:now, u:now, result:res, statusAfter:status, endLat: here ? +here[0].toFixed(6) : undefined, endLng: here ? +here[1].toFixed(6) : undefined});
      if (ph.extra) v.photos = [ph.extra];
      store.save(); closeSheet(); render();
      toast(`Визит завершён · ${fmtDur(now - v.start)} · ${STATUSES[status].short}`, 3200);
    };
    b.querySelector('#fDrop').onclick = () => {
      const btn = b.querySelector('#fDrop');
      if (!btn.dataset.sure){ btn.dataset.sure = 1; btn.textContent = isNew ? 'Удалить визит и партнёра?' : 'Точно отменить?'; return; }
      db.visits = db.visits.filter(x => x.id !== v.id);
      if (isNew) db.partners = db.partners.filter(x => x.id !== p.id);
      store.save(); closeSheet(); render(); toast('Визит отменён');
    };
  });
}

/* ---------- карточка партнёра ---------- */
function telLink(c){ const digits = String(c || '').replace(/[^\d+]/g,''); return digits.length >= 7 ? `<a href="tel:${esc(digits)}">${esc(c)}</a>` : esc(c); }
function threadHtml(){ return `<h3>Комментарии</h3><div class="thread" id="threadList"></div><div class="compose"><input id="cText" maxlength="1000" placeholder="${isLead() ? 'Комментарий менеджеру…' : 'Ответить руководителю…'}"><button id="cSend" aria-label="Отправить">${svg('send', 20)}</button></div>`; }
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
  const {p, owner} = f, st = STATUSES[p.status] || STATUSES.contacts, mine = isSeller();
  const vs = visitsOf(owner).filter(v => v.pid === p.id).sort((a,b) => b.start - a.start);
  const act = vs.find(v => !v.end);
  const photos = [p.photos && p.photos.facade && ['Фасад', p.photos.facade], p.photos && p.photos.inside && ['Зал', p.photos.inside], ...vs.flatMap(v => (v.photos||[]).map(x => ['Визит ' + fmtShort(v.day), x]))].filter(Boolean);
  const info = [['Сфера', esc(p.category)], ['Контактное лицо', esc(p.person)], ['Телефон', p.phone && telLink(p.phone)], ['ИНН', esc(p.inn)], ['Оборот в месяц', p.turnover && esc(p.turnover) + ' сум'], ['Контакт', p.contact && telLink(p.contact)], ['Следующий шаг', esc(p.nextStep)], ['Заметка', p.note && esc(p.note).replace(/\n/g,'<br>')]].filter(x => x[1]);
  openSheet(`
    <span class="chip" style="--c:${st.color}">${st.label}</span>
    <h2 style="margin-top:10px">${esc(p.name)}</h2>
    <div class="sub">${isLead() ? `Менеджер: <b style="color:${userOf(owner).color}">${esc(userOf(owner).name)}</b> · ` : ''}добавлен ${fmtTime(p.ts)}</div>
    ${photos.length ? `<div class="gallery">${photos.map(([t, x]) => `<a href="${photoUrl(x)}" target="_blank"><img src="${photoUrl(x)}" alt="" loading="lazy"><span>${t}</span></a>`).join('')}</div>` : ''}
    ${mine && !act ? `<div class="row"><button class="btn primary" id="pVisit">${svg('visit', 18)} Начать визит</button></div>` : ''}
    ${mine && act ? `<div class="row"><button class="btn primary" id="pFinish">Завершить текущий визит</button></div>` : ''}
    ${info.length ? `<div class="kv grid2">${info.map(([k, v]) => `<div><small>${k}</small>${v}</div>`).join('')}</div>` : ''}
    ${mine && !act && p.status !== 'new' ? `<h3>Быстро сменить статус</h3>${statusPicker(p.status)}` : ''}
    <h3>Визиты · ${vs.length}</h3>
    <div class="visits">${vs.length ? vs.map((v, i) => `<div class="vrow"><span class="vn">${vs.length - i}</span><div><b>${fmtTime(v.start)}${v.end ? ' – ' + fmtHM(v.end) : ' · идёт'}</b><small>${v.kind === 'new' ? 'Первый визит' : esc(v.purpose || 'Повторный визит')}${v.end ? ' · ' + fmtDur(v.end - v.start) : ''}${v.statusAfter ? ' · ' + STATUSES[v.statusAfter].short : ''}</small>${v.result ? `<p>${esc(v.result)}</p>` : ''}</div></div>`).join('') : '<div class="sub">Визитов ещё не было (метка из старой версии)</div>'}</div>
    ${threadHtml()}
    <h3>История статусов</h3>
    <ul class="timeline">${(p.history||[]).slice().reverse().map(h => `<li><span class="dot" style="--c:${STATUSES[h.s].color}"></span><b>${STATUSES[h.s].short}</b> · ${fmtTime(h.ts)}</li>`).join('') || '<li>—</li>'}</ul>
    <div class="row">${mine ? '<button class="btn danger" id="pDel">Удалить</button>' : ''}<button class="btn" id="pRoute">Яндекс Карты</button>${mine ? '<button class="btn" id="pEdit">Изменить</button>' : ''}</div>
  `, b => {
    mountThread(b, 'partner', p.id, owner, p.name);
    renderPins();
    b.querySelectorAll('[data-st]').forEach(x => x.onclick = () => {
      if (x.dataset.st === p.status) return;
      p.status = x.dataset.st; p.u = Date.now(); p.history.push({s:p.status, ts:Date.now()}); store.save(); render(); openPartner(p.id); toast('Статус: '+STATUSES[p.status].short);
    });
    const on = (s, f) => { const x = b.querySelector(s); if (x) x.onclick = f; };
    on('#pRoute', () => window.open(`https://yandex.uz/maps/?pt=${p.lng},${p.lat}&z=18&l=map`, '_blank'));
    on('#pVisit', () => startRepeatVisit(p.id));
    on('#pFinish', openActiveVisit);
    on('#pEdit', () => partnerEdit(p.id));
    on('#pDel', () => {
      const btn = b.querySelector('#pDel');
      if (btn.dataset.sure){ db.partners = db.partners.filter(x => x.id !== p.id); db.visits = db.visits.filter(v => v.pid !== p.id); store.save(); closeSheet(); render(); toast('Партнёр удалён'); }
      else { btn.dataset.sure = 1; btn.textContent = 'Точно?'; }
    });
  });
}
function partnerEdit(id){
  const p = db.partners.find(x => x.id === id); if (!p) return;
  let status = p.status === 'new' ? 'contacts' : p.status;
  openSheet(`
    <h2>Изменить партнёра</h2>
    <div class="field"><label>Название *</label><input id="eName" maxlength="80" value="${esc(p.name)}"></div>
    <div class="field"><label>Сфера</label>${chips('cat', CATEGORIES, p.category)}</div>
    <div class="grid2">
      <div class="field"><label>Контактное лицо</label><input id="ePerson" maxlength="60" value="${esc(p.person)}"></div>
      <div class="field"><label>Телефон</label><input id="ePhone" type="tel" maxlength="20" value="${esc(p.phone || p.contact)}"></div>
      <div class="field"><label>ИНН</label><input id="eInn" inputmode="numeric" maxlength="14" value="${esc(p.inn)}"></div>
      <div class="field"><label>Оборот в месяц, сум</label><select class="sel" id="eTurn"><option value="">—</option>${TURNOVERS.map(t => `<option${p.turnover===t?' selected':''}>${t}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Статус</label>${statusPicker(status)}</div>
    <div class="field"><label>Заметка</label><textarea id="eNote" maxlength="600">${esc(p.note)}</textarea></div>
    <div class="row"><button class="btn" id="eCancel">Отмена</button><button class="btn primary" id="eSave">Сохранить</button></div>
  `, b => {
    mountChips(b);
    b.querySelectorAll('[data-st]').forEach(x => x.onclick = () => { status = x.dataset.st; b.querySelectorAll('[data-st]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelector('#eCancel').onclick = () => openPartner(p.id);
    b.querySelector('#eSave').onclick = () => {
      const v = s => b.querySelector(s).value.trim();
      if (!v('#eName')) return toast('Введите название');
      if (p.status !== status) p.history.push({s:status, ts:Date.now()});
      Object.assign(p, {name:v('#eName'), category:chipVal(b, 'cat'), person:v('#ePerson'), phone:v('#ePhone'), inn:v('#eInn'), turnover:v('#eTurn'), note:v('#eNote'), status, u:Date.now()});
      store.save(); render(); openPartner(p.id); toast('Сохранено');
    };
  });
}

/* ---------- заметки руководителя ---------- */
map.on('click', e => {
  if (mode === 'note' && isLead()){
    if (ghost) map.removeLayer(ghost);
    ghost = L.marker(e.latlng, {icon: noteIcon(false, true), interactive:false}).addTo(map);
    noteForm(e.latlng);
  }
});
function noteForm(latlng, forU){
  openSheet(`
    <span class="leadtag">${svg('note', 14)} Заметка руководителя</span>
    <h2 style="margin-top:10px">${forU ? 'Написать ' + esc(firstName(userOf(forU).name)) : 'Новая заметка'}</h2>
    <div class="sub">${forU ? 'Заметка появится на карте менеджера там, где он сейчас, и придёт уведомлением.' : 'Менеджер увидит её на карте через несколько секунд'}</div>
    <div class="field"><label>Кому</label><select class="sel" id="nFor">${sellerOptions(forU || focus || 'all', true)}</select></div>
    <div class="field"><label>Текст</label><textarea id="nText" maxlength="500" placeholder="Зайди в новый салон связи напротив — спроси владельца"></textarea></div>
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
      <div><small>Кому</small>${n.for === 'all' ? 'Всем менеджерам' : esc(userOf(n.for).name)}</div>
      <div><small>Статус</small>${n.done ? `✅ Выполнено${n.doneName ? ' · ' + esc(n.doneName) : ''} · ${fmtTime(n.doneTs)}` : '⏳ Не выполнено'}</div>
    </div>
    ${threadHtml()}
    <div class="row">
      ${isLead() ? '<button class="btn danger" id="nDel">Удалить</button>' : ''}
      <button class="btn" id="nGo">Яндекс Карты</button>
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
    <h2>${isLead() ? (focus ? esc(userOf(focus).name) : 'Партнёры команды') : 'Мои партнёры'}</h2>
    <div class="seg" style="margin-top:10px"><button data-t="partners" class="${listTab==='partners'?'sel':''}">Партнёры · ${all.length}</button><button data-t="notes" class="${listTab==='notes'?'sel':''}">Заметки · ${myNotes.filter(n => !n.done).length}</button></div>
    <div id="lBody"></div>
  `, b => {
    const drawPartners = () => {
      b.querySelector('#lBody').innerHTML = `
        <div class="stats">${ST_ORDER.map(k => `<button class="stat${listFilter===k?' sel':''}" data-f="${k}" style="--c:${STATUSES[k].color}"><b>${counts[k]}</b><small>${STATUSES[k].short}</small></button>`).join('')}</div>
        <input class="search" id="q" placeholder="Название, ИНН, телефон, контакт" value="${esc(listQuery)}">
        <div class="list" id="lst"></div>`;
      const draw = () => {
        const q = listQuery.toLowerCase();
        const items = all.filter(({p}) => (!listFilter || p.status === listFilter) && (!q || [p.name, p.desc, p.contact, p.note, p.inn, p.phone, p.person, p.category].join(' ').toLowerCase().includes(q))).sort((a,c) => (c.p.u||c.p.ts) - (a.p.u||a.p.ts));
        b.querySelector('#lst').innerHTML = items.length ? items.map(({p, u}) => `<button class="item" data-id="${p.id}" style="--c:${(STATUSES[p.status]||{}).color}"><span class="dot"></span><span class="t"><b>${unread(p.id)?'💬 ':''}${esc(p.name)}</b><small>${esc([p.category, p.inn ? 'ИНН ' + p.inn : '', (STATUSES[p.status]||{}).short].filter(Boolean).join(' · '))}${isLead() && !focus ? ' · ' + esc(firstName(userOf(u).name)) : ''}</small></span><span class="d">${fmtShort(p.day)}</span></button>`).join('')
          : `<div class="empty">${all.length ? 'Ничего не найдено' : (isLead() ? 'Менеджеры ещё не добавили партнёров' : 'Пока нет партнёров.<br>Нажмите «Партнёр» внизу.')}</div>`;
        b.querySelectorAll('.item').forEach(x => x.onclick = () => {
          const {p} = findPartner(x.dataset.id);
          if (!partnerVisible(p)) setPeriod('all');
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

/* ---------- фильтры ---------- */
function openFilters(){
  const on = s => !cfg.statuses || cfg.statuses.includes(s);
  openSheet(`
    <h2>Фильтры карты</h2>
    <h3>Период</h3>
    <div class="seg wrap">${PERIODS.map(([k, t]) => `<button data-p="${k}" class="${period===k?'sel':''}">${t}</button>`).join('')}</div>
    <input type="date" class="native" id="fDay" value="${singleDay() || today()}" max="${today()}" style="margin-top:8px">
    <h3>Статусы партнёров</h3>
    <div class="stats">${ST_ORDER.map(k => `<button class="stat${on(k)?' sel':''}" data-s="${k}" style="--c:${STATUSES[k].color}"><b>●</b><small>${STATUSES[k].short}</small></button>`).join('')}</div>
    <h3>На карте</h3>
    <div class="seg"><button data-tr="1" class="${cfg.track?'sel':''}">GPS-маршрут</button><button data-tr="0" class="${cfg.track?'':'sel'}">Только визиты</button></div>
    <div class="seg" style="margin-top:8px"><button data-cv="1" class="${cfg.cov?'sel':''}">Покрытие района</button><button data-cv="0" class="${cfg.cov?'':'sel'}">Без покрытия</button></div>
    ${isLead() ? `<h3>Менеджер</h3><select class="sel" id="fWho"><option value="">Вся команда</option>${sellerOptions(focus)}</select>` : ''}
    <div class="row"><button class="btn" id="fReset">Сбросить</button><button class="btn primary" id="fOk">Готово</button></div>
  `, b => {
    b.querySelectorAll('[data-p]').forEach(x => x.onclick = () => { setPeriod(x.dataset.p); b.querySelectorAll('[data-p]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelector('#fDay').onchange = e => { if (e.target.value){ setPeriod('day', e.target.value); b.querySelectorAll('[data-p]').forEach(y => y.classList.toggle('sel', y.dataset.p === period)); } };
    b.querySelectorAll('[data-s]').forEach(x => x.onclick = () => {
      const list = cfg.statuses ? cfg.statuses.slice() : ST_ORDER.slice(); const k = x.dataset.s;
      const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k);
      cfg.statuses = list.length === ST_ORDER.length ? null : list; saveCfg();
      x.classList.toggle('sel', !cfg.statuses || cfg.statuses.includes(k)); render();
    });
    b.querySelectorAll('[data-tr]').forEach(x => x.onclick = () => { cfg.track = x.dataset.tr === '1'; saveCfg(); render(); b.querySelectorAll('[data-tr]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelectorAll('[data-cv]').forEach(x => x.onclick = () => { cfg.cov = x.dataset.cv === '1'; saveCfg(); render(); b.querySelectorAll('[data-cv]').forEach(y => y.classList.toggle('sel', y === x)); });
    const w = b.querySelector('#fWho'); if (w) w.onchange = () => focusSeller(w.value || null);
    b.querySelector('#fReset').onclick = () => { cfg.statuses = null; cfg.track = true; cfg.cov = false; saveCfg(); focus = null; setPeriod('today'); closeSheet(); };
    b.querySelector('#fOk').onclick = closeSheet;
  });
}
$('#filterBtn').onclick = openFilters;
$('#covChip').onclick = () => { cfg.cov = !cfg.cov; saveCfg(); renderCoverage(); updateCovChip(); if (cfg.cov && districtBounds) map.flyToBounds(districtBounds, {padding:[30,30], duration:.7}); toast(cfg.cov ? 'Зелёным — где уже были: GPS-маршрут, отметки и партнёры' : 'Покрытие скрыто'); };

/* ---------- дни ---------- */
function openDays(){
  const keys = new Set();
  visibleSellers().forEach(u => { dataOf(u).strokes.forEach(s => keys.add(s.day)); dataOf(u).partners.forEach(p => keys.add(p.day)); visitsOf(u).forEach(v => keys.add(v.day)); });
  Object.keys(tracks).forEach(k => { if (visibleSellers().some(u => trackOf(u, k).length)) keys.add(k); });
  const days = [...keys].sort().reverse();
  openSheet(`
    <h2>История по дням</h2><div class="sub">${days.length} ${plural(days.length,'день','дня','дней')} с маршрутами и визитами</div>
    <h3>Выбрать дату</h3>
    <input type="date" class="native" id="dPick" value="${singleDay() || today()}" max="${today()}">
    <h3>Дни</h3>
    <div class="list days">${days.length ? days.map(k => { const nv = visibleSellers().reduce((a,u) => a + visitsOf(u).filter(v => v.day === k).length, 0); const n = visibleSellers().reduce((a,u) => a + dataOf(u).partners.filter(p => p.day === k).length, 0); const km = visibleSellers().reduce((a,u) => a + (trackKm(trackOf(u, k)) || manualKm(u, k)), 0); return `<button class="item" data-d="${k}" style="--c:${k===singleDay()?'#7c6cff':'rgba(255,255,255,.25)'}"><span class="dot"></span><span class="t"><b>${fmtDay(k)}</b><small>${fmtShort(k)} · ${nv} ${plural(nv,'визит','визита','визитов')} · ${n} ${plural(n,'новый','новых','новых')}</small></span><span class="d"><b>${km ? fmtKm(km) : ''}</b></span></button>`; }).join('') : '<div class="empty">Здесь появятся дни с маршрутами.</div>'}</div>
  `, b => {
    const go = k => { closeSheet(); setPeriod('day', k); setTimeout(fitPeriod, 400); };
    b.querySelector('#dPick').onchange = e => e.target.value && go(e.target.value);
    b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => go(x.dataset.d));
  });
}
function fitPeriod(){
  const pts = [];
  visibleSellers().forEach(u => {
    dataOf(u).strokes.filter(s => inRange(s.day)).forEach(s => pts.push(...s.pts));
    dataOf(u).partners.filter(partnerVisible).forEach(p => pts.push([p.lat, p.lng]));
    rangeDays().forEach(k => trackOf(u, k).forEach(p => pts.push([p[0], p[1]])));
  });
  if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.15), {duration:.7, maxZoom:17});
}
$('#dateLabel').onclick = openDays;
$('#prevDay').onclick = () => setPeriod('day', shiftDay(singleDay() || today(), -1));
$('#nextDay').onclick = () => { const s = singleDay() || today(); if (s < today()) setPeriod('day', shiftDay(s, 1)); };

/* ---------- отчёт ---------- */
async function openReport(k){
  k = k || singleDay() || today();
  openSheet('<h2>Отчёт</h2><div class="sub">Загружаю…</div>');
  const prevPeriod = period, prevDay = day;
  if (!tracksLoaded[k] || k === today()){ period = 'day'; day = k; await ensureTracks(true); period = prevPeriod; day = prevDay; }
  const list = isLead() ? sellers() : [me()];
  const rows = list.map(s => ({s, r: dayStats(s.u, k)}));
  const tot = rows.reduce((a, {r}) => ({km:a.km+r.km, visits:a.visits+r.visits, created:a.created+r.created, connected:a.connected+r.connected}), {km:0, visits:0, created:0, connected:0});
  const statusLine = r => ST_ORDER.filter(s => r.byStatus[s]).map(s => `<span class="chip" style="--c:${STATUSES[s].color};margin:4px 4px 0 0">${STATUSES[s].short}: ${r.byStatus[s]}</span>`).join('');
  let html = `<h2>Отчёт · ${fmtDay(k)}</h2><div class="sub">${fmtShort(k)}</div>`;
  if (!isLead()){
    const r = rows[0].r;
    html += `<div class="kpis">
      <div class="kpi"><b>${r.visits}</b><small>визитов${r.repeat ? ` (${r.repeat} повт.)` : ''}</small></div>
      <div class="kpi"><b>${r.created}</b><small>новых партнёров</small></div>
      <div class="kpi"><b style="color:#2fd07a">${r.connected}</b><small>подключено</small></div>
      <div class="kpi"><b>${fmtKm(r.km)}</b><small>${r.gps ? 'пройдено (GPS)' : 'нарисовано'}</small></div>
      <div class="kpi"><b>${r.from ? fmtHM(r.from) + (r.to ? '–' + fmtHM(r.to) : '') : '—'}</b><small>рабочий день</small></div>
      <div class="kpi"><b>${r.avgVisit ? fmtDur(r.avgVisit) : '—'}</b><small>средний визит</small></div></div>
      ${r.created ? `<h3>Новые по статусам</h3>${statusLine(r)}` : ''}`;
  } else {
    html += `<div class="kpis"><div class="kpi"><b>${tot.visits}</b><small>визитов команды</small></div><div class="kpi"><b>${tot.created}</b><small>новых партнёров</small></div><div class="kpi"><b style="color:#2fd07a">${tot.connected}</b><small>подключено</small></div></div>
      <table class="report"><tr><th>Менеджер</th><th>День</th><th>Визиты</th><th>Итог</th></tr>
      ${rows.map(({s, r}) => `<tr><td><b style="color:${s.color}">${esc(s.name)}</b></td><td><b>${r.from ? fmtHM(r.from) + '–' + (r.to ? fmtHM(r.to) : '…') : '—'}</b><span class="sub">${fmtKm(r.km)}</span></td><td><b>${r.visits}</b><span class="sub">${r.avgVisit ? '≈ ' + fmtDur(r.avgVisit) : ''}</span></td><td><b>+${r.created}</b><span class="sub">подкл. ${r.connected}</span>${statusLine(r)}</td></tr>`).join('')}
      </table>${!rows.length ? '<div class="empty">В команде пока нет менеджеров</div>' : ''}`;
  }
  html += `<div class="row"><button class="btn" id="rPrev">← ${fmtShort(shiftDay(k,-1))}</button>${k < today() ? `<button class="btn" id="rNext">${fmtShort(shiftDay(k,1))} →</button>` : ''}</div>`;
  openSheet(html, b => {
    b.querySelector('#rPrev').onclick = () => openReport(shiftDay(k, -1));
    const n = b.querySelector('#rNext'); if (n) n.onclick = () => openReport(shiftDay(k, 1));
  });
}

/* ================= пульт руководителя ================= */
const EVT = {
  shift_start: e => ['▶️', `${name(e.u)} начал(а) день`, ''],
  shift_resume: e => ['▶️', `${name(e.u)} продолжил(а) день`, ''],
  shift_end: e => ['🏁', `${name(e.u)} завершил(а) день`, e.summary || ''],
  visit_start: e => ['🟣', `${name(e.u)} начал(а) визит`, (e.kind === 'new' ? 'Новый партнёр · ' : 'Повторный · ') + (e.pname || '')],
  visit_end: e => [e.status === 'connected' ? '✅' : e.status === 'refused' ? '⛔️' : '🔵', `${name(e.u)} завершил(а) визит · ${fmtDur(e.dur || 0)}`, `${e.pname || ''}${e.status && STATUSES[e.status] ? ' → ' + STATUSES[e.status].short : ''}`],
  comment: e => ['💬', `${name(e.u)}${e.title ? ' · ' + e.title : ''}`, e.text || ''],
  note: e => ['📌', `Заметка для ${e.for === 'all' ? 'всех' : firstName(userOf(e.for).name)}`, e.text || ''],
  note_done: e => ['✅', `${name(e.u)} выполнил(а) заметку`, e.text || '']
};
const name = u => firstName(userOf(u).name);
const evColor = e => userOf(e.u).color;
function evAction(e){
  if (e.pid && e.kind !== 'note' && e.type !== 'note'){ const f = findPartner(e.pid); if (f){ map.flyTo([f.p.lat, f.p.lng], Math.max(map.getZoom(), 16)); return openPartner(e.pid); } }
  if (e.nid || (e.kind === 'note' && e.pid)){ const n = notes.find(x => x.id === (e.nid || e.pid)); if (n){ map.flyTo([n.lat, n.lng], 16); return openNote(n.id); } }
  if (e.lat){ map.flyTo([e.lat, e.lng], 16); return; }
  if (e.u && sellers().some(s => s.u === e.u)) focusSeller(e.u);
}
function pushToast({icon, title, text, color, onClick}){
  const box = $('#toasts');
  const t = document.createElement('div'); t.className = 'etoast glass'; t.style.setProperty('--c', color || '#7c6cff');
  t.innerHTML = `<span class="ei">${icon}</span><span class="et"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</span>`;
  t.onclick = () => { t.remove(); onClick && onClick(); };
  box.prepend(t); while (box.children.length > 4) box.lastChild.remove();
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 7000);
}
function onEvents(list){
  for (const e of list){
    events.unshift(e);
    if (evInit && e.u !== me().u && EVT[e.type]){ const [icon, title, text] = EVT[e.type](e); pushToast({icon, title, text, color:evColor(e), onClick:() => evAction(e)}); }
  }
  if (events.length > 300) events.length = 300;
}
function sellerCard(s){
  const st = sellerState(s.u), r = dayStats(s.u, today());
  return `<div class="mcard${focus===s.u?' sel':''}" data-u="${esc(s.u)}" style="--c:${s.color}">
    <div class="mhead"><span class="av ${st.k}">${esc(initials(s.name))}</span><div class="mname"><b>${esc(s.name)}</b><small class="st-${st.k}">${st.icon} ${esc(st.text)}</small></div></div>
    <div class="mstats"><span><b>${r.visits}</b> визитов</span><span><b>${r.created}</b> новых</span><span><b>${r.connected}</b> подкл.</span><span><b>${fmtKm(r.km)}</b></span></div>
    <div class="mact"><button data-act="show">На карте</button><button data-act="day">День</button><button data-act="msg">${svg('note', 14)} Написать</button></div>
  </div>`;
}
function teamHtml(){
  const ss = sellers(), states = ss.map(s => sellerState(s.u).k);
  const t = ss.reduce((a, s) => { const r = dayStats(s.u, today()); a.v += r.visits; a.n += r.created; a.c += r.connected; return a; }, {v:0, n:0, c:0});
  const inField = states.filter(k => k === 'field' || k === 'visit' || k === 'lost').length;
  return `<div class="tkpis"><div><b>${inField}<small>/${ss.length}</small></b><span>в поле</span></div><div><b>${states.filter(k => k === 'visit').length}</b><span>на визите</span></div><div><b>${t.v}</b><span>визитов</span></div><div><b>${t.n}</b><span>новых</span></div><div><b style="color:#2fd07a">${t.c}</b><span>подключено</span></div></div>
    <div class="mlist">${ss.map(sellerCard).join('') || '<div class="empty">В команде пока нет менеджеров.<br>Добавьте их в разделе «Команда → Добавить».</div>'}</div>`;
}
function feedHtml(){
  const list = events.filter(e => EVT[e.type]).slice(0, 60);
  return list.length ? list.map((e, i) => { const [icon, title, text] = EVT[e.type](e); return `<button class="ev" data-ev="${i}" style="--c:${evColor(e)}"><span class="ei">${icon}</span><span class="et"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</span><span class="ets">${fmtHM(e.ts)}</span></button>`; }).join('')
    : '<div class="empty">Сегодня пока тихо. Здесь в реальном времени появятся начало дня, визиты и комментарии.</div>';
}
function mountTeam(b){
  b.querySelectorAll('.mcard').forEach(c => {
    const u = c.dataset.u;
    c.onclick = e => {
      const act = e.target.closest('[data-act]'); const a = act && act.dataset.act;
      if (a === 'msg'){ const p = live[u]; const ll = p ? L.latLng(p.lat, p.lng) : map.getCenter(); closeSheet(); return noteForm(ll, u); }
      if (a === 'day') return openSeller(u);
      closeSheet(); focusSeller(focus === u && !a ? null : u);
    };
  });
  const list = events.filter(e => EVT[e.type]).slice(0, 60);
  b.querySelectorAll('[data-ev]').forEach(x => x.onclick = () => { closeSheet(); evAction(list[+x.dataset.ev]); });
}
let sideTab = 'team';
function renderSide(){
  const side = $('#side');
  if (!isLead() || !document.body.classList.contains('wide')){ side.innerHTML = ''; return; }
  side.innerHTML = `<div class="side-head"><div class="auth-logo" style="margin:0"><img src="icon-180.png" alt=""><div><b>Mercury Map</b><small>Пульт руководителя · ${fmtHM(Date.now())}</small></div></div></div>
    <div class="seg" style="margin:0 14px"><button data-st="team" class="${sideTab==='team'?'sel':''}">Команда</button><button data-st="feed" class="${sideTab==='feed'?'sel':''}">Лента событий${events.length ? ' · ' + events.filter(e => EVT[e.type]).length : ''}</button></div>
    <div class="side-body">${sideTab === 'team' ? teamHtml() : `<div class="feed">${feedHtml()}</div>`}</div>`;
  side.querySelectorAll('[data-st]').forEach(x => x.onclick = () => { sideTab = x.dataset.st; renderSide(); });
  mountTeam(side);
}
function openTeam(){
  openSheet(`<h2>Команда · сейчас</h2><div class="sub">${fmtDay(today())} · обновляется в реальном времени</div>
    <div class="seg" style="margin-top:10px"><button data-st="team" class="sel">Команда</button><button data-st="feed">Лента</button><button data-st="manage">Добавить</button></div><div id="tBody"></div>`, b => {
    const show = t => {
      b.querySelectorAll('[data-st]').forEach(y => y.classList.toggle('sel', y.dataset.st === t));
      const box = b.querySelector('#tBody');
      if (t === 'team'){ box.innerHTML = teamHtml(); mountTeam(box); }
      else if (t === 'feed'){ box.innerHTML = `<div class="feed">${feedHtml()}</div>`; mountTeam(box); }
      else { box.innerHTML = manageHtml(); mountManage(box); }
    };
    b.querySelectorAll('[data-st]').forEach(x => x.onclick = () => show(x.dataset.st));
    show('team');
  });
}
function manageHtml(){
  const team = session.team || [];
  return `<div class="list">${team.map(t => `<div class="item"><span class="dot" style="--c:${t.color}"></span><span class="t"><b>${esc(t.name)}</b><small>${t.role === 'lead' ? 'Руководитель' : 'Менеджер'} · @${esc(t.u)}</small></span></div>`).join('')}</div>
    <h3>Добавить в команду</h3>${registerFields('t')}
    <div class="err" id="tErr" style="color:#ff7584;font-size:13px;min-height:18px;margin-top:8px"></div>
    <div class="row" style="margin-top:6px"><button class="btn primary" id="tAdd">Создать аккаунт</button></div>`;
}
function mountManage(b){
  mountRegister(b, 't');
  b.querySelector('#tAdd').onclick = async () => {
    try { await api('api/auth', {method:'POST', body:readRegister(b, 't')}); await refreshMe(); toast('Аккаунт создан — передайте логин и пароль'); openTeam(); }
    catch(e){ b.querySelector('#tErr').textContent = e.message; }
  };
}
function openSeller(u){
  const s = userOf(u), p = live[u], r = dayStats(u, today()), st = sellerState(u);
  const vs = visitsOf(u).filter(v => v.day === today()).sort((a,b) => a.start - b.start);
  const sh = shifts[u] && shifts[u].day === today() ? shifts[u] : null;
  const tl = [];
  if (sh && sh.start) tl.push({ts:sh.start, html:`<b>▶️ Начал(а) день</b>`});
  vs.forEach((v, i) => { const pn = (dataOf(u).partners.find(x => x.id === v.pid) || {}).name || 'Партнёр'; tl.push({ts:v.start, pid:v.pid, html:`<b><span class="vn">${i+1}</span> ${esc(pn)}</b><small>${v.kind === 'new' ? 'Новый партнёр' : esc(v.purpose || 'Повторный визит')} · ${v.end ? fmtHM(v.start) + '–' + fmtHM(v.end) + ' · ' + fmtDur(v.end - v.start) : 'идёт ' + fmtDur(Date.now() - v.start)}${v.statusAfter ? ' · ' + STATUSES[v.statusAfter].short : ''}</small>`}); });
  if (sh && sh.end) tl.push({ts:sh.end, html:`<b>🏁 Завершил(а) день</b>${sh.summary ? `<small>${esc(sh.summary)}</small>` : ''}`});
  openSheet(`
    <div class="mhead big" style="--c:${s.color}"><span class="av ${st.k}">${esc(initials(s.name))}</span><div class="mname"><b>${esc(s.name)}</b><small class="st-${st.k}">${st.icon} ${esc(st.text)}${p && p.src === 'owntracks' ? ' · фоновая запись' : ''}</small></div></div>
    <div class="kpis"><div class="kpi"><b>${r.visits}</b><small>визитов</small></div><div class="kpi"><b>+${r.created}</b><small>новых</small></div><div class="kpi"><b style="color:#2fd07a">${r.connected}</b><small>подключено</small></div><div class="kpi"><b>${fmtKm(r.km)}</b><small>маршрут</small></div><div class="kpi"><b>${r.avgVisit ? fmtDur(r.avgVisit) : '—'}</b><small>средний визит</small></div><div class="kpi"><b>${sh && sh.start ? fmtHM(sh.start) : '—'}</b><small>начал день</small></div></div>
    <h3>День по порядку</h3>
    <div class="tline">${tl.length ? tl.map((x, i) => `<div class="tl"${x.pid ? ` data-pid="${x.pid}"` : ''}><span class="tt">${fmtHM(x.ts)}</span><div>${x.html}</div></div>`).join('') : '<div class="sub">Сегодня ещё нет активности</div>'}</div>
    <div class="row"><button class="btn" id="sOnly">Показать на карте</button><button class="btn primary" id="sMsg">${svg('note', 16)} Написать</button></div>
  `, b => {
    b.querySelectorAll('[data-pid]').forEach(x => x.onclick = () => { const f = findPartner(x.dataset.pid); if (f){ closeSheet(); map.flyTo([f.p.lat, f.p.lng], 17); setTimeout(() => openPartner(f.p.id), 700); } });
    b.querySelector('#sOnly').onclick = () => { closeSheet(); focusSeller(u); };
    b.querySelector('#sMsg').onclick = () => { closeSheet(); noteForm(p ? L.latLng(p.lat, p.lng) : map.getCenter(), u); };
  });
}

/* ---------- настройки ---------- */
const PREVIEW = k => STYLES[k].url.replace('{z}', 13).replace('{x}', 5673).replace('{y}', 3061);
function openSettings(){
  const u = me();
  openSheet(`
    <h2>Настройки</h2>
    <div class="cloud" style="margin-top:10px"><span class="dot" style="width:34px;height:34px;border-radius:50%;background:${u.color};display:grid;place-items:center;font-weight:800;font-size:13px">${esc(initials(u.name))}</span><div style="flex:1"><b>${esc(u.name)}</b><div class="sub">${isLead() ? 'Руководитель' : 'Менеджер'} · @${esc(u.u)}</div></div><button class="btn sm" id="logout" style="flex:none;padding:0 14px">${DEMO ? 'Выйти из демо' : 'Выйти'}</button></div>
    ${isSeller() ? `<h3>Рабочий день и GPS</h3><button class="cloud" id="recOpen" style="width:100%;text-align:left"><span class="sync" data-s="${shiftActive()?'ok':'pending'}"></span><div><b>${shiftActive() ? 'День идёт · GPS записывается' : myShift() && myShift().end ? 'День завершён' : 'День не начат'}</b><div class="sub">Фоновая запись через OwnTracks · не гасить экран</div></div></button>` : ''}
    <h3>Облако</h3>
    <div class="cloud" id="cloudState">${cloudHtml()}</div>
    <h3>Уведомления</h3>
    <div class="row" style="margin-top:0"><button class="btn sm" id="pushOn">Включить уведомления</button><button class="btn sm" id="pushTest">Проверить</button></div>
    <h3>Стиль карты</h3>
    <div class="styles">${Object.keys(STYLES).map(k => `<button class="style${cfg.style===k?' sel':''}" data-s="${k}"><img loading="lazy" alt="" src="${PREVIEW(k)}">${STYLES[k].name}</button>`).join('')}</div>
    <h3>Мирзо-Улугбекский район</h3>
    <div class="seg"><button data-dz="1" class="${cfg.district?'sel':''}">Показывать границу</button><button data-dz="0" class="${cfg.district?'':'sel'}">Скрыть</button></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" id="dzFit">Показать район</button><button class="btn sm" id="dzReload">Обновить границу</button></div>
  `, b => {
    b.querySelector('#logout').onclick = () => logout();
    const ro = b.querySelector('#recOpen'); if (ro) ro.onclick = openShift;
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
  });
}
$('#layersBtn').onclick = openSettings;

function copyRow(label, value){ return `<div class="copyrow"><span><small>${label}</small><span class="mono">${esc(value)}</span></span><button data-copy="${esc(value)}">Копировать</button></div>`; }
function openShift(){
  const s = myShift(), st = dayStats(me().u, today());
  const url = location.origin + '/api/owntracks';
  openSheet(`
    <h2>${!s || !s.start ? 'Рабочий день' : s.end ? 'День завершён' : 'Вы в поле'}</h2>
    <div class="sub">${!s || !s.start ? '«Начать день» = выезд из офиса. С этого момента пишется GPS-маршрут, руководитель видит, что вы в поле.' : s.end ? `С ${fmtHM(s.start)} до ${fmtHM(s.end)}. GPS не записывается.` : `С ${fmtHM(s.start)} · GPS-маршрут записывается. После «Завершить день» запись остановится.`}</div>
    ${s && s.start ? `<div class="kpis"><div class="kpi"><b>${st.visits}</b><small>визитов</small></div><div class="kpi"><b>+${st.created}</b><small>новых</small></div><div class="kpi"><b>${fmtKm(st.km)}</b><small>маршрут</small></div></div>` : ''}
    <div class="row">${!s || !s.start ? `<button class="btn primary" id="shGo">${svg('play', 16)} Начать день</button>` : s.end ? `<button class="btn" id="shGo">${svg('play', 16)} Продолжить день</button>` : `<button class="btn danger" id="shEnd">${svg('stop', 16)} Завершить день</button>`}</div>
    <h3>Экран</h3>
    <div class="seg"><button data-wake="1" class="${cfg.wake?'sel':''}">Не гасить экран</button><button data-wake="0" class="${cfg.wake?'':'sel'}">Как обычно</button></div>
    <div class="sub" style="margin-top:8px">iPhone не даёт сайтам писать геопозицию при выключенном экране. С OwnTracks маршрут пишется и в кармане.</div>
    <h3>Фоновая запись · OwnTracks</h3>
    <ol class="steps">
      <li>Установите <a href="https://apps.apple.com/app/id692424691" target="_blank" style="color:var(--accent-2)">OwnTracks</a>, режим <b>HTTP</b>.</li>
      <li>Введите данные ниже: URL, UserID, Password (трек-токен), включите Authentication.</li>
      <li>На карте OwnTracks выберите режим <b>Движ (Move)</b>.</li>
      <li>Настройки iPhone → OwnTracks → Геопозиция → <b>Всегда</b>.</li>
    </ol>
    ${copyRow('URL', url)}${copyRow('UserID (логин)', me().u)}${copyRow('Password (трек-токен)', session.trackToken || '')}
    <div class="row"><button class="btn sm" id="otrc">Файл настроек OwnTracks</button><button class="btn sm" id="newTok">Новый токен</button></div>
  `, b => {
    const go = b.querySelector('#shGo'); if (go) go.onclick = async () => { if (await startShift()) closeSheet(); };
    const end = b.querySelector('#shEnd'); if (end) end.onclick = () => {
      if (activeVisit()) return toast('Сначала завершите текущий визит');
      if (!end.dataset.sure){ end.dataset.sure = 1; end.innerHTML = 'Нажмите ещё раз — завершить день'; return; }
      endShift();
    };
    b.querySelectorAll('[data-wake]').forEach(x => x.onclick = () => { cfg.wake = x.dataset.wake === '1'; saveCfg(); gpsTick(); b.querySelectorAll('[data-wake]').forEach(y => y.classList.toggle('sel', y === x)); });
    b.querySelectorAll('[data-copy]').forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.copy); toast('Скопировано'); } catch(e){ toast('Не удалось скопировать'); } });
    b.querySelector('#otrc').onclick = () => downloadFile('mercury-map.otrc', JSON.stringify({_type:'configuration', mode:3, url, auth:true, username:me().u, password:session.trackToken, deviceId:'iphone', tid:initials(me().name).padEnd(2,'X').slice(0,2), monitoring:2, locatorInterval:30, locatorDisplacement:25, ignoreInaccurateLocations:150, extendedData:true}, null, 1), 'application/octet-stream');
    b.querySelector('#newTok').onclick = async () => {
      const btn = b.querySelector('#newTok');
      if (!btn.dataset.sure){ btn.dataset.sure = 1; btn.textContent = 'Старый перестанет работать. Точно?'; return; }
      try { const j = await api('api/auth', {method:'POST', body:{action:'newTrackToken'}}); session.trackToken = j.trackToken; if (!DEMO) lsSet('mm-session', session); openShift(); toast('Новый токен — обновите его в OwnTracks'); }
      catch(e){ toast(e.message); }
    };
  });
}
$('#shiftChip').onclick = () => { const s = myShift(); if (!s || !s.start) startShift(); else openShift(); };
async function downloadFile(name, text, type){
  const blob = new Blob([text], {type});
  try { const file = new File([blob], name, {type}); if (navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return; } } catch(e){ if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- push ---------- */
function b64ToU8(s){ const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); }
async function enablePush(){
  if (DEMO) return toast('В демо-режиме уведомления не отправляются');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Добавьте приложение на экран «Домой» и откройте его оттуда (iOS 16.4+)', 4500);
  if (!session.vapid) return toast('Уведомления ещё не настроены на сервере (VAPID-ключи)', 4000);
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Уведомления запрещены в настройках');
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
    <div class="field"><label>Имя и фамилия</label><input id="${p}Name" maxlength="40" placeholder="Имя Фамилия"></div>
    <div class="field"><label>Логин (латиницей)</label><input id="${p}U" maxlength="24" autocapitalize="none" autocomplete="off" placeholder="например, aziz"></div>
    <div class="field"><label>Пароль (от 6 символов)</label><input id="${p}Pass" type="password" autocomplete="new-password"></div>
    <div class="field"><label>Роль</label><div class="seg" style="margin-top:0"><button type="button" data-role="seller" class="sel">Менеджер</button><button type="button" data-role="lead">Руководитель</button></div></div>
    <div class="field"><label>Цвет на карте</label><div class="colors">${USER_COLORS.map((c,i) => `<button type="button" data-col="${c}" style="--c:${c}" class="${i===0?'sel':''}"></button>`).join('')}</div></div>`;
}
function mountRegister(b){
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
  const head = `<div class="auth-logo"><img src="icon-180.png" alt=""><div><b>Mercury Map</b><small>Полевые продажи · маршруты · команда</small></div></div>`;
  const demoBtn = `<button class="demo-btn" id="toDemo"><span>✨</span><span><b>Посмотреть демо</b><small>Живая команда на карте — без входа</small></span></button>`;
  if (view === 'login'){
    box.innerHTML = head + `
      <div class="field"><label>Логин</label><input id="lU" autocapitalize="none" autocomplete="username" placeholder="ваш логин"></div>
      <div class="field"><label>Пароль</label><input id="lPass" type="password" autocomplete="current-password"></div>
      <div class="err" id="lErr">${esc(st.error || '')}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="lGo">Войти</button></div>
      <div class="auth-links"><button class="link" id="toReg">Создать аккаунт</button><button class="link" id="toReset">Забыли логин или пароль?</button></div>
      ${demoBtn}`;
    const go = async () => {
      const btn = box.querySelector('#lGo'); btn.disabled = true;
      try { await login(box.querySelector('#lU').value.trim().toLowerCase(), box.querySelector('#lPass').value); }
      catch(e){ box.querySelector('#lErr').textContent = e.message; btn.disabled = false; }
    };
    box.querySelector('#lGo').onclick = go;
    box.querySelector('#lPass').onkeydown = e => { if (e.key === 'Enter') go(); };
    box.querySelector('#toReg').onclick = () => showAuth('register');
    box.querySelector('#toReset').onclick = () => showAuth('reset');
  } else if (view === 'reset'){
    box.innerHTML = head + `<h2 style="margin:0 0 4px">Восстановить доступ</h2>
      <div class="sub">Нужен код администратора (APP_PIN). Можно посмотреть логины команды или задать новый пароль.</div>
      <div class="field"><label>Код администратора</label><input id="xCode" type="password" inputmode="numeric"></div>
      <div class="row" style="margin-top:8px"><button class="btn" id="xLogins">Показать логины</button></div>
      <div id="xList"></div>
      <div class="field"><label>Логин</label><input id="xU" autocapitalize="none" autocomplete="off"></div>
      <div class="field"><label>Новый пароль (от 6 символов)</label><input id="xPass" type="password" autocomplete="new-password"></div>
      <div class="err" id="xErr"></div>
      <div class="row"><button class="btn" id="xBack">Назад</button><button class="btn primary" id="xGo">Сменить и войти</button></div>`;
    box.querySelector('#xBack').onclick = () => showAuth('login');
    box.querySelector('#xLogins').onclick = async () => {
      try { const j = await api('api/auth', {method:'POST', body:{action:'logins', adminCode:box.querySelector('#xCode').value}}); box.querySelector('#xList').innerHTML = `<div class="list">${j.users.map(u => `<button class="item" data-lu="${esc(u.u)}"><span class="dot" style="--c:${u.color}"></span><span class="t"><b>${esc(u.u)}</b><small>${esc(u.name)} · ${u.role === 'lead' ? 'руководитель' : 'менеджер'}</small></span></button>`).join('')}</div>`; box.querySelectorAll('[data-lu]').forEach(x => x.onclick = () => { box.querySelector('#xU').value = x.dataset.lu; box.querySelector('#xPass').focus(); }); box.querySelector('#xErr').textContent = ''; }
      catch(e){ box.querySelector('#xErr').textContent = e.message; }
    };
    box.querySelector('#xGo').onclick = async () => {
      const u = box.querySelector('#xU').value.trim().toLowerCase(), pass = box.querySelector('#xPass').value;
      try { await api('api/auth', {method:'POST', body:{action:'resetPassword', adminCode:box.querySelector('#xCode').value, u, pass}}); await login(u, pass); }
      catch(e){ box.querySelector('#xErr').textContent = e.message; }
    };
  } else {
    const first = !st.hasUsers && !st.adminCode;
    box.innerHTML = head + `<h2 style="margin:0 0 4px">${st.hasUsers ? 'Новый аккаунт' : 'Первый запуск'}</h2>
      <div class="sub">${st.hasUsers ? 'Нужен код администратора — его знает тот, кто настраивал Vercel.' : 'Создайте свой аккаунт. Остальных добавите потом в разделе «Команда».'}</div>
      ${registerFields('r', first)}
      <div class="err" id="rErr">${esc(st.error || '')}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="rGo">Создать и войти</button></div>
      ${st.hasUsers ? '<div class="auth-links"><button class="link" id="toLogin">У меня уже есть аккаунт</button></div>' : ''}${demoBtn}`;
    mountRegister(box);
    box.querySelector('#rGo').onclick = async () => {
      const btn = box.querySelector('#rGo'); btn.disabled = true;
      const data = readRegister(box, 'r');
      try { await api('api/auth', {method:'POST', body:data}); await login(data.u, data.pass); }
      catch(e){ box.querySelector('#rErr').textContent = e.message; btn.disabled = false; }
    };
    const tl = box.querySelector('#toLogin'); if (tl) tl.onclick = () => showAuth('login');
  }
  const d = box.querySelector('#toDemo'); if (d) d.onclick = () => { location.href = location.pathname + '?demo=lead'; };
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
  session = Object.assign(session || {}, {user:j.user, team:j.team, work:j.work, vapid:j.vapid, trackToken:j.trackToken});
  if (j.user.role === 'seller' && j.shift) shifts[j.user.u] = j.shift;
  if (!DEMO) lsSet('mm-session', session);
}
function logout(expired){
  if (DEMO){ location.href = location.pathname; return; }
  try { localStorage.removeItem('mm-session'); } catch(e){}
  session = null;
  location.href = location.pathname + (expired ? '?expired=1' : '');
}

/* ================= запуск ================= */
let started = false, pollTimer = null;
const wideMq = matchMedia('(min-width: 1024px)');
function applyWide(){ document.body.classList.toggle('wide', wideMq.matches && isLead()); setTimeout(() => map.invalidateSize(), 50); renderSide(); }
wideMq.addEventListener && wideMq.addEventListener('change', applyWide);
async function start(){
  if (started) return; started = true;
  document.body.classList.add(isLead() ? 'lead' : 'seller');
  applyWide();
  buildDock(); setMode('hand');
  seen = DEMO ? {} : lsGet(seenKey(), {});
  if (isSeller()){
    DKEY = DEMO ? null : 'mm-data-' + me().u;
    db = Object.assign({strokes:[], partners:[], visits:[], deleted:{}}, DKEY ? lsGet(DKEY, {}) : {});
    if (!db.visits) db.visits = [];
    const legacy = DEMO ? null : lsGet('tashkent-route-v1', null);
    if (legacy && !lsGet('mm-legacy-done', false) && (legacy.strokes||[]).length + (legacy.partners||[]).length){
      db.strokes = db.strokes.concat(legacy.strokes || []); db.partners = db.partners.concat(legacy.partners || []);
      lsSet('mm-legacy-done', true);
    }
    lastIds = new Set();
    buf = DEMO ? [] : lsGet(BUFKEY(), []);
    const t = tracks[today()] || (tracks[today()] = {}); t[me().u] = mergePts(t[me().u], buf);
    if (DEMO){ DKEY = '__demo'; const j = await api('api/data'); applyRemote(j); DKEY = null; } else { store.save(); syncNow(); }
  }
  render();
  loadFeed(); loadCoverage();
  if (isLead()) await loadTeamData();
  ensureTracks(true).then(() => { render(); if (isLead() && !cfg.view) locateMe(); });
  await tick(); evInit = true;
  if (DEMO && isSeller() && districtBounds) map.fitBounds(districtBounds, {padding:[20,20]});
  if (isLead() && (DEMO || !cfg.view)) setTimeout(() => { fitPeriod(); locateMe(); }, 300);
  pollTimer = setInterval(tick, DEMO ? 3000 : (isLead() ? 10000 : 15000));
  setInterval(() => { if (isLead()){ renderSide(); renderLive(); renderPeople(); } else renderShiftChip(); }, 30000);
  openFromUrl();
  if (DEMO) DEMO.mounted({toast, render, focusSeller, openSeller});
}
let tickN = 0;
async function tick(){
  tickN++;
  if (document.visibilityState !== 'visible' && tickN % 4) return;
  try {
    const q = isLead() ? `api/feed?sellers=${sellers().map(s => s.u).join(',')}&ev=${evN}` : 'api/feed';
    const j = await api(q);
    Object.assign(shifts, j.shifts || {});
    if (isSeller()){
      gpsTick();
      if (buf.length && tickN % 2 === 0) flushTrack();
      if (j.ver !== feedVer) loadFeed();
      if (tickN % 20 === 0){ ensureTracks(true).then(() => { if (singleDay() === today()) render(); }); loadCoverage(); }
      if (tickN % 4 === 0) syncNow();
      renderShiftChip();
    } else {
      let moved = false;
      for (const [u, p] of Object.entries(j.live || {})){
        const old = live[u]; live[u] = p;
        if (!old || old.ts !== p.ts){ moved = true; const k = dayKey(p.ts); const t = tracks[k] || (tracks[k] = {}); t[u] = mergePts(t[u], [[p.lat, p.lng, p.ts, p.acc]]); }
      }
      if (j.day && j.day !== today()){ events = []; evN = 0; } else if (j.events && j.events.length){ evN = j.ev; onEvents(j.events); }
      if (j.ver !== feedVer) await loadFeed();
      if (j.dver !== dataVer) await loadTeamData();
      if (moved && singleDay() === today()){ renderRoutes(); updateHeader(); }
      renderLive(); renderPeople(); renderSide(); renderCoverage(); updateCovChip();
      if (tickN % 30 === 0){ ensureTracks(true).then(render); loadCoverage(); }
      if (tickN % 60 === 0) refreshMe().catch(() => {});
    }
  } catch(e){ setSync('error', e.message); }
}
function openFromUrl(){
  const q = new URLSearchParams(location.search);
  if (q.get('note')) setTimeout(() => { const n = notes.find(x => x.id === q.get('note')); if (n){ map.flyTo([n.lat, n.lng], 17); openNote(n.id); } }, 1500);
  if (q.get('partner')) setTimeout(() => { if (findPartner(q.get('partner'))) openPartner(q.get('partner')); }, 2500);
  if (q.get('report')) setTimeout(() => openReport(q.get('report')), 1200);
  if (q.toString() && !DEMO) history.replaceState(null, '', location.pathname);
}
let openedOn = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !started) return;
  if (today() !== openedOn){ openedOn = today(); period = 'today'; render(); }
  tick();
  if (isSeller()){ syncNow(); flushTrack(); }
});
window.addEventListener('online', () => { if (started){ syncNow(); flushTrack(); } });
window.addEventListener('pagehide', () => { if (isSeller() && buf.length) flushTrack(); });

if ('serviceWorker' in navigator && location.protocol === 'https:' && !DEMO) navigator.serviceWorker.register('sw.js').catch(()=>{});
if (DEMO){
  DEMO.boot({map, inDistrict: (a, b) => districtRings.length ? inDistrict(a, b) : true, districtReady: window.MM_districtReady, getBounds: () => districtBounds}).then(s => { session = s; $('#demoBar').classList.add('show'); start(); });
} else if (session && session.token){
  refreshMe().then(start).catch(e => { if (!session) return; if (session.team) start(); else showAuth(); });
} else showAuth();
window.__app = {get db(){ return db; }, map, get tracks(){ return tracks; }, get notes(){ return notes; }, get comments(){ return comments; }, get live(){ return live; }, get events(){ return events; }, get shifts(){ return shifts; }, setMode, openPartner, openNote, openSeller, openActiveVisit, startShift};
})();
