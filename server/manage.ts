import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from './database.js';

dotenv.config({ quiet: true });
const url = z.string().regex(/^postgres(?:ql)?:\/\//).parse(process.env.DATABASE_URL);
const db = new Database(url);
try {
  await db.migrate();
  const [action, ...args] = process.argv.slice(2);
  if (action === 'add') {
    const name = z.string().trim().min(2).max(120).regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u).parse(args.join(' '));
    const result = await db.pool.query('INSERT INTO rat_technicians(id, full_name) VALUES ($1, $2) RETURNING id, full_name', [randomUUID(), name]);
    console.table(result.rows);
  } else if (action === 'activate' || action === 'deactivate') {
    const id = z.uuidv4().parse(args[0]);
    const result = await db.pool.query('UPDATE rat_technicians SET active=$2 WHERE id=$1 RETURNING id, full_name, active', [id, action === 'activate']);
    if (!result.rowCount) throw new Error('Técnico não encontrado.');
    console.table(result.rows);
  } else if (action === 'list') {
    console.table((await db.pool.query('SELECT id, full_name, active FROM rat_technicians ORDER BY full_name')).rows);
  } else if (action !== 'migrate') {
    throw new Error('Use migrate, list, add "Nome completo", activate UUID ou deactivate UUID.');
  }
} finally { await db.close(); }
