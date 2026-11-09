import { FILES } from './config.mjs';
import { appendCsv } from './store.mjs';

const HEADER = ['time', 'fire_per_yuan', 'yuan_per_fire', 'wavg_fire_per_yuan', 'volume_fire', 'stale', 'summary_check', 'league', 'nonseason_fire_per_yuan'];

export function rowOf(p) {
  return [
    p.time, p.fire_per_yuan, p.yuan_per_fire, p.wavg_fire_per_yuan, p.volume_fire,
    p.stale ? 1 : 0, p.summary_check?.status || '', p.league || '',
    p.leagues?.['非赛季']?.fire_per_yuan ?? '',
  ];
}

export function record(p, csv = FILES.csv) {
  appendCsv(csv, HEADER, rowOf(p));
  return csv;
}

export function line(p) {
  const flag = p.stale ? ` [STALE ${p.age_sec}s]` : '';
  const chk = p.summary_check?.status === 'mismatch' ? ` [摘要偏差 x${p.summary_check.ratio}]` : '';
  const other = p.leagues?.['非赛季']?.fire_per_yuan;
  const extra = other ? `  非赛季 ${other}` : '';
  return `${p.time}  [${p.league}] ${p.fire_per_yuan} 火/元  (${p.yuan_per_fire} 元/火)  wavg ${p.wavg_fire_per_yuan}  vol ${p.volume_fire}${extra}${flag}${chk}`;
}
