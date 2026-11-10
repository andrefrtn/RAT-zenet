import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { ratSchema } from '../shared/rat.js';
import type { Settings } from './config.js';
import { createSender, MailError, type SendRat } from './mail.js';
import { generatePdf, pdfFilename } from './pdf.js';
import { receiptStore } from './receipts.js';
import { signatureImage } from './signatures.js';

const bodySchema = z.object({ submissionId: z.uuidv4(), report: z.unknown() }).strict();

function failure(res: Response, status: number, message: string, editable = true) {
  return res.status(status).json({ message, editable });
}

export function createApp(settings: Settings, send?: SendRat) {
  const app = express();
  const mailMode = settings.MAIL_MODE === 'smtp' && settings.MAIL_TO ? 'smtp' : 'test';
  const sendReport = mailMode === 'smtp' ? (send ?? createSender(settings)) : undefined;
  const receipts = receiptStore(resolve(settings.RECEIPTS_DIR));
  const requireTechnician = settings.REQUIRE_TECH_SIGNATURE === 'true';
  const schema = ratSchema(requireTechnician);
  const inFlight = new Set<string>();

  app.disable('x-powered-by');
  app.set('trust proxy', settings.TRUST_PROXY_HOPS || false);
  app.use(helmet({
    contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': settings.PUBLIC_ORIGIN ? [] : null } },
    strictTransportSecurity: Boolean(settings.PUBLIC_ORIGIN),
  }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/config', (_req, res) => res.json({ requireTechnician, mailMode }));

  const limitHandler = (_req: Request, res: Response) =>
    failure(res, 429, 'Limite de tentativas atingido. Aguarde antes de tentar novamente.', false);
  const originCheck = (req: Request, res: Response, next: () => void) => {
    const origin = req.get('origin');
    let matchesOrigin = !origin;
    if (origin) {
      try {
        const url = new URL(origin);
        matchesOrigin = settings.PUBLIC_ORIGIN
          ? url.origin === settings.PUBLIC_ORIGIN
          : url.host === req.get('host') && ['http:', 'https:'].includes(url.protocol);
      } catch {
        matchesOrigin = false;
      }
    }
    if (req.get('sec-fetch-site') === 'cross-site' || !matchesOrigin) {
      return failure(res, 403, 'Origem da solicitação inválida.');
    }
    if (!req.is('application/json')) return failure(res, 415, 'Envie os dados em JSON.');
    next();
  };

  app.post('/api/rat', originCheck,
    rateLimit({ windowMs: 15 * 60_000, limit: 16, standardHeaders: 'draft-8', legacyHeaders: false, handler: limitHandler }),
    rateLimit({ windowMs: 60 * 60_000, limit: 150, keyGenerator: () => 'all', legacyHeaders: false, handler: limitHandler }),
    express.json({ limit: '1mb', inflate: false }),
    async (req, res) => {
      const envelope = bodySchema.safeParse(req.body);
      if (!envelope.success) return failure(res, 422, 'Solicitação de envio inválida.');
      const { submissionId, report } = envelope.data;
      const validated = schema.safeParse(report);
      if (!validated.success) {
        return res.status(422).json({
          message: 'Revise os campos destacados antes de enviar.',
          editable: true,
          errors: validated.error.flatten().fieldErrors,
        });
      }

      const rat = validated.data;
      let signatures: { client: Buffer; technician?: Buffer };
      try {
        signatures = { client: signatureImage(rat.clientSignature) };
      } catch {
        return res.status(422).json({
          message: 'Refaça a assinatura do cliente.',
          editable: true,
          errors: { clientSignature: ['Desenhe uma assinatura válida.'] },
        });
      }
      if (rat.technicianSignature) {
        try {
          signatures.technician = signatureImage(rat.technicianSignature);
        } catch {
          return res.status(422).json({
            message: 'Refaça a assinatura do técnico.',
            editable: true,
            errors: { technicianSignature: ['Desenhe uma assinatura válida.'] },
          });
        }
      }

      if (inFlight.has(submissionId)) return failure(res, 409, 'O envio ainda está sendo processado. Tente novamente em instantes.', false);
      inFlight.add(submissionId);
      const fingerprint = createHash('sha256').update(JSON.stringify([mailMode, rat])).digest('hex');
      let state: 'unchecked' | 'claimed' | 'accepted' | 'smtp' = 'unchecked';
      try {
        const existing = await receipts.claim(submissionId, fingerprint);
        if (existing && (existing.fingerprint !== fingerprint || existing.state !== 'accepted')) {
          return failure(res, 409, 'Já existe uma tentativa para este envio. Se a mensagem persistir, verifique a caixa de entrada com o responsável antes de criar outro RAT.', false);
        }
        state = existing ? 'accepted' : 'claimed';
        const pdf = await generatePdf(rat, signatures);
        const filename = pdfFilename(rat);
        if (state === 'claimed') {
          if (sendReport) {
            state = 'smtp';
            await sendReport(rat, submissionId, filename, pdf);
          }
          await receipts.accept(submissionId);
        }
        return res.set('Content-Disposition', 'attachment; filename="' + filename + '"')
          .set('X-Mail-Mode', mailMode).type('application/pdf').send(pdf);
      } catch (error) {
        if (state === 'claimed' || (state === 'smtp' && error instanceof MailError && !error.uncertain)) {
          try {
            await receipts.release(submissionId);
            return failure(res, 503, state === 'smtp'
              ? 'O serviço de e-mail recusou o envio. Tente novamente.'
              : 'O PDF não pôde ser gerado. Tente novamente.');
          } catch {
            return failure(res, 503, 'Não foi possível registrar o resultado do envio. Verifique a caixa de entrada antes de criar outro RAT.', false);
          }
        }
        return failure(res, 503, 'Não foi possível confirmar o envio. Tente novamente com o mesmo rascunho.', false);
      } finally {
        inFlight.delete(submissionId);
      }
    },
  );

  app.use('/api', (_req, res) => failure(res, 404, 'Rota não encontrada.'));
  app.use(express.static(resolve('dist/client')));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error.status === 413) return failure(res, 413, 'O relatório excede o limite de tamanho.');
    if (error.status === 400 || error.status === 415) return failure(res, error.status, 'Formato de solicitação inválido.');
    return failure(res, 500, 'Erro ao processar a solicitação. Tente novamente.', false);
  };
  app.use(handleError);
  return app;
}
