import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { settingsFrom } from '../server/config.js';
import { MailError, mailMessage, type SendRat } from '../server/mail.js';
import { pngData, sample } from './fixture.js';

const smtpSettings = {
  MAIL_MODE: 'smtp', MAIL_TO: 'destino@example.org', SMTP_HOST: 'smtp.example.org',
  SMTP_USER: 'remetente@example.org', SMTP_PASS: 'credencial-ficticia', SMTP_FROM: 'remetente@example.org',
};

async function start(t: TestContext, send?: SendRat, existingDirectory?: string, env: NodeJS.ProcessEnv = {}) {
  const directory = existingDirectory || await mkdtemp(join(tmpdir(), 'rat-zenet-'));
  const settings = settingsFrom({ ...(send ? smtpSettings : {}), ...env, RECEIPTS_DIR: directory });
  const server = createApp(settings, send).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (!existingDirectory) await rm(directory, { recursive: true, force: true });
  });
  const post = (id: string, report: unknown = sample, headers = {}) => fetch(url + '/api/rat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ submissionId: id, report }),
  });
  return { url, post, directory };
}

test('destinatário vazio gera o PDF sem acionar o envio, mesmo com SMTP selecionado', async t => {
  const { post, url } = await start(t, async () => assert.fail('Nenhum e-mail deveria ser enviado.'), undefined, { MAIL_TO: ' ' });
  assert.deepEqual(await (await fetch(url + '/api/config')).json(), { requireTechnician: false, mailMode: 'test' });
  const id = randomUUID();
  const response = await post(id);
  assert.equal(response.status, 200, response.ok ? '' : await response.text());
  assert.equal(response.headers.get('x-mail-mode'), 'test');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const message = mailMessage(sample, id, 'RAT.pdf', bytes, smtpSettings.SMTP_FROM, smtpSettings.MAIL_TO);
  assert.equal(message.to, smtpSettings.MAIL_TO);
  assert.equal(message.attachments[0].contentType, 'application/pdf');
  assert.deepEqual(message.attachments[0].content, bytes);
  assert.equal(message.subject, 'RAT ZENET Nº 2026/012 — Oficina São João — 10/11/2026');
});

test('rejeita origem externa, payload acima do limite e assinatura vazia', async t => {
  const { post } = await start(t);
  assert.equal((await post(randomUUID(), sample, { Origin: 'https://externo.example' })).status, 403);
  assert.equal((await post(randomUUID(), { ...sample, notes: 'x'.repeat(1_060_000) })).status, 413);
  const response = await post(randomUUID(), { ...sample, clientSignature: pngData(false) });
  assert.equal(response.status, 422);
  assert.ok((await response.json()).errors.clientSignature);
});

test('repetição simultânea e nova instância do servidor não enviam o mesmo relatório outra vez', async t => {
  let calls = 0;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const first = await start(t, async () => { calls++; entered(); await wait; });
  const id = randomUUID();
  const pending = first.post(id);
  await Promise.race([started, pending.then(async response => assert.fail(await response.text()))]);
  const duplicate = await first.post(id);
  release();
  assert.equal(duplicate.status, 409);
  assert.equal((await pending).status, 200);
  const second = await start(t, async () => { calls++; }, first.directory);
  assert.equal((await second.post(id)).status, 200);
  assert.equal((await second.post(id, { ...sample, notes: 'Alteração' })).status, 409);
  assert.equal(calls, 1);
});

test('falha confirmada permite repetir; aceitação indeterminada impede novo disparo', async t => {
  let calls = 0;
  const { post } = await start(t, async () => {
    calls++;
    if (calls === 1) throw new MailError(false);
    if (calls === 3) throw new MailError(true);
  });
  const id = randomUUID();
  const rejected = await post(id);
  assert.equal(rejected.status, 503);
  assert.equal((await rejected.json()).editable, true);
  assert.equal((await post(id)).status, 200);
  const unknown = randomUUID();
  const ambiguous = await post(unknown);
  assert.equal(ambiguous.status, 503);
  assert.equal((await ambiguous.json()).editable, false);
  assert.equal((await post(unknown)).status, 409);
  assert.equal(calls, 3);
});

test('SMTP exige configuração explícita de credenciais e remetente', () => {
  assert.throws(() => settingsFrom({ MAIL_MODE: 'smtp', MAIL_TO: smtpSettings.MAIL_TO }), /SMTP_HOST/);
  assert.throws(() => settingsFrom({ MAIL_TO: 'endereço inválido' }), /MAIL_TO/);
  assert.equal(settingsFrom({ MAIL_MODE: 'smtp' }).MAIL_MODE, 'test');
});
