#!/usr/bin/env node
/** Create a trusted administrator using only a username (no public email address).
 * Firebase Auth internally uses username@pizzicato.com; do not use Firebase email recovery.
 * Usage: npm run admin:create -- leadresearcher "/secure/service-account.json"
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeUsername, emailForUsername } = require('../functions/username');
function fail(message) { console.error(message); process.exitCode = 1; }
async function main() {
  const [requestedName, file] = process.argv.slice(2);
  if (!requestedName || !file) throw new Error('Usage: npm run admin:create -- leadresearcher "/path/to/service-account.json"');
  const username = normalizeUsername(requestedName);
  const keyPath = path.resolve(file);
  if (!fs.existsSync(keyPath)) throw new Error('Service-account file not found.');
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (!key.project_id || !key.private_key || !key.client_email) throw new Error('Please provide a Firebase Admin SDK service-account JSON file, not the web config.');
  const { localPath } = require('./web-config');
  if (fs.existsSync(localPath)) {
    const web = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    if (web.mode === 'online' && web.firebase?.projectId !== key.project_id)
      throw new Error('Service-account project differs from configured web project. Refusing to grant access to the wrong project.');
  }
  let admin;
  try { admin = require('../functions/node_modules/firebase-admin'); }
  catch { throw new Error('Firebase Admin SDK not installed. First run: npm install --prefix functions'); }
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'pizzicato-admin-setup');
  try {
    const auth = admin.auth(app);
    const email = emailForUsername(username);
    let user; let password;
    try {
      user = await auth.getUserByEmail(email);
      if (user.customClaims?.superadmin !== true)
        throw new Error(`Username "${username}" is already taken by a non-administrator. Choose a different name; this command will not elevate other accounts.`);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      password = crypto.randomBytes(24).toString('base64url');
      user = await auth.createUser({ email, displayName: username, password, emailVerified: false, disabled: false });
    }
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), superadmin: true });
    console.log(`\nAdministrator created/verified in Firebase project: ${key.project_id}`);
    console.log(`Login username: ${username}`);
    if (password) {
      console.log(`Generated password (shown ONLY once): ${password}`);
      console.log('Save the username and password in a password manager; never commit either to Git.');
    } else console.log('Existing administrator kept the same password; sign in with your existing credentials.');
    console.log('Open Pizzicato and log in with the USERNAME, not an email address.');
  } finally { await app.delete(); }
}
main().catch(error => fail(`Administrator setup failed: ${error.message}`));
