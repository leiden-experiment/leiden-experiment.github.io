const { createHash } = require('node:crypto');
function firebasePassword(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) throw new Error('Password must contain 1–128 characters');
  return value.length >= 6 ? value : createHash('sha256').update('pizzicato-short-password-v1:' + value).digest('hex');
}
module.exports = { firebasePassword };
