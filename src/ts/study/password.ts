/** Firebase Auth requires >=6 characters. Only short passwords are deterministically
 * expanded. This does NOT add entropy: researchers should prefer long passwords. */
export async function firebasePassword(value: string): Promise<string> {
  if (!value || value.length > 128) throw new Error('Password must contain 1–128 characters');
  if (value.length >= 6) return value;
  const bytes = new TextEncoder().encode('pizzicato-short-password-v1:' + value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
