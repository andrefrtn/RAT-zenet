import dotenv from 'dotenv';
import { createApp } from './app.js';
import { settingsFrom } from './config.js';

dotenv.config({ quiet: true });
const settings = settingsFrom(process.env);
createApp(settings).listen(settings.PORT, settings.HOST, () => {
  console.log('RAT Digital ZENET · http://' + settings.HOST + ':' + settings.PORT + ' · e-mail: ' + settings.MAIL_MODE);
});
