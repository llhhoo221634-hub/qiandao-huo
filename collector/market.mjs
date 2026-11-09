import { FILES } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import { post } from './client.mjs';
import { resolveSpu } from './catalog.mjs';

const HISTORY = '/c2c-web/v1/common/get-spu-trading-history-list';
const SUMMARY = '/c2c-web/v1/common/get-spu-latest-trading-summary';

export function computeStats(items) {
  const withPrice = items.filter((i) => +i.unitPrice > 0);
  if (!withPrice.length) return null;
  const ups = withPrice.map((i) => +i.unitPrice);
  const vols = withPrice.map((i) => +i.tradingVolume || 0);
  const totalVol = vols.reduce((a, b) => a + b, 0) || 1;
  const wavg = ups.reduce((a, u, k) => a + u * vols[k], 0) / totalVol;
  const sorted = [...ups].sort((a, b) => a - b);
  const latest = withPrice[0];
  return {
    ts: +latest.tradingTime,
    time: new Date(+latest.tradingTime).toLocaleString('zh-CN', { hour12: false }),
    fire_per_yuan: +latest.unitPrice,
    yuan_per_fire: +(1 / latest.unitPrice).toFixed(7),
    wavg_fire_per_yuan: +wavg.toFixed(3),
    median_fire_per_yuan: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    low_fire_per_yuan: +sorted[0].toFixed(3),
    high_fire_per_yuan: +sorted[sorted.length - 1].toFixed(3),
    samples: ups.length,
    volume_fire: totalVol,
    volume_yuan: +withPrice.reduce((a, i) => a + (+i.tradingAmount || 0), 0).toFixed(2),
    spec: latest.productName,
  };
}

export function parseSpec(name = '') {
  const parts = name.split('/');
  return {
    league: parts[0] || '未知',
    pool: parts[1] || '',
    permission: parts[2] || '',
    mode: parts[3] || '',
  };
}

export function splitLeagues(items) {
  const out = new Map();
  for (const i of items) {
    if (!(+i.unitPrice > 0)) continue;
    const { league } = parseSpec(i.productName);
    if (!out.has(league)) out.set(league, []);
    out.get(league).push(i);
  }
  return out;
}

export function groupBySpec(items) {
  const m = new Map();
  for (const i of items) {
    if (!(+i.unitPrice > 0)) continue;
    const k = i.productName || 'unknown';
    const g = m.get(k) || { spec: k, league: parseSpec(k).league, count: 0, fire_per_yuan: +i.unitPrice, volume_fire: 0 };
    g.count += 1; g.volume_fire += +i.tradingVolume || 0;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

// 双源校验：摘要字段对“初火源质”已知会失真，只做交叉验证不直接采用
export async function summaryCheck(spuId, mine) {
  try {
    const { data } = await post(SUMMARY, { spuId });
    const s = data?.data?.summary;
    if (!s?.amountPerRmb) return { status: 'unavailable' };
    const ratio = +(s.amountPerRmb / mine).toFixed(3);
    const ok = ratio > 0.85 && ratio < 1.15;
    return { status: ok ? 'agree' : 'mismatch', otherside_fire_per_yuan: +s.amountPerRmb, ratio };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

export function saveLastKnown(price) {
  writeJson(FILES.lastKnown, { ...price, savedAt: Date.now() });
}

export function loadLastKnown() {
  return readJson(FILES.lastKnown);
}

/**
 * 取一次实时价。赛季/非赛季价格差别很大（实测 3 倍），必须分开出。
 * 失败时降级为 last_known 并标 stale。
 */
export async function getPrice({ limit = 100, spuId, checkSummary = true } = {}) {
  const id = spuId || (await resolveSpu());
  const healed = [];
  try {
    const r = await post(HISTORY, { spuId: id, offset: 0, limit });
    healed.push(...(r.healed || []));
    const items = r.data?.data?.items || [];
    const priced = items.filter((i) => +i.unitPrice > 0);
    if (!priced.length) throw new Error('no priced trades in response');

    const byLeague = splitLeagues(items);
    const leagues = {};
    for (const [k, arr] of byLeague) leagues[k] = computeStats(arr);
    const seasonKey = Object.keys(leagues).find((k) => k === '赛季') || Object.keys(leagues)[0];
    const main = leagues[seasonKey];

    const out = {
      spuId: id,
      league: seasonKey,
      ...main,
      leagues,
      by_spec: groupBySpec(items),
      samples: priced.length,
      healed,
    };
    if (checkSummary) out.summary_check = await summaryCheck(id, main.fire_per_yuan);
    saveLastKnown(out);
    return out;
  } catch (e) {
    const last = loadLastKnown();
    if (last) {
      return { ...last, spuId: id, stale: true, stale_reason: e.message, age_sec: Math.round((Date.now() - (last.savedAt || 0)) / 1000), healed };
    }
    throw e;
  }
}
