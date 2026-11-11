import type { Draft } from '../../shared/rat';

export async function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, init);
}
export async function downloadPdf(operationId: string, filename: string, report: Draft) {
  const response = await apiFetch('/api/rat/pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId: operationId, report }),
  });
  if (!response.ok) throw new Error((await response.json()).message || 'Tente gerar o PDF novamente.');
  const pdf = await response.blob();
  if (!pdf.type.includes('application/pdf')) throw new Error('O documento recebido é inválido.');
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
