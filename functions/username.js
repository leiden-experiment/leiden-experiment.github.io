/** Public login-name convention shared by Firebase Admin SDK scripts and Cloud Functions.
 * Firebase Authentication still uses Email/Password internally; no email is sent to this address.
 * Usernames are globally unique within one central Firebase Authentication project.
 */
const DOMAIN = 'pizzicato.com';
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{3,39}$/;
function normalizeUsername(username) {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username))
    throw new Error('Username must be 4–40 characters, start with a letter, and contain only letters, numbers, _ or -. Do not enter an email address.');
  return username.toLowerCase();
}
function emailForUsername(username) { return `${normalizeUsername(username)}@${DOMAIN}`; }
module.exports = { DOMAIN, USERNAME_PATTERN, normalizeUsername, emailForUsername };
