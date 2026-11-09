const t = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
export const log = (...a) => console.error(`[${t()}]`, ...a);
export const info = (...a) => log('INFO', ...a);
export const warn = (...a) => log('WARN', ...a);
export const error = (...a) => log('ERR ', ...a);
