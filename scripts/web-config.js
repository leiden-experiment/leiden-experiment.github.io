/** Build-time PUBLIC browser configuration. Never place administrator keys/passwords here. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const localPath = path.join(root, 'web-config.local.json');
const guest = Object.freeze({ mode: 'guest', allowGuest: true, firebase: null });
const required = ['apiKey', 'authDomain', 'projectId', 'databaseURL', 'appId'];
const allowedFirebaseKeys = [...required, 'messagingSenderId', 'storageBucket', 'measurementId'];
function validateWebConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Web configuration must be a JSON object.');
  if (!['guest', 'online', 'offline'].includes(config.mode)) throw new Error('mode must be guest, online or offline.');
  if (typeof config.allowGuest !== 'boolean') throw new Error('allowGuest must be true or false.');
  for (const key of Object.keys(config)) if (!['mode', 'allowGuest', 'firebase'].includes(key))
    throw new Error(`Unexpected config field ${key}; never include private keys or passwords in browser config.`);
  if (config.mode === 'online') {
    if (!config.firebase || typeof config.firebase !== 'object' || Array.isArray(config.firebase))
      throw new Error('Online mode requires the Firebase web app configuration.');
    for (const key of Object.keys(config.firebase)) if (!allowedFirebaseKeys.includes(key))
      throw new Error(`Unexpected Firebase field ${key}; only paste the PUBLIC Web app config, never an Admin SDK private key.`);
    for (const key of allowedFirebaseKeys) if (config.firebase[key] !== undefined && typeof config.firebase[key] !== 'string')
      throw new Error(`Firebase ${key} must be a string.`);
    for (const key of required) if (typeof config.firebase[key] !== 'string' || !config.firebase[key].trim() || /REPLACE|YOUR-PROJECT/i.test(config.firebase[key]))
      throw new Error(`Firebase ${key} is missing or a placeholder.`);
    try {
      const url = new URL(config.firebase.databaseURL);
      if (url.protocol !== 'https:' || !/^([a-z0-9-]+\.)*(firebaseio\.com|firebasedatabase\.app)$/i.test(url.hostname))
        throw new Error('Not a Realtime Database URL.');
    } catch { throw new Error('firebase.databaseURL must be an HTTPS Firebase Realtime Database URL.'); }
    if (config.firebase.authDomain.includes('://')) throw new Error('firebase.authDomain must be a hostname (no https://).');
    if (config.allowGuest) throw new Error('Online research configuration must disable guest access to avoid accidental guest sessions.');
  } else if (config.firebase !== null) throw new Error('Guest/offline configurations must set firebase to null.');
  if (config.mode === 'guest' && !config.allowGuest) throw new Error('Guest mode must allow guests.');
  return config;
}
function loadWebConfig(env = process.env) {
  if (env.PIZZICATO_FORCE_GUEST === '1') {
    if (env.PIZZICATO_REQUIRED_MODE && env.PIZZICATO_REQUIRED_MODE !== 'guest')
      throw new Error('Conflicting build flags: a research login deployment cannot be forced into guest mode.');
    return guest;
  }
  let value;
  if (env.PIZZICATO_WEB_CONFIG && env.PIZZICATO_WEB_CONFIG.trim()) {
    try { value = JSON.parse(env.PIZZICATO_WEB_CONFIG); }
    catch { throw new Error('PIZZICATO_WEB_CONFIG is not valid JSON.'); }
  } else if (fs.existsSync(localPath)) {
    try { value = JSON.parse(fs.readFileSync(localPath, 'utf8')); }
    catch { throw new Error('web-config.local.json is not valid JSON. Run npm run setup:web again.'); }
  } else value = guest;
  const validated = validateWebConfig(value);
  if (env.PIZZICATO_REQUIRED_MODE && validated.mode !== env.PIZZICATO_REQUIRED_MODE)
    throw new Error(`Expected ${env.PIZZICATO_REQUIRED_MODE} mode but got ${validated.mode}. Check your deployment configuration.`);
  return validated;
}
module.exports = { guest, required, localPath, validateWebConfig, loadWebConfig };
