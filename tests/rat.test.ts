import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import { duration, elapsedLabel, kilometers, ratSchema, totals } from '../shared/rat.js';
import { generatePdf, pdfFilename } from '../server/pdf.js';
import { signatureImage } from '../server/signatures.js';
import { pngData, sample } from './fixture.js';

test('calcula a duração no mesmo dia e na virada da meia-noite', () => {
  assert.equal(duration('09:20', '10:00'), 40);
  assert.equal(duration('23:45', '01:15'), 90);
  assert.equal(duration('12:00', '12:00'), 0);
  assert.equal(duration('25:00', '00:00'), null);
  assert.equal(elapsedLabel(90), '01:30');
});

test('calcula quilometragem decimal sem erro de arredondamento e rejeita total negativo', () => {
  assert.equal(kilometers('100,1', '100.3'), 0.2);
  assert.equal(kilometers('11', '10'), null);
  assert.equal(kilometers('', '10'), null);
  assert.equal(kilometers('1e3', '1001'), null);
  assert.deepEqual(totals(sample), { duration: '01:30', distance: '26,5 km' });
});

test('valida data, sequência de horários, KM em pares e assinaturas obrigatórias', () => {
  assert.equal(ratSchema(true).safeParse(sample).success, true);
  assert.equal(ratSchema(false).safeParse({ ...sample, technicianSignature: '' }).success, true);
  for (const change of [
    { technicianSignature: '' }, { clientSignature: '' }, { date: '2026-02-30' },
    { arrival: '00:10', start: '23:45', end: '01:15' }, { kmEnd: '3' },
    { kmEnd: '' }, { number: '01\nBCC' }, { recipient: 'alternativo@example.org' },
  ]) assert.equal(ratSchema(true).safeParse({ ...sample, ...change }).success, false, JSON.stringify(change));
});

test('decodifica PNG com traços e recusa PNG vazio, truncado e falso', () => {
  assert.ok(signatureImage(sample.clientSignature).length > 45);
  assert.throws(() => signatureImage(pngData(false)));
  assert.throws(() => signatureImage(sample.clientSignature.slice(0, -8)));
  assert.throws(() => signatureImage('data:image/png;base64,SGVsbG8='));
});

test('gera PDF de uma página para um RAT curto e pagina textos longos com ambas as assinaturas', async () => {
  assert.equal(pdfFilename(sample), 'RAT_2026_012_Oficina_Sao_Joao_2026-11-10.pdf');
  const signatures = { client: signatureImage(sample.clientSignature), technician: signatureImage(sample.technicianSignature) };
  const shortPdf = await PDFDocument.load(await generatePdf(sample, signatures));
  assert.equal(shortPdf.getPageCount(), 1);
  const text = 'Verificação da estação, alimentação, conectividade e periféricos. '.repeat(150) + '\nREGISTRO FINAL';
  const longPdf = await PDFDocument.load(await generatePdf({ ...sample, problem: text }, signatures));
  assert.ok(longPdf.getPageCount() >= 3);
  const lastPage = longPdf.getPages().at(-1)!;
  const images = lastPage.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  assert.equal(images.entries().filter(([, reference]) =>
    longPdf.context.lookup(reference, PDFRawStream).dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
  ).length, 3); // logomarca e dois PNGs
});
