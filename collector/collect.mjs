// GitHub Actions 入口：拉一次价，写 data.json / history.csv
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrice } from './market.mjs';
import * as skeyStore from './skey.mjs';
import { info, warn } from './log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'data.json');
const CSV = path.join(ROOT, 'history.csv');
const MAX_POINTS = 2880;          // 10 分钟一次 ≈ 20 天

const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

const prev = readJSON(OUT, {});
const history = prev.history || {};

let p = null;
try {
  p = await getPrice({ limit: 100 });
  info(`价 ${p.fire_per_yuan} 火/元  样本 ${p.samples}  联赛 ${Object.keys(p.leagues || {}).join('/')}`);
} catch (e) {
  warn('抓取失败，本次仅保留旧数据：', e.message);
}

const now = Date.now();
// 保护：抓不到就完全不动线上文件，绝不用旧值覆盖更新的数据
if (!p || p.stale) {
  warn('本轮未取得新价，保持线上数据不变');
  process.exit(0);
}
if (p && !p.stale) {
  for (const [k, v] of Object.entries(p.leagues || {})) {
    if (!v?.fire_per_yuan) continue;
    const arr = (history[k] = history[k] || []);
    const t = v.ts || now;
    if (!arr.length || arr[arr.length - 1].t !== t) arr.push({ t, v: v.fire_per_yuan });
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  }
}

// 某个联赛这一轮没有成交时，沿用上一份的统计并标记 cached，避免标签忽隐忽现
function mergeLeagues(cur) {
  const merged = { ...(cur || {}) };
  for (const [k, v] of Object.entries(prev.leagues || {})) {
    if (!merged[k] && v?.fire_per_yuan) merged[k] = { ...v, cached: true, seenAt: v.seenAt || v.ts || prev.at };
  }
  return merged;
}

const out = p && !p.stale
  ? {
      updatedAt: new Date(now).toISOString(),
      at: now,
      spuId: p.spuId,
      league: p.league,
      fire_per_yuan: p.fire_per_yuan,
      yuan_per_fire: p.yuan_per_fire,
      time: p.time,
      samples: p.samples,
      by_spec: p.by_spec || [],
      summary_check: p.summary_check || {},
      leagues: mergeLeagues(p.leagues),
      healed: p.healed || [],
      stale: false,
      history,
    }
  : { ...prev, checkedAt: new Date(now).toISOString(), stale: true, error: String(p ? p.error || 'stale' : 'fetch failed'), history };

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

// 追加 CSV（首次运行写表头）
if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, 'time,league,fire_per_yuan,yuan_per_fire,samples\n');
if (p && !p.stale) {
  const rows = [];
  for (const [k, v] of Object.entries(p.leagues || {})) {
    if (!v?.fire_per_yuan) continue;
    rows.push([v.time || out.updatedAt, k, v.fire_per_yuan, v.yuan_per_fire, v.samples].join(','));
  }
  if (rows.length) fs.appendFileSync(CSV, rows.join('\n') + '\n');
}

info(`写出 ${path.relative(ROOT, OUT)}，历史点 ${Object.entries(history).map(([k, v]) => k + ':' + v.length).join(' ')}`);
process.exit(0);
