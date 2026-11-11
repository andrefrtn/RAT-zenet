import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { defaultPhotoLimits, duration, elapsedLabel, kilometers, ratSchema, totals } from '../shared/rat.js';
import { generatePdf, pdfFilename } from '../server/pdf.js';
import { signatureImage } from '../server/signatures.js';
import { preparePhoto, normalizeSubmission } from '../server/images.js';
import { pngData, sample, issued, technicianIds } from './fixture.js';

test('mantém os cálculos de duração, virada de dia e quilômetros decimais', () => {
  assert.equal(duration('23:45', '01:15'), 90);
  assert.equal(duration('12:00', '12:00'), 0);
  assert.equal(duration('25:00', '00:00'), null);
  assert.equal(elapsedLabel(90), '01:30');
  assert.equal(kilometers('100,1', '100.3'), 0.2);
  assert.equal(kilometers('11', '10'), null);
  assert.equal(kilometers('1e3', '1001'), null);
  assert.deepEqual(totals(sample), { duration: '01:30', distance: '26,5 km' });
});
test('exige técnicos únicos e associa exatamente uma assinatura a cada ID', () => {
  assert.ok(ratSchema().safeParse(sample).success);
  for (const change of [
    { technicians: [] }, { technicians: [technicianIds[0], technicianIds[0]] },
    { technicianSignatures: {} }, { clientSignature: '' }, { date: '2026-02-30' },
    { arrival: '00:10', start: '23:45', end: '01:15' }, { kmEnd: '3' }, { kmEnd: '' },
    { number: '2026-11-11-0001' }, { technicianSignatures: { ...sample.technicianSignatures, [randomUUID()]: pngData() } },
  ]) assert.equal(ratSchema().safeParse({ ...sample, ...change }).success, false);
});
test('rejeita assinaturas vazias, PNG falso e imagem truncada', () => {
  assert.ok(signatureImage(sample.clientSignature).length > 45);
  assert.throws(() => signatureImage(pngData(false)));
  assert.throws(() => signatureImage(sample.clientSignature.slice(0, -8)));
  assert.throws(() => signatureImage('data:image/png;base64,SGVsbG8='));
});
test('normaliza JPEG, PNG e WebP, comprime e corrige orientação EXIF', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#0646a5' } }).toFormat(format).toBuffer();
    const result = Buffer.from((await preparePhoto(input, defaultPhotoLimits)).split(',')[1], 'base64');
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.width, 1600); assert.equal(metadata.height, 800);
    assert.equal(metadata.format, 'jpeg'); assert.ok(result.length <= defaultPhotoLimits.maxBytes);
  }
  const rotated = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#ffffff' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const fixed = Buffer.from((await preparePhoto(rotated, defaultPhotoLimits)).split(',')[1], 'base64');
  const metadata = await sharp(fixed).metadata();
  assert.equal(metadata.width, 40); assert.equal(metadata.height, 80); assert.equal(metadata.orientation, undefined);
  await assert.rejects(preparePhoto(Buffer.from('arquivo inválido'), defaultPhotoLimits));
  await assert.rejects(preparePhoto(Buffer.alloc(defaultPhotoLimits.maxFileBytes + 1), defaultPhotoLimits));
});
test('preserva a categoria e a legenda, recusa fotos acima do limite', async () => {
  const photo = { id: randomUUID(), category: 'problem' as const, caption: 'Conector danificado', data: pngData() };
  const result = await normalizeSubmission({ ...sample, photos: [photo] }, defaultPhotoLimits);
  assert.equal(result.photos[0].category, 'problem'); assert.equal(result.photos[0].caption, photo.caption);
  await assert.rejects(normalizeSubmission({ ...sample, photos: [photo, { ...photo, id: randomUUID() }] }, { ...defaultPhotoLimits, maxCount: 1 }));
});
test('PDF A4 inclui técnicos, todas as assinaturas e registro fotográfico paginado', async () => {
  const photo = await preparePhoto(Buffer.from(pngData().split(',')[1], 'base64'), defaultPhotoLimits);
  const report = { ...issued, problem: 'Descrição técnica detalhada da estação e da conectividade. '.repeat(170),
    photos: Array.from({ length: 5 }, (_, index) => ({ id: randomUUID(), category: 'notes' as const, caption: 'Foto de teste ' + index, data: photo })) };
  const bytes = await generatePdf(report);
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 5);
  assert.deepEqual(document.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  assert.equal(pdfFilename(issued), 'RAT_2026-11-11-0001_Empresa_de_teste.pdf');
});
