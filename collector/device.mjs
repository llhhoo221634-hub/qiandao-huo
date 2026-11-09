import crypto from 'crypto';
import { FILES } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

export function deviceId() {
  const s = readJson(FILES.device);
  if (s?.id) return s.id;
  return rotate();
}

export function rotate() {
  const id = crypto.randomUUID();
  writeJson(FILES.device, { id, at: Date.now() });
  return id;
}
