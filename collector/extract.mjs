// 在 jsdom 桩环境里加载线上 bundle，打印 skey
import { createRequire } from 'module';
import path from 'path';
const req = createRequire(path.resolve(process.env.HUO_ROOT || '/root/workspace/qiandao', 'package.json'));
let JSDOM;
try { ({ JSDOM } = req('jsdom')); } catch (e) {
  console.log('MISSING_DEP jsdom: 无法加载 jsdom，密钥刷新不可用');
  process.exit(3);
}
const BUNDLE = process.env.BUNDLE;
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://h5.qiandao.com/island?id=300444', pretendToBeVisual: true, runScripts: 'outside-only',
});
const w = dom.window;
globalThis.window = w; globalThis.document = w.document; globalThis.self = w;
for (const k of Object.getOwnPropertyNames(w)) {
  if (['window', 'self', 'navigator', 'location', 'document'].includes(k)) continue;
  try { if (!(k in globalThis)) globalThis[k] = w[k]; } catch {}
}
globalThis.location = w.location;
globalThis.MutationObserver = w.MutationObserver || class { observe() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const ctx = new Proxy({}, { get: (t, k) => k === 'backingStorePixelRatio' ? 1 : k === 'measureText' ? () => ({ width: 1 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => ({}) });
w.HTMLCanvasElement.prototype.getContext = () => ctx;
globalThis.wx = new Proxy({}, { get: (t, k) => k === 'getStorageSync' ? () => '' : () => ({}) });
globalThis.uni = new Proxy({}, { get: (t, k) => {
  if (k === 'getStorageSync') return () => '';
  if (typeof k === 'string' && /^(on|off)/.test(k)) return () => {};
  return () => ({});
} });
globalThis.__uniConfig = { router: { routerBase: '', mode: 'hash', base: '/' }, globalStyle: {}, pages: [] };
globalThis.__uniRoutes = [];
globalThis.getApp = () => ({ globalData: {} });
globalThis.getCurrentPages = () => [];

const m = await import('file://' + BUNDLE);
console.log('skey', m.__skey || (m.lz && m.lz.production) || 'null');
process.exit(0);
