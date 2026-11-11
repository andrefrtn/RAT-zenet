import { PNG } from 'pngjs';
import { randomUUID } from 'node:crypto';
import { emptyDraft, ratSchema, type Rat } from '../shared/rat.js';

export function pngData(draw = true, offset = 0) {
  const png = new PNG({ width: 160, height: 72 });
  if (draw) for (let x = 12; x < 145; x++) {
    const y = 27 + offset + Math.round(Math.sin(x / 7) * 13);
    for (let d = -2; d < 3; d++) png.data[((y + d) * png.width + x) * 4 + 3] = 255;
  }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
}
export const technicianIds = [randomUUID(), randomUUID(), randomUUID()];
export const sample = ratSchema().parse({
  ...structuredClone(emptyDraft), serviceType: 'Contrato', ticket: 'OS-97', opening: 'Telefone',
  date: '2026-11-11', client: 'Empresa de teste', branch: 'Unidade de teste', requester: 'Solicitante de teste',
  equipment: 'Estação de trabalho', sector: 'Administrativo', serial: 'SN123', asset: 'PAT123',
  problem: 'A estação não acessava a rede.', solution: 'Conector substituído e conexão verificada.', pending: '',
  arrival: '23:30', start: '23:45', end: '01:15', kmStart: '10235,5', kmEnd: '10262', status: 'Operacional', notes: '',
  clientSignature: pngData(), technicians: technicianIds,
  technicianSignatures: Object.fromEntries(technicianIds.map((id, index) => [id, pngData(true, index)])),
});
export const issued: Rat = {
  ...sample, number: '2026-11-11-0001', issuedAt: '2026-11-11T15:00:00.000Z',
  technicians: technicianIds.map((id, index) => ({ id, name: 'Profissional de teste ' + (index + 1), signature: sample.technicianSignatures[id] })),
};
