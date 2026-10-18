import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { LiveBrowser } from './browser.js';
import { Companion } from './service.js';
import { JsonStore } from './store.js';
import { createApp } from './http.js';
const production = fileURLToPath(import.meta.url).includes(`${process.platform === 'win32' ? '\\' : '/'}dist${process.platform === 'win32' ? '\\' : '/'}`);
const root = resolve(fileURLToPath(new URL(production ? '../../' : '../', import.meta.url)));
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT geçersiz.');
const store = new JsonStore(resolve(root, 'data/state.json'));
const reader = new LiveBrowser();
const service = new Companion(reader, store, await store.load());
const app = createApp(service, port);
if (production) {
  app.use(express.static(resolve(root, 'dist/client')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist/client/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, '127.0.0.1', () => console.log(`Touchline hazır: http://127.0.0.1:${port}`));
server.on('error', error => { console.error('Yerel sunucu başlatılamadı:', error.message); process.exitCode = 1; });
let closing = false;
async function shutdown() {
  if (closing) return; closing = true;
  server.close();
  await reader.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
