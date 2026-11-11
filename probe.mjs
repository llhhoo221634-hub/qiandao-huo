// GitHub Actions 出口 IP 探针：直接打千岛网关，看是不是"手速太快"
import crypto from 'crypto';

const SKEY = process.env.HUO_SKEY || '2TJhRTpCpUIgnWl3qwIaoMMt3KhL2nkC';
const PATH = '/c2c-web/v1/common/get-spu-trading-history-list';
const BASE = 'https://api.qiandao.cn';
const DEVICE = 'a3f19b7e-2c4d-4e8a-9b61-7d5c0f2e8a44';

const ipRes = await fetch('https://ipinfo.io/json').then((r) => r.json()).catch(() => ({}));
console.log('EGRESS', JSON.stringify({ ip: ipRes.ip, org: ipRes.org, city: ipRes.city, country: ipRes.country }));

const ts = String(Date.now());
const hex = crypto.createHmac('sha256', SKEY).update(PATH + ts).digest('hex');
const res = await fetch(BASE + PATH, {
  method: 'POST',
  headers: {
    authorization: 'Bearer',
    'x-request-timestamp': ts,
    'x-device-id': '"' + DEVICE + '"',
    'x-request-sign-type': 'HMAC_SHA256',
    'x-request-sign-version': 'v1',
    'x-request-package-sign-version': '0.0.1',
    'x-request-package-id': '1057',
    'x-request-circle': 'qdmp',
    'x-echoing-env': 'test-z',
    'x-request-sign': Buffer.from(hex).toString('base64'),
    'user-agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/156.0 Mobile Safari/537.36',
    referer: 'https://h5.qiandao.com/',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ spuId: '836104794648117801', offset: 0, limit: 100 }),
});
const text = await res.text();
console.log('STATUS', res.status);
console.log('BODY', text.slice(0, 300).replace(/\s+/g, ' '));
try {
  const j = JSON.parse(text);
  if (j.code === '0' || j.code === 0) console.log('ITEMS', (j.data.items || []).length, 'FIRST', JSON.stringify((j.data.items || [])[0] || {}).slice(0, 200));
} catch {}
