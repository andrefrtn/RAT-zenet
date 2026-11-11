import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { company, dataKeys, displayDate, labels, totals, type Rat } from '../shared/rat.js';
import { signatureImage } from './signatures.js';

const require = createRequire(import.meta.url);
const width = 595.28;
const height = 841.89;
const margin = 42;
const inner = width - margin * 2;
const navy = rgb(0.063, 0.098, 0.18);
const slate = rgb(0.24, 0.3, 0.38);
const blue = rgb(6 / 255, 70 / 255, 165 / 255);
const line = rgb(0.86, 0.88, 0.91);
const paper = rgb(237 / 255, 244 / 255, 1);

function filenamePart(value: string, max: number) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/, '') || 'sem_identificacao';
}

export function pdfFilename(rat: Pick<Rat, 'number' | 'client'>) {
  return 'RAT_' + rat.number + '_' + filenamePart(rat.client, 72) + '.pdf';
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  return text.split('\n').flatMap(paragraph => {
    const rows: string[] = [];
    let row = '';
    for (const word of paragraph.split(/[ \t]+/)) {
      if (!word) continue;
      const joined = row ? row + ' ' + word : word;
      if (font.widthOfTextAtSize(joined, size) <= maxWidth) {
        row = joined;
        continue;
      }
      if (row) rows.push(row);
      row = '';
      for (const char of word) {
        if (row && font.widthOfTextAtSize(row + char, size) > maxWidth) {
          rows.push(row);
          row = '';
        }
        row += char;
      }
    }
    rows.push(row);
    return rows;
  });
}

export async function generatePdf(rat: Rat) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    readFile(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    readFile(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
    readFile(resolve('client/public/zenet.png')),
  ]);
  const normal = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const logo = await doc.embedPng(logoBytes);
  const glyphs = new Set(normal.getCharacterSet());
  const printable = (text: string) => [...text.normalize('NFC')].map(char =>
    char === '\n' || char === '\t' || glyphs.has(char.codePointAt(0)!) ? char :
      '[U+' + char.codePointAt(0)!.toString(16).toUpperCase() + ']'
  ).join('');

  doc.setTitle('RAT ZENET - ' + rat.number);
  doc.setAuthor(company.name);
  let page: PDFPage;
  let y = 0;
  const text = (value: string, x: number, baseline: number, size: number, font = normal, color = navy) =>
    page.drawText(value, { x, y: baseline, size, font, color });

  function newPage(first = false) {
    page = doc.addPage([width, height]);
    page.drawRectangle({ x: 0, y: height - 7, width, height: 7, color: navy });
    page.drawRectangle({ x: margin, y: height - 7, width: 44, height: 7, color: blue });
    page.drawImage(logo, { x: margin, y: height - 97, ...logo.scaleToFit(124, 44) });
    text(company.segments, margin, height - 112, 8, bold, slate);
    text(company.name, 200, height - 53, 11, bold);
    text('CNPJ ' + company.cnpj + '  |  I.E. ' + company.registration, 200, height - 69, 8.5, normal, slate);
    text(company.address + '  |  ' + company.city, 200, height - 83, 8.5, normal, slate);
    text('Fone/Fax ' + company.phone + '  |  ' + company.site, 200, height - 97, 8.5, normal, slate);
    y = height - 139;
    text(first ? 'Relatório de Atendimento Técnico' : 'Relatório de Atendimento Técnico (continuação)', margin, y, first ? 20 : 15, bold);
    y -= 20;
    for (const row of wrap(printable('Nº RAT ' + rat.number + '  |  ' + displayDate(rat.date)), bold, 10, inner)) {
      text(row, margin, y, 10, bold, blue);
      y -= 15;
    }
    y -= 13;
  }
  function reserve(space: number) {
    if (y - space < 69) newPage();
  }
  function section(title: string) {
    reserve(60);
    page.drawRectangle({ x: margin, y: y - 24, width: inner, height: 24, color: paper });
    page.drawRectangle({ x: margin, y: y - 24, width: 3, height: 24, color: blue });
    text(title, margin + 11, y - 16, 11, bold);
    y -= 34;
  }
  function grid(fields: [string, string][], columns: number) {
    const gap = 14;
    const columnWidth = (inner - (columns - 1) * gap) / columns;
    for (let i = 0; i < fields.length; i += columns) {
      const cells = fields.slice(i, i + columns).map(([label, value]) => ({
        label, rows: wrap(printable(value || '—'), normal, 10.5, columnWidth - 3),
      }));
      const rowHeight = 18 + Math.max(...cells.map(cell => cell.rows.length)) * 14;
      reserve(rowHeight);
      cells.forEach(({ label, rows }, col) => {
        const x = margin + col * (columnWidth + gap);
        text(label, x, y, 8.5, bold, slate);
        rows.forEach((row, j) => text(row, x, y - 15 - j * 14, 10.5));
      });
      y -= rowHeight;
    }
  }
  function detail(label: string, value: string) {
    reserve(42);
    text(label, margin, y, 10, bold);
    y -= 17;
    for (const row of wrap(printable(value || '—'), normal, 10.5, inner)) {
      if (y < 79) {
        newPage();
        text(label + ' (continuação)', margin, y, 10, bold);
        y -= 17;
      }
      text(row, margin, y, 10.5);
      y -= 15;
    }
    y -= 8;
  }

  newPage(true);
  section('01  Dados do atendimento');
  grid(dataKeys.map(key => [labels[key], key === 'date' ? displayDate(rat.date) : rat[key]]), 3);
  detail('Técnicos participantes', rat.technicians.map(tech => tech.name).join('; '));
  section('02  Relatório técnico');
  detail(labels.problem, rat.problem);
  detail(labels.solution, rat.solution);
  detail(labels.pending, rat.pending);
  section('03  Fechamento');
  const calculated = totals(rat);
  grid([
    [labels.arrival, rat.arrival], [labels.start, rat.start], [labels.end, rat.end],
    ['Total (duração)', calculated.duration], [labels.kmStart, rat.kmStart], [labels.kmEnd, rat.kmEnd],
    ['KM total', calculated.distance], [labels.status, rat.status],
  ], 4);
  detail(labels.notes, rat.notes);

  reserve(160);
  section('04  Assinaturas');
  const signatureWidth = (inner - 22) / 2;
  const signatures = [{ label: labels.clientSignature, data: rat.clientSignature },
    ...rat.technicians.map(tech => ({ label: tech.name, data: tech.signature }))];
  for (let offset = 0; offset < signatures.length; offset += 2) {
    const row = signatures.slice(offset, offset + 2).map(item => ({ ...item, rows: wrap(printable(item.label), bold, 9, signatureWidth) }));
    const rowHeight = 92 + Math.max(...row.map(item => item.rows.length)) * 12;
    if (y - rowHeight < 69) { newPage(); section('04  Assinaturas (continuação)'); }
    for (const [index, item] of row.entries()) {
      const x = margin + index * (signatureWidth + 22);
      page!.drawRectangle({ x, y: y - 69, width: signatureWidth, height: 77, borderColor: line, borderWidth: 1 });
      const image = await doc.embedPng(signatureImage(item.data));
      const size = image.scaleToFit(signatureWidth - 22, 59);
      page!.drawImage(image, { x: x + (signatureWidth - size.width) / 2, y: y - 69 + (77 - size.height) / 2, ...size });
      item.rows.forEach((label, lineIndex) => text(label, x, y - 83 - lineIndex * 12, 9, bold, slate));
    }
    y -= rowHeight;
  }

  if (rat.photos.length) {
    newPage();
    section('05  Registro fotográfico');
    for (const [index, photo] of rat.photos.entries()) {
      const caption = wrap(printable(photo.caption), normal, 9, inner);
      const blockHeight = 250 + caption.length * 13;
      if (y - blockHeight < 69) { newPage(); section('05  Registro fotográfico (continuação)'); }
      text('Foto ' + (index + 1) + ' - ' + labels[photo.category], margin, y, 10, bold, blue);
      y -= 16;
      const bytes = Buffer.from(photo.data.split(',')[1], 'base64');
      const image = await doc.embedJpg(new Uint8Array(bytes));
      const size = image.scaleToFit(inner, 215);
      page!.drawImage(image, { x: margin + (inner - size.width) / 2, y: y - size.height, ...size });
      y -= 225;
      for (const line of caption) { text(line, margin, y, 9, normal, slate); y -= 13; }
      y -= 12;
    }
  }

  const pages = doc.getPages();
  pages.forEach((footer, i) => {
    footer.drawLine({ start: { x: margin, y: 53 }, end: { x: width - margin, y: 53 }, thickness: 0.75, color: line });
    footer.drawText(company.email + '  |  ' + company.phone, { x: margin, y: 37, size: 8, font: normal, color: slate });
    footer.drawText(String(i + 1) + ' / ' + pages.length, { x: width - margin - 32, y: 37, size: 8, font: normal, color: slate });
  });
  return Buffer.from(await doc.save());
}
