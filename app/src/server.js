// HTTP API and web console. Binds to 127.0.0.1 unless MERIDIAN_HOST says otherwise.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(engine, { mode = 'offline', version = '1.0.0' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.resolve(here, '..', 'public'), { index: 'index.html' }));

  const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).then(out => res.json(out)).catch(next);

  app.get('/api/health', h(async () => {
    const store = await engine.store.ping();
    const cfg = await engine.config();
    return { ok: true, mode, store: store.store, version, demo_today: cfg.today, model: cfg.model };
  }));

  app.get('/api/listings', h(req => engine.searchListings({ q: req.query.q || '', category: req.query.category || '' })));
  app.get('/api/listings/:id', h(req => engine.listingDetail(req.params.id)));

  app.get('/api/workspaces', h(() => engine.store.listWorkspaces()));
  app.get('/api/workspaces/:ws', h(req => engine.workspaceState(req.params.ws)));
  app.post('/api/workspaces/:ws/installs/:listing/purchase', h(req => engine.purchase(req.params.ws, req.params.listing, req.body || {})));
  app.put('/api/workspaces/:ws/installs/:listing/policy', h(req => engine.updatePolicy(req.params.ws, req.params.listing, req.body || {})));
  app.post('/api/workspaces/:ws/installs/:listing/approve', h(req => engine.approveDeploy(req.params.ws, req.params.listing, req.body || {})));
  app.get('/api/workspaces/:ws/usage', h(req => engine.usage(req.params.ws)));

  app.post('/api/run', h(req => engine.run(req.body || {})));
  app.get('/api/approvals', h(req => engine.listApprovals(req.query)));
  app.post('/api/approvals/:id/decide', h(req => engine.decide(req.params.id, req.body || {})));
  app.get('/api/audit', h(req => engine.listAudit(req.query)));

  app.get('/api/review', h(() => engine.reviewQueue()));
  app.post('/api/review/:id/decide', h(req => engine.reviewDecide(req.params.id, req.body || {})));
  app.get('/api/operator/health', h(() => engine.health()));

  app.post('/api/demo/reset', h(async () => { await engine.store.reset(); return { ok: true }; }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'No such API route. See README, HTTP API.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'The request body is not valid JSON.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'The request body is too large.' });
    console.error('[meridian] unexpected error:', err);
    return res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server. Check the terminal for details.' });
  });
  return app;
}

export function listen(app, { host, port }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on('error', reject);
  });
}
