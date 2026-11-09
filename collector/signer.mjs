import crypto from 'crypto';
import { PACKAGE_ID, PACKAGE_SIGN_VERSION, SIGN_TYPE, SIGN_VERSION } from './config.mjs';

// 排序 query（与前端一致：按 key 升序，值 URL 编码）
export function canonicalQuery(params) {
  if (!params) return '';
  return Object.keys(params).sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
}

export function buildSign(skey, path, qs, ts) {
  const raw = path + (qs ? '?' + qs : '') + ts;
  const hex = crypto.createHmac('sha256', skey).update(raw).digest('hex');
  return { sign: Buffer.from(hex).toString('base64'), raw };
}

export function buildHeaders(skey, deviceId, path, qs, ts = String(Date.now())) {
  const { sign } = buildSign(skey, path, qs, ts);
  return {
    authorization: 'Bearer',
    'x-request-timestamp': ts,
    'x-device-id': `"${deviceId}"`,
    'x-request-sign-type': SIGN_TYPE,
    'x-request-sign-version': SIGN_VERSION,
    'x-request-package-sign-version': PACKAGE_SIGN_VERSION,
    'x-request-package-id': PACKAGE_ID,
    'x-request-circle': 'qdmp',
    'x-echoing-env': 'test-z',
    'x-request-sign': sign,
    'user-agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/156.0 Mobile Safari/537.36',
    referer: 'https://h5.qiandao.com/',
  };
}
