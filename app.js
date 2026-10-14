/* 央国企求职站 · 前端应用 */
'use strict';

/* ---------- 工具 ---------- */
const view = document.getElementById('view');
const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');
const toastEl = document.getElementById('toast');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const splitTags = s => String(s || '').split(/[,，、；;]/).map(x => x.trim()).filter(Boolean);
const fmt = n => Number(n || 0).toLocaleString('zh-CN');
const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => dstr(new Date());
const dateAdd = (base, days) => { const [y, m, dd] = String(base).split('-').map(Number); return dstr(new Date(y, m - 1, dd + days)); };
const mmdd = s => String(s || '').slice(5, 10).replace('-', '/');
const md = s => { const p = String(s || '').split('-'); return p.length === 3 ? `${+p[1]}月${+p[2]}日` : String(s || ''); };
const qs = o => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? u : '');
async function get(url) {
  if (window.__GQ_GET) return window.__GQ_GET(url);
  const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
}
let toastTimer;
let latestTimer = null;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900); }
function lsGet(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// 地名去重：["北京市","北京市"] → "北京市"；["重庆市","重庆市","渝北区"] → "重庆市 渝北区"
function placeText(parts, sep = ' ') {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = String(p == null ? '' : p).trim();
    if (!t) continue;
    const norm = t.replace(/[省市区县]$/, '');
    if (seen.has(t) || (norm && seen.has(norm))) continue;
    seen.add(t); if (norm) seen.add(norm);
    out.push(t);
  }
  return out.join(sep);
}
// 投递进展（对齐小程序「投递进展」状态）
const APPLY_STATES = ['暂无进展', '网申未通过', '收到测评', '收到笔试', '笔试通过', '笔试未通过', '收到面试', '一面通过', '一面未通过', '二面通过', '二面未通过', '终面通过', '终面未通过', '体检阶段', '体检未通过', '收到offer', '已经签约'];
const applyStateName = v => APPLY_STATES[Number(v || 1) - 1] || APPLY_STATES[0];
function applyStateKind(v) {
  const n = Number(v || 1);
  if (n === 16 || n === 17) return 'win';
  if ([2, 6, 9, 11, 13, 15].includes(n)) return 'fail';
  if (n === 1) return 'idle';
  return 'go';
}

function areaList(a) {
  if (!a) return [];
  const s = String(a).trim();
  if (s.startsWith('[')) { try { const arr = JSON.parse(s); if (Array.isArray(arr)) return arr.map(x => String(x).trim()).filter(Boolean); } catch {} }
  return s.split(/[｜|、,，/]+/).map(x => x.trim()).filter(Boolean);
}
function areaText(a, max = 2) { const l = areaList(a); return l.slice(0, max).join('·') + (l.length > max ? ' 等' : ''); }
function statusOf(n) {
  const end = String(n.endTime || '').slice(0, 10);
  const t = todayStr();
  if (!end) return { k: 'open', t: '报名中' };
  if (end < t) return { k: 'closed', t: '已截止' };
  if (end <= dateAdd(t, 7)) return { k: 'soon', t: '即将截止' };
  return { k: 'open', t: '报名中' };
}
function detailText(s) {
  let t = String(s || '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

/* ---------- 状态 ---------- */
const state = {
  meta: null, categories: [], facets: null, dates: [],
  brief: { date: '', data: null },
  latest: { list: [], idx: 0 },
  notice: { q: '', tag: '', area: '', edu: '', from: '', to: '', industry: '', ptype: '', status: '', prov: '', city: '', grade: '', page: 1, size: 20, total: 0, mix: null, list: [], loaded: false, dirty: false, loading: false },
  company: { q: '', group: '', prov: '', city: '', div: '', scale: '', sort: '', favOnly: false, page: 1, size: 20, total: 0, mix: null, list: [], loaded: false, loading: false },
  cofacets: null,
  nfacets: null,
  mine: { tab: 'favN' },
  report: { tab: 'bi', q: '', cat: '', leaf: '', expand: false },
  major: { q: '', type: '1', l1: '', l2: '', search: null, expand: false },
  career: { q: '', cat: '' },
  industry: { tab: 'notice' },
  ext: { reports: null, majors: null, professions: null, industry: null },
  fav: { notices: lsGet('gq_fav_notices', []), companies: lsGet('gq_fav_companies', []) },
  applied: lsGet('gq_applied', []),
  history: lsGet('gq_history', []),
};

const isFavNotice = id => state.fav.notices.some(x => String(x.id) === String(id));
const isFavCompany = id => state.fav.companies.some(x => String(x.id) === String(id));
const applyOf = id => state.applied.find(x => String(x.id) === String(id)) || null;
const isApplied = id => !!applyOf(id);

function pickNotice(n) {
  return { id: n.id, title: n.title, companyName: n.companyName, tag: n.tag, area: n.area, education: n.education, startTime: n.startTime, endTime: n.endTime, createTime: n.createTime, industry: n.industry };
}
function toggleFavNotice(n) {
  const arr = state.fav.notices;
  const i = arr.findIndex(x => String(x.id) === String(n.id));
  if (i >= 0) { arr.splice(i, 1); toast('已取消收藏'); } else { arr.unshift(pickNotice(n)); toast('已加入收藏'); }
  lsSet('gq_fav_notices', arr);
  syncStars();
}
function toggleFavCompany(c) {
  const arr = state.fav.companies;
  const i = arr.findIndex(x => String(x.id) === String(c.id));
  if (i >= 0) { arr.splice(i, 1); toast('已取消收藏'); } else { arr.unshift({ id: c.id, companyName: c.companyName, categoryGroup: c.categoryGroup, type: c.type, provName: c.provName, cityName: c.cityName, division: c.division, hasRecruit: c.hasRecruit }); toast('已收藏该企业'); }
  lsSet('gq_fav_companies', arr);
  syncStars();
}
function setApplied(n, status) {
  const arr = state.applied;
  const i = arr.findIndex(x => String(x.id) === String(n.id));
  if (status === 0) {
    if (i >= 0) arr.splice(i, 1);
    toast('已取消投递记录');
  } else if (i >= 0) {
    arr[i].status = status;
    toast('进展已更新：' + applyStateName(status));
  } else {
    arr.unshift({ ...pickNotice(n), appliedAt: todayStr(), status });
    toast('已加入投递记录：' + applyStateName(status));
  }
  lsSet('gq_applied', arr);
}
function pushHistory(n) {
  const arr = state.history.filter(x => String(x.id) !== String(n.id));
  arr.unshift(pickNotice(n));
  state.history = arr.slice(0, 60);
  lsSet('gq_history', state.history);
}
function syncStars() {
  document.querySelectorAll('[data-act="favNotice"]').forEach(el => el.classList.toggle('on', isFavNotice(el.dataset.id)));
  document.querySelectorAll('[data-act="favCompany"]').forEach(el => el.classList.toggle('on', isFavCompany(el.dataset.id)));
}

/* ---------- 公告条目 ---------- */
function noticeItemHTML(n) {
  const st = statusOf(n);
  const tags = splitTags(n.tag).slice(0, 3);
  const fav = isFavNotice(n.id);
  return `<article class="notice-item" data-act="openNotice" data-id="${esc(n.id)}">
    <div class="ni-body">
      <h3 class="ni-title">${esc(n.title || '（无标题）')}</h3>
      <div class="ni-company">${esc(n.companyName || '')}</div>
      <div class="ni-chips">
        ${tags.map(t => `<span class="chip chip-tag">${esc(t)}</span>`).join('')}
        ${n.education ? `<span class="chip">${esc(n.education)}</span>` : ''}
        <span class="chip chip-st ${st.k}">${st.t}</span>
      </div>
    </div>
    <div class="ni-side">
      <span class="ni-area">${esc(areaText(n.area, 1))}</span>
      <span class="ni-date">${esc(mmdd(n.createTime))}</span>
    </div>
    <button class="ni-star ${fav ? 'on' : ''}" data-act="favNotice" data-id="${esc(n.id)}" title="收藏">${fav ? '★' : '☆'}</button>
    <span class="ni-arrow">›</span>
  </article>`;
}

/* ---------- 投递条目 ---------- */
function appliedItemHTML(n) {
  const st = statusOf(n);
  const ap = applyOf(n.id) || {};
  const kind = applyStateKind(ap.status);
  const fav = isFavNotice(n.id);
  return `<article class="notice-item" data-act="openNotice" data-id="${esc(n.id)}">
    <div class="ni-body">
      <h3 class="ni-title">${esc(n.title || '（无标题）')}</h3>
      <div class="ni-company">${esc(n.companyName || '')}</div>
      <div class="ni-chips">
        <span class="chip chip-ap ${kind}">${esc(applyStateName(ap.status))}</span>
        ${ap.appliedAt ? `<span class="chip">投递于 ${esc(ap.appliedAt)}</span>` : ''}
        <span class="chip chip-st ${st.k}">${st.t}</span>
      </div>
    </div>
    <div class="ni-side">
      <span class="ni-area">${esc(areaText(n.area, 1))}</span>
      <span class="ni-date">${esc(mmdd(n.createTime))}</span>
    </div>
    <button class="ni-apbtn" data-act="apply" data-id="${esc(n.id)}" title="修改投递进展">进展</button>
    <button class="ni-star ${fav ? 'on' : ''}" data-act="favNotice" data-id="${esc(n.id)}" title="收藏">${fav ? '★' : '☆'}</button>
    <span class="ni-arrow">›</span>
  </article>`;
}

/* ---------- 企业条目 ---------- */
function companyItemHTML(c) {
  const fav = isFavCompany(c.id);
  const initial = String(c.companyName || '企').replace(/^(中国|中华|国家)/, '').charAt(0) || '企';
  return `<article class="company-item" data-act="openCompany" data-id="${esc(c.id)}">
    <div class="ci-logo">${esc(initial)}</div>
    <div class="ci-main">
      <div class="ci-title">
        <span class="ci-name">${esc(c.companyName || '')}</span>
        ${c.categoryGroup ? `<span class="badge">${esc(String(c.categoryGroup).replace('家央企', '央企').replace('家省属国企', '省属国企'))}</span>` : ''}
      </div>
      <div class="ci-meta">${[c.type, c.companySize, placeText([c.provName, c.cityName])].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="ci-sub">${c.supervisoryAuthority ? '监管：' + esc(c.supervisoryAuthority) : (c.division ? esc(c.division) : '')}${c.hasRecruit ? '　<span class="red">• 有招聘入口</span>' : ''}</div>
    </div>
    <button class="ni-star ${fav ? 'on' : ''}" data-act="favCompany" data-id="${esc(c.id)}" title="收藏">${fav ? '★' : '☆'}</button>
    <span class="ni-arrow">›</span>
  </article>`;
}

/* ---------- 动效：顶部进度条 / 印章落章 / 数字滚动 ---------- */
let loadTimer = null;
function loading(on, delay = 200) {
  const bar = document.getElementById('loadbar');
  if (!bar) return;
  clearTimeout(loadTimer);
  if (on) loadTimer = setTimeout(() => bar.classList.add('on'), delay);
  else bar.classList.remove('on');
}
function armStamps() {
  document.querySelectorAll('.sf-seal:not(.armed)').forEach(el => {
    el.classList.add('armed');
    if (!('IntersectionObserver' in window)) { el.classList.add('stamp'); return; }
    const io = new IntersectionObserver(list => {
      list.forEach(en => { if (en.isIntersecting) { en.target.classList.add('stamp'); io.disconnect(); } });
    }, { threshold: .35 });
    io.observe(el);
  });
}
function countUp(el, dur = 1050) {
  const target = Number(String(el.textContent).replace(/[^\d]/g, ''));
  if (!target || target < 10) return;
  const t0 = performance.now();
  el.classList.add('rolling');
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(target * e));
    if (p < 1) requestAnimationFrame(tick);
    else { el.textContent = fmt(target); el.classList.remove('rolling'); }
  };
  requestAnimationFrame(tick);
}
function playHomeAnim() {
  document.querySelectorAll('.hero-stats b').forEach(el => countUp(el));
}

/* ---------- 路由 ---------- */
const scrollPos = {};
let lastSeg = null;
let navCount = 0;
function parseHash() {
  let raw = location.hash.replace(/^#\/?/, '');
  let params = null;
  const qi = raw.indexOf('?');
  if (qi >= 0) { params = new URLSearchParams(raw.slice(qi + 1)); raw = raw.slice(0, qi); }
  const [seg, ...rest] = raw.split('/');
  return { seg: seg || 'home', arg: rest.join('/'), params };
}
function setActiveTab(seg) {
  const alias = { legal: 'mine' };
  const on = alias[seg] || seg;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === on));
}
async function route() {
  navCount++;
  const { seg, arg } = parseHash();
  if (seg === 'notice' || seg === 'company' || seg === 'majorinfo' || seg === 'careerinfo') { openDetail(seg, arg); return; }
  if (seg === 'follow') { openFollowSheet(); return; }
  loading(true);
  closeOverlay();
  closeCoSheet();
  closeNoSheet();
  if (seg === 'companies') {
    const p = parseHash().params;
    if (p && [...p.keys()].length) { applyCoParams(p); history.replaceState(null, '', '#/companies'); }
  }
  if (seg === 'notices') {
    const p = parseHash().params;
    if (p && [...p.keys()].length) { applyNoticeParams(p); history.replaceState(null, '', '#/notices'); }
  }
  if (lastSeg && lastSeg !== seg) scrollPos[lastSeg] = window.scrollY;
  setActiveTab(seg);
  try {
    if (seg === 'home') await renderHome();
    else if (seg === 'notices') await renderNotices();
    else if (seg === 'companies') await renderCompanies();
    else if (seg === 'report') await renderReport();
    else if (seg === 'major') await renderMajor();
    else if (seg === 'career') await renderCareer();
    else if (seg === 'industry') await renderIndustry();
    else if (seg === 'mine') renderMine();
    else if (seg === 'legal') renderLegal();
    else { location.replace('#/home'); return; }
  } catch (e) {
    view.innerHTML = `<div class="wrap page"><div class="empty"><div class="ico">📡</div><p>加载出错了，请稍后再试</p><button class="btn warm" onclick="location.reload()">重新加载</button></div></div>`;
  }
  loading(false);
  armStamps();
  playHomeAnim();
  view.classList.remove('anim'); void view.offsetWidth; view.classList.add('anim');
  window.scrollTo(0, scrollPos[seg] || 0);
  lastSeg = seg;
}
function goBack() {
  if (navCount > 1) history.back();
  else location.hash = '#/home';
}

/* ---------- 首页 ---------- */
async function renderHome() {
  const m = state.meta || {};
  const upd = m.generatedAt ? (() => { const d = new Date(m.generatedAt); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })() : '';
  const todayNew = (state.dates || []).find(d => d.date === todayStr());
  view.innerHTML = `
  <div class="home">
    <section class="hero">
      <div class="hero-sheen" aria-hidden="true"></div>
      <div class="wrap">
        <div class="hero-top">
          <div class="hero-badge">央企 · 国企 · 专项求职</div>
          <div class="hero-live"><i></i>${upd ? '数据更新 ' + upd : '数据每日更新'}</div>
        </div>
        <h1>央国企求职站</h1>
        <p class="hero-sub">招聘公告每日更新 · 央企与各省国企名录一站查询</p>
        <div class="hero-search">
          <input id="heroInput" placeholder="搜索：国家电网 / 秋招 / 财务 / 江苏…" enterkeyhint="search" />
          <button class="btn primary" data-act="heroSearch" data-mode="notice">搜公告</button>
          <button class="btn ghost" data-act="heroSearch" data-mode="company">搜企业</button>
        </div>
        <div class="hero-hot"><span class="hl">大家在搜</span>${['国家电网', '秋招', '财务', '电力', '江苏'].map(k => `<button data-act="heroHot" data-q="${k}">${k}</button>`).join('')}</div>
        <div class="hero-stats">
          <div><b>${fmt(m.companiesUnique)}</b><span>家央国企</span></div>
          <div><b>${fmt(m.noticesSoe)}</b><span>条在招公告</span>${todayNew ? `<em>今日 +${fmt(todayNew.count)}</em>` : ''}</div>
          <div><b>${fmt(m.positions || 0)}</b><span>个在招岗位</span></div>
          <div><b>${fmt(state.categories.length || 33)}</b><span>个企业分类</span></div>
        </div>
      </div>
    </section>
    <div class="wrap">
      <section class="card" id="latestCard"><div class="loading">最新公告加载中…</div></section>
      <section class="card">
        <div class="section-head"><h2>求职工具</h2><span class="sub">央国企专项</span></div>
        <div class="tool-grid">
          <a class="tool-tile" href="#/report"><span class="tt-ico">📄</span><b>就业报告</b><small>笔试/面试真题库</small></a>
          <a class="tool-tile" href="#/major"><span class="tt-ico">🎓</span><b>专业概述</b><small>专业介绍与前景</small></a>
          <a class="tool-tile" href="#/career"><span class="tt-ico">🧭</span><b>职业分析</b><small>职业介绍与薪酬</small></a>
          <a class="tool-tile" href="#/industry"><span class="tt-ico">📊</span><b>行业分析</b><small>热度与企业分布</small></a>
          <a class="tool-tile" href="#/notices"><span class="tt-ico">📢</span><b>招聘公告</b><small>每日更新</small></a>
          <a class="tool-tile" href="#/companies"><span class="tt-ico">🏢</span><b>企业名录</b><small>央企/省属/地方</small></a>
          <a class="tool-tile" href="#/mine" data-act="mineTabGo" data-tab="applied"><span class="tt-ico">🔖</span><b>我的投递</b><small>网申进展跟踪</small></a>
          <a class="tool-tile" href="#/mine" data-act="mineTabGo" data-tab="favN"><span class="tt-ico">⭐</span><b>我的收藏</b><small>公告与企业</small></a>
        </div>
      </section>
      <section class="card follow" id="followCard">
        <div class="section-head"><h2>关注圭煜</h2><span class="sub">微信公众号 · 小红书 <b>官方唯二</b></span></div>
        <div class="fo-qrs">
          <button class="fo-qr" data-act="openFollow" title="查看大图">
            <img src="${QR_WECHAT}" alt="微信公众号「圭煜」二维码" />
            <b>微信公众号</b><small>Guiyus01 · 发「圭煜的群」进群</small>
          </button>
          <button class="fo-qr" data-act="openFollow" title="查看大图">
            <img src="${QR_XHS}" alt="小红书「圭煜」二维码" />
            <b>小红书</b><small>Ss1127592272 · 动态与私信</small>
          </button>
        </div>
        <p class="fo-safe">官方账号<b>只此两个</b>，谨防仿冒；点二维码看大图 · 任何「内推 / 保 offer」收费均与本站无关。</p>
      </section>
      <section class="card brief" id="briefCard"><div class="loading">早报加载中…</div></section>
      <footer class="foot">
        <p>数据来自公开招聘渠道整理，仅供求职参考，投递前请以用人单位官方信息为准。</p>
        <p>数据更新于 <b>${m.generatedAt ? new Date(m.generatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</b></p>
      </footer>
    </div>
  </div>`;
  const input = document.getElementById('heroInput');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doHeroSearch('notice', input.value); });
  await Promise.all([renderBrief(), renderLatest()]);
}

async function renderBrief() {
  const dates = state.dates;
  const card = document.getElementById('briefCard');
  if (!card) return;
  if (!dates.length) { card.innerHTML = '<div class="loading">暂无数据</div>'; return; }
  if (!state.brief.date || !dates.some(d => d.date === state.brief.date)) state.brief.date = dates[0].date;
  let data;
  try { data = await get('/api/brief?' + qs({ date: state.brief.date })); }
  catch { card.innerHTML = '<div class="loading">早报加载失败</div>'; return; }
  state.brief.data = data;
  const isToday = state.brief.date === todayStr();
  const dateNote = isToday ? '今天' : md(state.brief.date);
  const shown = data.list.slice(0, 3);
  card.innerHTML = `
    <div class="section-head">
      <div>
        <h2>求职早报</h2>
        <p class="sub">${dateNote} 新增央国企公告 <b>${fmt(data.total)}</b> 条${isToday ? ' · 每日必刷' : ''}</p>
      </div>
      <a class="link" href="#/notices">全部公告 ›</a>
    </div>
    <div class="date-strip">${dates.map(d => `<button class="date-chip ${d.date === state.brief.date ? 'on' : ''}" data-act="briefDate" data-date="${d.date}"><b>${mmdd(d.date)}</b><span>${fmt(d.count)}条</span></button>`).join('')}</div>
    ${data.tags.length ? `<div class="brief-tags">${data.tags.slice(0, 6).map(t => `<span class="mini-chip">${esc(t.name)} ${fmt(t.count)}</span>`).join('')}</div>` : ''}
    <div class="notice-list">${shown.map(noticeItemHTML).join('') || '<div class="loading">这一天还没有新增公告</div>'}</div>
    ${data.total > 3 ? `<div class="brief-foot"><button class="btn warm" data-act="briefAll" data-date="${state.brief.date}">查看该日全部 ${fmt(data.total)} 条 ›</button></div>` : ''}`;
}

function tickItemHTML(n) {
  const st = statusOf(n);
  return `<a class="tk-row" href="#/notice/${esc(n.id)}" data-act="openNotice" data-id="${esc(n.id)}">
    <span class="tk-title">${esc(n.title || '（无标题）')}</span>
    <span class="tk-company">${esc(n.companyName || '')}</span>
    <span class="chip chip-st ${st.k}">${st.t}</span>
    <span class="tk-date">${esc(mmdd(n.createTime))}</span>
    <span class="ni-arrow">›</span>
  </a>`;
}
async function renderLatest() {
  const card = document.getElementById('latestCard');
  if (!card) return;
  let data;
  try { data = await get('/api/notices?' + qs({ page: 1, size: 10 })); }
  catch { card.innerHTML = '<div class="loading">加载失败</div>'; return; }
  const list = (data.list || []).slice(0, 10);
  state.latest = { list, idx: 0 };
  card.innerHTML = `
    <div class="section-head"><h2>最新公告</h2><a class="link" href="#/notices">查看全部 ›</a></div>
    <div class="ticker" id="latestTick">
      <span class="tk-flag"><i></i>最新</span>
      <div class="tk-body" id="latestBody">${list.length ? tickItemHTML(list[0]) : '<div class="loading">暂无公告</div>'}</div>
    </div>`;
  startLatestTicker();
}
function startLatestTicker() {
  clearInterval(latestTimer);
  latestTimer = null;
  const list = (state.latest && state.latest.list) || [];
  if (list.length < 2) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  latestTimer = setInterval(() => {
    const box = document.getElementById('latestTick');
    const body = document.getElementById('latestBody');
    if (!box || !body || !state.latest || !state.latest.list.length) { clearInterval(latestTimer); latestTimer = null; return; }
    if (box.matches(':hover')) return;
    state.latest.idx = (state.latest.idx + 1) % state.latest.list.length;
    const html = tickItemHTML(state.latest.list[state.latest.idx]);
    if (reduce) { body.innerHTML = html; return; }
    body.classList.add('out');
    setTimeout(() => {
      const b2 = document.getElementById('latestBody');
      if (!b2) return;
      b2.innerHTML = html;
      b2.classList.remove('out');
      b2.classList.add('in');
      setTimeout(() => b2.classList.remove('in'), 480);
    }, 260);
  }, 3600);
}function doHeroSearch(mode, val) {
  const q = String(val || '').trim();
  if (mode === 'company') { state.company.q = q; state.company.loaded = false; location.hash = '#/companies'; }
  else { state.notice.q = q; state.notice.loaded = false; state.notice.dirty = true; location.hash = '#/notices'; }
}
function applyNoticeParams(p) {
  const s = state.notice;
  s.q = p.get('q') || '';
  s.tag = p.get('tag') || '';
  s.area = p.get('area') || '';
  s.edu = p.get('edu') || '';
  s.from = p.get('from') || '';
  s.to = p.get('to') || '';
  s.industry = p.get('industry') || '';
  s.ptype = p.get('ptype') || '';
  s.status = p.get('status') || '';
  s.prov = p.get('prov') || '';
  s.city = p.get('city') || '';
  s.grade = p.get('grade') || '';
  s.loaded = false; s.dirty = true; s.page = 1;
}

/* ---------- 招聘公告页 ---------- */
const NO_STATUS_LABEL = { open: '报名中', soon: '7天内截止', today: '今日截止', closed: '已截止' };
const NO_TIME_LABEL = { today: '今天', '3d': '近3天', '7d': '近7天', '30d': '近30天' };
const shortProv = x => String(x || '').replace(/(维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|省|市)$/, '');
function noticeTypeSegsHTML() {
  const t = (state.nfacets && state.nfacets.types) || {};
  const total = (t.xiao || 0) + (t.she || 0) + (t.shi || 0) + (t.other || 0);
  const segs = [['', '全部', total], ['xiao', '校招', t.xiao || 0], ['she', '社招', t.she || 0], ['shi', '实习', t.shi || 0], ['other', '其他', t.other || 0]];
  return `<div class="segmented" id="noCats">${segs.map(([v, label, n]) => `<button class="${(state.notice.ptype || '') === v ? 'on' : ''}" data-act="noGroup" data-val="${v}"><span>${label}</span><b class="sn">${fmt(n)}</b></button>`).join('')}</div>`;
}
// 公告筛选：六个一级分类，逐项下拉展开（与「企业名录」同一套逻辑）
function noFilterSelectsHTML() {
  const s = state.notice;
  const f = state.nfacets || {};
  const c = f.status || {};
  const tk = noticeTimeKey() || '';
  const cur = tk === 'custom' ? 'custom' : tk;
  const timeOpts = [['', '不限时间'], ['today', '今天'], ['3d', '近3天'], ['7d', '近7天'], ['30d', '近30天']];
  if (cur === 'custom') timeOpts.push(['custom', '自定义时间（链接带入）']);
  return `<div class="frow nfrow">
    <select data-nsel="status"><option value="">不限报名状态</option>${[['open', '报名中'], ['soon', '7天内截止'], ['today', '今日截止'], ['closed', '已截止']].map(([v, t]) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${t}（${fmt(c[v] || 0)}）</option>`).join('')}</select>
    <select data-nsel="prov"><option value="">全部省份</option>${(f.provinces || []).map(p => `<option value="${esc(p.name)}" ${s.prov === p.name ? 'selected' : ''}>${esc(p.name)}（${fmt(p.count)}）</option>`).join('')}</select>
    <select data-nsel="city" id="noCity">${cityOptionsHTML(s.prov, s.city, f)}</select>
    <select data-nsel="edu"><option value="">不限学历</option>${(f.edus || []).filter(e => e.count).map(e => `<option value="${esc(e.name)}" ${s.edu === e.name ? 'selected' : ''}>${esc(e.name)}（${fmt(e.count)}）</option>`).join('')}</select>
    <select data-nsel="grade"><option value="">不限届别</option>${(f.grades || []).map(e => `<option value="${esc(e.name)}" ${s.grade === e.name ? 'selected' : ''}>${esc(e.name)}（${fmt(e.count)}）</option>`).join('')}</select>
    <select data-nsel="time">${timeOpts.map(([v, t]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
  </div>`;
}
function noSumItems() {
  const s = state.notice;
  const items = [];
  if (s.q) items.push(['q', '搜索 · ' + s.q]);
  if (s.ptype) items.push(['ptype', ({ xiao: '校招', she: '社招', shi: '实习', other: '其他' })[s.ptype] || s.ptype]);
  if (s.status) items.push(['status', NO_STATUS_LABEL[s.status] || s.status]);
  if (s.prov) items.push(['prov', shortProv(s.prov) + (s.city ? '·' + String(s.city).replace(/市$/, '') : '')]);
  if (s.edu) items.push(['edu', s.edu]);
  if (s.grade) items.push(['grade', s.grade]);
  const tk = noticeTimeKey();
  if (tk) items.push(['time', NO_TIME_LABEL[tk] || '自定义时间']);
  if (s.industry) items.push(['industry', '行业 · ' + String(s.industry).split('|').join(' · ')]);
  if (s.tag) items.push(['tag', '标签 · ' + s.tag]);
  if (s.area) items.push(['area', '地区 · ' + s.area]);
  return items;
}
function noSumHTML() {
  const items = noSumItems();
  if (!items.length) return '';
  return '<div class="filterline" id="noSum">' + items.map(([k, label]) => `<span class="chip chip-f">${esc(label)}<button data-act="noClear" data-key="${k}" title="清除">✕</button></span>`).join('') +
    '<button class="link" data-act="noReset">全部清空</button></div>';
}
function noFilterCount() {
  const s = state.notice;
  return [s.status, s.prov, s.city, s.edu, s.grade, noticeTimeKey(), s.tag, s.area, s.industry].filter(Boolean).length;
}
function noticesShellHTML() {
  const s = state.notice;
  return `<div class="wrap page">
    <div class="page-head"><h2>招聘公告</h2><span class="page-count" id="noticeCount"></span></div>
    <div class="searchrow2">
      <div class="searchbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
        <input id="noticeQ" placeholder="搜索公告标题、单位名称" value="${esc(s.q)}" enterkeyhint="search" />
        ${s.q ? '<button class="clear" data-act="clearNoticeQ">✕</button>' : ''}
      </div>
      <button class="btn ghost act-filter" data-act="openNoFilter">筛选<span class="fbadge" id="noBadge" hidden></span></button>
    </div>
    ${noticeTypeSegsHTML()}
    <section class="coblock" id="noFilters">
      <div class="nf-tip only-mobile">先分类、再取值，选完立即出结果</div>
      ${noFilterSelectsHTML()}
      <div class="stats2"><span><b id="noN">0</b> 条命中</span><span class="mix" id="noMix"></span></div>
      <div class="frow in-sheet">
        <button class="btn ghost" data-act="noShare">复制筛选链接</button>
        <button class="btn ghost" data-act="noReset">重置</button>
        <button class="btn primary only-mobile" data-act="noDone">完成</button>
      </div>
    </section>
    <div class="cscrim" id="noScrim" data-act="noDone"></div>
    ${noSumHTML()}
    <div class="notice-list" id="noticeList"></div>
    <div class="loadmore" id="noticeMore"></div>
  </div>`;
}
function syncNoControls() {
  const s = state.notice;
  const f = state.nfacets || {};
  document.querySelectorAll('#noCats button').forEach(b => b.classList.toggle('on', b.dataset.val === (s.ptype || '')));
  const cityEl = document.getElementById('noCity');
  if (cityEl) {
    if (cityEl.dataset.prov !== (s.prov || '')) { cityEl.innerHTML = cityOptionsHTML(s.prov, s.city, f); cityEl.dataset.prov = s.prov || ''; }
    cityEl.value = s.city || '';
  }
  document.querySelectorAll('#noFilters select[data-nsel]').forEach(el => {
    const key = el.dataset.nsel;
    if (key === 'city') return;
    if (key === 'time') {
      const tk = noticeTimeKey() || '';
      const want = tk === 'custom' ? 'custom' : tk;
      if (want === 'custom' && !Array.from(el.options).some(o => o.value === 'custom')) el.insertAdjacentHTML('beforeend', '<option value="custom">自定义时间（链接带入）</option>');
      el.value = want;
      return;
    }
    el.value = s[key] || '';
  });
  const sum = document.getElementById('noSum');
  if (sum) sum.outerHTML = noSumHTML();
  else if (noSumItems().length) {
    const anchor = document.getElementById('noScrim');
    if (anchor) anchor.insertAdjacentHTML('afterend', noSumHTML());
  }
  const badge = document.getElementById('noBadge');
  const n = noFilterCount();
  if (badge) { badge.hidden = !n; badge.textContent = n; }
}function closeNoSheet() {
  document.getElementById('noFilters')?.classList.remove('open');
  document.getElementById('noScrim')?.classList.remove('show');
  document.body.classList.remove('sheet-open', 'locked');
}
function noticeTimeKey() {
  const { from, to } = state.notice;
  if (!from && !to) return '';
  const t = todayStr();
  if (from === t && to === t) return 'today';
  if (from === dateAdd(t, -2) && to === t) return '3d';
  if (from === dateAdd(t, -6) && to === t) return '7d';
  if (from === dateAdd(t, -29) && to === t) return '30d';
  return 'custom';
}
async function renderNotices() {
  await refreshNoticesShell(!(state.notice.loaded && !state.notice.dirty));
  state.notice.dirty = false;
}
async function refreshNoticesShell(reload) {
  view.innerHTML = noticesShellHTML();
  const q = document.getElementById('noticeQ');
  q.addEventListener('input', debounce(e => { state.notice.q = e.target.value.trim(); loadNotices(true); }, 380));
  syncNoControls();
  if (reload) await loadNotices(true);
  else renderNoticeList();
}
async function loadNotices(reset) {
  const s = state.notice;
  if (s.loading) return;
  s.loading = true;
  if (reset) s.page = 1;
  const list = document.getElementById('noticeList');
  if (list && reset) list.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const data = await get('/api/notices?' + qs({ page: s.page, size: s.size, q: s.q, tag: s.tag, area: s.area, edu: s.edu, from: s.from, to: s.to, industry: s.industry, ptype: s.ptype, status: s.status, prov: s.prov, city: s.city, grade: s.grade }));
    s.total = data.total;
    s.mix = data.mix || null;
    s.list = reset ? data.list : s.list.concat(data.list);
    s.loaded = true;
    s.page++;
  } catch { toast('加载失败，请稍后再试'); }
  s.loading = false;
  syncNoControls();
  renderNoticeList();
}
function renderNoticeList() {
  const s = state.notice;
  const list = document.getElementById('noticeList');
  const count = document.getElementById('noticeCount');
  const more = document.getElementById('noticeMore');
  if (!list) return;
  count.textContent = s.loaded ? `共 ${fmt(s.total)} 条` : '';
  const nEl = document.getElementById('noN'); if (nEl) nEl.textContent = fmt(s.total);
  const mixEl = document.getElementById('noMix');
  if (mixEl) {
    const m = s.mix || {};
    const parts = [m.open ? `报名中 ${fmt(m.open)}` : '', m.soon ? `7天内截止 ${fmt(m.soon)}` : '', m.closed ? `已截止 ${fmt(m.closed)}` : ''].filter(Boolean);
    mixEl.textContent = parts.length ? '· ' + parts.join(' · ') : '';
  }
  list.innerHTML = s.list.map(noticeItemHTML).join('') || (s.loaded ? `<div class="empty"><div class="ico">🗂️</div><p>没有符合条件的公告，换个筛选条件试试</p><button class="btn warm" data-act="noReset">重置筛选</button></div>` : '');
  more.innerHTML = s.list.length < s.total ? `<button class="btn ghost" data-act="loadNotices">加载更多（还有 ${fmt(s.total - s.list.length)} 条）</button>` : '';
}

/* ---------- 企业名录页 ---------- */
function companiesShellHTML() {
  const s = state.company;
  const f = state.cofacets || { groups: {}, provinces: [], divisions: [], sizes: [] };
  const g = f.groups || {};
  const totalAll = (g.central || 0) + (g.provincial || 0) + (g.municipal || 0);
  const segs = [['', '全部', totalAll], ['central', '央企', g.central || 0], ['provincial', '省属国企', g.provincial || 0], ['municipal', '地方国企', g.municipal || 0]];
  const favN = state.fav.companies.length;
  return `<div class="wrap page">
    <div class="page-head"><h2>企业名录</h2></div>
    <div class="searchrow2">
      <div class="searchbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
        <input id="companyQ" placeholder="搜索企业名称、行业、监管部门" value="${esc(s.q)}" enterkeyhint="search" />
        ${s.q ? '<button class="clear" data-act="clearCompanyQ">✕</button>' : ''}
      </div>
      <button class="btn ghost act-filter" data-act="openCoFilter">筛选<span class="fbadge" id="coBadge" hidden></span></button>
    </div>
    <div class="toolbar2">
      <span class="hint" id="coCount"></span>
      <button class="favbtn" id="coFavBtn" data-act="coFavToggle">★ 收藏 <b>${favN}</b></button>
      <label class="sortlab">排序
        <select id="coSort" data-sel="sort">
          ${[['', '默认排序'], ['name', '企业名称'], ['prov', '所属地区'], ['div', '所属行业'], ['scale', '企业规模']].map(([v, t]) => `<option value="${v}" ${s.sort === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
    </div>
    <section class="coblock" id="coFilters">
      <div class="segmented" id="coCats">${segs.map(([v, label, n]) => `<button class="${s.group === v ? 'on' : ''}" data-act="coGroup" data-val="${v}"><span>${label}</span><b class="sn">${fmt(n)}</b></button>`).join('')}</div>
      <div class="frow">
        <select data-sel="prov"><option value="">全部省份</option>${(f.provinces || []).map(p => `<option value="${esc(p.name)}" ${s.prov === p.name ? 'selected' : ''}>${esc(p.name)}（${fmt(p.count)}）</option>`).join('')}</select>
        <select data-sel="city" id="coCity">${cityOptionsHTML(s.prov, s.city, f)}</select>
        <select data-sel="div"><option value="">全部行业</option>${(f.divisions || []).map(p => `<option value="${esc(p.name)}" ${s.div === p.name ? 'selected' : ''}>${esc(p.name)}（${fmt(p.count)}）</option>`).join('')}</select>
        <select data-sel="scale"><option value="">不限规模</option>${(f.sizes || []).filter(x => x.count).map(p => `<option value="${esc(p.name)}" ${s.scale === p.name ? 'selected' : ''}>${esc(p.name)}（${fmt(p.count)}）</option>`).join('')}</select>
      </div>
      <div class="stats2"><span><b id="coN">0</b> 家命中</span><span class="mix" id="coMix"></span></div>
      <div class="frow in-sheet">
        <button class="btn ghost" data-act="coShare">复制筛选链接</button>
        <button class="btn ghost" data-act="coReset">重置</button>
        <button class="btn primary only-mobile" data-act="coDone">完成</button>
      </div>
    </section>
    <div class="cscrim" id="coScrim" data-act="coDone"></div>
    <div class="company-list" id="companyList"></div>
    <div class="loadmore" id="companyMore"></div>
  </div>`;
}
async function renderCompanies() {
  view.innerHTML = companiesShellHTML();
  bindCompanySearch();
  syncCoControls();
  if (!state.company.loaded) await loadCompanies(true);
  else renderCompanyList();
}
function bindCompanySearch() {
  const q = document.getElementById('companyQ');
  q.addEventListener('input', debounce(e => { state.company.q = e.target.value.trim(); loadCompanies(true); }, 380));
}
function coFilterCount() {
  const s = state.company;
  return [s.group, s.prov, s.city, s.div, s.scale].filter(Boolean).length + (s.favOnly ? 1 : 0);
}
// 城市下拉：选了省 → 该省城市；没选省 → 全部城市（按数量排序）
function cityOptionsHTML(prov, city, f) {
  const cities = (f && f.cities) || {};
  let list;
  if (prov) list = cities[prov] || [];
  else {
    const agg = {};
    for (const pv of Object.keys(cities)) for (const c of cities[pv]) agg[c.name] = (agg[c.name] || 0) + c.count;
    list = Object.entries(agg).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }
  const head = prov ? '全部城市' : '全部城市（先选省份更准）';
  return `<option value="">${head}</option>` + list.map(c => `<option value="${esc(c.name)}" ${city === c.name ? 'selected' : ''}>${esc(c.name)}（${fmt(c.count)}）</option>`).join('');
}
function refreshCityOptions() {
  const el = document.getElementById('coCity');
  if (el) el.innerHTML = cityOptionsHTML(state.company.prov, state.company.city, state.cofacets || {});
}
function syncCoControls() {
  const s = state.company;
  document.querySelectorAll('#coCats button').forEach(b => b.classList.toggle('on', b.dataset.val === s.group));
  const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.value = v; };
  set('#companyQ', s.q);
  document.querySelectorAll('#coFilters select[data-sel]').forEach(el => { el.value = s[el.dataset.sel] || ''; });
  refreshCityOptions();
  const badge = document.getElementById('coBadge');
  const n = coFilterCount();
  if (badge) { badge.hidden = !n; badge.textContent = n; }
  document.getElementById('coFavBtn')?.classList.toggle('on', s.favOnly);
}
function closeCoSheet() {
  document.getElementById('coFilters')?.classList.remove('open');
  document.getElementById('coScrim')?.classList.remove('show');
  document.body.classList.remove('sheet-open', 'locked');
}
function applyCoParams(p) {
  const s = state.company;
  s.group = p.get('group') || '';
  s.prov = p.get('prov') || '';
  s.city = p.get('city') || '';
  s.div = p.get('div') || '';
  s.scale = p.get('scale') || '';
  s.sort = p.get('sort') || '';
  s.q = p.get('q') || '';
  s.favOnly = p.get('fav') === '1';
  s.loaded = false;
  s.page = 1;
}
async function loadCompanies(reset) {
  const s = state.company;
  if (s.loading) return;
  s.loading = true;
  if (reset) s.page = 1;
  const list = document.getElementById('companyList');
  if (list && reset) list.innerHTML = '<div class="loading">加载中…</div>';
  const ids = s.favOnly ? state.fav.companies.map(c => c.id).join(',') : '';
  try {
    const data = await get('/api/companies?' + qs({ page: s.page, size: s.size, q: s.q, group: s.group, prov: s.prov, city: s.city, div: s.div, scale: s.scale, sort: s.sort, ids }));
    s.total = data.total;
    s.mix = data.mix || null;
    s.list = reset ? data.list : s.list.concat(data.list);
    s.loaded = true;
    s.page++;
  } catch { toast('加载失败，请稍后再试'); }
  s.loading = false;
  renderCompanyList();
}
function renderCompanyList() {
  const s = state.company;
  const list = document.getElementById('companyList');
  const hint = document.getElementById('coCount');
  const more = document.getElementById('companyMore');
  if (!list) return;
  if (hint) hint.textContent = s.loaded ? `共 ${fmt(s.total)} 家` : '';
  const nEl = document.getElementById('coN'); if (nEl) nEl.textContent = fmt(s.total);
  const mixEl = document.getElementById('coMix');
  if (mixEl) {
    const m = s.mix || {};
    const parts = [m.central ? `央企 ${fmt(m.central)}` : '', m.provincial ? `省属 ${fmt(m.provincial)}` : '', m.municipal ? `地方 ${fmt(m.municipal)}` : ''].filter(Boolean);
    mixEl.textContent = parts.length ? '· ' + parts.join(' · ') : '';
  }
  list.innerHTML = s.list.map(companyItemHTML).join('') || (s.loaded ? emptyCompaniesHTML() : '');
  more.innerHTML = s.list.length < s.total ? `<button class="btn ghost" data-act="loadCompanies">加载更多（还有 ${fmt(s.total - s.list.length)} 家）</button>` : '';
}
function emptyCompaniesHTML() {
  const s = state.company;
  if (s.favOnly) return `<div class="empty"><div class="ico">⭐</div><p>还没有符合条件的收藏企业</p><button class="btn warm" data-act="coFavToggle">看全部企业</button></div>`;
  return `<div class="empty"><div class="ico">🏢</div><p>没有符合条件的企业，换个筛选条件试试</p><button class="btn warm" data-act="coReset">重置筛选</button></div>`;
}

/* ---------- 我的 ---------- */
/* ---------- 版本指纹 / 数据校验码 / 访问追踪码（防伪四码） ---------- */
const FP_PREFIX = 'GYQ-WEB';
const TRACE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function fnv8(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return ('00000000' + h.toString(16).toUpperCase()).slice(-8);
}
function signSource() {
  const m = state.meta || {};
  return [m.generatedAt || '', m.companies || 0, m.companiesUnique || 0, m.noticesAll || 0,
    m.noticesSoe || 0, (m.soeDateRange || []).join('~'), 'guiyu', '央国企求职站'].join('|');
}
// 版本指纹：站点代号-数据日期-哈希前 8 位，数据一变指纹就变
function fpCode() {
  const m = state.meta || {};
  if (m.fp) return String(m.fp);
  const now = new Date();
  const day = String(m.generatedAt || '').slice(0, 10).replace(/-/g, '') ||
    (String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0'));
  return FP_PREFIX + '-' + day + '-' + fnv8('fp|' + signSource(), 0x811c9dc5);
}
// 数据校验码：只覆盖数据本身，16 位
function dhCode() {
  const m = state.meta || {};
  if (m.dh) return String(m.dh);
  return fnv8('dh1|' + signSource(), 0x811c9dc5) + fnv8('dh2|' + signSource(), 0x9e3779b9);
}
// 访问追踪码：每次打开页面都不一样
function makeTrace() {
  const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
  let r = '';
  for (let i = 0; i < 4; i++) r += TRACE_CHARS.charAt(Math.floor(Math.random() * TRACE_CHARS.length));
  return 'GY-' + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '-' + r;
}
const TRACE = makeTrace();
// 把追踪码编成看不见的零宽字符，跟着文字一起被复制走
function zwEncode(s) {
  let out = '';
  for (const ch of String(s)) {
    let b = ch.charCodeAt(0).toString(2);
    while (b.length < 8) b = '0' + b;
    for (const x of b) out += (x === '1' ? '\u200b' : '\u200c');
  }
  return out;
}
function dataVerText() {
  const m = state.meta || {};
  const d = String(m.generatedAt || '').slice(0, 10).replace(/-/g, '/');
  return [d ? '数据更新 ' + d : '', m.companiesUnique ? '收录企业 ' + fmt(m.companiesUnique) + ' 家' : '', m.noticesSoe ? '央国企公告 ' + fmt(m.noticesSoe) + ' 条' : ''].filter(Boolean).join(' · ');
}
// 页脚四处标记 + 页面标题
function stampMarks() {
  const fp = fpCode(), dh = dhCode();
  const ffp = document.getElementById('sfFp');
  if (ffp) { ffp.textContent = fp; ffp.appendChild(document.createTextNode(zwEncode(TRACE))); }
  const fdh = document.getElementById('sfDh'); if (fdh) fdh.textContent = dh;
  const ftr = document.getElementById('sfTr'); if (ftr) ftr.textContent = TRACE;
  const tp = document.getElementById('trace'); if (tp) tp.textContent = '圭煜 · 央国企求职站 · ' + TRACE;
  document.title = '央国企求职站（圭煜）｜ ' + fp;
}
// 复制站内任何文字，自动带上出处与本次追踪码
document.addEventListener('copy', e => {
  if (!e.clipboardData) return;
  const s = window.getSelection ? window.getSelection() : null;
  const sel = s ? String(s) : '';
  if (!sel || sel.length < 2) return;
  // 输入框 / 文本框里的复制不干预，只给页面正文加出处
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable) &&
      s.anchorNode && s.anchorNode.contains && s.anchorNode.contains(ae)) return;
  e.clipboardData.setData('text/plain', sel + '\n\n—— 来源：圭煜 · 央国企求职站（' + fpCode() + ' / ' + TRACE + '）');
  e.preventDefault();
});

function renderLegal() {
  const fp = fpCode(), dh = dhCode();
  const { params } = parseHash();
  view.innerHTML = `<div class="wrap page">
    <div class="page-head"><h2>免责声明 · 版权与防伪</h2></div>
    <div class="lg-card" id="lgMark">
      <div class="lg-seal">
        <div class="sf-seal big" aria-hidden="true"><span>圭</span><span>煜</span></div>
        <div>
          <div class="lg-seal-t">版本指纹</div>
          <div class="lg-fp" id="lgFp">${esc(fp)}</div>
          <div class="lg-seal-s">${esc(dataVerText())}</div>
        </div>
      </div>
      <div class="lg-kv">
        <span>数据校验码 <b>${esc(dh)}</b></span>
        <span>本次访问追踪码 <b>${esc(TRACE)}</b></span>
      </div>
      <p class="lg-note">本页用于声明作者身份与使用边界：本站由 <b>圭煜</b> 独立设计、开发与维护。认准本页的版本指纹、数据校验码与全站「圭煜」署名，谨防仿冒。</p>
    </div>

    <section class="lg-block">
      <h3>一、正版标识与防伪说明</h3>
      <p>本站（央国企求职站）是非商业性质的个人作品，作者为 <b>圭煜</b>。正版页面具备以下六个特征：</p>
      <ol class="lg-list">
        <li><b>署名</b>：顶栏品牌名下方标注「圭煜 出品」，页脚有「圭煜」印章与版权行；</li>
        <li><b>版本指纹</b>：形如 <b>${esc(fp)}</b>，写在页脚与标题上，数据每次更新都会变化；</li>
        <li><b>数据校验码</b>：页脚的 16 位校验码，只覆盖数据本身，用来核对两份数据是不是同一版；</li>
        <li><b>访问追踪码</b>：形如 <b>${esc(TRACE)}</b>，每打开一次都不一样，电脑端显示在页面左下角（手机上只在页脚显示），并以看不见的零宽字符嵌在页脚指纹里；</li>
        <li><b>背景水印</b>：全站铺有「版权所有 · 禁止盗用 · 圭煜」淡色水印，公告与企业的详情弹层里也有署名水印；</li>
        <li><b>复制来源标记</b>：从本站复制任何文字，粘贴时会自动带上「来源：圭煜 · 央国企求职站」与当时的版本指纹、追踪码。</li>
      </ol>
      <p>如果某个网站、小程序或 App 与本站内容高度相似，却没有上述署名、印章与标识，或者刻意抹掉、遮挡这些标识（去水印、去指纹后再发布），即为未经授权的复制、搬运或仿冒。</p>
      <p class="lg-tip">发现仿冒、盗用或售卖本站数据的线索，欢迎通过你获取本站的渠道告诉作者。</p>
    </section>

    <section class="lg-block">
      <h3>二、版权与防侵权</h3>
      <h4>2.1 授权范围</h4>
      <ol class="lg-list">
        <li>© ${new Date().getFullYear()} 圭煜，保留全部权利。个人学习、求职、研究可自由使用，无需授权。</li>
        <li>面向公众传播（转载、摘编、二次发布、做成榜单或数据集）与商业使用（售卖、付费内容、商业报告、培训材料）需事先取得<b>书面授权</b>。</li>
      </ol>
      <h4>2.2 明确禁止</h4>
      <ol class="lg-list">
        <li>批量爬取、镜像站点、整页复制、去水印或去指纹后再发布；</li>
        <li>把本站数据用于对外售卖、引流课、付费社群或任何形式的商业分发；</li>
        <li>抹除、伪造或替换页面中的水印、版本指纹、数据校验码与访问追踪码。</li>
      </ol>
      <h4>2.3 引用规范</h4>
      <ol class="lg-list">
        <li>引用请注明来源「央国企求职站（圭煜）」并保留版本指纹；引用具体条目时，建议同时保留该条目的原始出处与链接。</li>
      </ol>
      <h4>2.4 商标与名称</h4>
      <ol class="lg-list">
        <li>企业名称、商标与标识归各自权利人所有；本站仅作客观指称与信息索引，不含任何授权、合作或背书关系。</li>
      </ol>
    </section>

    <section class="lg-block">
      <h3>三、免责声明</h3>
      <ol class="lg-list">
        <li><b>信息性质。</b>本站是个人开发的求职信息聚合工具。招聘公告、企业名录、考试资料、专业与职业资料等均整理自公开渠道，只做汇总与索引，<b>仅供参考</b>，不构成任何推荐、承诺或保证。</li>
        <li><b>以官方为准。</b>整理内容可能存在滞后或误差，岗位、报名条件、截止时间、薪资待遇等一律以用人单位官方发布为准；据此作出的任何决定及后果由使用者自行负责。</li>
        <li><b>与用人单位的关系。</b>本站与所列企业、机构没有任何隶属、代理或合作关系。作者不提供、也不授权任何「内推、保录、代办、代投」服务。</li>
        <li><b>完全免费。</b>本站免费使用、不收费、不带货、不导流。若有人以本站或作者名义收费、索要押金，均属冒用，请勿相信并注意留存证据。</li>
        <li><b>第三方内容。</b>站内跳转的官网、PDF、外部链接均为第三方内容，其真实性、时效性与版权由原发布方负责，本站不承担连带责任。</li>
        <li><b>资料版权。</b>真题、报告等资料版权归原作者或原发布方所有，本站仅作索引与跳转；权利人如认为收录不妥，可联系删除。</li>
        <li><b>隐私说明。</b>本站不收集、不上传任何个人信息；收藏、投递记录等只保存在你自己的浏览器本地，清除浏览器数据会一并清除。</li>
        <li><b>风险提示。</b>因网络、设备、数据更新等原因造成的访问中断或信息偏差，本站不作担保；因使用或依赖本站信息产生的任何直接、间接损失，作者不承担责任。</li>
        <li><b>条款变更。</b>本页内容可能随功能调整而更新，更新后即时生效。</li>
      </ol>
    </section>

    <section class="lg-block">
      <h3>四、版本与更新</h3>
      <h4>4.1 版本指纹怎么读</h4>
      <ol class="lg-list">
        <li>格式 <b>GYQ-WEB-日期-哈希</b>，例如 ${esc(fp)}：中间 8 位是数据生成日期，最后 8 位是数据内容的哈希前缀。</li>
        <li>用途：数据一变指纹就变。页面上的指纹与官方发布的一致，说明你看到的就是这一版；别处出现本站数据时，也可以用指纹比对来源版本。</li>
      </ol>
      <h4>4.2 更新方式</h4>
      <ol class="lg-list">
        <li>公告与企业数据由本机脚本从公开渠道定期同步，整理入库后重新生成网站；每次更新后，版本指纹与数据校验码都会随之变化。</li>
        <li>「求职早报」按天汇总当天新增的央国企公告，数据同步后自动出现当天内容。</li>
      </ol>
      <h4>4.3 更新记录</h4>
      <ol class="lg-list">
        <li>2026-10-13：央国企求职站上线——求职早报、招聘公告（五级筛选）、企业名录（省市联动筛选）、网申跟踪、就业报告、专业概述、职业分析、行业分析；同版加入「圭煜」署名与全套防伪标识。</li>
      </ol>
    </section>

    <section class="lg-block">
      <h3>五、官方账号与联系</h3>
      <ol class="lg-list">
        <li><b>微信公众号「圭煜」</b>：更新通知与投稿进展都在这里发布，可直接搜索微信公众号：<b>Guiyus01</b>。</li>
        <li><b>小红书「圭煜」</b>（小红书号 <b>Ss1127592272</b>）：动态与私信。</li>
        <li>官方账号<b>只此两个</b>；任何以「内推 / 保 offer」名义收费的，都与本站无关。</li>
      </ol>
      <p class="lg-tip">本站不收费、不内推、不代办。凡是以「央国企求职站」或作者名义收费、索要押金、要求转账的，均属冒用，请勿相信并注意留存证据。</p>
    </section>

    <div class="lg-foot">© ${new Date().getFullYear()} 圭煜 · 保留所有权利 ｜ 版本指纹 ${esc(fp)} ｜ 数据校验码 ${esc(dh)} ｜ 本次访问追踪码 ${esc(TRACE)}</div>
  </div>`;
  const lf = document.getElementById('lgFp');
  if (lf) lf.appendChild(document.createTextNode(zwEncode(TRACE)));
  if (params && params.get('sec') === 'mark') {
    const el = document.getElementById('lgMark');
    if (el) el.scrollIntoView({ block: 'start' });
  }
}
function renderMine() {
  const tabs = [['favN', '公告收藏', state.fav.notices.length], ['favC', '企业收藏', state.fav.companies.length], ['applied', '已投递', state.applied.length], ['history', '浏览记录', state.history.length]];
  view.innerHTML = `<div class="wrap page">
    <div class="page-head"><h2>我的</h2></div>
    <button class="mine-follow" data-act="openFollow" title="关注圭煜">
      <span class="mf-badge">关</span>
      <span class="mf-txt"><b>关注圭煜</b><small>公众号 / 小红书 · 更新通知与进群入口</small></span>
      <span class="mf-go">看二维码 ›</span>
    </button>
    <div class="seg">${tabs.map(([k, label, n]) => `<button class="${state.mine.tab === k ? 'on' : ''}" data-act="mineTab" data-tab="${k}">${label}<small>${n}</small></button>`).join('')}</div>
    <div id="mineList"></div>
    <div class="mine-foot">
      <a href="#/legal">免责声明 · 版权与防伪</a>
      <span>© ${new Date().getFullYear()} 圭煜 · 保留所有权利</span>
    </div>
  </div>`;
  renderMineList();
}
function renderMineList() {
  const box = document.getElementById('mineList');
  if (!box) return;
  const t = state.mine.tab;
  if (t === 'favN') box.innerHTML = state.fav.notices.length ? `<div class="notice-list">${state.fav.notices.map(noticeItemHTML).join('')}</div>` : emptyMine('还没有收藏公告，看到合适的先点☆收藏', '#/notices', '去看公告');
  else if (t === 'favC') box.innerHTML = state.fav.companies.length ? `<div class="company-list">${state.fav.companies.map(companyItemHTML).join('')}</div>` : emptyMine('还没有收藏企业', '#/companies', '去逛企业');
  else if (t === 'applied') box.innerHTML = state.applied.length ? appliedSummaryHTML() + `<div class="notice-list">${state.applied.map(appliedItemHTML).join('')}</div>` : emptyMine('投递过的公告会出现在这里（在公告详情里点“标记投递”）', '#/notices', '去看公告');
  else box.innerHTML = state.history.length ? `<div class="notice-list">${state.history.map(noticeItemHTML).join('')}</div>` : emptyMine('暂无浏览记录', '#/notices', '去看看');
}
function emptyMine(text, href, btn) {
  return `<div class="empty"><div class="ico">🗒️</div><p>${esc(text)}</p><a class="btn warm" href="${href}">${esc(btn)}</a></div>`;
}

function appliedSummaryHTML() {
  const stat = {};
  for (const a of state.applied) { const k = applyStateName(a.status); stat[k] = (stat[k] || 0) + 1; }
  const order = APPLY_STATES.filter(s => stat[s]);
  return `<div class="ap-sum">${order.map(s => `<span class="chip chip-ap ${applyStateKind(APPLY_STATES.indexOf(s) + 1)}">${esc(s)} ${stat[s]}</span>`).join('')}<span class="ap-tip">点每条右侧「进展」可随时更新状态</span></div>`;
}

/* ---------- 选择抽屉（分类 / 单位 / 方向选择器） ---------- */
let picker = null;
function catCountOf(rp, c) {
  return (c.children && c.children.length) ? c.children.reduce((a, k) => a + (rp.items[k.id] || []).length, 0) : (rp.items[c.id] || []).length;
}
function pickerOpen(spec) {
  picker = Object.assign({ q: '' }, spec);
  document.body.classList.add('locked');
  let host = document.getElementById('pickerHost');
  if (!host) { host = document.createElement('div'); host.id = 'pickerHost'; document.body.appendChild(host); }
  host.innerHTML = `<div class="pk-mask" data-act="pkClose"></div>
    <div class="pk-panel">
      <div class="pk-head"><b>${esc(picker.title)}</b><span>共 ${picker.items.length} 个</span><button class="pk-x" data-act="pkClose">✕</button></div>
      ${picker.items.length > 12 ? `<div class="pk-search"><input id="pkQ" placeholder="搜索${esc(picker.short || '')}…" enterkeyhint="search" /></div>` : ''}
      <div class="pk-body" id="pkBody"></div>
    </div>`;
  pickerListPaint();
  const qi = document.getElementById('pkQ');
  if (qi) {
    qi.addEventListener('input', () => { picker.q = qi.value.trim().toLowerCase(); pickerListPaint(); });
    setTimeout(() => qi.focus(), 60);
  }
}
function pickerListPaint() {
  const box = document.getElementById('pkBody');
  if (!box || !picker) return;
  const list = picker.q ? picker.items.filter(x => String(x.name).toLowerCase().includes(picker.q)) : picker.items;
  box.innerHTML = list.length
    ? list.map(x => `<button class="pick2 ${x.id === picker.cur ? 'on' : ''}" data-act="pkPick" data-id="${esc(x.id)}">${esc(x.name)}<small>${fmt(x.n)}</small></button>`).join('')
    : '<p class="pk-empty">没有匹配项，换个关键词试试</p>';
}
function pickerClose() {
  const host = document.getElementById('pickerHost');
  if (host) host.remove();
  picker = null;
  if (overlay.hidden) document.body.classList.remove('locked');
}

/* ---------- 就业报告（笔试/面试真题库） ---------- */
const MAJOR_TYPE_LABEL = { '1': '本科', '2': '专科', '3': '本科（职业）', '4': '交叉学科' };
function reportItemHTML(it) {
  const url = safeUrl(it.fileUrl);
  const date = String(it.createTime || it.updateTime || '').slice(0, 10);
  const inner = `
    ${it.logo ? `<img class="rp-logo" src="${esc(it.logo)}" alt="" loading="lazy" />` : `<div class="rp-ico">PDF</div>`}
    <div class="rp-main">
      <div class="rp-name">${esc(it.reportName || '')}</div>
      <div class="rp-meta">${date ? esc(date) : ''}${it.typeName ? (date ? ' · ' : '') + esc(it.typeName) : ''}</div>
    </div>
    <span class="ni-arrow">›</span>`;
  return url
    ? `<a class="rp-item" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="rp-item">${inner}</div>`;
}
async function renderReport() {
  const rp = state.ext.reports;
  if (!rp) { view.innerHTML = `<div class="wrap page">${emptyDataHTML('就业报告数据还没生成')}</div>`; return; }
  const s = state.report;
  const total = (rp.exam.bi || []).length + (rp.exam.mian || []).length + Object.values(rp.items || {}).reduce((a, b) => a + b.length, 0);
  view.innerHTML = `<div class="wrap page">
    <div class="page-head"><h2>就业报告</h2><span class="page-count">笔试/面试真题 · 共 ${fmt(total)} 份</span></div>
    <div class="searchbox">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <input id="reportQ" placeholder="搜索报告名称，如：国家电网、行测、面试" value="${esc(s.q)}" enterkeyhint="search" />
    </div>
    <div class="seg" id="reportTabs">
      ${[['bi', `笔试真题 ${fmt((rp.exam.bi || []).length)}`], ['mian', `面试真题 ${fmt((rp.exam.mian || []).length)}`], ['cat', '企业真题']].map(([v, t]) => `<button class="${s.tab === v ? 'on' : ''}" data-act="rpTab" data-val="${v}">${t}</button>`).join('')}
    </div>
    <div id="reportBody"></div>
    <p class="d-note">资料整理自公开渠道，版权归原作者所有；点击条目在新窗口打开原件（PDF）。</p>
  </div>`;
  const input = document.getElementById('reportQ');
  input.addEventListener('input', debounce(e => { state.report.q = e.target.value.trim(); renderReportBody(); }, 260));
  renderReportBody();
}
function renderReportBody() {
  const el = document.getElementById('reportBody');
  if (!el) return;
  const rp = state.ext.reports, s = state.report;
  const q = s.q.trim().toLowerCase();
  const filt = arr => (q ? (arr || []).filter(x => String(x.reportName || '').toLowerCase().includes(q)) : (arr || []));
  if (s.tab === 'bi' || s.tab === 'mian') {
    const list = filt(s.tab === 'bi' ? rp.exam.bi : rp.exam.mian);
    el.innerHTML = list.length ? `<div class="rp-list">${list.map(reportItemHTML).join('')}</div>`
      : `<div class="empty"><div class="ico">🔍</div><p>没有匹配的报告，换个关键词试试</p></div>`;
    return;
  }
  const cats = rp.cats || [];
  if (!s.cat && cats.length) s.cat = cats[0].id;
  const cat = cats.find(c => c.id === s.cat) || cats[0];
  if (!cat) { el.innerHTML = `<div class="empty"><div class="ico">🗂️</div><p>暂无企业真题数据</p></div>`; return; }
  let leaf = cat;
  if (cat.children && cat.children.length) {
    if (!s.leaf || !cat.children.some(k => k.id === s.leaf)) s.leaf = cat.children[0].id;
    leaf = cat.children.find(k => k.id === s.leaf) || cat.children[0];
  } else s.leaf = '';
  const list = filt(rp.items[leaf.id]);
  const kids = cat.children || [];
  el.innerHTML = `
    <button class="selrow" data-act="rpPick" data-kind="cat"><span class="sel-k">分类</span><span class="sel-v">${esc(cat.name)}<small>${fmt(catCountOf(rp, cat))} 份</small></span><span class="sel-a">切换 ›</span></button>
    ${kids.length ? `<button class="selrow" data-act="rpPick" data-kind="leaf"><span class="sel-k">单位</span><span class="sel-v">${esc(leaf.name)}<small>${fmt((rp.items[leaf.id] || []).length)} 份</small></span><span class="sel-a">切换 ›</span></button>` : ''}
    ${list.length ? `<div class="rp-list">${list.map(reportItemHTML).join('')}</div>` : `<div class="empty"><div class="ico">🗂️</div><p>这一类暂时没有资料</p></div>`}`;
}

/* ---------- 专业概述 ---------- */
async function renderMajor() {
  const mj = state.ext.majors;
  if (!mj) { view.innerHTML = `<div class="wrap page">${emptyDataHTML('专业数据还没生成')}</div>`; return; }
  const s = state.major;
  view.innerHTML = `<div class="wrap page">
    <div class="page-head"><h2>专业概述</h2><span class="page-count">专业介绍 · 课程 · 就业方向 · 薪资参考</span></div>
    <div class="searchbox">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <input id="majorQ" placeholder="搜索专业名称，如：计算机、会计、电气" value="${esc(s.q)}" enterkeyhint="search" />
    </div>
    ${s.q ? '' : `<div class="seg" id="majorTypes">${Object.keys(MAJOR_TYPE_LABEL).map(t => `<button class="${s.type === t ? 'on' : ''}" data-act="mjType" data-val="${t}">${MAJOR_TYPE_LABEL[t]}</button>`).join('')}</div>`}
    <div id="majorBody"></div>
  </div>`;
  const input = document.getElementById('majorQ');
  input.addEventListener('input', debounce(e => { state.major.q = e.target.value.trim(); renderMajorBody(); }, 300));
  renderMajorBody();
}
function majorSearchResults(kw) {
  const out = [];
  const k = kw.toLowerCase();
  for (const t of Object.keys(state.ext.majors.types)) {
    for (const l1 of state.ext.majors.types[t]) for (const l2 of (l1.c || [])) for (const l3 of (l2.c || [])) {
      if (String(l3.name).toLowerCase().includes(k)) {
        out.push({ id: l3.id, name: l3.name, cat: l2.name, l1: l1.name, type: t });
        if (out.length >= 120) return out;
      }
    }
  }
  return out;
}
function renderMajorBody() {
  const el = document.getElementById('majorBody');
  if (!el) return;
  const s = state.major, mj = state.ext.majors;
  if (s.q) {
    const res = majorSearchResults(s.q);
    el.innerHTML = `<div class="chipwrap"><button class="pick2 on" data-act="mjClear">✕ 退出搜索</button></div>
      ${res.length ? `<div class="mj-list">${res.map(r => `<article class="mj-item" data-act="openMajor" data-id="${esc(r.id)}">
        <div class="mj-main"><div class="mj-name">${esc(r.name)}</div><div class="mj-meta">${esc(MAJOR_TYPE_LABEL[r.type] || '')} · ${esc(r.l1)} / ${esc(r.cat)}</div></div>
        <span class="ni-arrow">›</span></article>`).join('')}</div>` : `<div class="empty"><div class="ico">🔍</div><p>没找到这个专业，换个关键词试试</p></div>`}`;
    return;
  }
  const tree = mj.types[s.type] || [];
  if (!tree.length) { el.innerHTML = `<div class="empty"><div class="ico">🎓</div><p>这一类暂无数据</p></div>`; return; }
  const l1 = tree.find(x => x.name === s.l1) || tree[0];
  const l2list = l1.c || [];
  const l2 = l2list.find(x => x.name === s.l2) || l2list[0];
  const majors = (l2 && l2.c) || [];
  el.innerHTML = `
    <button class="selrow" data-act="mjPick" data-kind="l1"><span class="sel-k">专业大类</span><span class="sel-v">${esc(l1.name)}<small>${fmt((l1.c || []).reduce((a, b) => a + ((b.c || []).length), 0))} 个专业</small></span><span class="sel-a">切换 ›</span></button>
    ${l2list.length <= 8
      ? `<div class="chipwrap">${l2list.map(x => `<button class="pick2 ${l2 && x.name === l2.name ? 'on' : ''}" data-act="mjL2" data-val="${esc(x.name)}">${esc(x.name)}<small>${(x.c || []).length}</small></button>`).join('')}</div>`
      : `<button class="selrow" data-act="mjPick" data-kind="l2"><span class="sel-k">细分方向</span><span class="sel-v">${esc(l2 ? l2.name : '')}<small>${l2 && l2.c ? l2.c.length : 0} 个专业</small></span><span class="sel-a">切换 ›</span></button>`}
    <div class="mj-list">${majors.map(x => `<article class="mj-item" data-act="openMajor" data-id="${esc(x.id)}">
      <div class="mj-main"><div class="mj-name">${esc(x.name)}</div><div class="mj-meta">${esc(l1.name)} / ${esc(l2 ? l2.name : '')}</div></div>
      <span class="ni-arrow">›</span></article>`).join('')}</div>`;
}
async function renderMajorDetail(id) {
  let d;
  try { d = (await get('/api/major/' + encodeURIComponent(id))).data; }
  catch { sheet.innerHTML = '<div class="empty"><p>专业资料加载失败（需要联网获取）</p><button class="btn warm" data-act="closeSheet">返回</button></div>'; return; }
  const sec = (arr, title) => (Array.isArray(arr) && arr.length)
    ? `<div class="d-section"><h3>${title}</h3>${arr.map(x => `<div class="ext-item"><h4>${esc(x.title || '')}</h4><p>${esc(x.content || '')}</p></div>`).join('')}</div>` : '';
  const txt = (v, title) => {
    if (!v) return '';
    if (Array.isArray(v)) return sec(v, title);
    return `<div class="d-section"><h3>${title}</h3><p class="ext-text">${esc(v)}</p></div>`;
  };
  const kv = [['修业批次', d.undergraduateBatch], ['授予学位', d.degreeAwarded], ['专业排名', d.majorRanking ? '第 ' + d.majorRanking + ' 名' : ''], ['毕业期望薪资', d.expectedSalary ? '≈ ' + d.expectedSalary + ' 元/月' : ''], ['文理比例', d.liberalScienceRatio], ['男女比例', d.genderRatio]].filter(([, v]) => v);
  sheet.innerHTML = `
  <header class="sheet-head">
    <button class="icon-btn" data-act="closeSheet" title="返回">‹</button>
    <div class="sheet-head-title">专业概述</div>
    <span class="head-pad"></span>
  </header>
  <div class="sheet-body">
    <h1 class="d-title">${esc(d.majorNameInfo || '')}</h1>
    <div class="d-chips">${MAJOR_TYPE_LABEL[String(d.majorType)] ? `<span class="chip chip-tag">${MAJOR_TYPE_LABEL[String(d.majorType)]}</span>` : ''}${kv.slice(0, 3).map(([k, v]) => `<span class="chip">${esc(k)} · ${esc(v)}</span>`).join('')}</div>
    ${kv.length ? `<div class="kv-box">${kv.map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>` : ''}
    ${sec(d.majorIntroduction, '专业介绍')}
    ${sec(d.courseRequirements, '课程与要求')}
    ${sec(d.majorSatisfaction, '专业满意度')}
    ${sec(d.employmentRateSection, '就业率区间')}
    ${sec(d.industryInvolved, '就业行业分布')}
    ${txt(d.employmentDirection, '就业方向')}
    ${sec(d.specificPositions, '就业岗位与对口率')}
    <p class="d-note">资料整理自公开渠道，供选专业/选方向参考。</p>
  </div>
  <footer class="sheet-foot">
    <button class="btn primary grow" data-act="majorJobs" data-name="${esc(d.majorNameInfo || '')}">找该专业相关央国企岗位</button>
  </footer>`;
  sheet.querySelector('.sheet-body').scrollTop = 0;
}
const DETAIL_SEGS = { notice: 'notices', company: 'companies', majorinfo: 'major', careerinfo: 'career' };
let detailBack = null;
try { const s = sessionStorage.getItem('gq_detail_back'); if (s) detailBack = JSON.parse(s); } catch {}
function openDetail(kind, id) {
  const idKey = String(id);
  if (lastSeg && !DETAIL_SEGS[lastSeg]) detailBack = { id: idKey, kind, seg: lastSeg, y: window.scrollY };
  else if (!detailBack || detailBack.id !== idKey) detailBack = { id: idKey, kind, seg: DETAIL_SEGS[kind] || 'home', y: 0 };
  try { sessionStorage.setItem('gq_detail_back', JSON.stringify(detailBack)); } catch {}
  if (lastSeg) scrollPos[lastSeg] = window.scrollY;
  overlay.hidden = false;
  document.body.classList.add('locked');
  layerStack = null;
  sheet.innerHTML = '<div class="loading" style="padding:60px 0">加载中…</div>';
  if (kind === 'notice') renderNoticeDetail(id);
  else if (kind === 'company') renderCompanyDetail(id);
  else if (kind === 'majorinfo') renderMajorDetail(id);
  else renderProfessionDetail(id);
}
function closeOverlay(hide = true) {
  if (hide) { overlay.hidden = true; document.body.classList.remove('locked'); sheet.innerHTML = ''; }
}
function closeSheet() {
  closeOverlay();
  if (navCount > 1) { history.back(); return; }
  const seg = (detailBack && detailBack.seg) || 'home';
  history.replaceState(null, '', '#/' + seg);
  scrollPos[seg] = (detailBack && detailBack.y) || 0;
  route();
}

async function renderNoticeDetail(id) {
  let n;
  try { n = await get('/api/notice/' + encodeURIComponent(id)); }
  catch { sheet.innerHTML = '<div class="empty"><p>公告加载失败</p><button class="btn warm" data-act="closeSheet">返回</button></div>'; return; }
  pushHistory(n);
  const st = statusOf(n);
  const tags = splitTags(n.tag);
  const fav = isFavNotice(n.id);
  const send = safeUrl(n.sendUrl), notice = safeUrl(n.noticeUrl);
  const ap = applyOf(n.id);
  sheet.innerHTML = `
  <header class="sheet-head">
    <button class="icon-btn" data-act="closeSheet" title="返回">‹</button>
    <div class="sheet-head-title">招聘公告</div>
    <button class="icon-btn star ${fav ? 'on' : ''}" data-act="favNotice" data-id="${esc(n.id)}" title="收藏">${fav ? '★' : '☆'}</button>
  </header>
  <div class="sheet-body">
    <h1 class="d-title">${esc(n.title || '')}</h1>
    <div class="d-company">${esc(n.companyName || '')}<button class="link" data-act="findCompany" data-name="${esc(n.companyName || '')}">查该单位 ›</button></div>
    <div class="d-chips">
      ${tags.map(t => `<span class="chip chip-tag">${esc(t)}</span>`).join('')}
      ${n.education ? `<span class="chip">学历 · ${esc(n.education)}</span>` : ''}
      <span class="chip chip-st ${st.k}">${st.t}${n.endTime ? '（截止 ' + esc(String(n.endTime).slice(5, 10)) + '）' : ''}</span>
    </div>
    <div class="kv-box">
      ${n.education ? `<div class="kv"><span class="k">学历要求</span><span class="v">${esc(n.education)}</span></div>` : ''}
      ${n.area ? `<div class="kv"><span class="k">工作地区</span><span class="v">${esc(placeText(areaList(n.area), '、'))}</span></div>` : ''}
      ${n.industry ? `<div class="kv"><span class="k">所属行业</span><span class="v">${esc(String(n.industry).replace(/\|/g, ' / '))}</span></div>` : ''}
      ${n.startTime || n.endTime ? `<div class="kv"><span class="k">报名时间</span><span class="v">${esc(String(n.startTime || '—').slice(0, 10))} 至 ${esc(String(n.endTime || '—').slice(0, 10))}</span></div>` : ''}
      <div class="kv"><span class="k">发布时间</span><span class="v">${esc(String(n.createTime || '').slice(0, 16))}</span></div>
    </div>
    <div class="d-section">
      <h3>招聘详情</h3>
      <div class="d-body">${esc(detailText(n.noticeDetails) || '暂无文字详情，请点击下方按钮查看公告原文。')}</div>
    </div>
    <p class="d-note">信息整理自公开招聘渠道，可能存在更新延迟；投递前请到用人单位官方页面核实岗位与时间。</p>
  </div>
  <footer class="sheet-foot">
    ${send ? `<a class="btn primary grow" href="${esc(send)}" target="_blank" rel="noopener">立即网申</a>` : ''}
    ${send ? `<button class="btn ghost" data-act="copyLink" data-url="${esc(send)}" title="复制网申链接">复制链接</button>` : ''}
    ${notice && notice !== send ? `<a class="btn ghost grow" href="${esc(notice)}" target="_blank" rel="noopener">公告原文</a>` : ''}
    <button class="btn ${ap ? 'warm' : 'ghost'}" data-act="apply" data-id="${esc(n.id)}">${ap ? esc('已投递 · ' + applyStateName(ap.status)) : '标记投递 · 记进展'}</button>
  </footer>`;
  sheet.querySelector('.sheet-body').scrollTop = 0;
}

async function renderCompanyDetail(id) {
  let d;
  try { d = await get('/api/company/' + encodeURIComponent(id)); }
  catch { sheet.innerHTML = '<div class="empty"><p>企业信息加载失败</p><button class="btn warm" data-act="closeSheet">返回</button></div>'; return; }
  const c = d.company || {};
  const fav = isFavCompany(c.id);
  const url = safeUrl(c.recruitmentLink) || safeUrl(c.website);
  const isRecruit = safeUrl(c.recruitmentLink) ? '招聘官网' : '企业官网';
  sheet.innerHTML = `
  <header class="sheet-head">
    <button class="icon-btn" data-act="closeSheet" title="返回">‹</button>
    <div class="sheet-head-title">企业详情</div>
    <button class="icon-btn star ${fav ? 'on' : ''}" data-act="favCompany" data-id="${esc(c.id)}" title="收藏">${fav ? '★' : '☆'}</button>
  </header>
  <div class="sheet-body">
    <h1 class="d-title">${esc(c.companyName || '')}</h1>
    <div class="d-chips">
      ${c.categoryGroup ? `<span class="chip chip-tag">${esc(c.categoryGroup)}</span>` : ''}
      ${c.type ? `<span class="chip">${esc(c.type)}</span>` : ''}
      ${c.companySize ? `<span class="chip">${esc(c.companySize)}</span>` : ''}
    </div>
    <div class="kv-box">
      ${c.supervisoryAuthority ? `<div class="kv"><span class="k">监管部门</span><span class="v">${esc(c.supervisoryAuthority)}</span></div>` : ''}
      ${c.division || c.mainCategory ? `<div class="kv"><span class="k">所属行业</span><span class="v">${esc([c.division, c.mainCategory].filter(Boolean).join(' · '))}</span></div>` : ''}
      ${c.provName || c.cityName ? `<div class="kv"><span class="k">所在地</span><span class="v">${esc(placeText([c.provName, c.cityName, c.areaName]))}</span></div>` : ''}
      ${c.address ? `<div class="kv"><span class="k">注册地址</span><span class="v">${esc(c.address)}</span></div>` : ''}
      ${c.foundingDate ? `<div class="kv"><span class="k">成立日期</span><span class="v">${esc(String(c.foundingDate).slice(0, 10))}</span></div>` : ''}
      ${c.telephoneNumber ? `<div class="kv"><span class="k">联系电话</span><span class="v">${esc(c.telephoneNumber)}</span></div>` : ''}
      ${c.email ? `<div class="kv"><span class="k">电子邮箱</span><span class="v">${esc(c.email)}</span></div>` : ''}
      ${safeUrl(c.website) ? `<div class="kv"><span class="k">官方网站</span><span class="v"><a href="${esc(safeUrl(c.website))}" target="_blank" rel="noopener">${esc(c.website)}</a></span></div>` : ''}
    </div>
    ${c.companyProfile ? `<div class="d-section"><h3>企业简介</h3><div class="d-profile clamp" id="cProfile">${esc(detailText(c.companyProfile))}</div><button class="d-more" data-act="expandProfile">展开全文 ▾</button></div>` : ''}
    <div class="d-section">
      <h3>相关招聘公告${d.notices.length ? `（${d.notices.length}）` : ''}</h3>
      ${d.notices.length ? `<div class="notice-list">${d.notices.map(noticeItemHTML).join('')}</div>` : '<p class="muted" style="font-size:13px">暂未收录该单位近期公告，可点击下方按钮前往官方招聘页查看。</p>'}
    </div>
    <p class="d-note">企业信息整理自公开渠道，仅供参考。</p>
  </div>
  <footer class="sheet-foot">
    ${url ? `<a class="btn primary grow" href="${esc(url)}" target="_blank" rel="noopener">${isRecruit} / 投递入口</a>` : ''}
    <button class="btn ghost" data-act="favCompany" data-id="${esc(c.id)}">${fav ? '已收藏 ★' : '收藏该企业 ☆'}</button>
  </footer>`;
  sheet.querySelector('.sheet-body').scrollTop = 0;
}

/* ---------- 职业分析 ---------- */
async function renderCareer() {
  const pf = state.ext.professions;
  if (!pf) { view.innerHTML = `<div class="wrap page">${emptyDataHTML('职业数据还没生成')}</div>`; return; }
  const s = state.career;
  const tree = pf.tree || [];
  const curCat = tree.find(x => x.name === s.cat) || tree[0];
  view.innerHTML = `<div class="wrap page">
    <div class="page-head"><h2>职业分析</h2><span class="page-count">职业介绍 · 工作内容 · 技能薪酬 · 发展前景</span></div>
    <div class="searchbox">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <input id="careerQ" placeholder="搜索职业，如：翻译、会计、电气工程师" value="${esc(s.q)}" enterkeyhint="search" />
    </div>
    <button class="selrow" data-act="crPick"><span class="sel-k">职业类别</span><span class="sel-v">${esc(curCat ? curCat.name : '')}<small>${curCat ? (curCat.c || []).length : 0} 个职业</small></span><span class="sel-a">切换 ›</span></button>
    <div id="careerBody"></div>
  </div>`;
  const input = document.getElementById('careerQ');
  input.addEventListener('input', debounce(e => { state.career.q = e.target.value.trim(); renderCareerBody(); }, 300));
  renderCareerBody();
}
function renderCareerBody() {
  const el = document.getElementById('careerBody');
  if (!el) return;
  const s = state.career, tree = (state.ext.professions || {}).tree || [];
  const kw = s.q.trim().toLowerCase();
  if (kw) {
    const res = [];
    for (const c of tree) for (const p of (c.c || [])) {
      if (String(p.name).toLowerCase().includes(kw)) { res.push({ id: p.id, name: p.name, cat: c.name }); if (res.length >= 100) break; }
    }
    el.innerHTML = res.length ? `<div class="mj-list">${res.map(r => `<article class="mj-item" data-act="openProfession" data-id="${esc(r.id)}">
      <div class="mj-main"><div class="mj-name">${esc(r.name)}</div><div class="mj-meta">${esc(r.cat)}</div></div><span class="ni-arrow">›</span></article>`).join('')}</div>`
      : `<div class="empty"><div class="ico">🔍</div><p>没找到这个职业，换个关键词试试</p></div>`;
    return;
  }
  const cat = tree.find(x => x.name === s.cat) || tree[0];
  if (!cat) { el.innerHTML = ''; return; }
  s.cat = cat.name;
  el.innerHTML = `<div class="mj-list">${(cat.c || []).map(p => `<article class="mj-item" data-act="openProfession" data-id="${esc(p.id)}">
    <div class="mj-main"><div class="mj-name">${esc(p.name)}</div><div class="mj-meta">${esc(cat.name)}</div></div><span class="ni-arrow">›</span></article>`).join('')}</div>`;
  scrollChipsActive();
}
async function renderProfessionDetail(id) {
  let d;
  try { d = (await get('/api/profession/' + encodeURIComponent(id))).data; }
  catch { sheet.innerHTML = '<div class="empty"><p>职业资料加载失败（需要联网获取）</p><button class="btn warm" data-act="closeSheet">返回</button></div>'; return; }
  const sec = (arr, title) => (Array.isArray(arr) && arr.length)
    ? `<div class="d-section"><h3>${title}</h3>${arr.map(x => `<div class="ext-item"><h4>${esc(x.title || '')}</h4><p>${esc(x.content || '')}</p></div>`).join('')}</div>` : '';
  const txt = (v, title) => {
    if (!v) return '';
    if (Array.isArray(v)) return sec(v, title);
    return `<div class="d-section"><h3>${title}</h3><p class="ext-text">${esc(v)}</p></div>`;
  };
  sheet.innerHTML = `
  <header class="sheet-head">
    <button class="icon-btn" data-act="closeSheet" title="返回">‹</button>
    <div class="sheet-head-title">职业分析</div>
    <span class="head-pad"></span>
  </header>
  <div class="sheet-body">
    <h1 class="d-title">${esc(d.professionName || '')}</h1>
    ${txt(d.professionIntroduction, '职业简介')}
    ${txt(d.professionDefinition, '职业定义')}
    ${sec(d.responsibilities, '工作内容与职责')}
    ${sec(d.workEnvironment, '工作环境')}
    ${txt(d.educationRequirements, '学历要求')}
    ${txt(d.industryKnowledge, '行业知识')}
    ${txt(d.professionalKnowledge, '专业知识')}
    ${txt(d.universityCourses, '对口课程')}
    ${sec(d.vocationalSkills, '职业技能')}
    ${sec(d.qualifications, '资格证书')}
    ${txt(d.professionalEthics, '职业道德')}
    ${sec(d.developmentOutlook, '发展前景')}
    ${sec(d.salaryTreatment, '薪酬待遇')}
    <p class="d-note">资料整理自公开渠道，供职业规划参考。</p>
  </div>
  <footer class="sheet-foot">
    <button class="btn primary grow" data-act="careerJobs" data-name="${esc(d.professionName || '')}">找该职业相关央国企岗位</button>
  </footer>`;
  sheet.querySelector('.sheet-body').scrollTop = 0;
}

/* ---------- 行业分析 ---------- */
async function renderIndustry() {
  const ind = state.ext.industry;
  if (!ind) { view.innerHTML = `<div class="wrap page">${emptyDataHTML('行业数据还没生成')}</div>`; return; }
  const s = state.industry;
  const items = ind.items || [], divisions = ind.divisions || [];
  const maxN = Math.max(1, ...items.map(x => x.notices));
  const maxC = Math.max(1, ...divisions.map(x => x.count));
  view.innerHTML = `<div class="wrap page">
    <div class="page-head"><h2>行业分析</h2><span class="page-count">数据截至 ${esc(ind.latest || '')}</span></div>
    <div class="seg" id="indTabs">
      <button class="${s.tab === 'notice' ? 'on' : ''}" data-act="indTab" data-val="notice">招聘热度 ${fmt(items.length)}</button>
      <button class="${s.tab === 'company' ? 'on' : ''}" data-act="indTab" data-val="company">企业分布 ${fmt(divisions.length)}</button>
    </div>
    ${s.tab === 'notice'
      ? `<p class="ind-tip">按近期央国企公告统计，点行业看该行业在招公告。</p>
        <div class="ind-list">${items.map(x => `<article class="ind-card" data-act="indOpen" data-id="${esc(x.id || x.name)}" data-name="${esc(x.name)}">
          <div class="ind-top"><b>${esc(x.name)}</b><span class="ind-num">${fmt(x.notices)} 条公告</span></div>
          <div class="ind-bar"><i style="width:${Math.max(4, Math.round(x.notices / maxN * 100))}%"></i></div>
          <div class="ind-meta">近7天新增 <b>${fmt(x.recent7)}</b> · 涉及单位 <b>${fmt(x.companies)}</b> 家${x.topCompanies.length ? ' · ' + x.topCompanies.map(t => esc(t.name)).join('、') : ''}</div>
        </article>`).join('')}</div>`
      : `<p class="ind-tip">按企业名录统计，点行业看该行业有哪些企业。</p>
        <div class="ind-list">${divisions.map(x => `<article class="ind-card" data-act="indCompany" data-name="${esc(x.name)}">
          <div class="ind-top"><b>${esc(x.name)}</b><span class="ind-num">${fmt(x.count)} 家企业</span></div>
          <div class="ind-bar"><i style="width:${Math.max(4, Math.round(x.count / maxC * 100))}%"></i></div>
          <div class="ind-meta">央企 ${fmt(x.group.central)} · 省属 ${fmt(x.group.provincial)} · 地方 ${fmt(x.group.municipal)}${x.provinces.length ? ' · ' + x.provinces.map(p => esc(p.name)).join('、') : ''}</div>
        </article>`).join('')}</div>`}
    <p class="d-note">统计基于站内已收录的公告与企业数据，随数据更新自动变化。</p>
  </div>`;
}
function emptyDataHTML(msg) {
  const isGH = /\.github\.io$/i.test(location.hostname);
  return `<div class="empty"><div class="ico">🧰</div><p>${esc(msg)}</p><p class="tip">${isGH ? '换个网络或刷新重试；若一直如此，请回首页重新进入。' : '站点数据由本地服务提供，请先运行「启动预览.bat」再打开页面。'}</p></div>`;
}
// 横向芯片行自动滚到当前选中项
function scrollChipsActive() {
  document.querySelectorAll('.chipsline').forEach(line => {
    const on = line.querySelector('.pick.on');
    if (!on) return;
    const lr = line.getBoundingClientRect(), cr = on.getBoundingClientRect();
    if (cr.left < lr.left || cr.right > lr.right) line.scrollLeft += (cr.left - lr.left) - (lr.width - cr.width) / 2;
  });
}
function goNoticeSearch(params) {
  applyNoticeParams(new URLSearchParams(params || {}));
  if (parseHash().seg === 'notices') route(); else location.hash = '#/notices';
}
function goCompanyFilter(params) {
  applyCoParams(new URLSearchParams(params || {}));
  if (parseHash().seg === 'companies') route(); else location.hash = '#/companies';
}

/* ---------- 投递进展选择层 ---------- */
let layerStack = null;
function openLayer(html) { layerStack = sheet.innerHTML; overlay.hidden = false; document.body.classList.add('locked'); sheet.innerHTML = html; sheet.querySelector('.sheet-body').scrollTop = 0; }
function closeLayer() {
  if (layerStack !== null) { sheet.innerHTML = layerStack; layerStack = null; }
  else closeOverlay();
}
/* ---------- 关注圭煜：二维码（base64 内嵌，随站发布）与弹层 ---------- */
const QR_WECHAT = 'data:image/png;base64,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';
const QR_XHS = 'data:image/png;base64,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';
function openFollowSheet() {
  if (lastSeg) scrollPos[lastSeg] = window.scrollY;
  overlay.hidden = false;
  document.body.classList.add('locked');
  layerStack = null;
  sheet.innerHTML = `
  <header class="sheet-head">
    <button class="icon-btn" data-act="closeSheet" title="返回">‹</button>
    <div class="sheet-head-title">关注圭煜</div>
    <span class="head-pad"></span>
  </header>
  <div class="sheet-body">
    <p class="fol-lead">更新通知、进群交流、报喜与纠错进度，都在这里；官方账号<b>只此两个</b>，谨防仿冒。</p>
    <div class="fol-card">
      <img class="fol-qr" src="${QR_WECHAT}" alt="微信公众号「圭煜」二维码" />
      <div class="fol-meta">
        <h4>微信公众号「圭煜」</h4>
        <p>关注后发送「<b>圭煜的群</b>」，获取央国企交流群入口。</p>
        <p class="fol-id">Guiyus01<button class="btn ghost fol-copy" data-act="copyText" data-text="Guiyus01" data-msg="公众号已复制：Guiyus01">复制</button></p>
      </div>
    </div>
    <div class="fol-card">
      <img class="fol-qr" src="${QR_XHS}" alt="小红书「圭煜」二维码" />
      <div class="fol-meta">
        <h4>小红书「圭煜」</h4>
        <p>求职动态、上岸报喜与私信，都在小红书。</p>
        <p class="fol-id">Ss1127592272<button class="btn ghost fol-copy" data-act="copyText" data-text="Ss1127592272" data-msg="小红书号已复制：Ss1127592272">复制</button></p>
      </div>
    </div>
    <p class="fol-tip">手机看：长按二维码可保存或识别；电脑看：用手机微信 / 小红书扫码即可。</p>
    <div class="fol-safe">官方账号只此两个：微信公众号「圭煜」（Guiyus01）、小红书「圭煜」（Ss1127592272）。<b>任何以「内推 / 保 offer」名义收费的都与本站无关。</b></div>
  </div>
  <footer class="sheet-foot">
    <button class="btn primary grow" data-act="closeSheet">知道了</button>
  </footer>`;
  sheet.querySelector('.sheet-body').scrollTop = 0;
}
async function openApplyPicker(id) {
  let n = state.notice.list.find(x => String(x.id) === String(id))
    || state.applied.find(x => String(x.id) === String(id))
    || state.history.find(x => String(x.id) === String(id))
    || state.brief.data?.list.find(x => String(x.id) === String(id));
  if (!n) { try { n = await get('/api/notice/' + encodeURIComponent(id)); } catch {} }
  if (!n) { toast('公告信息加载失败'); return; }
  const cur = applyOf(n.id);
  const curS = cur ? Number(cur.status || 1) : 0;
  openLayer(`
  <header class="sheet-head">
    <button class="icon-btn" data-act="layerClose" title="返回">‹</button>
    <div class="sheet-head-title">投递进展</div>
    <span class="head-pad"></span>
  </header>
  <div class="sheet-body">
    <p class="ap-company">${esc(n.companyName || '')}</p>
    <p class="ap-notice">${esc(n.title || '')}</p>
    <p class="ap-hint">选择这条投递的当前进度，随时可改；记录只保存在本机浏览器里。</p>
    <div class="ap-grid">
      ${APPLY_STATES.map((s, i) => `<button class="ap-pick ${applyStateKind(i + 1)} ${curS === i + 1 ? 'on' : ''}" data-act="applySet" data-id="${esc(n.id)}" data-status="${i + 1}">${esc(s)}</button>`).join('')}
    </div>
    ${cur ? `<div class="ap-foot"><button class="btn ghost" data-act="applySet" data-id="${esc(n.id)}" data-status="0">删除投递记录</button></div>` : ''}
  </div>`);
}

/* ---------- 全局事件 ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case 'openNotice': e.preventDefault(); location.hash = '#/notice/' + el.dataset.id; break;
    case 'openCompany': e.preventDefault(); location.hash = '#/company/' + el.dataset.id; break;
    case 'openMajor': e.preventDefault(); location.hash = '#/majorinfo/' + el.dataset.id; break;
    case 'openProfession': e.preventDefault(); location.hash = '#/careerinfo/' + el.dataset.id; break;
    case 'rpTab': state.report.tab = el.dataset.val; state.report.q = ''; document.querySelectorAll('#reportTabs button').forEach(b => b.classList.toggle('on', b.dataset.val === state.report.tab)); renderReportBody(); break;
    case 'rpLeaf': state.report.leaf = el.dataset.id; renderReportBody(); break;
    case 'rpPick': {
      const rp = state.ext.reports, s = state.report;
      const cats = rp.cats || [];
      const cat = cats.find(c => c.id === s.cat) || cats[0];
      if (!cat) break;
      if (el.dataset.kind === 'cat') {
        pickerOpen({
          title: '选择分类', short: '分类', cur: cat.id,
          items: cats.map(c => ({ id: c.id, name: c.name, n: catCountOf(rp, c) })),
          pick: id => { s.cat = id; s.leaf = ''; renderReportBody(); }
        });
      } else {
        const items = (cat.children || []).map(k => ({ id: k.id, name: k.name, n: (rp.items[k.id] || []).length })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh'));
        pickerOpen({ title: '选择单位', short: '单位', cur: s.leaf, items, pick: id => { s.leaf = id; renderReportBody(); } });
      }
      break;
    }
    case 'mjType': state.major.type = el.dataset.val; state.major.l1 = ''; state.major.l2 = ''; renderMajor(); break;
    case 'mjL1': state.major.l1 = el.dataset.val; state.major.l2 = ''; renderMajorBody(); break;
    case 'mjL2': state.major.l2 = el.dataset.val; renderMajorBody(); break;
    case 'mjPick': {
      const s = state.major, mj = state.ext.majors;
      const tree = mj.types[s.type] || [];
      const l1 = tree.find(x => x.name === s.l1) || tree[0];
      if (!l1) break;
      if (el.dataset.kind === 'l1') {
        pickerOpen({ title: '选择专业大类', short: '大类', cur: l1.name,
          items: tree.map(x => ({ id: x.name, name: x.name, n: (x.c || []).reduce((a, b) => a + ((b.c || []).length), 0) })),
          pick: v => { s.l1 = v; s.l2 = ''; renderMajorBody(); } });
      } else {
        const l2list = l1.c || [];
        pickerOpen({ title: '选择细分方向', short: '方向', cur: s.l2 || (l2list[0] ? l2list[0].name : ''),
          items: l2list.map(x => ({ id: x.name, name: x.name, n: (x.c || []).length })),
          pick: v => { s.l2 = v; renderMajorBody(); } });
      }
      break;
    }
    case 'mjClear': {
      state.major.q = '';
      const qi = document.getElementById('majorQ'); if (qi) qi.value = '';
      renderMajor();
      break;
    }
    case 'crPick': {
      const s = state.career, pf = state.ext.professions || {};
      const tree = pf.tree || [];
      pickerOpen({ title: '选择职业类别', short: '类别', cur: s.cat,
        items: tree.map(x => ({ id: x.name, name: x.name, n: (x.c || []).length })),
        pick: v => { s.cat = v; renderCareer(); } });
      break;
    }
    case 'pkClose': pickerClose(); break;
    case 'pkPick': { const P = picker; const id = el.dataset.id; pickerClose(); if (P && P.pick) P.pick(id); break; }
    case 'indTab': state.industry.tab = el.dataset.val; renderIndustry(); break;
    case 'indOpen': goNoticeSearch({ industry: el.dataset.id || el.dataset.name }); break;
    case 'indCompany': goCompanyFilter({ div: el.dataset.name }); break;
    case 'majorJobs': goNoticeSearch({ q: el.dataset.name }); break;
    case 'careerJobs': {
      const name = String(el.dataset.name || '');
      closeOverlay();
      goNoticeSearch({ q: name });
      break;
    }
    case 'favNotice': {
      e.stopPropagation();
      let n = state.notice.list.find(x => String(x.id) === String(el.dataset.id))
        || state.brief.data?.list.find(x => String(x.id) === String(el.dataset.id))
        || state.fav.notices.find(x => String(x.id) === String(el.dataset.id))
        || state.applied.find(x => String(x.id) === String(el.dataset.id))
        || state.history.find(x => String(x.id) === String(el.dataset.id));
      const wasFav = isFavNotice(el.dataset.id);
      if (!n && !wasFav) { try { n = await get('/api/notice/' + encodeURIComponent(el.dataset.id)); } catch {} }
      if (n) { toggleFavNotice(n); const on = isFavNotice(n.id); el.classList.toggle('on', on); el.textContent = on ? '★' : '☆'; if (state.mine.tab === 'favN' && document.getElementById('mineList')) renderMineList(); }
      break;
    }
    case 'favCompany': {
      e.stopPropagation();
      let c = state.company.list.find(x => String(x.id) === String(el.dataset.id))
        || state.fav.companies.find(x => String(x.id) === String(el.dataset.id));
      const wasFav = isFavCompany(el.dataset.id);
      if (!c && !wasFav) { try { const d = await get('/api/company/' + encodeURIComponent(el.dataset.id)); c = d.company; } catch {} }
      if (c) { toggleFavCompany(c); document.querySelectorAll(`[data-act="favCompany"][data-id="${CSS.escape(String(c.id))}"]`).forEach(b => { const on = isFavCompany(c.id); b.classList.toggle('on', on); if (b.classList.contains('icon-btn') || b.classList.contains('ni-star')) b.textContent = on ? '★' : '☆'; else b.textContent = on ? '已收藏 ★' : '收藏该企业 ☆'; }); if (state.mine.tab === 'favC' && document.getElementById('mineList')) renderMineList(); }
      break;
    }
    case 'apply': await openApplyPicker(el.dataset.id); break;
    case 'layerClose': closeLayer(); break;
    case 'openFollow': location.hash = '#/follow'; break;
    case 'copyText': {
      const txt = el.dataset.text || '';
      try { await navigator.clipboard.writeText(txt); toast(el.dataset.msg || ('已复制：' + txt)); }
      catch { window.prompt('复制下面的内容：', txt); }
      break;
    }
    case 'applySet': {
      const id = el.dataset.id, status = Number(el.dataset.status);
      let n = state.notice.list.find(x => String(x.id) === String(id))
        || state.applied.find(x => String(x.id) === String(id))
        || state.history.find(x => String(x.id) === String(id))
        || state.brief.data?.list.find(x => String(x.id) === String(id));
      if (!n) { try { n = await get('/api/notice/' + encodeURIComponent(id)); } catch {} }
      if (n) {
        setApplied(n, status);
        closeLayer();
        if (parseHash().seg === 'notice') renderNoticeDetail(id);
        else if (state.mine.tab === 'applied' && document.getElementById('mineList')) renderMine();
      }
      break;
    }
    case 'copyLink': {
      const url = el.dataset.url || '';
      try { await navigator.clipboard.writeText(url); toast('已复制，可粘贴到浏览器打开'); }
      catch { window.prompt('复制下面的链接：', url); }
      break;
    }
    case 'briefDate': if (state.brief.date !== el.dataset.date) { state.brief.date = el.dataset.date; renderBrief(); } break;
    case 'briefAll':
      state.notice.from = el.dataset.date; state.notice.to = el.dataset.date;
      state.notice.dirty = true; location.hash = '#/notices'; break;
    case 'loadNotices': await loadNotices(false); break;
    case 'loadCompanies': await loadCompanies(false); break;
    case 'clearNoticeQ': state.notice.q = ''; await refreshNoticesShell(true); break;
    case 'clearIndustry': state.notice.industry = ''; await refreshNoticesShell(true); break;
    case 'clearCompanyQ': {
      state.company.q = '';
      const el2 = document.getElementById('companyQ'); if (el2) el2.value = '';
      document.querySelector('.searchrow2 .clear')?.remove();
      await loadCompanies(true);
      break;
    }
    case 'openCoFilter': {
      document.getElementById('coFilters')?.classList.add('open');
      document.getElementById('coScrim')?.classList.add('show');
      document.body.classList.add('sheet-open', 'locked');
      break;
    }
    case 'coDone': closeCoSheet(); break;
    case 'coGroup': {
      state.company.group = el.dataset.val || '';
      syncCoControls();
      await loadCompanies(true);
      break;
    }
    case 'coReset': {
      const s = state.company;
      s.q = ''; s.group = ''; s.prov = ''; s.city = ''; s.div = ''; s.scale = ''; s.favOnly = false;
      document.querySelector('.searchrow2 .clear')?.remove();
      syncCoControls();
      await loadCompanies(true);
      break;
    }
    case 'coFavToggle': {
      const s = state.company;
      if (!s.favOnly && !state.fav.companies.length) { toast('还没有收藏企业，先点卡片上的 ☆ 收藏吧'); break; }
      s.favOnly = !s.favOnly;
      syncCoControls();
      await loadCompanies(true);
      break;
    }
    case 'coShare': {
      const s = state.company;
      const qset = qs({ group: s.group, prov: s.prov, city: s.city, div: s.div, scale: s.scale, sort: s.sort, q: s.q, fav: s.favOnly ? 1 : '' });
      const url = location.origin + location.pathname + '#/companies' + (qset ? '?' + qset : '');
      try { await navigator.clipboard.writeText(url); toast('筛选链接已复制'); }
      catch { window.prompt('复制下面的筛选链接：', url); }
      break;
    }
    case 'openNoFilter': {
      syncNoControls();
      document.getElementById('noFilters')?.classList.add('open');
      document.getElementById('noScrim')?.classList.add('show');
      document.body.classList.add('sheet-open', 'locked');
      break;
    }
    case 'noDone': closeNoSheet(); break;

    case 'noGroup': {
      state.notice.ptype = el.dataset.val || '';
      syncNoControls();
      await loadNotices(true);
      break;
    }
    case 'noClear': {
      const s = state.notice, key = el.dataset.key || '';
      if (key === 'time') { s.from = ''; s.to = ''; }
      else if (key === 'prov') { s.prov = ''; s.city = ''; }
      else if (key === 'q') { s.q = ''; const qi = document.getElementById('noticeQ'); if (qi) qi.value = ''; document.querySelector('.searchrow2 .clear')?.remove(); }
      else if (key) s[key] = '';
      syncNoControls();
      await loadNotices(true);
      break;
    }
    case 'noReset': {
      const s = state.notice;
      s.q = ''; s.tag = ''; s.area = ''; s.edu = ''; s.from = ''; s.to = ''; s.industry = '';
      s.ptype = ''; s.status = ''; s.prov = ''; s.city = ''; s.grade = '';
      const qi = document.getElementById('noticeQ'); if (qi) qi.value = '';
      document.querySelector('.searchrow2 .clear')?.remove();
      syncNoControls();
      await loadNotices(true);
      break;
    }
    case 'noShare': {
      const s = state.notice;
      const qset = qs({ q: s.q, ptype: s.ptype, status: s.status, prov: s.prov, city: s.city, edu: s.edu, grade: s.grade, from: s.from, to: s.to, industry: s.industry });
      const url = location.origin + location.pathname + '#/notices' + (qset ? '?' + qset : '');
      try { await navigator.clipboard.writeText(url); toast('筛选链接已复制'); }
      catch { window.prompt('复制下面的筛选链接：', url); }
      break;
    }
    case 'mineTab': state.mine.tab = el.dataset.tab; renderMine(); break;
    case 'mineTabGo': {
      e.preventDefault();
      state.mine.tab = el.dataset.tab;
      if (parseHash().seg === 'mine') renderMine();
      else location.hash = '#/mine';
      break;
    }
    case 'heroSearch': doHeroSearch(el.dataset.mode, document.getElementById('heroInput').value); break;
    case 'heroHot': { const qi = document.getElementById('heroInput'); if (qi) qi.value = el.dataset.q; doHeroSearch('notice', el.dataset.q); break; }
    case 'closeSheet': closeSheet(); break;
    case 'findCompany': state.company.q = el.dataset.name; state.company.loaded = false; location.hash = '#/companies'; break;
    case 'expandProfile': {
      const p = document.getElementById('cProfile');
      if (p) { p.classList.toggle('clamp'); el.textContent = p.classList.contains('clamp') ? '展开全文 ▾' : '收起 ▴'; }
      break;
    }
  }
});

overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (picker) { pickerClose(); return; } if (!overlay.hidden) closeSheet(); });
window.addEventListener('hashchange', () => route());
document.addEventListener('change', e => {
  const nel = e.target.closest('#noFilters select[data-nsel]');
  if (nel) {
    const s = state.notice, key = nel.dataset.nsel, val = nel.value;
    if (key === 'prov') { s.prov = val; s.city = ''; }
    else if (key === 'city') { s.city = val; }
    else if (key === 'time') {
      const t = todayStr();
      const map = { '': ['', ''], today: [t, t], '3d': [dateAdd(t, -2), t], '7d': [dateAdd(t, -6), t], '30d': [dateAdd(t, -29), t], custom: [s.from, s.to] };
      const pair = map[val] || ['', ''];
      s.from = pair[0]; s.to = pair[1];
    } else if (key) s[key] = val;
    syncNoControls();
    loadNotices(true);
    return;
  }
  const el = e.target.closest('[data-sel]');
  if (!el) return;
  state.company[el.dataset.sel] = el.value;
  if (el.dataset.sel === 'prov') { state.company.city = ''; }
  syncCoControls();
  loadCompanies(true);
});

/* ---------- 启动 ---------- */
async function boot() {
  stampMarks();
  armStamps();
  loading(true, 0);
  try {
    const [meta, categories, facets, dates, cofacets, nfacets, reports, majors, professions, industry] = await Promise.all([
      get('/api/meta'), get('/api/categories'), get('/api/facets'), get('/api/dates?limit=24'), get('/api/cofacets'), get('/api/nfacets'),
      get('/api/report').catch(() => null), get('/api/majors').catch(() => null),
      get('/api/professions').catch(() => null), get('/api/industry').catch(() => null),
    ]);
    state.meta = meta; state.categories = categories; state.facets = facets; state.dates = dates; state.cofacets = cofacets; state.nfacets = nfacets;
    state.ext = { reports, majors, professions, industry };
    const fy = document.getElementById('sfYear'); if (fy) fy.textContent = String(new Date().getFullYear());
    stampMarks();
    const metaEl = document.getElementById('topbarMeta');
    if (metaEl && meta.generatedAt) metaEl.textContent = '数据更新 ' + String(meta.generatedAt).slice(5, 10).replace('-', '/');
    if (!location.hash) history.replaceState(null, '', '#/home');
    route();
    const toTopBtn = document.getElementById('toTop');
    if (toTopBtn) {
      window.addEventListener('scroll', () => { toTopBtn.classList.toggle('show', window.scrollY > 620); }, { passive: true });
      toTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      toTopBtn.classList.toggle('show', window.scrollY > 620);
    }
    const fab = document.querySelector('.follow-fab');
    if (fab) {
      let fabY = window.scrollY, fabUp = 0;
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        if (y > fabY + 0.5) { fabUp = 0; if (y > 300) fab.classList.add('mini'); }
        else if (y < fabY - 0.5) { fabUp += fabY - y; if (y < 240 || fabUp >= 140) fab.classList.remove('mini'); }
        fabY = y;
      }, { passive: true });
      if (window.scrollY > 300) fab.classList.add('mini');
    }
  } catch (e) {
    const isGH = /\.github\.io$/i.test(location.hostname);
    view.innerHTML = isGH ? `<div class="offline">
      <h2>链接可能不完整，请检查链接是否正确</h2>
      <p>你打开的地址可能被截断、粘多了字符，或网络暂时不稳。</p>
      <p class="tip">点下方按钮回首页，或重新复制完整网址再打开。</p>
      <p class="off-btns"><a class="btn primary" href="https://${location.hostname}/guoqi-jobs/">回到网站首页</a><button class="btn ghost" onclick="location.reload()">重新加载</button></p>
    </div>` : `<div class="offline">
      <h2>暂时连不上本地数据服务</h2>
      <p>请先双击运行「启动预览.bat」，再打开本页面。</p>
      <p class="tip">如果你是通过双击网页文件打开的，浏览器会因为安全限制拦下数据请求——用启动脚本打开就正常了。</p>
    </div>`;
  }
  loading(false);
}
boot();
