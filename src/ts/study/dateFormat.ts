/** Researcher-facing dates are always DD-MM-YYYY. Firebase stores ISO YYYY-MM-DD. */
export function displayDate(iso?: string): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

/** Reject invalid calendar dates rather than allowing Date.parse to normalize them. */
export function isoDate(display: string): string {
  const text = (display || '').trim();
  if (!text) return '';
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (!match) throw new Error('Enter a date as DD-MM-YYYY.');
  const [, dd, mm, yyyy] = match;
  const day = Number(dd), month = Number(mm), year = Number(yyyy);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${text}. Use DD-MM-YYYY.`);
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Timestamp shown in participants, using local time, with a consistent 24-hour clock. */
export function displayDateTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.valueOf())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
