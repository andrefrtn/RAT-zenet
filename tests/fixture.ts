import { PNG } from 'pngjs';
import { emptyDraft, ratFields } from '../shared/rat.js';

export function pngData(draw = true, offset = 0) {
  const png = new PNG({ width: 160, height: 72 });
  if (draw) {
    for (let x = 12; x < 145; x++) {
      const y = 27 + offset + Math.round(Math.sin(x / 7) * 13);
      for (let d = -2; d < 3; d++) png.data[((y + d) * png.width + x) * 4 + 3] = 255;
    }
  }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
}

export const sample = ratFields.parse({
  ...emptyDraft,
  number: '2026/012', serviceType: 'Contrato', ticket: 'OS-97', opening: 'Telefone',
  date: '2026-11-10', client: 'Oficina São João', branch: 'Calafate', requester: 'Ana',
  technician: 'Luís', equipment: 'Estação de trabalho', sector: 'Administrativo',
  serial: 'SN123', asset: 'PAT123', problem: 'A estação não acessava a rede.',
  solution: 'Conector substituído e conexão verificada.', pending: '',
  arrival: '23:30', start: '23:45', end: '01:15', kmStart: '10235,5', kmEnd: '10262',
  status: 'Operacional', notes: 'Configuração conferida com a solicitante.',
  clientSignature: pngData(), technicianSignature: pngData(true, 5),
});
