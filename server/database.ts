import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { Issuance, Rat, Submission, Technician } from '../shared/rat.js';
import { pdfFilename } from './pdf.js';

export class ReportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const migration = `
CREATE TABLE IF NOT EXISTS rat_technicians (
  id uuid PRIMARY KEY, full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rat_counters (
  issue_day date PRIMARY KEY, last_value integer NOT NULL CHECK (last_value BETWEEN 1 AND 9999)
);
CREATE TABLE IF NOT EXISTS rat_numbers (
  operation_id uuid PRIMARY KEY, official_number text NOT NULL UNIQUE,
  issue_day date NOT NULL, sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 9999),
  issued_at timestamptz NOT NULL, request_hash text NOT NULL CHECK (length(request_hash) = 64),
  technicians jsonb NOT NULL DEFAULT '[]', UNIQUE(issue_day, sequence)
);
-- Transfer only numbering metadata from the old archive, then remove its contents.
DO $$ BEGIN
  IF to_regclass('rat_reports') IS NOT NULL THEN
    INSERT INTO rat_numbers(operation_id, official_number, issue_day, sequence, issued_at, request_hash)
      SELECT operation_id, official_number, issue_day, sequence, issued_at, request_hash FROM rat_reports
      ON CONFLICT (operation_id) DO NOTHING;
    DROP TABLE rat_reports;
  END IF;
END $$;
INSERT INTO rat_counters(issue_day, last_value)
  SELECT issue_day, max(sequence) FROM rat_numbers GROUP BY issue_day
  ON CONFLICT (issue_day) DO UPDATE SET last_value = GREATEST(rat_counters.last_value, EXCLUDED.last_value);
CREATE OR REPLACE FUNCTION rat_number_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Um número emitido é imutável'; END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rat_numbers_immutable' AND tgrelid = 'rat_numbers'::regclass) THEN
    CREATE TRIGGER rat_numbers_immutable BEFORE UPDATE ON rat_numbers FOR EACH ROW EXECUTE FUNCTION rat_number_immutable();
  END IF;
END $$;
`;
type Identity = { id: string; name: string };
type Stored = { operation_id: string; official_number: string; issued_at: Date; request_hash: string; technicians: Identity[] };

export class Database {
  readonly pool: Pool;
  constructor(url: string, private clock?: () => Date) {
    this.pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10_000, query_timeout: 25_000, statement_timeout: 20_000, application_name: 'rat-zenet' });
    this.pool.on('error', () => console.error('A conexão PostgreSQL foi interrompida. As próximas operações tentarão reconectar.'));
  }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('rat-zenet-schema-v1', 0))");
      await client.query(migration);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async technicians(): Promise<Technician[]> {
    const result = await this.pool.query('SELECT id, full_name AS name, active FROM rat_technicians WHERE active ORDER BY full_name, id');
    return result.rows;
  }
  async numberPreview(): Promise<string | null> {
    const result = await this.pool.query<{ issue_day: string; last_value: number }>(
      `WITH today AS (
        SELECT to_char(COALESCE($1::timestamptz, clock_timestamp()) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS issue_day
      ) SELECT today.issue_day, COALESCE(counter.last_value, 0) AS last_value
        FROM today LEFT JOIN rat_counters counter ON counter.issue_day = today.issue_day::date`,
      [this.clock?.().toISOString() ?? null],
    );
    const { issue_day, last_value } = result.rows[0];
    return last_value >= 9999 ? null : issue_day + '-' + String(last_value + 1).padStart(4, '0');
  }
  async issue(operationId: string, input: Submission, normalize: () => Promise<Submission>, existingOnly = false): Promise<Rat> {
    const ids = [...input.technicians].sort();
    const hash = createHash('sha256').update(JSON.stringify({ ...input, technicians: ids,
      technicianSignatures: Object.fromEntries(ids.map(id => [id, input.technicianSignatures[id]])),
    })).digest('hex');
    // The request and normalized images live in memory only, never in a SQL parameter.
    const { technicianSignatures, ...normalized } = await normalize();
    const makeReport = (number: string, issuedAt: Date, technicians: Identity[]): Rat => ({
      ...normalized, number, issuedAt: issuedAt.toISOString(),
      technicians: input.technicians.map(id => ({ id, name: technicians.find(tech => tech.id === id)!.name, signature: technicianSignatures[id] })),
    });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['rat-operation:' + operationId]);
      const existing = await client.query<Stored>('SELECT * FROM rat_numbers WHERE operation_id = $1', [operationId]);
      const saved = existing.rows[0];
      if (saved) {
        if (saved.request_hash !== hash) throw new ReportError(409, 'Esta operação já emitiu um RAT com outros dados. Use o rascunho original deste aparelho.');
        // Old numbering records did not contain a technician-name snapshot.
        const technicians = saved.technicians.length ? saved.technicians : (await client.query<Identity>(
          'SELECT id, full_name AS name FROM rat_technicians WHERE id = ANY($1::uuid[])', [ids],
        )).rows;
        if (technicians.length !== ids.length) throw new ReportError(422, 'O cadastro dos técnicos deste rascunho não está disponível.');
        const report = makeReport(saved.official_number, saved.issued_at, technicians);
        await client.query('COMMIT');
        return report;
      }
      if (existingOnly) throw new ReportError(404, 'Número não encontrado. Finalize o RAT antes de baixar o PDF.');
      const technicians = await client.query<Identity>(
        'SELECT id, full_name AS name FROM rat_technicians WHERE id = ANY($1::uuid[]) AND active ORDER BY id FOR SHARE', [ids],
      );
      if (technicians.rows.length !== ids.length) throw new ReportError(422, 'Selecione apenas técnicos ativos do cadastro.');
      const time = await client.query<{ issued_at: Date; issue_day: string }>(
        "SELECT instant AS issued_at, to_char(instant AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS issue_day FROM (SELECT COALESCE($1::timestamptz, clock_timestamp()) AS instant) t",
        [this.clock?.().toISOString() ?? null],
      );
      const { issue_day, issued_at } = time.rows[0];
      const counter = await client.query<{ last_value: number }>(
        `INSERT INTO rat_counters(issue_day, last_value) VALUES ($1, 1)
         ON CONFLICT (issue_day) DO UPDATE SET last_value = rat_counters.last_value + 1
         WHERE rat_counters.last_value < 9999 RETURNING last_value`, [issue_day],
      );
      if (!counter.rows[0]) throw new ReportError(409, 'O limite de 9999 RATs para hoje foi atingido. Tente novamente no próximo dia.');
      const sequence = counter.rows[0].last_value;
      const report = makeReport(issue_day + '-' + String(sequence).padStart(4, '0'), issued_at, technicians.rows);
      await client.query(
        'INSERT INTO rat_numbers(operation_id, official_number, issue_day, sequence, issued_at, request_hash, technicians) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [operationId, report.number, issue_day, sequence, issued_at, hash, JSON.stringify(technicians.rows)],
      );
      await client.query('COMMIT');
      return report;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  metadata(operationId: string, report: Rat): Issuance {
    return { operationId, number: report.number, issuedAt: report.issuedAt, client: report.client, filename: pdfFilename(report) };
  }
  async close() { await this.pool.end(); }
}
