import dotenv from 'dotenv';
import { createApp } from './app.js';
import { settingsFrom } from './config.js';
import { Database } from './database.js';

dotenv.config({ quiet: true });
const settings = settingsFrom(process.env);
const db = new Database(settings.DATABASE_URL);
await db.migrate();
const server = createApp(settings, db).listen(settings.PORT, settings.HOST, () => {
  console.log('RAT Digital ZENET · http://' + settings.HOST + ':' + settings.PORT);
});
process.once('SIGTERM', () => server.close(() => { void db.close(); }));
