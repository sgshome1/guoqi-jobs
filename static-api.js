/* 央国企求职站 · 静态版数据层（公网 GitHub Pages 用）
   把原来由本地预览服务提供的 /api/... 接口，改成读取 data/ 目录下的静态 JSON 文件；
   筛选、分页、早报聚合等逻辑与本地服务保持一致，前台页面代码不需要任何改动。
   本文件由 tools/build_public.js 一并放进 public/ 目录。 */
(function () {
  'use strict';
  if (window.__GQ_GET) return;
  window.__GQ_STATIC__ = true;

  var B = (function () {
    var p = location.pathname || '/';
    if (/\.html?$/i.test(p)) p = p.replace(/[^/]*$/, '');
    else if (p.charAt(p.length - 1) !== '/') p += '/';
    return location.origin + p;
  })();
  var D = B + 'data/';

  var cache = {}, pending = {};
  function jf(name) {
    if (cache[name] !== undefined) return Promise.resolve(cache[name]);
    if (!pending[name]) {
      pending[name] = fetch(D + name).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + name);
        return r.json();
      }).then(function (d) { cache[name] = d; return d; })
        .catch(function (e) { delete pending[name]; throw e; });
    }
    return pending[name];
  }

  /* ---------- 分片下载 + 浏览器级缓存（Cache API，命中即秒开；不支持的环境自动退化为普通请求） ---------- */
  var CACHE_NAME = 'gq-data-v1';
  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
      return r.json();
    });
  }
  function cacheJson(url) {
    if (!('caches' in window)) return fetchJson(url);
    var req = new Request(url, { credentials: 'same-origin' });
    return caches.open(CACHE_NAME).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit.json();
        return fetch(req).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
          try { c.put(req, r.clone()); } catch (e) {}
          return r.json();
        });
      });
    }).catch(function () { return fetchJson(url); });
  }
  function fetchManifest(name) {
    var bucket = Math.floor(Date.now() / 600000); /* 10 分钟一档：数据更新后最多 10 分钟生效 */
    return fetchJson(D + name + '?v=' + bucket);
  }
  function pruneShards(dir, keep) {
    if (!('caches' in window)) return;
    caches.open(CACHE_NAME).then(function (c) {
      c.keys().then(function (keys) {
        keys.forEach(function (req) {
          var u = req.url, i = u.indexOf(dir);
          if (i < 0) return;
          var name = u.slice(i + dir.length).split('?')[0];
          if (!keep[name]) c.delete(req).catch(function () {});
        });
      });
    }).catch(function () {});
  }

  /* ---------- 工具（与本地服务保持一致） ---------- */
  var pad2 = function (x) { return x < 10 ? '0' + x : '' + x; };
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dayAdd(n) { var t = new Date(todayStr() + 'T00:00:00'); t.setDate(t.getDate() + n); return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()); }
  function statusCtx() { var T = todayStr(); return { T: T, S: dayAdd(7) }; }
  function nStatusOf(n, T, S) {
    var e = String(n.endTime || '').slice(0, 10);
    if (!e) return 'open';
    if (e < T) return 'closed';
    if (e === T) return 'today';
    if (e <= S) return 'soon';
    return 'open';
  }
  function nStatusMix(list, T, S) {
    var m = { open: 0, soon: 0, today: 0, closed: 0 };
    for (var i = 0; i < list.length; i++) m[nStatusOf(list[i], T, S)]++;
    return m;
  }
  function areaTokens(a) {
    if (!a) return [];
    var s = String(a).trim();
    if (s.charAt(0) === '[') { try { var arr = JSON.parse(s); if (Array.isArray(arr)) return arr.map(function (x) { return String(x).trim(); }).filter(Boolean); } catch (e) {} }
    return s.split(/[\uFF5C|、,\uFF0C/]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function top(obj, n) {
    return Object.entries(obj).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n).map(function (kv) { return { name: kv[0], count: kv[1] }; });
  }
  var COMPACT_KEYS = ['id', 'title', 'companyName', 'tag', 'area', 'education', 'startTime', 'endTime', 'createTime', 'industry', 'hasEnd'];
  function compact(n) {
    var o = {};
    for (var i = 0; i < COMPACT_KEYS.length; i++) o[COMPACT_KEYS[i]] = n[COMPACT_KEYS[i]];
    return o;
  }

  /* ---------- 企业工具 ---------- */
  function coCleanDiv(s) { return String(s || '').replace(/^[A-Z]\s*/, '').trim() || '其他'; }
  function coSizeBucket(s) {
    var t = String(s || '');
    if (t.indexOf('超大型') >= 0) return '超大型';
    if (t.indexOf('大型') >= 0) return '大型';
    if (t.indexOf('中型') >= 0) return '中型';
    if (t.indexOf('小型') >= 0 || t.indexOf('微型') >= 0) return '小型及以下';
    return '';
  }
  var CO_SIZE_ORDER = ['超大型', '大型', '中型', '小型及以下'];
  function coAuthBucket(s) {
    var t = String(s || '');
    if (!t) return '未标注';
    if (/国务院国资委|国务院国有资产监督管理委员会/.test(t)) return '国务院国资委';
    if (/财政部|中央汇金/.test(t)) return '财政部/中央汇金';
    if (/省国资委|自治区国资委/.test(t)) return '省/自治区国资委';
    if (/国资委|国资局|国资办|国有资产|财政局/.test(t)) return '市/县国资委';
    return '其他';
  }
  function coGroupOf(c) { return c.categoryGroup === '245家央企' ? 'central' : c.categoryGroup === '665家省属国企' ? 'provincial' : 'municipal'; }
  function coreName(s) { return String(s || '').replace(/(股份有限公司|有限责任公司|有限公司|集团有限公司|集团公司|集团|公司|总院|学院|研究院|研究所|总厂|厂)$/g, '').trim(); }
  function coCompact(c) {
    return { id: c.id, companyName: c.companyName, categoryGroup: c.categoryGroup, type: c.type, companySize: c.companySize,
      provName: c.provName, cityName: c.cityName, division: c.division, mainCategory: c.mainCategory,
      supervisoryAuthority: c.supervisoryAuthority, hasRecruit: !!(c.recruitmentLink || c.website) };
  }

  /* ---------- 公告索引（分片并发加载 + 浏览器缓存；进入公告页或后台预取时触发） ---------- */
  var idxRows = null, idxPending = null;
  function rotateParts(parts, cols) {
    var total = 0, i, j;
    for (i = 0; i < parts.length; i++) total += parts[i].rows.length;
    var out = new Array(total), w = 0;
    for (i = 0; i < parts.length; i++) {
      var rows = parts[i].rows;
      for (j = 0; j < rows.length; j++) {
        var r = rows[j], o = {};
        for (var k = 0; k < cols.length; k++) o[cols[k]] = r[k];
        out[w++] = o;
      }
    }
    return out;
  }
  function ensureIndex() {
    if (idxRows) return Promise.resolve(idxRows);
    if (!idxPending) {
      idxPending = fetchManifest('notices/idx/manifest.json').then(function (mf) {
        if (!mf || !mf.parts || !mf.parts.length) throw new Error('索引清单无效');
        var keep = {};
        mf.parts.forEach(function (h) { keep[h + '.json'] = 1; });
        pruneShards('data/notices/idx/', keep);
        return Promise.all(mf.parts.map(function (h) { return cacheJson(D + 'notices/idx/' + h + '.json'); }))
          .then(function (parts) { return rotateParts(parts, mf.cols); });
      }).catch(function () {
        /* 回退：旧的单文件索引（兼容兜底） */
        return cacheJson(D + 'notices/index.json').then(function (raw) { return rotateParts([raw], raw.cols); });
      }).then(function (out) {
        idxRows = out;
        fixNfacets(out);
        return out;
      }).catch(function (e) { idxPending = null; throw e; });
    }
    return idxPending;
  }
  /* 统计口径里的“报名中/即将截止”随时间变化，索引到本地后按当天日期校正一次 */
  function fixNfacets(list) {
    if (!cache['nfacets.json']) return;
    var ctx = statusCtx(), m = nStatusMix(list, ctx.T, ctx.S);
    cache['nfacets.json'].today = ctx.T;
    cache['nfacets.json'].status = m;
    cache['nfacets.json'].total = list.length;
  }

  /* ---------- 公告筛选（与本地服务 filterNotices 一致） ---------- */
  var NOTICE_FILTER_KEYS = ['q', 'tag', 'area', 'edu', 'date', 'from', 'to', 'industry', 'ptype', 'status', 'prov', 'city', 'grade'];
  function filterNotices(sp, notices) {
    var ctx = statusCtx();
    var kw = (sp.get('q') || '').trim().toLowerCase();
    var tag = sp.get('tag') || '';
    var area = sp.get('area') || '';
    var edu = sp.get('edu') || '';
    var date = sp.get('date') || '';
    var from = sp.get('from') || '', to = sp.get('to') || '';
    var industry = sp.get('industry') || '';
    var ptype = sp.get('ptype') || '';
    var status = sp.get('status') || '';
    var prov = sp.get('prov') || '';
    var city = sp.get('city') || '';
    var grade = sp.get('grade') || '';
    var list = notices;
    if (tag) list = list.filter(function (n) { return String(n.tag || '').split(/[,\uFF0C\u3001\uFF1B;]/).map(function (s) { return s.trim(); }).indexOf(tag) >= 0; });
    if (edu) list = list.filter(function (n) { return String(n.education || '').indexOf(edu) >= 0; });
    if (date) list = list.filter(function (n) { return String(n.createTime || '').indexOf(date) === 0; });
    if (from) list = list.filter(function (n) { return String(n.createTime || '').slice(0, 10) >= from; });
    if (to) list = list.filter(function (n) { return String(n.createTime || '').slice(0, 10) <= to; });
    if (area) list = list.filter(function (n) { return areaTokens(n.area).indexOf(area) >= 0; });
    if (industry) {
      var want = industry.split('|').map(function (s) { return s.trim(); }).filter(Boolean).sort().join('|');
      list = list.filter(function (n) {
        var toks = Array.from(new Set(String(n.industry || '').split(/[\uFF5C|、,\uFF0C/]+/).map(function (s) { return s.trim(); }).filter(Boolean)));
        return toks.sort().join('|') === want;
      });
    }
    if (ptype) list = list.filter(function (n) { return String(n.ptype || 'other') === ptype; });
    if (status) list = list.filter(function (n) { return nStatusOf(n, ctx.T, ctx.S) === status; });
    if (prov) list = list.filter(function (n) { return Array.isArray(n.nprov) && n.nprov.indexOf(prov) >= 0; });
    if (city) list = list.filter(function (n) {
      var ncp = n.ncp || {};
      if (prov && ncp[prov]) return ncp[prov].indexOf(city) >= 0;
      return Object.values(ncp).some(function (arr) { return Array.isArray(arr) && arr.indexOf(city) >= 0; });
    });
    if (grade) list = list.filter(function (n) { return String(n.tag || '').split(/[,\uFF0C\u3001\uFF1B;]/).map(function (s) { return s.trim(); }).indexOf(grade) >= 0; });
    if (kw) list = list.filter(function (n) { return (String(n.title || '') + String(n.companyName || '')).toLowerCase().indexOf(kw) >= 0; });
    return list;
  }

  /* ---------- 公告详情分片 ---------- */
  var detailCache = {};
  function idCmp(a, b) {
    var x = String(a), y = String(b);
    if (x.length !== y.length) return x.length < y.length ? -1 : 1;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function noticeById(id) {
    var key = String(id);
    if (detailCache[key]) return Promise.resolve(detailCache[key]);
    return jf('notices/bounds.json').then(function (bd) {
      var shardKey = null;
      if (bd && bd.mode === 'bounds') {
        for (var i = 0; i < bd.list.length; i++) {
          var it = bd.list[i];
          if (idCmp(it[1], key) <= 0 && idCmp(key, it[2]) <= 0) { shardKey = it[0]; break; }
        }
        if (!shardKey) return null;
        return jf('notices/s/' + shardKey + '.json');
      }
      return jf('notices/map.json').then(function (m) { shardKey = m[key]; return shardKey ? jf('notices/s/' + shardKey + '.json') : null; });
    }).then(function (shard) {
      var rec = shard ? shard[key] : null;
      if (!rec) throw new Error('公告不存在');
      detailCache[key] = rec;
      return rec;
    });
  }

  /* ---------- 专业 / 职业详情分片 ---------- */
  function extById(kind, id) {
    return jf('ext/index.json').then(function (idx) {
      var key = kind + '_' + id;
      var pack = idx[key];
      if (pack == null) throw new Error('资料不存在');
      return jf('ext/p/' + pack + '.json').then(function (d) {
        if (!d[key]) throw new Error('资料不存在');
        return d[key];
      });
    });
  }

  /* ---------- 企业名录（分片并发加载 + 浏览器缓存） ---------- */
  var companiesCache = null, coPending = null;
  function loadCompanies() {
    if (companiesCache) return Promise.resolve(companiesCache);
    if (!coPending) {
      coPending = fetchManifest('companies/c/manifest.json').then(function (mf) {
        if (!mf || !mf.parts || !mf.parts.length) throw new Error('企业清单无效');
        var keep = {};
        mf.parts.forEach(function (h) { keep[h + '.json'] = 1; });
        pruneShards('data/companies/c/', keep);
        return Promise.all(mf.parts.map(function (h) { return cacheJson(D + 'companies/c/' + h + '.json'); }));
      }).catch(function () {
        /* 回退：旧的单文件企业名录 */
        return cacheJson(D + 'companies.json').then(function (arr) { return [arr]; });
      }).then(function (parts) {
        var out = [], i, j;
        for (i = 0; i < parts.length; i++) for (j = 0; j < parts[i].length; j++) out.push(parts[i][j]);
        companiesCache = out;
        return out;
      }).catch(function (e) { coPending = null; throw e; });
    }
    return coPending;
  }
  function companyNotices(c, notices) {
    var core = coreName(c.companyName);
    if (!core || core.length < 3) return [];
    var out = [];
    for (var i = 0; i < notices.length; i++) {
      var n = notices[i];
      if (n.companyName && String(n.companyName).indexOf(core) >= 0) { out.push(compact(n)); if (out.length >= 30) break; }
    }
    return out;
  }

  /* ---------- 接口路由 ---------- */
  function apiBrief(sp) {
    var date = sp.get('date') || '';
    return jf('home.json').catch(function () { return null; }).then(function (home) {
      if (home && home.brief && date && home.brief.date === date) return home.brief;
      return ensureIndex().then(function (notices) {
        var list = date ? notices.filter(function (n) { return String(n.createTime || '').indexOf(date) === 0; }) : notices.slice(0, 80);
        var tc = {}, ec = {}, ac = {};
        for (var i = 0; i < list.length; i++) {
          var n = list[i];
          String(n.tag || '').split(/[,\uFF0C\u3001\uFF1B;]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (t) { tc[t] = (tc[t] || 0) + 1; });
          if (n.education) ec[n.education] = (ec[n.education] || 0) + 1;
          areaTokens(n.area).forEach(function (t) { ac[t] = (ac[t] || 0) + 1; });
        }
        return { date: date, total: list.length, tags: top(tc, 12), educations: top(ec, 8), areas: top(ac, 10), list: list.slice(0, 80).map(compact) };
      });
    });
  }
  function apiNotices(sp) {
    var page = Math.max(1, Number(sp.get('page') || 1));
    var size = Math.min(100, Math.max(1, Number(sp.get('size') || 20)));
    var hasFilter = NOTICE_FILTER_KEYS.some(function (k) { return sp.get(k); });
    if (page === 1 && size === 10 && !hasFilter) {
      return jf('home.json').catch(function () { return null; }).then(function (home) {
        if (!home || !home.latest) return null;
        var ctx = statusCtx();
        var mix = home.mix || nStatusMix(home.latest, ctx.T, ctx.S);
        return { total: home.total, mix: mix, page: 1, size: 10, list: home.latest };
      }).then(function (fast) {
        if (fast) return fast;
        return ensureIndex().then(function (notices) {
          var ctx = statusCtx();
          return { total: notices.length, mix: nStatusMix(notices, ctx.T, ctx.S), page: 1, size: 10, list: notices.slice(0, 10).map(compact) };
        });
      });
    }
    /* 首屏快照：默认视图第一页先秒出，全量分片同时在后台加载（供筛选/翻页） */
    if (page === 1 && !hasFilter && size <= 20) {
      return fetchManifest('notices/page1.json').then(function (p1) {
        if (!p1 || !p1.list || !p1.list.length) throw new Error('首屏快照无效');
        ensureIndex().catch(function () {});
        return { total: p1.total, mix: p1.mix, page: 1, size: size, list: p1.list.slice(0, size) };
      }).catch(function () { return null; }).then(function (fast) {
        if (fast) return fast;
        return ensureIndex().then(function (notices) {
          var ctx = statusCtx();
          return { total: notices.length, mix: nStatusMix(notices, ctx.T, ctx.S), page: 1, size: size, list: notices.slice(0, size).map(compact) };
        });
      });
    }
    return ensureIndex().then(function (notices) {
      var ctx = statusCtx();
      var list = filterNotices(sp, notices);
      var start = (page - 1) * size;
      return { total: list.length, mix: nStatusMix(list, ctx.T, ctx.S), page: page, size: size, list: list.slice(start, start + size).map(compact) };
    });
  }
  function apiCompanies(sp) {
    var page = Math.max(1, Number(sp.get('page') || 1));
    var size = Math.min(100, Math.max(1, Number(sp.get('size') || 20)));
    var q = (sp.get('q') || '').trim().toLowerCase();
    var cat = sp.get('cat') || '', group = sp.get('group') || '', prov = sp.get('prov') || '', city = sp.get('city') || '';
    var div = sp.get('div') || '', scale = sp.get('scale') || '', auth = sp.get('auth') || '', ids = sp.get('ids') || '', sort = sp.get('sort') || '';
    var hasFilter = !!(q || cat || group || prov || city || div || scale || auth || ids || sort);
    /* 首屏快照：默认视图第一页先秒出，全量分片同时在后台加载（供筛选/翻页） */
    if (page === 1 && !hasFilter && size <= 20) {
      return fetchManifest('companies/page1.json').then(function (p1) {
        if (!p1 || !p1.list || !p1.list.length) throw new Error('首屏快照无效');
        loadCompanies().catch(function () {});
        return { total: p1.total, page: 1, size: size, mix: p1.mix, list: p1.list.slice(0, size) };
      }).catch(function () { return null; }).then(function (fast) {
        if (fast) return fast;
        return loadCompanies().then(function (companies) {
          var mix = { central: 0, provincial: 0, municipal: 0 };
          for (var i = 0; i < companies.length; i++) mix[coGroupOf(companies[i])]++;
          return { total: companies.length, page: 1, size: size, mix: mix, list: companies.slice(0, size).map(coCompact) };
        });
      });
    }
    return loadCompanies().then(function (companies) {
      var list = companies;
      if (cat) list = list.filter(function (c) { return c.categoryGroup === cat || c.categoryGroupId === cat; });
      if (group) list = list.filter(function (c) { return coGroupOf(c) === group; });
      if (prov) list = list.filter(function (c) { return String(c.provName || '') === prov; });
      if (city) list = list.filter(function (c) { return String(c.cityName || '') === city; });
      if (div) list = list.filter(function (c) { return coCleanDiv(c.division) === div; });
      if (scale) list = list.filter(function (c) { return coSizeBucket(c.companySize) === scale; });
      if (auth) list = list.filter(function (c) { return coAuthBucket(c.supervisoryAuthority) === auth; });
      if (ids) { var set = new Set(ids.split(',').map(function (s) { return s.trim(); }).filter(Boolean)); list = list.filter(function (c) { return set.has(String(c.id)); }); }
      if (q) list = list.filter(function (c) { return (String(c.companyName || '') + ' ' + String(c.mainCategory || '') + ' ' + String(c.division || '') + ' ' + String(c.supervisoryAuthority || '') + ' ' + String(c.cityName || '') + ' ' + String(c.provName || '')).toLowerCase().indexOf(q) >= 0; });
      if (sort === 'name') list = list.slice().sort(function (a, b) { return String(a.companyName || '').localeCompare(String(b.companyName || ''), 'zh'); });
      else if (sort === 'prov') list = list.slice().sort(function (a, b) { return String(a.provName || '').localeCompare(String(b.provName || ''), 'zh'); });
      else if (sort === 'div') list = list.slice().sort(function (a, b) { return coCleanDiv(a.division).localeCompare(coCleanDiv(b.division), 'zh'); });
      else if (sort === 'scale') { var si = function (x) { var i = CO_SIZE_ORDER.indexOf(coSizeBucket(x.companySize)); return i < 0 ? 9 : i; }; list = list.slice().sort(function (a, b) { return si(a) - si(b); }); }
      var mix = { central: 0, provincial: 0, municipal: 0 };
      for (var i = 0; i < list.length; i++) mix[coGroupOf(list[i])]++;
      var start = (page - 1) * size;
      return { total: list.length, page: page, size: size, mix: mix, list: list.slice(start, start + size).map(coCompact) };
    });
  }
  function apiCompanyDetail(id) {
    return loadCompanies().then(function (companies) {
      var c = null;
      for (var i = 0; i < companies.length; i++) if (String(companies[i].id) === String(id)) { c = companies[i]; break; }
      if (!c) throw new Error('企业不存在');
      return ensureIndex().then(function (notices) { return { company: c, notices: companyNotices(c, notices) }; });
    });
  }

  window.__GQ_GET = function (url) {
    var u = new URL(url, location.href);
    var p = u.pathname, sp = u.searchParams;
    try {
      if (p === '/api/meta') return Promise.all([jf('meta.json'), jf('categories.json')]).then(function (a) { return Object.assign({}, a[0], { categories: a[1].length }); });
      if (p === '/api/categories') return jf('categories.json');
      if (p === '/api/facets') return jf('facets.json');
      if (p === '/api/cofacets') return jf('cofacets.json');
      if (p === '/api/nfacets') return jf('nfacets.json');
      if (p === '/api/report') return jf('reports.json');
      if (p === '/api/majors') return jf('majors.json');
      if (p === '/api/professions') return jf('professions.json');
      if (p === '/api/industry') return jf('industry.json');
      if (p === '/api/dates') {
        var limit = Number(sp.get('limit') || 60);
        return jf('dates.json').then(function (dt) {
          return Object.entries(dt).sort(function (a, b) { return a[0] < b[0] ? 1 : -1; }).map(function (kv) { return { date: kv[0], count: kv[1] }; }).slice(0, limit);
        });
      }
      if (p === '/api/brief') return apiBrief(sp);
      if (p === '/api/notices') return apiNotices(sp);
      if (p.indexOf('/api/notice/') === 0) return noticeById(decodeURIComponent(p.slice('/api/notice/'.length)));
      if (p === '/api/companies') return apiCompanies(sp);
      if (p.indexOf('/api/company/') === 0) return apiCompanyDetail(decodeURIComponent(p.slice('/api/company/'.length)));
      if (p.indexOf('/api/major/') === 0) return extById('major', decodeURIComponent(p.slice('/api/major/'.length))).then(function (d) { return { data: d }; });
      if (p.indexOf('/api/profession/') === 0) return extById('profession', decodeURIComponent(p.slice('/api/profession/'.length))).then(function (d) { return { data: d }; });
      return Promise.reject(new Error('未知接口: ' + p));
    } catch (e) { return Promise.reject(e); }
  };

  /* 首屏完成约 6 秒后再悄悄预取公告索引（避免与首屏抢带宽）；企业数据等进入名录页再取。
     公告页/名录页的默认视图由预生成快照秒开，全量数据在后台分片下载并缓存（Cache API），
     之后访问命中缓存秒开；数据更新后只有内容变化的片需要重新下载。 */
  function schedulePrefetch() {
    setTimeout(function () { ensureIndex().catch(function () {}); }, 6000);
  }
  if (document.readyState === 'complete') schedulePrefetch();
  else window.addEventListener('load', schedulePrefetch);
})();
