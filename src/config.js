import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const integer = (value, fallback, min, max) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('Configuração numérica inválida no .env.');
  return n;
};
export function getConfig(overrides = {}) {
  const port = integer(process.env.PORT, 3000, 1, 65535);
  return {
    port, host: process.env.HOST || '127.0.0.1',
    dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
    publicDir: path.join(ROOT, 'public'),
    origins: (process.env.APP_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port},http://localhost:8100,http://127.0.0.1:8100`).split(',').map(x => x.trim()).filter(Boolean),
    secureCookie: process.env.COOKIE_SECURE === 'true',
    registration: process.env.ALLOW_REGISTRATION !== 'false',
    maxFileBytes: integer(process.env.MAX_UPLOAD_MB, 100, 1, 1024) * 1024 * 1024,
    quotaBytes: integer(process.env.USER_STORAGE_MB, 2048, 1, 102400) * 1024 * 1024,
    sessionHours: integer(process.env.SESSION_HOURS, 24, 1, 720),
    audioEnabled: process.env.AUDIO_ENABLED === 'true',
    python: process.env.AUDIO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    jobTimeoutMs: integer(process.env.AUDIO_TIMEOUT_SECONDS, 1800, 10, 14400) * 1000,
    ollamaUrl: process.env.OLLAMA_URL || '',
    embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma',
    ...overrides
  };
}
