import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Pool } from 'pg';
import { Database } from '../server/database.js';
import { settingsFrom } from '../server/config.js';
import { createApp } from '../server/app.js';
import { generatePdf } from '../server/pdf.js';
import { normalizeSubmission } from '../server/images.js';
import { defaultPhotoLimits } from '../shared/rat.js';
import { sample, technicianIds } from './fixture.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Configure TEST_DATABASE_URL para um PostgreSQL exclusivo de testes antes de executar npm test.');
async function environment(t: TestContext, clock?: () => Date) {
  const admin = new Pool({ connectionString: testUrl });
  const schema = 'rat_test_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE SCHEMA ' + schema);
  const url = new URL(testUrl!); url.searchParams.set('options', '-c search_path=' + schema);
  const db = new Database(url.toString(), clock);
  const others: Database[] = [];
  t.after(async () => {
    await Promise.all([db.close(), ...others.map(other => other.close())]);
    await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end();
  });
  await db.migrate();
  for (const [index, id] of technicianIds.entries()) await db.pool.query('INSERT INTO rat_technicians(id,full_name) VALUES ($1,$2)', [id, 'Profissional de teste ' + index]);
  const issue = (id = randomUUID(), report = sample, database = db) => database.issue(id, report, () => normalizeSubmission(report, defaultPhotoLimits));
  return { db, url: url.toString(), issue, another: () => { const other = new Database(url.toString(), clock); others.push(other); return other; } };
}
async function api(t: TestContext, failPdf = false) {
  const env = await environment(t);
  const settings = settingsFrom({ NODE_ENV: 'test', DATABASE_URL: env.url });
  let fail = failPdf;
  const server = createApp(settings, env.db, async report => {
    if (fail) { fail = false; throw new Error('Falha de PDF simulada.'); }
    return generatePdf(report);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const headers = { 'Content-Type': 'application/json' };
  const post = (id = randomUUID(), report: unknown = sample, extra = {}) => fetch(url + '/api/rat', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ submissionId: id, report }) });
  return { ...env, url, headers, post };
}

test('sequência diária usa a data de São Paulo e reinicia após a meia-noite local', async t => {
  let now = new Date('2026-11-12T02:59:59Z');
  const { issue } = await environment(t, () => now);
  assert.equal((await issue()).number, '2026-11-11-0001');
  assert.equal((await issue()).number, '2026-11-11-0002');
  now = new Date('2026-11-12T03:00:00Z');
  assert.equal((await issue()).number, '2026-11-12-0001');
});
test('duas instâncias e múltiplas conexões emitem 24 números únicos sob concorrência', async t => {
  const env = await environment(t, () => new Date('2026-11-11T12:00:00Z'));
  const second = env.another();
  const reports = await Promise.all(Array.from({ length: 24 }, (_, index) => env.issue(randomUUID(), sample, index % 2 ? second : env.db)));
  assert.equal(new Set(reports.map(report => report.number)).size, 24);
  assert.deepEqual(reports.map(report => report.number).sort(), Array.from({ length: 24 }, (_, index) => '2026-11-11-' + String(index + 1).padStart(4, '0')));
  const id = randomUUID();
  const repeated = await Promise.all(Array.from({ length: 12 }, (_, index) => env.issue(id, sample, index % 2 ? second : env.db)));
  assert.equal(new Set(repeated.map(report => report.number)).size, 1);
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_numbers')).rows[0].count, '25');
  await assert.rejects(env.issue(id, { ...sample, client: 'Alterado' }), /outros dados/);
});
test('limite diário faz rollback, e UNIQUE e trigger protegem o relatório emitido', async t => {
  const env = await environment(t, () => new Date('2026-11-11T12:00:00Z'));
  const id = randomUUID(); const report = await env.issue(id);
  await assert.rejects(env.db.pool.query('UPDATE rat_numbers SET official_number=$1 WHERE operation_id=$2', ['novo', id]), /imutável/);
  await assert.rejects(env.db.pool.query(
    'INSERT INTO rat_numbers SELECT $1::uuid, official_number, issue_day, sequence, issued_at, request_hash, technicians FROM rat_numbers WHERE operation_id=$2', [randomUUID(), id],
  ), (error: unknown) => (error as { code: string }).code === '23505');
  await env.db.pool.query("UPDATE rat_counters SET last_value=9999 WHERE issue_day='2026-11-11'");
  await assert.rejects(env.issue(), /9999/);
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_numbers')).rows[0].count, '1');
  assert.equal((await env.issue(id)).number, report.number);
});
test('mantém o snapshot das identidades e recusa técnicos inativos em novas emissões', async t => {
  const env = await environment(t); const id = randomUUID(); const report = await env.issue(id);
  assert.deepEqual(report.technicians.map(tech => tech.id), technicianIds);
  for (const tech of report.technicians) assert.equal(tech.signature, sample.technicianSignatures[tech.id]);
  await env.db.pool.query('UPDATE rat_technicians SET active=false, full_name=$2 WHERE id=$1', [technicianIds[0], 'Nome modificado']);
  await assert.rejects(env.issue(), /técnicos ativos/);
  assert.equal((await env.issue(id)).technicians[0].name, report.technicians[0].name);
  assert.equal((await env.issue(id)).number, report.number);
  const rows = (await env.db.pool.query('SELECT * FROM rat_numbers')).rows;
  const columns = (await env.db.pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='rat_numbers' ORDER BY ordinal_position")).rows.map(row => row.column_name);
  assert.deepEqual(columns, ['operation_id', 'official_number', 'issue_day', 'sequence', 'issued_at', 'request_hash', 'technicians']);
  const raw = JSON.stringify(rows);
  for (const content of [sample.client, sample.problem, sample.clientSignature, ...Object.values(sample.technicianSignatures)]) assert.equal(raw.includes(content), false);
  assert.deepEqual(rows[0].technicians.map((tech: { id: string; name: string }) => Object.keys(tech).sort()), technicianIds.map(() => ['id', 'name']));
});
test('acesso direto sem senha preserva validação de origem, emissão e fotos', async t => {
  const env = await api(t);
  assert.equal((await fetch(env.url + '/api/config')).status, 200);
  assert.equal((await fetch(env.url + '/api/rats')).status, 404);
  assert.equal((await fetch(env.url + '/api/session')).status, 404);
  assert.equal((await env.post(randomUUID(), sample, { Origin: 'https://externo.example' })).status, 403);
  assert.equal((await env.post(randomUUID(), { ...sample, number: '2026-11-11-0001' })).status, 422);
  const config = await (await fetch(env.url + '/api/config')).json();
  assert.equal(config.technicians.length, 3); assert.equal('DATABASE_URL' in config, false);
  assert.equal((await fetch(env.url + '/api/photos/prepare', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('falso') })).status, 422);
  const photo = await fetch(env.url + '/api/photos/prepare', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from(sample.clientSignature.split(',')[1], 'base64') });
  assert.equal(photo.status, 200); assert.match((await photo.json()).data, /^data:image\/jpeg/);
});
test('PDF com falha após emissão pode ser regenerado sem consumir outro número', async t => {
  const env = await api(t, true); const id = randomUUID();
  const response = await env.post(id); assert.equal(response.status, 200);
  const metadata = await response.json();
  const path = env.url + '/api/rat/pdf';
  const pdfRequest = (report: unknown = sample, submissionId = id) => fetch(path, { method: 'POST', headers: env.headers, body: JSON.stringify({ submissionId, report }) });
  assert.equal((await pdfRequest(sample, randomUUID())).status, 404);
  const failed = await pdfRequest();
  assert.equal(failed.status, 503); assert.equal((await failed.json()).number, metadata.number);
  assert.equal((await (await env.post(id)).json()).number, metadata.number);
  const pdf = await pdfRequest();
  assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_numbers')).rows[0].count, '1');
  assert.equal((await pdfRequest({ ...sample, client: 'Cliente alterado' })).status, 409);
  assert.equal((await fetch(env.url + '/api/rats/' + id + '/pdf')).status, 404);
  assert.equal((await fetch(env.url + '/api/rats?number=' + metadata.number)).status, 404);
});
test('conexão interrompida depois do commit recupera a mesma operação', async t => {
  const env = await api(t); const id = randomUUID();
  await new Promise<void>((resolve, reject) => {
    const req = request(env.url + '/api/rat', { method: 'POST', headers: env.headers }, response => {
      assert.equal(response.statusCode, 200); response.destroy(); resolve();
    });
    req.on('error', reject); req.end(JSON.stringify({ submissionId: id, report: sample }));
  });
  const repeated = await env.post(id); assert.equal(repeated.status, 200);
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_numbers')).rows[0].count, '1');
});


test('migração remove o arquivo de relatórios e preserva números e técnicos', async t => {
  const env = await environment(t);
  const id = randomUUID(); const original = await env.issue(id);
  await env.db.pool.query('ALTER TABLE rat_numbers RENAME TO rat_reports');
  await env.db.pool.query("ALTER TABLE rat_reports ADD COLUMN encrypted_payload bytea, ADD COLUMN encrypted_metadata bytea");
  await env.db.pool.query("UPDATE rat_counters SET last_value=1");
  // Simulate legacy private content without invoking the immutable-number trigger.
  await env.db.pool.query('ALTER TABLE rat_reports DISABLE TRIGGER rat_numbers_immutable');
  await env.db.pool.query('UPDATE rat_reports SET encrypted_payload=$1, encrypted_metadata=$2', [Buffer.from('private photo'), Buffer.from('private client')]);
  await env.db.migrate();
  await env.db.migrate();
  assert.equal((await env.db.pool.query("SELECT to_regclass('rat_reports') AS legacy")).rows[0].legacy, null);
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_numbers')).rows[0].count, '1');
  assert.equal((await env.db.technicians()).length, 3);
  assert.equal((await env.issue(id)).number, original.number);
  const next = await env.issue(); assert.ok(next.number.endsWith('0002'));
  const tables = (await env.db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() ORDER BY table_name")).rows.map(row => row.table_name);
  assert.deepEqual(tables, ['rat_counters', 'rat_numbers', 'rat_technicians']);
});


test('prévia não grava nem reserva, acompanha concorrência, virada do dia e limite', async t => {
  let now = new Date('2026-11-12T02:59:59Z');
  const env = await environment(t, () => now);
  const previews = await Promise.all(Array.from({ length: 12 }, () => env.db.numberPreview()));
  assert.ok(previews.every(value => value === '2026-11-11-0001'));
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_counters')).rows[0].count, '0');
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_numbers')).rows[0].count, '0');
  await env.issue();
  assert.equal(await env.db.numberPreview(), '2026-11-11-0002');
  const anotherPreview = await env.db.numberPreview();
  await env.issue();
  assert.notEqual((await env.issue()).number, anotherPreview);
  await env.db.pool.query("UPDATE rat_counters SET last_value=9999 WHERE issue_day='2026-11-11'");
  assert.equal(await env.db.numberPreview(), null);
  now = new Date('2026-11-12T03:00:00Z');
  assert.equal(await env.db.numberPreview(), '2026-11-12-0001');
  assert.equal((await env.db.pool.query('SELECT count(*) FROM rat_counters')).rows[0].count, '1');
});
