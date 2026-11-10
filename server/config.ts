import { z } from 'zod';

const settingsSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  REQUIRE_TECH_SIGNATURE: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(8).default(0),
  RECEIPTS_DIR: z.string().min(1).default('./data/receipts'),
  PUBLIC_ORIGIN: z.string().default('').refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.origin === value && url.protocol === 'https:';
    } catch {
      return false;
    }
  }),
  MAIL_MODE: z.enum(['test', 'smtp']).default('test'),
  MAIL_TO: z.string().trim().default('').refine(value => !value || z.email().safeParse(value).success, 'Informe um endereço de e-mail.'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
}).superRefine((value, ctx) => {
  if (value.MAIL_MODE !== 'smtp' || !value.MAIL_TO) return;
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const) {
    if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Configuração SMTP obrigatória.' });
  }
  if (value.SMTP_FROM && !z.email().safeParse(value.SMTP_FROM).success) {
    ctx.addIssue({ code: 'custom', path: ['SMTP_FROM'], message: 'Informe um endereço de e-mail.' });
  }
});

export type Settings = z.infer<typeof settingsSchema>;

export function settingsFrom(env: NodeJS.ProcessEnv) {
  const result = settingsSchema.safeParse(env);
  if (!result.success) {
    throw new Error('Revise as variáveis de ambiente: ' + result.error.issues.map(issue => issue.path.join('.')).join(', '));
  }
  const settings = result.data;
  return settings.MAIL_TO ? settings : { ...settings, MAIL_MODE: 'test' as const };
}
