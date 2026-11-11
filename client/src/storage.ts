import { emptyDraft, photoSchema, type Draft, type Field, type Issuance } from '../../shared/rat';

export type Session = { step: number; id: string; locked: boolean; emitted?: Issuance };
export type Snapshot = { values: Draft; session: Session; legacy?: { number: string; technician: string; signature: string } };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function createId() { return crypto.randomUUID(); }
export function blankDraft(): Draft { return structuredClone(emptyDraft); }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zenet.rat', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('draft');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche outras abas para atualizar o rascunho.'));
  });
}
async function transaction(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('draft', mode);
      const request = action(tx.objectStore('draft'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
let pending: Promise<unknown> = Promise.resolve();
export function writeDraft(values: Draft, session: Session, legacy?: Snapshot['legacy']): Promise<boolean> {
  const copy = structuredClone({ values, session, legacy });
  pending = pending.catch(() => undefined).then(() => transaction('readwrite', store => store.put(copy, 'current')));
  return pending.then(() => true, () => false);
}
export function removeDraft(): Promise<boolean> {
  pending = pending.catch(() => undefined).then(() => transaction('readwrite', store => store.delete('current')));
  return pending.then(() => true, () => false);
}
export async function readDraft(): Promise<Snapshot> {
  const empty: Snapshot = { values: blankDraft(), session: { step: 0, id: '', locked: false } };
  const stored = await transaction('readonly', store => store.get('current')) as Snapshot | undefined;
  if (stored?.values && stored.session) {
    const values = { ...empty.values, ...stored.values };
    values.photos = (values.photos || []).filter(photo => photoSchema.safeParse(photo).success);
    values.technicians = Array.isArray(values.technicians) ? [...new Set(values.technicians.filter(id => uuid.test(id)))] : [];
    values.technicianSignatures = values.technicianSignatures || {};
    return { ...stored, values, session: { ...stored.session, step: stored.session.locked ? 4 : Math.min(4, Math.max(0, stored.session.step)) } };
  }
  const raw = localStorage.getItem('zenet.rat.draft.v1');
  if (!raw) return empty;
  try {
    const old = JSON.parse(raw);
    for (const field of Object.keys(emptyDraft) as Field[]) {
      if (typeof old.values?.[field] === 'string' && typeof empty.values[field] === 'string') empty.values[field] = old.values[field];
    }
    empty.legacy = { number: old.values?.number || '', technician: old.values?.technician || '', signature: old.values?.technicianSignature || '' };
    if (!await writeDraft(empty.values, empty.session, empty.legacy)) throw new Error('Rascunho anterior preservado no armazenamento antigo.');
    localStorage.removeItem('zenet.rat.draft.v1');
    return empty;
  } catch { throw new Error('Não foi possível migrar o rascunho anterior. Os dados originais foram preservados.'); }
}
