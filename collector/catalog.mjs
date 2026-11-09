import { FILES, TARGET_SPU_NAME, FALLBACK_SPU_ID } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import { get } from './client.mjs';

export async function resolveSpu(name = TARGET_SPU_NAME, { force = false } = {}) {
  const cache = readJson(FILES.spu);
  if (!force && cache?.spuId) return cache.spuId;
  try {
    const { data } = await get('/plast/search/spu', { q: name, page: 1, pageSize: 10 });
    const items = data?.data?.items || [];
    const hit = items.find((x) => x.name === name) || items[0];
    if (hit?.id) { writeJson(FILES.spu, { spuId: hit.id, name: hit.name, at: Date.now() }); return hit.id; }
  } catch (e) {
    if (cache?.spuId) return cache.spuId;
  }
  return FALLBACK_SPU_ID;
}
