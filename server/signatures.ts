import { PNG } from 'pngjs';

const prefix = 'data:image/png;base64,';
const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function signatureImage(value: string) {
  const encoded = value.slice(prefix.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (!value.startsWith(prefix) || bytes.toString('base64') !== encoded ||
      bytes.length < 45 || !bytes.subarray(0, 8).equals(magic) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('PNG inválido.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 16 || height < 16 || width > 1200 || height > 600 ||
      bytes[24] !== 8 || bytes[28] !== 0 || ![2, 6].includes(bytes[25])) {
    throw new Error('Formato ou dimensões do PNG inválidos.');
  }
  const png = PNG.sync.read(bytes);
  let left = width, top = height, right = -1, bottom = -1, ink = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const [r, g, b, alpha] = png.data.subarray(pixel, pixel + 4);
      if (alpha < 100 || Math.max(r, g, b) > 130) continue;
      ink++;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (ink < 24 || (right - left < 12 && bottom - top < 12)) {
    throw new Error('Desenhe a assinatura antes de continuar.');
  }
  left = Math.max(0, left - 5);
  top = Math.max(0, top - 5);
  const cropped = new PNG({
    width: Math.min(width - left, right - left + 6),
    height: Math.min(height - top, bottom - top + 6),
  });
  PNG.bitblt(png, cropped, left, top, cropped.width, cropped.height, 0, 0);
  return PNG.sync.write(cropped);
}
