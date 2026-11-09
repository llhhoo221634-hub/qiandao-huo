import fs from 'fs';
import path from 'path';

export function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }

export function readJson(file, def = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}

export function writeJson(file, obj) {
  ensureDir(file);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}

export function appendCsv(file, header, row) {
  ensureDir(file);
  if (!fs.existsSync(file)) fs.writeFileSync(file, header + '\n');
  fs.appendFileSync(file, row.join(',') + '\n');
}
