import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';
import { deployment } from './deployment';
import { emailForUsername } from './username';
import { Account, PublishedLevel, StudySettings, StudySummary, Progress, ResultEnvelope } from './types';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let functions: Functions | null = null;
function ensureServices() {
  if (!deployment.firebase) throw new Error('Firebase is not configured. Set study/deployment.ts');
  if (!app) {
    app = initializeApp(deployment.firebase);
    auth = getAuth(app);
    functions = getFunctions(app, 'europe-west1');
  }
}
export async function loginOnline(username: string, password: string) {
  ensureServices();
  const email = emailForUsername(username);
  const credential = await signInWithEmailAndPassword(auth!, email, password);
  const token = await credential.user.getIdTokenResult(true);
  const profile = await callBackend<{ account: Account }>('getProfile', {});
  return { account: profile.account, isAdmin: token.claims.superadmin === true };
}
export async function logoutOnline() { if (auth) await signOut(auth); }
export async function callBackend<T>(name: string, data: object): Promise<T> {
  ensureServices();
  if (!auth?.currentUser) throw new Error('Sign in to use this operation');
  const reply = await httpsCallable<object, T>(functions!, name)(data);
  return reply.data;
}
export const studyApi = {
  listModerators: () => callBackend<{ moderators: Account[] }>('listModerators', {}),
  listStudies: () => callBackend<{ studies: StudySummary[] }>('listStudies', {}),
  saveStudy: (id: string, settings: StudySettings, databaseURL?: string) =>
    callBackend<{ id: string }>('saveStudy', { id, settings, ...(databaseURL ? { databaseURL } : {}) }),
  listParticipants: (studyId: string) => callBackend<{ accounts: Account[] }>('listParticipants', { studyId }),
  provisionAccount: (studyId: string, username: string, password: string, role: 'participant' | 'moderator', group = '', startDate = '') =>
    callBackend<{ uid: string }>('provisionAccount', { studyId, username, password, role, group, startDate }),
  setAccountActive: (uid: string, active: boolean) => callBackend<{ ok: boolean }>('setAccountActive', { uid, active }),
  setParticipant: (uid: string, changes: object) => callBackend<{ ok: boolean }>('setParticipant', { uid, changes }),
  advanceStep: (week: number, sessionId: string, index: number, stepType: string) => callBackend<{ ok: boolean }>('advanceStudyStep', { week, sessionId, index, stepType }),
  removeAccount: (uid: string) => callBackend<{ ok: boolean }>('removeAccount', { uid }),
  resetModeratorPassword: (uid: string, password: string) => callBackend<{ ok: boolean }>('resetModeratorPassword', { uid, password }),
  updateAccountCredentials: (uid: string, username?: string, password?: string) =>
    callBackend<{ ok: boolean }>('updateAccountCredentials', { uid, ...(username !== undefined ? { username } : {}),
      ...(password !== undefined ? { password } : {}) }),
  listLevels: () => callBackend<{ levels: PublishedLevel[] }>('listLevels', {}),
  saveLevel: (id: string, name: string, data: unknown) => callBackend<{ id: string }>('saveLevel', { id, name, data }),
  getLevel: (id: string) => callBackend<{ level: PublishedLevel }>('getLevel', { id }),
  fetchParticipant: () => callBackend<{ account: Account; settings: StudySettings; progress: Progress }>('getParticipantBundle', {}),
  saveResult: (data: ResultEnvelope, progress: Progress) => callBackend<{ ok: boolean }>('submitResult', { data, progress }),
  exportResults: (studyId: string, uid?: string) =>
    callBackend<{ results: ResultEnvelope[]; partial?: boolean }>('exportResults', { studyId, ...(uid ? { uid } : {}) }),
};
