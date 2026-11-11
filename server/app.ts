import { resolve } from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { ratSchema } from '../shared/rat.js';
import { photoLimits, type Settings } from './config.js';
import { Database, ReportError } from './database.js';
import { normalizeSubmission, preparePhoto } from './images.js';
import { generatePdf } from './pdf.js';

const operationSchema = z.uuidv4();
const envelopeSchema = z.object({ submissionId: operationSchema, report: z.unknown() }).strict();

export function createApp(settings: Settings, db: Database, renderPdf = generatePdf) {
  const app = express();
  const limits = photoLimits(settings);
  let processing = 0;
  const workloadLimit: RequestHandler = (_req, res, next) => {
    if (processing >= 2) { res.set('Retry-After', '2').status(429).json({ message: 'O servidor está processando outros relatórios. Tente novamente em instantes.' }); return; }
    processing++;
    res.once('close', () => { processing--; });
    next();
  };
  app.disable('x-powered-by');
  app.set('trust proxy', settings.TRUST_PROXY_HOPS || false);
  app.use(helmet({
    contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'upgrade-insecure-requests': settings.PUBLIC_ORIGIN ? [] : null } },
    strictTransportSecurity: Boolean(settings.PUBLIC_ORIGIN),
  }));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const origin = req.get('origin');
    let valid = !origin;
    if (origin) {
      try {
        const url = new URL(origin);
        valid = settings.PUBLIC_ORIGIN ? url.origin === settings.PUBLIC_ORIGIN : url.host === req.get('host') && url.protocol === 'http:';
      } catch { valid = false; }
    }
    if (!valid || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ message: 'Origem da solicitação inválida.' });
    next();
  });
  app.get('/api/config', async (_req, res) => {
    const [technicians, numberPreview] = await Promise.all([db.technicians(), db.numberPreview()]);
    res.json({ technicians, photoLimits: limits, numberPreview });
  });
  const requestLimit = rateLimit({ windowMs: 15 * 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Limite de operações atingido. Aguarde antes de tentar novamente.' } });
  app.post('/api/photos/prepare', requestLimit, workloadLimit, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: limits.maxFileBytes, inflate: false }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new ReportError(415, 'Use fotografias JPEG, PNG ou WebP.');
    res.json({ data: await preparePhoto(req.body, limits) });
  });
  const reportBody = express.json({ limit: limits.maxCount * 1_000_000 + 16 * 280_000 + 200_000, inflate: false });
  app.post(['/api/rat', '/api/rat/pdf'], requestLimit, workloadLimit, reportBody, async (req, res) => {
    const envelope = envelopeSchema.safeParse(req.body);
    if (!envelope.success) throw new ReportError(422, 'Operação de emissão inválida.');
    const parsed = ratSchema().safeParse(envelope.data.report);
    if (!parsed.success) return res.status(422).json({ message: 'Confira os campos e as assinaturas antes de finalizar.', editable: true, errors: parsed.error.flatten().fieldErrors });
    const report = await db.issue(envelope.data.submissionId, parsed.data, () => normalizeSubmission(parsed.data, limits), req.path === '/api/rat/pdf');
    if (req.path === '/api/rat') return res.json(db.metadata(envelope.data.submissionId, report));
    try {
      const pdf = await renderPdf(report);
      res.set('Content-Disposition', 'attachment; filename="' + db.metadata(envelope.data.submissionId, report).filename + '"').type('application/pdf').send(pdf);
    } catch {
      res.status(503).json({ message: 'O RAT ' + report.number + ' já foi emitido. Tente gerar o PDF novamente.', issued: true, number: report.number });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
  app.use(express.static(resolve('dist/client')));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ReportError) return res.status(error.status).json({ message: error.message, editable: error.status === 422 });
    if (error.status === 413) return res.status(413).json({ message: 'O arquivo ou relatório excede o tamanho permitido.' });
    if (error.status === 400 || error.status === 415) return res.status(error.status).json({ message: 'Formato de solicitação inválido.' });
    res.status(503).json({ message: 'Não foi possível confirmar a operação. Mantenha este rascunho e tente novamente.' });
  };
  app.use(handleError);
  return app;
}
