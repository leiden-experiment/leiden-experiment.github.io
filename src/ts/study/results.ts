import { ResultEnvelope } from './types';
export function resultsCSV(rows: ResultEnvelope[]): string {
  const cols: Array<keyof ResultEnvelope> = [
    'studyId', 'participantId', 'group', 'sessionId', 'week', 'assignmentIndex', 'levelId', 'completedAt', 'result'
  ];
  const escapeCSV = (value: unknown) => {
    const text = String(value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : value);
    // Prevent spreadsheet-formula injection when opening participant-provided text.
    const safe = /^[=+@\t\r]/.test(text) || /^-[^0-9]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [cols.join(','), ...rows.map(row => cols.map(c => escapeCSV(row[c])).join(','))].join('\r\n');
}
