import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { FILES, HERE, ROOT, H5_HOME } from './config.mjs';
import { readJson, writeJson, ensureDir } from './store.mjs';
import { info, warn } from './log.mjs';

let cached = null;

export function current() {
  if (cached) return cached;
  const s = readJson(FILES.skey);
  return s?.skey || null;
}

export function save(skey, src = 'manual') {
  cached = skey;
  writeJson(FILES.skey, { skey, src, at: Date.now() });
  return skey;
}

// 从线上 H5 产物现场还原 skey（前端混淆后的字符串表，只能执行不能正则）
const PAGES = ['/island?id=300444', '/', '/pages-tab/home/index'];

export async function discoverBundleUrl() {
  for (const p of PAGES) {
    const html = await (await fetch(H5_HOME + p, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
    const m = html.match(/<script[^>]*type="module"[^>]*\ssrc="([^"]+\.js)"/);
    if (m) return m[1].startsWith('http') ? m[1] : H5_HOME + m[1];
  }
  throw new Error('bundle url not found in shell html');
}

const PROBE = '\nexport const __skey = (() => { try { return lz.production; } catch (e) { return null; } })();\n';

function withProbe(src) {
  const i = src.lastIndexOf('export{');
  if (i < 0) return src + PROBE;
  const j = src.indexOf('}', i);
  return src.slice(0, i) + src.slice(j + 1) + PROBE;
}

function runExtractor() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(HERE, 'extract.mjs')], {
      cwd: ROOT, env: { ...process.env, ROOT, BUNDLE: path.join(HERE, 'state', 'bundle.live.mjs') },
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      if (code === 0) return resolve(out);
      if (code === 3) return reject(new Error('缺少 jsdom，无法刷新密钥：npm i jsdom 或设置 HUO_ROOT=/path/to/project'));
      reject(new Error('extractor exit ' + code + ': ' + out.slice(-300)));
    });
    setTimeout(() => p.kill('SIGKILL'), 120000);
  });
}

export async function refresh(reason = '') {
  if (reason) warn('refreshing skey:', reason);
  const url = await discoverBundleUrl();
  const src = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  if (src.length < 100000) throw new Error('bundle too small: ' + src.length);
  ensureDir(path.join(HERE, 'state', 'x'));
  fs.writeFileSync(path.join(HERE, 'state', 'bundle.live.mjs'), withProbe(src));
  const out = await runExtractor();
  const m = out.match(/skey\s+([A-Za-z0-9+/=]{20,})/);
  if (!m) throw new Error('skey not found in extractor output: ' + out.slice(-300));
  if (m[1] === 'null') throw new Error('bundle export shape changed (lz not found)');
  info('skey refreshed from', url);
  return save(m[1], url);
}
