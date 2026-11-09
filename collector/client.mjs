import { BASE, SLEEP } from './config.mjs';
import { buildHeaders, canonicalQuery } from './signer.mjs';
import { deviceId, rotate } from './device.mjs';
import * as skeyStore from './skey.mjs';
import { info, warn } from './log.mjs';

const RATE_LIMIT = /手速/;
const SIG_FAIL = /SYSTEM\.FAIL|SIG\.FAIL|验签/;

export class ApiError extends Error {
  constructor(msg, detail) { super(msg); this.detail = detail; }
}

async function once(path, { method = 'GET', query, body } = {}) {
  const skey = skeyStore.current();
  if (!skey) throw new ApiError('no skey available', null);
  const qs = canonicalQuery(query);
  const h = buildHeaders(skey, deviceId(), path, qs);
  if (body !== undefined) h['content-type'] = 'application/json';
  const url = BASE + path + (qs ? '?' + qs : '');
  const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { }
  return { status: r.status, text, json };
}

/**
 * 带自愈的请求：限流→换设备；验签失败→刷 skey；网络抖动→退避重试
 * @returns {Promise<{data:any, attempts:number, healed:string[]}>}
 */
export async function request(path, opts = {}, { retries = 4 } = {}) {
  const healed = [];
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const { status, text, json } = await once(path, opts);
      const code = json?.code;
      const blob = text.slice(0, 300);
      if (RATE_LIMIT.test(blob)) {
        rotate(); healed.push('device');
        warn('rate limited, rotated device id');
        await SLEEP(1500 * (i + 1)); continue;
      }
      if (status === 405 || SIG_FAIL.test(blob) || code === 20000) {
        await skeyStore.refresh('gateway rejected signature');
        healed.push('skey'); lastErr = new ApiError('signature rejected', blob);
        await SLEEP(800); continue;
      }
      if (!json) { lastErr = new ApiError('non-json response', blob); await SLEEP(1000 * (i + 1)); continue; }
      if (json.code === -1 && json.message) throw new ApiError(json.message, json);
      return { data: json, attempts: i + 1, healed };
    } catch (e) {
      lastErr = e;
      if (e instanceof ApiError && /login|spuId|required|invalid/i.test(e.message)) throw e;
      await SLEEP(1000 * (i + 1));
    }
  }
  throw lastErr || new ApiError('request failed', null);
}

export const get = (path, query, o) => request(path, { method: 'GET', query }, o);
export const post = (path, body, o) => request(path, { method: 'POST', body }, o);
export { info };
