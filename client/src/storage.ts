import { emptyDraft, type Draft, type Field } from '../../shared/rat';

const key = 'zenet.rat.draft.v1';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type Session = { step: number; id: string; locked: boolean };

export function createId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function readDraft(): { values: Draft; session: Session } {
  const fallback = { values: { ...emptyDraft }, session: { step: 0, id: '', locked: false } };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    const id = typeof saved.id === 'string' && uuid.test(saved.id) ? saved.id : '';
    const locked = Boolean(id && saved.locked === true);
    const step = Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= 4 ? saved.step : 0;
    for (const field of Object.keys(emptyDraft) as Field[]) {
      if (typeof saved.values?.[field] === 'string') fallback.values[field] = saved.values[field];
    }
    return { values: fallback.values, session: { id, locked, step: locked ? 4 : step } };
  } catch {
    return fallback;
  }
}

export function writeDraft(values: Draft, session: Session) {
  try {
    localStorage.setItem(key, JSON.stringify({ values, ...session }));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft() {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
