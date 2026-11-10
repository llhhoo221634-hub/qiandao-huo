// 初火源质看板脚本（外部文件：CSP 不再需要 unsafe-inline）
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (n) => n == null ? '—' : Math.round(n).toLocaleString('zh-CN');
const timeAgo = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + ' 秒前';
  if (s < 3600) return Math.round(s / 60) + ' 分钟前';
  if (s < 86400) return Math.round(s / 3600) + ' 小时前';
  return Math.round(s / 86400) + ' 天前';
};
const clock = (ts) => new Date(ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
const dayStr = (ts) => new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

let D = null, league = '赛季', range = '24h', auto = true, tick = null, left = 60, inflight = false, tradeOpen = false;
const LOCAL = location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.protocol === 'file:';
const AUTO_MS = LOCAL ? 20000 : 60000;   // 本地版 20 秒一刷（只重读文件，不额外出网）
let lastLoad = 0;               // 上次成功取数的时间（墙钟，抗浏览器冻结）
let lastCount = 0;              // 上一秒显示的秒数，避免每秒重排

document.addEventListener('click', (e) => {
  if (e.target.id === 'tradeToggle') { tradeOpen = !tradeOpen; render(); }
});

for (const btn of $('seg').children) {
  btn.onclick = () => {
    if (btn.classList.contains('off')) return;
    league = btn.dataset.k;
    for (const b of $('seg').children) b.classList.toggle('on', b === btn);
    render();
  };
}
for (const btn of $('ranges').children) {
  btn.onclick = () => {
    range = btn.dataset.r;
    for (const b of $('ranges').children) b.classList.toggle('on', b === btn);
    drawChart();
  };
}

function pick() {
  const l = D.leagues || {};
  const cur = l[league] || {};
  const other = Object.entries(l).find(([k]) => k !== league);
  return { cur, other: other ? [other[0], other[1]] : null };
}

function series() {
  if (range === '24h') {
    const arr = (D.history?.[league] || []);
    const cut = Date.now() - 24 * 3600e3;
    const pts = arr.filter((p) => p.t >= cut);
    return (pts.length >= 2 ? pts : arr.slice(-2)).map((p) => ({ t: p.t, v: p.v }));
  }
  const days = { '7d': 7, '30d': 30, all: 1e9 }[range];
  const rows = (D.daily || []).slice(-days);
  return rows.map((r) => ({ t: new Date(r.d + 'T12:00:00+08:00').getTime(), v: r.avg ?? r.close }));
}

function drawChart() {
  const svg = $('chart');
  const pts = series();
  const W = 320, H = 150, PL = 36, PR = 8, PT = 10, PB = 18;
  if (pts.length < 2) {
    svg.innerHTML = `<text x="160" y="82" text-anchor="middle" class="axis">样本不足，等待更多成交</text>`;
    return;
  }
  // 轻微平滑（3 点居中均值）：早期历史是按单笔成交记的，保留形状但去掉毛刺
  if (pts.length >= 5) {
    const raw = pts.map((p) => p.v);
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i] = { ...pts[i], v: +(((raw[i - 1] + raw[i] * 2 + raw[i + 1]) / 4).toFixed(3)) };
    }
  }
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = (hi - lo) * 0.18 || hi * 0.02 || 1;
  lo -= pad; hi += pad;
  const x = (i) => PL + (i / (pts.length - 1)) * (W - PL - PR);
  const y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PB} L${PL},${H - PB} Z`;

  // 网格：3 条水平线
  let grid = '';
  for (let i = 0; i <= 2; i++) {
    const v = lo + (hi - lo) * (i / 2);
    const yy = y(v);
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${yy}" y2="${yy}" stroke="var(--line2)" stroke-width="1"/>`;
    grid += `<text x="${PL - 6}" y="${yy + 3}" text-anchor="end" class="axis">${Math.round(v)}</text>`;
  }
  const last = pts[pts.length - 1];
  const first = pts[0];
  const up = last.v >= first.v;
  const col = up ? 'var(--up)' : 'var(--down)';

  let xlab = '';
  if (range === '24h') {
    xlab = `<text x="${PL}" y="${H - 4}" class="axis">${clock(first.t)}</text>
            <text x="${W - PR}" y="${H - 4}" text-anchor="end" class="axis">${clock(last.t)}</text>`;
  } else {
    xlab = `<text x="${PL}" y="${H - 4}" class="axis">${new Date(first.t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</text>
            <text x="${W - PR}" y="${H - 4}" text-anchor="end" class="axis">${new Date(last.t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</text>`;
  }

  svg.innerHTML = `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".22"/>
      <stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(last.v)}" r="3.2" fill="${col}"/>
    ${xlab}`;

  // 触摸查看
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect();
    const rx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((rx - PL) / (W - PL - PR)) * (pts.length - 1))));
    const p = pts[i];
    const tip = $('tip');
    tip.style.opacity = 1;
    tip.style.left = (x(i) / W * 100) + '%';
    tip.style.top = (y(p.v) / H * 100) + '%';
    tip.textContent = `${range === '24h' ? clock(p.t) : new Date(p.t).toLocaleDateString('zh-CN')} · ${fmt(p.v)} 火`;
  };
  svg.onpointerleave = () => { $('tip').style.opacity = 0; };
}

function deltas() {
  const arr = D.history?.[league] || [];
  const nowV = pick().cur.fire_per_yuan ?? D.fire_per_yuan;
  const cut = Date.now() - 24 * 3600e3;
  const back = arr.find((p) => p.t >= cut) || arr[0];
  if (!back || !back.v) return null;
  return { base: back.v, pct: ((nowV - back.v) / back.v) * 100, nowV };
}

function render() {
  if (!D) return;
  const { cur, other } = pick();

  // 段控价格
  for (const b of $('seg').children) {
    const k = b.dataset.k;
    const v = D.leagues?.[k];
    b.innerHTML = `${k}<span class="n">${v?.fire_per_yuan ? fmt(v.fire_per_yuan, 0) : ''}</span>`;
    b.classList.toggle('off', !v?.fire_per_yuan);
    b.classList.toggle('on', k === league);
  }

  const price = cur.fire_per_yuan ?? D.fire_per_yuan;
  $('main').textContent = fmt(price, 2);
  $('yuan').textContent = fmt(cur.yuan_per_fire ?? 1 / price, 6);
  tickClock();

  const d = deltas();
  const el = $('delta');
  if (d && isFinite(d.pct)) {
    el.classList.remove('hidden', 'up', 'down', 'flat');
    el.classList.add(d.pct > 0.05 ? 'up' : d.pct < -0.05 ? 'down' : 'flat');
    el.textContent = `${d.pct >= 0 ? '▲' : '▼'} ${Math.abs(d.pct).toFixed(2)}%`;
    $('change').textContent = `${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(2)}%`;
    $('changeFrom').textContent = `24 小时前 ${fmt(d.base)}`;
  } else {
    el.classList.add('hidden');
    $('change').textContent = '—'; $('changeFrom').textContent = '数据不足';
  }

  $('hl').textContent = cur.low_fire_per_yuan
    ? `${fmt(cur.low_fire_per_yuan, 0)} – ${fmt(cur.high_fire_per_yuan, 0)}`
    : '—';
  $('hlRange').textContent = `近 ${cur.samples || 0} 笔`;
  $('lastTrade').textContent = fmt(D.last_fire_per_yuan ?? main.last_fire_per_yuan ?? price, 2);
  $('lastTime').textContent = (D.last_trade_time || main.last_trade_time || '').replace(/^\d{4}\//, '');
  if (D.ref_window_min) $('heroLabel').textContent = `1 元可购 · 近 ${D.ref_window_min} 分钟均价`;
  $('median').textContent = fmt(cur.median_fire_per_yuan ?? price, 2);
  $('volYuan').innerHTML = `${fmtInt(D.volume_yuan)} <small>元</small>`;
  $('volFire').textContent = `${fmt(D.volume_fire / 10000, 1)} 万火 · ${D.samples || 0} 笔`;
  $('dataLen').innerHTML = `${D.total_days || (D.daily || []).length} <small>天</small>`;
  $('dataLenSub').textContent = `${fmtInt(D.total_points || 0)} 个采样点 · 每分钟`;

  if (other && !D.leagues?.[league]?.fire_per_yuan) {
    $('changeFrom').textContent = '该联赛暂无成交';
  }

  // 分规格
  const rows = (D.by_spec || []).filter((r) => r.league === league);
  $('specTable').querySelector('tbody').innerHTML = rows.length
    ? rows.map((r) => `<tr><td class="spec">${esc(r.spec)}</td><td><b>${fmt(r.fire_per_yuan, 2)}</b></td><td>${esc(r.count)}</td></tr>`).join('')
    : `<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:20px">暂无</td></tr>`;
  $('specHint').textContent = `${rows.length} 类`;

  // 最近成交
  const tr = (D.trades || []).filter((t) => t.league === league).slice(0, 12);
  $('trades').classList.toggle('clip', !tradeOpen && tr.length > 3);
  $('trades').style.maxHeight = tradeOpen ? 'none' : '';
  if (!tr.length) $('trades').classList.remove('clip');
  $('tradeToggle').textContent = tr.length ? (tradeOpen ? '收起 ▴' : `展开全部 ${tr.length} 条 ▾`) : '';
  $('trades').innerHTML = tr.length
    ? tr.map((t) => `<div class="trade">
        <div><div class="t">${clock(t.ts)} · ${fmtInt(t.fire)} 火</div><div class="s">${esc(t.spec).replace(/\//g, ' · ')}</div></div>
        <div class="p">${fmt(t.price, 2)}</div>
        <div class="a">${fmt(t.yuan, 0)} 元</div>
      </div>`).join('')
    : `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">暂无成交</div>`;

  // 日线表（最近 10 天，倒序）
  const all = D.daily || [];
  const dd = all.map((r, i) => ({ r, prev: all[i - 1] })).reverse().slice(0, 10);
  $('dailyHint').textContent = all.length ? `共 ${all.length} 天 · 累计 ${fmtInt(D.total_points || 0)} 点` : '';
  $('dailyTable').querySelector('tbody').innerHTML = dd.length
    ? dd.map(({ r, prev }) => {
        let pct = null;
        if (prev?.close) pct = ((r.close - prev.close) / prev.close) * 100;
        const cls = pct == null ? 'flat' : pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
        const txt = pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        return `<tr><td>${esc(String(r.d || '').slice(5))}</td><td><b>${fmt(r.avg ?? r.close, 2)}</b></td>
        <td style="color:var(--muted)">${fmt(r.low, 0)} / ${fmt(r.high, 0)}</td>
        <td><span class="badge ${cls}" style="border:0;background:transparent;padding:0">${txt}</span></td></tr>`;
      }).join('')
    : `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:20px">今天刚开始记录</td></tr>`;

  // 校验徽章
  const chk = D.summary_check || {};
  const map = { agree: ['平台摘要一致', 'ok'], mismatch: ['摘要偏差 ×' + chk.ratio, 'warn'], unavailable: ['无平台摘要', ''], error: ['摘要校验失败', 'warn'] };
  const [ct, cc] = map[chk.status] || ['—', ''];
  const ageMin0 = D.at ? (Date.now() - D.at) / 60000 : 999;
  const staleCls = ageMin0 > 25 ? 'warn' : '';
  const staleTxt = ageMin0 > 25 ? `数据停更 ${Math.round(ageMin0)} 分钟` : `更新 ${timeAgo(D.at)}`;
  $('badges').innerHTML = `
    <span class="badge ${cc}">${ct}</span>
    <span class="badge ok">成交明细口径</span>
    <span class="badge">${D.samples || 0} 笔样本</span>
    <span class="badge ${staleCls}">${staleTxt}</span>`;

  // 采集停更检测：超过 25 分钟没新数据就在顶部明说，不装实时
  const ageMin = D.at ? (Date.now() - D.at) / 60000 : 999;
  if (ageMin > 25) {
    setStatus(`停更 ${Math.round(ageMin)} 分钟`, 'stale');
    $('main').style.opacity = '.55';
  } else {
    $('main').style.opacity = '1';
  }

  drawChart();
}

const pad2 = (n) => String(n).padStart(2, '0');
function beijingNow() {
  const k = new Date(Date.now() + 8 * 3600000);   // UTC+8，用 getUTC* 取值避免二次偏移
  return `${k.getUTCFullYear()}/${pad2(k.getUTCMonth() + 1)}/${pad2(k.getUTCDate())} ${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}:${pad2(k.getUTCSeconds())}`;
}
function tickAge() {
  if (!D || !D.at) return;
  const s = Math.max(0, Math.round((Date.now() - D.at) / 1000));
  const el = $('age');
  if (el) el.textContent = s < 60 ? s + 's前' : Math.round(s / 60) + '分前';
}
function tickClock() {
  const el = $('clock');
  if (el) el.textContent = beijingNow();
}

function setStatus(text, kind) {
  $('status').textContent = text;
  $('pill').className = 'pill' + (kind ? ' ' + kind : '');
}

async function load(force) {
  if (inflight) return;
  inflight = true;
  $('refresh').disabled = true;
  if (force) setStatus('刷新中');
  try {
    // 本地版：先让服务端真去抓一次（GitHub 版没有这个接口，跳过）
    const staleMs = D?.at ? Date.now() - D.at : Infinity;
    if (LOCAL && (force || staleMs > 55000)) {
      await fetch('/api/refresh', { method: 'POST', signal: AbortSignal.timeout(30000) }).catch(() => {});
    }
    const r = await fetch('./data.json?_=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    D = await r.json();
    if (D.stale) { setStatus('数据过期', 'stale'); } else { setStatus('实时', ''); }
    render();
  } catch (e) {
    if (D) { setStatus('接口不可达', 'err'); }
    else { setStatus('加载失败', 'err'); $('main').textContent = '—'; }
  } finally {
    inflight = false;
    $('refresh').disabled = false;
    lastLoad = Date.now();
    left = AUTO_MS / 1000;
    $('count').textContent = left + 's';
  }
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]');
  if (!b) return;
  for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('on', x === b);
  for (const p of document.querySelectorAll('.pane')) p.classList.toggle('on', p.dataset.p === b.dataset.t);
});

$('refresh').onclick = () => load(true);
$('auto').onclick = () => {
  auto = !auto;
  $('auto').textContent = '自动 · ' + (auto ? '开' : '关');
  left = 60;
};
setInterval(tickClock, 1000);
setInterval(tickAge, 1000);

tick = setInterval(() => {
  if (!auto) { $('count').textContent = '暂停'; return; }
  // 用墙钟算“还差多久”，而不是自减计数器：
  // 手机浏览器冻结后台定时器时，恢复后的第一个 tick 会立刻发现已超时并补一次
  const due = AUTO_MS - (Date.now() - lastLoad);
  const sec = Math.max(0, Math.ceil(due / 1000));
  if (sec !== lastCount) { lastCount = sec; $('count').textContent = sec + 's'; }
  if (due <= 0) load(true);
}, 1000);

// 回到前台 / 从后台恢复时，数据过期就立刻取一次
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastLoad > AUTO_MS) load(true);
});
window.addEventListener('pageshow', () => { if (Date.now() - lastLoad > AUTO_MS) load(true); });
// 手指碰屏幕（滚动、点标签）时如果已经过期，也补一次，用户永远不用点“刷新”
document.addEventListener('touchstart', () => {
  if (Date.now() - lastLoad > AUTO_MS) load(true);
}, { passive: true });

load(false);
