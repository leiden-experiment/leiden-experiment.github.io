#!/usr/bin/env node
/* Simple, local-only wizard; the Firebase web app configuration is public, NOT an administrator credential. */
const fs = require('node:fs');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { localPath, validateWebConfig } = require('./web-config');
const rl = readline.createInterface({ input, output });
async function main() {
  console.log('\nPIZZICATO — WEB SETUP\n');
  console.log('This writes web-config.local.json on THIS computer only (it is ignored by Git).');
  console.log('For online mode, first create a Firebase project, Realtime Database, and Web app.');
  const choice = (await rl.question('Use Firebase? (y = research login, n = guest demo) [y]: ')).trim().toLowerCase();
  let config;
  if (choice === 'n' || choice === 'no') config = { mode: 'guest', allowGuest: true, firebase: null };
  else {
    console.log('\nIn Firebase Console: Project settings > General > Your apps > Web app > SDK setup and configuration > Config.');
    console.log('Paste ONLY the public web configuration values, NOT a service-account file/password.\n');
    const firebase = {};
    for (const [key, label] of [
      ['apiKey', 'apiKey'], ['authDomain', 'authDomain (e.g. myproject.firebaseapp.com)'],
      ['projectId', 'projectId'], ['databaseURL', 'Realtime Database URL (from Build > Realtime Database)'],
      ['appId', 'appId'],
    ]) firebase[key] = (await rl.question(`${label}: `)).trim();
    config = { mode: 'online', allowGuest: false, firebase };
  }
  validateWebConfig(config);
  fs.writeFileSync(localPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  console.log(`\nSaved ${localPath}.\nRun npm start, then open http://localhost:8080 (or the address printed by the server).`);
  console.log('To change Firebase projects, run npm run setup:web again.');
}
main().catch(error => { console.error('\nSetup not saved:', error.message); process.exitCode = 1; }).finally(() => rl.close());
