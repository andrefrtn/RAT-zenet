import { z } from 'zod';

export const company = {
  name: 'ZENET INFORMÁTICA LTDA',
  cnpj: '10.358.390/0001-20',
  registration: '0010915830043',
  address: 'Rua Três Corações, 232A - Calafate',
  city: 'CEP 30.411-293 - Belo Horizonte/MG',
  phone: '(31) 3443-5711',
  fax: '(31) 3443-5711',
  site: 'www.zenet.com.br',
  email: 'contato@zenet.com.br',
  segments: 'Engenharia | T.I. | Telecom',
};

export const serviceTypes = ['Contrato', 'Garantia', 'A Faturar'] as const;
export const openingChannels = ['E-mail', 'Telefone'] as const;
export const statuses = ['Operacional', 'Pendente', 'Laboratório', 'Reparo Externo'] as const;
export const detailLimit = 12_000;
export const shortLimit = 120;
export const signatureLimit = 280_000;
export const photoCategories = ['problem', 'solution', 'pending', 'notes'] as const;
export type PhotoCategory = typeof photoCategories[number];
export const defaultPhotoLimits = { maxCount: 12, maxFileBytes: 10 * 1024 * 1024, maxBytes: 600_000, maxEdge: 1600, quality: 78 };
export type PhotoLimits = typeof defaultPhotoLimits;
export type Technician = { id: string; name: string; active: boolean };
export const photoSchema = z.object({
  id: z.uuidv4(), category: z.enum(photoCategories), caption: z.string().trim().max(240),
  data: z.string().max(1_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
}).strict();
export type Photo = z.infer<typeof photoSchema>;

export const labels = {
  number: 'Nº RAT', serviceType: 'Tipo de atendimento', ticket: 'Ticket/OS',
  opening: 'Abertura', date: 'Data do atendimento', client: 'Cliente', branch: 'Filial',
  requester: 'Solicitante', technician: 'Técnico', equipment: 'Equipamento',
  sector: 'Setor', serial: 'Nº de série', asset: 'Patrimônio', problem: 'Problema relatado',
  solution: 'Solução', pending: 'Pendências', arrival: 'Comparecimento', start: 'Início',
  end: 'Término', kmStart: 'KM inicial', kmEnd: 'KM final', status: 'Situação',
  notes: 'Observações', clientSignature: 'Assinatura do cliente',
  technicianSignature: 'Assinatura do técnico',
};

export const dataKeys = [
  'serviceType', 'ticket', 'opening', 'date', 'client', 'branch',
  'requester', 'equipment', 'sector', 'serial', 'asset',
] as const;
export const reportKeys = ['problem', 'solution', 'pending'] as const;
export const closingKeys = ['arrival', 'start', 'end', 'kmStart', 'kmEnd', 'status', 'notes'] as const;

const singleLine = z.string().trim().max(shortLimit).regex(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u, 'Use uma única linha de texto.');
const required = singleLine.min(1, 'Preencha este campo.');
const detail = z.string().transform(value => value.replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().max(detailLimit).regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]*$/u, 'Texto inválido.'));
const hour = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido.');
const kilometerPattern = /^\d{1,7}(?:[.,]\d{1,3})?$/;
const kilometer = z.string().trim().refine(value => value === '' || kilometerPattern.test(value), 'Use até 7 dígitos e 3 casas decimais.');
const signature = z.string().max(signatureLimit, 'A assinatura excede o tamanho permitido.')
  .refine(value => value === '' || /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value), 'Assinatura PNG inválida.');

export const ratFields = z.object({
  serviceType: z.enum(serviceTypes, { error: 'Selecione o tipo de atendimento.' }),
  ticket: singleLine, opening: z.enum(openingChannels, { error: 'Selecione o canal de abertura.' }),
  date: z.iso.date('Informe uma data válida.').refine(value => !value.startsWith('0000'), 'Informe uma data válida.'),
  client: required, branch: singleLine, requester: singleLine,
  equipment: required, sector: singleLine, serial: singleLine, asset: singleLine,
  problem: detail.refine(Boolean, 'Descreva o problema relatado.'),
  solution: detail, pending: detail, arrival: hour, start: hour, end: hour,
  kmStart: kilometer, kmEnd: kilometer,
  status: z.enum(statuses, { error: 'Selecione a situação do equipamento.' }),
  notes: detail, clientSignature: signature,
}).strict();

function timeMinutes(value: string) {
  if (!hour.safeParse(value).success) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function duration(start: string, end: string) {
  const from = timeMinutes(start);
  const to = timeMinutes(end);
  if (from === null || to === null) return null;
  return (to - from + 1440) % 1440;
}

export function elapsedLabel(minutes: number | null) {
  if (minutes === null) return '—';
  return [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, '0')).join(':');
}

export function kilometers(start: string, end: string) {
  if (!kilometerPattern.test(start) || !kilometerPattern.test(end)) return null;
  const asMeters = (value: string) => {
    const [whole, decimal = ''] = value.split(/[.,]/);
    return Number(whole) * 1000 + Number(decimal.padEnd(3, '0'));
  };
  const meters = asMeters(end) - asMeters(start);
  return meters < 0 ? null : meters / 1000;
}

export function closingIssues(values: Pick<Draft, 'arrival' | 'start' | 'end' | 'kmStart' | 'kmEnd'>) {
  const issues: Partial<Record<typeof closingKeys[number], string>> = {};
  const before = duration(values.arrival, values.start);
  const service = duration(values.start, values.end);
  if (before !== null && service !== null && before + service >= 1440) {
    issues.arrival = 'A sequência de comparecimento, início e término deve caber em menos de 24 horas.';
  }
  if (values.kmStart && !values.kmEnd) issues.kmEnd = 'Informe o KM final.';
  if (values.kmEnd && !values.kmStart) issues.kmStart = 'Informe o KM inicial.';
  if (kilometerPattern.test(values.kmStart) && kilometerPattern.test(values.kmEnd) &&
      kilometers(values.kmStart, values.kmEnd) === null) {
    issues.kmEnd = 'O KM final deve ser maior ou igual ao KM inicial.';
  }
  return issues;
}

export const submissionFields = ratFields.extend({
  technicians: z.array(z.uuidv4()).min(1, 'Selecione ao menos um técnico.').max(16),
  technicianSignatures: z.record(z.uuidv4(), signature),
  photos: z.array(photoSchema).max(40),
}).strict();

export function ratSchema() {
  return submissionFields.superRefine((values, ctx) => {
    for (const [path, message] of Object.entries(closingIssues(values))) {
      ctx.addIssue({ code: 'custom', path: [path], message });
    }
    if (!values.clientSignature) ctx.addIssue({ code: 'custom', path: ['clientSignature'], message: 'Colete a assinatura do cliente.' });
    if (new Set(values.technicians).size !== values.technicians.length) {
      ctx.addIssue({ code: 'custom', path: ['technicians'], message: 'Um técnico só pode ser selecionado uma vez.' });
    }
    for (const id of values.technicians) {
      if (!values.technicianSignatures[id]) ctx.addIssue({ code: 'custom', path: ['technicianSignatures', id], message: 'Colete a assinatura deste técnico.' });
    }
    for (const id of Object.keys(values.technicianSignatures)) {
      if (!values.technicians.includes(id)) ctx.addIssue({ code: 'custom', path: ['technicianSignatures', id], message: 'Assinatura sem técnico participante.' });
    }
    if (new Set(values.photos.map(photo => photo.id)).size !== values.photos.length) {
      ctx.addIssue({ code: 'custom', path: ['photos'], message: 'Fotografia duplicada.' });
    }
  });
}

export type Submission = z.infer<typeof submissionFields>;
export type Field = keyof typeof ratFields.shape;
export type Draft = Record<Field, string> & Pick<Submission, 'technicians' | 'technicianSignatures' | 'photos'>;
export type Rat = Omit<Submission, 'technicians' | 'technicianSignatures'> & {
  number: string; issuedAt: string; technicians: { id: string; name: string; signature: string }[];
};
export type Issuance = { operationId: string; number: string; issuedAt: string; client: string; filename: string };
export const emptyDraft = {
  ...Object.fromEntries(Object.keys(ratFields.shape).map(key => [key, ''])) as Record<Field, string>,
  technicians: [], technicianSignatures: {}, photos: [],
} as Draft;

export function displayDate(date: string) {
  const [year, month, day] = date.split('-');
  return day && month && year ? [day, month, year].join('/') : '—';
}

export function totals(values: Pick<Draft, 'start' | 'end' | 'kmStart' | 'kmEnd'>) {
  const distance = kilometers(values.kmStart.trim(), values.kmEnd.trim());
  return {
    duration: elapsedLabel(duration(values.start, values.end)),
    distance: distance === null ? '—' : distance.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' km',
  };
}
