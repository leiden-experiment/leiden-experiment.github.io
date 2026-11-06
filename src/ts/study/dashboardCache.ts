/** Per-login, memory-only researcher working set. Never persist profiles in localStorage. */
import { Account, Progress, PublishedLevel, StudySettings, StudySummary } from './types';
import { studyApi } from './firebaseClient';

export interface DashboardSnapshot {
  studies: StudySummary[];
  settings: Record<string, StudySettings>;
  accounts: Record<string, Account[]>;
  levels: PublishedLevel[];
  progress: Record<string, Record<string, Progress>>;
}

export class DashboardCache {
  private snapshot: DashboardSnapshot | null = null;
  private loading: Promise<void> | null = null;
  private disposed = false;

  get ready() { return this.snapshot !== null && !this.disposed; }

  load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Dashboard session has ended'));
    if (this.snapshot) return Promise.resolve();
    if (!this.loading) this.loading = studyApi.dashboardSnapshot().then(result => {
      if (!this.disposed) this.snapshot = result;
    }).catch(error => { this.loading = null; throw error; });
    return this.loading!;
  }
  private get data(): DashboardSnapshot {
    if (!this.snapshot || this.disposed) throw new Error('Dashboard is not loaded');
    return this.snapshot;
  }
  studies() { return this.data.studies; }
  levels() { return this.data.levels; }
  accounts(studyId: string) { return this.data.accounts[studyId] || []; }
  settings(studyId: string) {
    const settings = this.data.settings[studyId];
    if (!settings) throw new Error('Study settings are not available');
    // A form must not mutate the cached copy before Save is confirmed.
    return JSON.parse(JSON.stringify(settings)) as StudySettings;
  }
  study(studyId: string) { return this.data.studies.find(item => item.id === studyId); }
  saveStudy(studyId: string, settings: StudySettings, databaseURL: string, revision: number) {
    this.data.settings[studyId] = JSON.parse(JSON.stringify(settings));
    const summary: StudySummary = { id: studyId, title: settings.title, enabled: settings.enabled, databaseURL, revision };
    const index = this.data.studies.findIndex(item => item.id === studyId);
    if (index >= 0) this.data.studies[index] = summary;
    else this.data.studies.push(summary);
    if (!this.data.accounts[studyId]) this.data.accounts[studyId] = [];
  }
  removeStudy(studyId: string) {
    this.data.studies = this.data.studies.filter(item => item.id !== studyId);
    delete this.data.settings[studyId]; delete this.data.accounts[studyId]; delete this.data.progress[studyId];
  }
  addLevel(level: PublishedLevel) { this.data.levels.push(level); }
  removeLevel(id: string) { this.data.levels = this.data.levels.filter(level => level.id !== id); }
  addAccount(studyId: string, account: Account) {
    if (!this.data.accounts[studyId]) this.data.accounts[studyId] = [];
    this.data.accounts[studyId].push(account);
  }
  updateAccount(uid: string, patch: Partial<Account>) {
    for (const accounts of Object.values(this.data.accounts)) {
      const account = accounts.find(item => item.uid === uid);
      if (account) { Object.assign(account, patch); return; }
    }
  }
  removeAccount(uid: string) {
    for (const [id, accounts] of Object.entries(this.data.accounts)) {
      this.data.accounts[id] = accounts.filter(account => account.uid !== uid);
      if (this.data.progress[id]) delete this.data.progress[id][uid];
    }
  }
  progress(studyId: string, uid: string): Progress | undefined { return this.data.progress[studyId]?.[uid]; }
  setProgress(studyId: string, uid: string, progress: Progress) {
    if (!this.data.progress[studyId]) this.data.progress[studyId] = {};
    this.data.progress[studyId][uid] = progress;
  }
  async refreshProgress(studyId: string) {
    const { progress } = await studyApi.refreshStudyProgress(studyId);
    if (!this.disposed) this.data.progress[studyId] = progress;
  }
  /** Explicit researcher refresh; normal navigation still uses the login-time snapshot.
   * Read participant profiles and progress together so last-completed timestamps
   * and account changes are current without downloading large result files.
   */
  async refreshParticipants(studyId: string) {
    const [{ accounts }, { progress }] = await Promise.all([
      studyApi.listParticipants(studyId), studyApi.refreshStudyProgress(studyId)
    ]);
    if (this.disposed) return;
    const existingModerators = this.accounts(studyId).filter(account => account.role !== 'participant');
    this.data.accounts[studyId] = [...existingModerators, ...accounts.filter(account => account.role === 'participant')];
    this.data.progress[studyId] = progress;
  }
  /** Forget all profiles on logout, including anything fetched while the logout was in flight. */
  dispose() { this.disposed = true; this.snapshot = null; this.loading = null; }
}
