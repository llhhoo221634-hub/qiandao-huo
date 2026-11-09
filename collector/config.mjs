import path from 'path';
import { fileURLToPath } from 'url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');       // /root/workspace/qiandao

export const BASE = process.env.HUO_BASE || 'https://api.qiandao.cn';
export const H5_HOME = 'https://h5.qiandao.com';

// 网关要求的固定标识（实测必需）
export const PACKAGE_ID = '1057';
export const PACKAGE_SIGN_VERSION = '0.0.1';
export const SIGN_TYPE = 'HMAC_SHA256';
export const SIGN_VERSION = 'v1';

export const TARGET_SPU_NAME = '初火源质';
export const FALLBACK_SPU_ID = '836104794648117801';

export const FILES = {
  skey: path.join(HERE, 'state', 'skey.json'),
  device: path.join(HERE, 'state', 'device.json'),
  spu: path.join(HERE, 'state', 'spu.json'),
  lastKnown: path.join(HERE, 'state', 'last_known.json'),
  csv: process.env.HUO_CSV || '/sdcard/Download/DSH-Go/huo_price.csv',
};

export const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
