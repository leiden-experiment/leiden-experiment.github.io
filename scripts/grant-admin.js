#!/usr/bin/env node
/* Run from a trusted machine with Google Application Default Credentials authorized for Firebase Auth.
 * Example: GOOGLE_APPLICATION_CREDENTIALS=/secure/service-account.json node scripts/grant-admin.js leadresearcher
 * NEVER put a service account file or a password in this repository.
 */
const admin = require('../functions/node_modules/firebase-admin');
const { emailForUsername } = require('../functions/username');
const username = process.argv[2];
if (!username) throw new Error('Usage: node scripts/grant-admin.js <existing-admin-username>');
const email = emailForUsername(username);
admin.initializeApp({ credential: admin.credential.applicationDefault() });
admin.auth().getUserByEmail(email).then(async user => {
  if (user.customClaims?.superadmin !== true) throw new Error('Refusing to elevate a non-administrator; use the documented administrator creation command instead.');
  const existing = (await admin.auth().getUser(user.uid)).customClaims || {};
  await admin.auth().setCustomUserClaims(user.uid, { ...existing, superadmin: true });
  console.log(`Administrator privilege granted to UID ${user.uid}; sign out and back in to refresh claims.`);
}).catch(err => { console.error(err.message); process.exitCode = 1; });
