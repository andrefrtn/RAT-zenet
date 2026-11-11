import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { blankDraft, createId, readDraft, removeDraft, writeDraft } from '../client/src/storage.js';
import { sample } from './fixture.js';

const local = new Map<string, string>();
Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory() });
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => local.get(key) ?? null, removeItem: (key: string) => local.delete(key) } });
test('IndexedDB preserva dados, IDs, assinaturas e fotos entre leituras', async () => {
  const values = { ...blankDraft(), ...sample, photos: [{ id: createId(), category: 'solution' as const, caption: 'Foto', data: sample.clientSignature }] };
  const id = createId();
  assert.equal(await writeDraft(values, { step: 4, id, locked: true }), true);
  const loaded = await readDraft();
  assert.deepEqual(loaded.values, values); assert.equal(loaded.session.id, id); assert.equal(loaded.session.locked, true);
  assert.equal(local.size, 0);
  await Promise.all([writeDraft({ ...values, notes: 'Primeiro' }, loaded.session), writeDraft({ ...values, notes: 'Último' }, loaded.session)]);
  assert.equal((await readDraft()).values.notes, 'Último');
});
test('migra rascunho anterior sem atribuir a assinatura antiga a um novo profissional', async () => {
  await removeDraft();
  local.set('zenet.rat.draft.v1', JSON.stringify({ values: { ...sample, number: 'antigo', technician: 'Nome anterior', technicianSignature: sample.clientSignature }, step: 3, locked: true }));
  const loaded = await readDraft();
  assert.equal(loaded.values.client, sample.client); assert.deepEqual(loaded.values.technicians, []);
  assert.equal(loaded.legacy?.signature, sample.clientSignature);
  assert.equal(loaded.session.locked, false); assert.equal(local.size, 0);
});
