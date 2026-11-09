#!/usr/bin/env node
/** Change an existing Firebase Authentication login to a Pizzicato username.
 * Preserves UID, password, custom role claims, study membership and results.
 * Usage: npm run account:migrate -- "old-login@example.edu" newusername "/safe/service-account.json"
 * Run locally against the CENTRAL Firebase project, never in a GitHub Actions/public web build.
 */
const fs = require('node:fs');
const path = require('node:path');
const { normalizeUsername, emailForUsername } = require('../functions/username');
async function main() {
  const [oldEmail, requestedName, file] = process.argv.slice(2);
  if (!oldEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oldEmail) || !requestedName || !file)
    throw new Error('Usage: npm run account:migrate -- "old-email@example.edu" newusername "/path/to/service-account.json"');
  const username = normalizeUsername(requestedName);
  const newEmail = emailForUsername(username);
  const key = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!key.project_id || !key.private_key || !key.client_email) throw new Error('Use a Firebase Admin SDK service-account JSON key.');
  const { localPath } = require('./web-config');
  if (!fs.existsSync(localPath)) throw new Error('First run npm run setup:web, choosing the central Firebase project.');
  const web = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  if (web.mode !== 'online' || web.firebase?.projectId !== key.project_id || !web.firebase?.databaseURL)
    throw new Error('Central web config must use the same Firebase project as the service account.');
  let admin;
  try { admin = require('../functions/node_modules/firebase-admin'); }
  catch { throw new Error('First run npm install --prefix functions'); }
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id,
    databaseURL: web.firebase.databaseURL }, 'pizzicato-username-migration');
  try {
    const auth = admin.auth(app);
    const user = await auth.getUserByEmail(oldEmail);
    // Reject collisions rather than overwriting another user or merging accounts.
    try {
      const other = await auth.getUserByEmail(newEmail);
      if (other.uid !== user.uid) throw new Error(`The username "${username}" is already taken. Choose another.`);
    } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    const ref = admin.database(app).ref(`accounts/${user.uid}`);
    const snap = await ref.get();
    const profile = snap.val();
    if (profile && !['participant', 'moderator', 'admin'].includes(profile.role))
      throw new Error('The existing account has an unrecognized role; no changes made.');
    if (user.email !== newEmail || user.displayName !== username)
      await auth.updateUser(user.uid, { email: newEmail, displayName: username, emailVerified: false });
    if (profile) await ref.update({ username }); // Keep original participantId to preserve study result identity.
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Migration complete: ${username} (Firebase project ${key.project_id}).`);
    console.log('UID, password, permissions and study data were preserved. Sign out and log in using the new USERNAME.');
  } finally { await app.delete(); }
}
main().catch(err => { console.error(`Migration failed: ${err.message}`); process.exitCode = 1; });
