import { z } from 'zod';
import { defaultPhotoLimits } from '../shared/rat.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  PUBLIC_ORIGIN: z.string().default('').refine(value => {
    if (!value) return true;
    try { return new URL(value).origin === value && value.startsWith('https://'); } catch { return false; }
  }),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(8).default(0),
  PHOTO_MAX_COUNT: z.coerce.number().int().min(1).max(40).default(defaultPhotoLimits.maxCount),
  PHOTO_MAX_FILE_MB: z.coerce.number().int().min(1).max(15).default(10),
  PHOTO_MAX_BYTES: z.coerce.number().int().min(50_000).max(600_000).default(defaultPhotoLimits.maxBytes),
  PHOTO_MAX_EDGE: z.coerce.number().int().min(640).max(2000).default(defaultPhotoLimits.maxEdge),
  PHOTO_QUALITY: z.coerce.number().int().min(50).max(90).default(defaultPhotoLimits.quality),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.PUBLIC_ORIGIN) ctx.addIssue({ code: 'custom', path: ['PUBLIC_ORIGIN'], message: 'Configure a origem HTTPS.' });
});
export type Settings = z.infer<typeof schema>;
export function settingsFrom(env: NodeJS.ProcessEnv): Settings {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error('Revise as variáveis de ambiente: ' + result.error.issues.map(issue => issue.path.join('.')).join(', '));
  return result.data;
}
export function photoLimits(settings: Settings) {
  return {
    maxCount: settings.PHOTO_MAX_COUNT, maxFileBytes: settings.PHOTO_MAX_FILE_MB * 1024 * 1024,
    maxBytes: settings.PHOTO_MAX_BYTES, maxEdge: settings.PHOTO_MAX_EDGE, quality: settings.PHOTO_QUALITY,
  };
}
