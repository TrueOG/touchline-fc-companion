import express, { type ErrorRequestHandler } from 'express';
import type { Companion } from './service.js';
import { AppError } from './domain.js';
import type { MockReader, Scenario } from './mock.js';
export function createApp(service: Companion, port: number, mock?: MockReader) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host ?? '')) { res.status(403).json({ message: 'Yalnızca yerel bağlantı desteklenir.' }); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      if (req.headers.origin && !hosts.map(host => `http://${host}`).includes(req.headers.origin)) { res.status(403).json({message:'Kaynak doğrulanamadı.'}); return; }
      if (req.method !== 'GET' && req.headers['x-local-client'] !== 'touchline') { res.status(403).json({message:'Yerel istemci başlığı gerekli.'}); return; }
    }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.get('/api/history', (req,res)=>res.json(service.historyPage(Number(req.query.page??1))));
  app.get('/api/state', (_req, res) => res.json(service.state()));
  app.get('/api/browser/inspection', async (_req, res) => res.json(await service.inspect()));
  app.post('/api/runs', async (req, res) => {
    const b=req.body;
    if(!b || typeof b.id!=='string' || typeof b.targetId!=='string' || typeof b.maxPrice!=='number' || typeof b.durationSeconds!=='number' || typeof b.intervalSeconds!=='number') throw new AppError('invalid','Çalışma alanları geçersiz.');
    res.json(await service.startRun(b));
  });
  app.post('/api/runs/:id/stop', (req, res) => res.json(service.stopRun(String(req.params.id))));
  app.post('/api/browser/open', async (_req, res) => { await service.open(); res.json(service.state()); });
  app.post('/api/browser/close', async (_req, res) => { await service.close(); res.json(service.state()); });
  app.post('/api/targets/capture', async (_req, res) => res.json(await service.capture()));
  app.post('/api/attempts', async (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || !('id' in body) || !('targetId' in body) || !('maxPrice' in body) || typeof body.id !== 'string' || typeof body.targetId !== 'string' || typeof body.maxPrice !== 'number') throw new AppError('invalid', 'İstek alanları geçersiz.');
    res.json(await service.attempt(body.id, body.targetId, body.maxPrice, 'autoBuy' in body && body.autoBuy === true, ('minBidResetAt' in body ? body.minBidResetAt : undefined) as number | undefined));
  });
  app.post('/api/attempts/:id/resolve', async (req, res) => {
    await service.resolve(String(req.params.id), req.body?.resolution, req.body?.checked);
    res.json(service.state());
  });
  // Only test bootstrapping registers this route. Production has no mock switch.
  if (mock) app.post('/api/test/scenario', (req, res) => {
    const scenarios: Scenario[] = ['purchased','purchase_failed','eligible','price_high','no_player','wrong_version','price_changed','listing_gone','session_expired','disconnected','unknown'];
    if (!scenarios.includes(req.body?.scenario)) throw new AppError('invalid', 'Geçersiz test senaryosu.');
    mock.scenario = req.body.scenario as Scenario; res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({message:'Böyle bir işlem yok.'}));
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AppError) res.status(error.status).json({code:error.code,message:error.message});
    else res.status(500).json({code:'internal',message:'İşlem tamamlanamadı. Durumu yenileyip kontrol edin.'});
  };
  app.use(errorHandler);
  return app;
}
