import sharp from 'sharp';
import type { Photo, PhotoLimits, Submission } from '../shared/rat.js';
import { ReportError } from './database.js';
import { signatureImage } from './signatures.js';

export async function preparePhoto(bytes: Buffer, limits: PhotoLimits) {
  if (!bytes.length || bytes.length > limits.maxFileBytes) throw new ReportError(413, 'A fotografia excede o tamanho permitido.');
  try {
    const image = sharp(bytes, { limitInputPixels: 36_000_000, failOn: 'warning', animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages ?? 1) > 1) throw new Error();
    const output = await image.rotate().resize({ width: limits.maxEdge, height: limits.maxEdge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: limits.quality, mozjpeg: true }).toBuffer();
    if (output.length > limits.maxBytes) throw new ReportError(413, 'A imagem ainda está muito grande. Selecione uma foto menor.');
    return 'data:image/jpeg;base64,' + output.toString('base64');
  } catch (error) {
    if (error instanceof ReportError) throw error;
    throw new ReportError(422, 'Use uma fotografia JPEG, PNG ou WebP válida, com até 36 megapixels.');
  }
}
export async function normalizeSubmission(report: Submission, limits: PhotoLimits): Promise<Submission> {
  if (report.photos.length > limits.maxCount) throw new ReportError(422, 'O relatório excede a quantidade permitida de fotos.');
  try {
    signatureImage(report.clientSignature);
    for (const id of report.technicians) signatureImage(report.technicianSignatures[id]);
  } catch { throw new ReportError(422, 'Refaça as assinaturas inválidas antes de finalizar.'); }
  const photos: Photo[] = [];
  for (const photo of report.photos) photos.push({ ...photo, data: await preparePhoto(Buffer.from(photo.data.split(',')[1], 'base64'), limits) });
  return { ...report, photos };
}
