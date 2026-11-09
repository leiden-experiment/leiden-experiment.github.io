import { Account, Progress, StudySettings, ResultEnvelope, emptyProgress } from './types';
export interface OfflinePack { schemaVersion: 1; account: Account; settings: StudySettings; salt: string; verifier: string; iterations: number; levels: Record<string, unknown> }
const KEY = 'pizzicato.study.offline.v1';
const RESULTS = 'pizzicato.study.results.v1';
const PROGRESS = 'pizzicato.study.progress.v1';
const encoder = new TextEncoder();
function hex(buf: ArrayBuffer) { return Array.from(new Uint8Array(buf)).map(v => v.toString(16).padStart(2, '0')).join(''); }
async function derive(password: string, salt: string, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' }, material, 256));
}
export async function createOfflinePack(account: Account, settings: StudySettings, password: string, levels: Record<string, unknown> = {}): Promise<OfflinePack> {
  if (!account.studyId || !account.participantId || !password || password.length < 12) throw new Error('A study participant and 12-character password are required');
  const salt = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
  const iterations = 310000;
  return { schemaVersion: 1, account: { ...account, role: 'participant' }, settings, salt, verifier: await derive(password, salt, iterations), iterations, levels };
}
export function importOfflinePack(pack: OfflinePack) {
  if (pack?.schemaVersion !== 1 || pack.account?.role !== 'participant' || !pack.account?.studyId || !pack.account?.participantId ||
      !pack.verifier || !pack.salt || !pack.iterations || pack.iterations < 200000) throw new Error('Invalid offline participant pack');
  localStorage.setItem(KEY, JSON.stringify(pack));
}
export function getOfflinePack(): OfflinePack | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export async function loginOffline(username: string, password: string): Promise<OfflinePack> {
  const pack = getOfflinePack();
  if (!pack || username.toLowerCase() !== pack.account.username.toLowerCase() || !pack.account.active) throw new Error('Invalid offline account');
  const candidate = await derive(password, pack.salt, pack.iterations);
  // Digest comparison is not guaranteed constant-time in a browser; offline packs are not a hardened secret store.
  if (candidate !== pack.verifier) throw new Error('Invalid offline account');
  return pack;
}
function recordKey(studyId: string, participantId: string) { return `${studyId}:${participantId}`; }
export function loadLocalProgress(studyId: string, participantId: string): Progress {
  try { return JSON.parse(localStorage.getItem(`${PROGRESS}.${recordKey(studyId, participantId)}`) || 'null') || emptyProgress(); }
  catch { return emptyProgress(); }
}
export async function saveLocalResult(result: ResultEnvelope, progress: Progress): Promise<void> {
  const id = recordKey(result.studyId, result.participantId);
  const resultKey = `${RESULTS}.${id}`;
  const values = JSON.parse(localStorage.getItem(resultKey) || '{}');
  values[result.sessionId + ':' + result.assignmentIndex] = result;
  // Save into Electron's app.userData directory before accepting completion.
  if (window.electron?.saveStudyRecord) await window.electron.saveStudyRecord(result);
  else localStorage.setItem(resultKey, JSON.stringify(values)); // Browser-only fallback.
  // Results are never stored twice in Electron's quota-limited localStorage.
  localStorage.setItem(`${PROGRESS}.${id}`, JSON.stringify(progress));
}
export async function getLocalResults(studyId: string, participantId: string): Promise<ResultEnvelope[]> {
  if (window.electron?.readStudyRecords) return window.electron.readStudyRecords(studyId, participantId);
  try { return Object.values(JSON.parse(localStorage.getItem(`${RESULTS}.${recordKey(studyId, participantId)}`) || '{}')); }
  catch { return []; }
}
export function downloadFile(name: string, value: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export async function downloadResults(studyId: string, participantId: string) {
  const data = await getLocalResults(studyId, participantId);
  downloadFile(`pizzicato-${studyId}-${participantId}-results.json`, JSON.stringify(data, null, 2));
}

export function saveLocalProgress(studyId: string, participantId: string, progress: Progress): void {
  localStorage.setItem(`${PROGRESS}.${recordKey(studyId, participantId)}`, JSON.stringify(progress));
}
