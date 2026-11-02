#!/usr/bin/env node
/** Offline AES-256-GCM admin-credential backup and one-time Firebase Auth activation.
 * A password verifier must NEVER run in the public client. The server uses Firebase Auth.
 * Usage: npm run admin:prepare -- leadresearcher /safe/admin-vault.json
 *        npm run admin:activate -- /safe/admin-vault.json /safe/service-account.json
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { stdin, stdout } = require('node:process');
const { normalizeUsername, emailForUsername } = require('../functions/username');

async function promptHidden(label) {
  if (process.env.PIZZICATO_VAULT_PASSPHRASE) return process.env.PIZZICATO_VAULT_PASSPHRASE;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run in an interactive terminal; a vault passphrase is required.');
  return new Promise((resolve, reject) => {
    stdout.write(label);
    let value = '';
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true); stdin.resume();
    const done = (error) => {
      stdin.removeListener('data', onData); stdin.setRawMode(!!wasRaw); stdin.pause(); stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    function onData(chunk) {
      for (const c of String(chunk)) {
        if (c === '\r' || c === '\n') return done();
        if (c === '\u0003') return done(new Error('Cancelled'));
        if (c === '\u007f') value = value.slice(0, -1);
        else if (c.charCodeAt(0) >= 32) value += c;
      }
    }
    stdin.on('data', onData);
  });
}
const derive = (secret, salt) => crypto.scryptSync(secret, salt, 32, { N: 1 << 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
function encryptCredentials(value, secret) {
  if (!secret || secret.length < 20) throw new Error('Use a separate vault passphrase of at least 20 characters.');
  const salt = crypto.randomBytes(24), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive(secret, salt), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { format: 'pizzicato-admin-vault-v1', kdf: 'scrypt-N65536-r8-p1', cipher: 'AES-256-GCM',
    salt: salt.toString('base64'), nonce: iv.toString('base64'), data: payload.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function decryptCredentials(vault, secret) {
  if (vault?.format !== 'pizzicato-admin-vault-v1' || vault?.kdf !== 'scrypt-N65536-r8-p1' || vault?.cipher !== 'AES-256-GCM') throw new Error('Unknown vault format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', derive(secret, Buffer.from(vault.salt, 'base64')), Buffer.from(vault.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(vault.data, 'base64')), decipher.final()]).toString());
}
async function main() {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'prepare') {
    if (!first || !second) throw new Error('Usage: npm run admin:prepare -- leadresearcher /safe/admin-vault.json');
    const username = normalizeUsername(first);
    const pass = await promptHidden('Create a separate vault encryption passphrase (20+ characters; NOT the login password): ');
    if (pass.length < 20) throw new Error('Vault passphrase must be at least 20 characters.');
    const confirmation = await promptHidden('Re-enter vault encryption passphrase: ');
    if (confirmation !== pass) throw new Error('Passphrases do not match.');
    const account = { username, password: crypto.randomBytes(30).toString('base64url'), createdAt: new Date().toISOString() };
    const outPath = path.resolve(second);
    fs.writeFileSync(outPath, JSON.stringify(encryptCredentials(account, pass), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`\nEncrypted vault written to ${outPath}`);
    console.log(`ADMINISTRATOR USERNAME: ${account.username}`);
    console.log(`ADMINISTRATOR PASSWORD (COPY NOW): ${account.password}`);
    console.log('Store login/password and the unrelated vault passphrase separately in a password manager.');
    console.log('Do not commit the login password, vault passphrase, or a Firebase private key.');
  } else if (command === 'activate') {
    if (!first || !second) throw new Error('Usage: npm run admin:activate -- /safe/admin-vault.json /safe/service-account.json');
    const secret = await promptHidden('Vault encryption passphrase: ');
    const account = decryptCredentials(JSON.parse(fs.readFileSync(path.resolve(first), 'utf8')), secret);
    if (typeof account?.password !== 'string' || account.password.length < 12) throw new Error('Invalid vault password');
    if (!account.username) throw new Error('This is a legacy email-based vault. Prepare a new username vault, or migrate an existing Firebase account using account:migrate.');
    const username = normalizeUsername(account.username);
    const email = emailForUsername(username);
    const key = JSON.parse(fs.readFileSync(path.resolve(second), 'utf8'));
    if (!key.project_id || !key.private_key || !key.client_email) throw new Error('Not a Firebase Admin SDK service-account JSON');
    const webPath = path.resolve(__dirname, '../web-config.local.json');
    if (fs.existsSync(webPath)) {
      const config = JSON.parse(fs.readFileSync(webPath, 'utf8'));
      if (config.firebase?.projectId && config.firebase.projectId !== key.project_id) throw new Error('Web project ID and Admin SDK project ID do not match.');
    }
    let admin;
    try { admin = require('../functions/node_modules/firebase-admin'); }
    catch { throw new Error('Run npm install --prefix functions first.'); }
    const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'pizzicato-activate');
    try {
      let existing;
      try { existing = await app.auth().getUserByEmail(email); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      if (existing) throw new Error('This Firebase login already exists. Refusing to replace its password.');
      const user = await app.auth().createUser({ email, displayName: username, password: account.password, disabled: false });
      await app.auth().setCustomUserClaims(user.uid, { superadmin: true });
      console.log(`Administrator activated in project ${key.project_id}. Sign in as ${username} with the password from preparation.`);
    } finally { await app.delete(); }
  } else throw new Error('Use admin:prepare or admin:activate. See docs/README.md (Step 5)');
}
if (require.main === module) main().catch(error => { console.error(`Setup error: ${error.message}`); process.exitCode = 1; });
module.exports = { encryptCredentials, decryptCredentials };
