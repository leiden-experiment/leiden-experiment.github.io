/** UI-only mapping; Firebase SDK uses its Email/Password provider behind the scenes.
 * Do not accept email addresses in any Pizzicato login form.
 */
export function normalizeUsername(username: string): string {
  if (typeof username !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{3,39}$/.test(username))
    throw new Error('Enter a username (4–40 characters, beginning with a letter; letters, numbers, _ and - only), not an email address.');
  return username.toLowerCase();
}
export function emailForUsername(username: string): string {
  return `${normalizeUsername(username)}@pizzicato.com`;
}
