import { studyApi, callBackend } from './firebaseClient';
import { Account, StudySettings, StudySummary, defaultStudySettings, validateSettings, isLevelStep } from './types';
import { createFlowBoard } from './flowBoard';
import { LevelConverter } from '../util/levelConverter';
import { createOfflinePack, downloadFile } from './offline';
import { resultsCSV } from './results';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag); if (text) item.textContent = text; parent.appendChild(item); return item;
}
// Return the actual element type: HTMLTextAreaElement.type is readonly, while
// HTMLInputElement.type is writable (e.g. for password inputs).
function field(parent: HTMLElement, title: string, value?: string, kind?: 'input'): HTMLInputElement;
function field(parent: HTMLElement, title: string, value: string, kind: 'textarea'): HTMLTextAreaElement;
function field(parent: HTMLElement, title: string, value = '', kind: 'input' | 'textarea' = 'input') {
  const row = node('label', parent); row.className = 'study-field';
  node('span', row, title);
  const control = document.createElement(kind);
  control.value = value; row.appendChild(control); return control;
}
function action(parent: HTMLElement, title: string, fn: () => void | Promise<void>) {
  const btn = node('button', parent, title);
  btn.addEventListener('click', async () => { btn.disabled = true; try { await fn(); } catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { btn.disabled = false; } });
  return btn;
}
function section(parent: HTMLElement, heading: string) { const el = node('section', parent); el.className = 'study-card'; node('h2', el, heading); return el; }
function downloadJSON(name: string, data: unknown) { downloadFile(name, JSON.stringify(data, null, 2)); }
export async function showDashboard(root: HTMLElement, user: Account, onExit: () => void) {
  root.replaceChildren(); root.classList.add('study-shell');
  const header = node('header', root); node('h1', header, 'Pizzicato · Research administration');
  node('p', header, `Signed in as ${user.username} (${user.role})`);
  action(header, 'Sign out', onExit);
  const output = node('main', root);
  const render = async () => {
    output.replaceChildren();
    const summaries = (await studyApi.listStudies()).studies;
    const top = section(output, 'Studies');
    if (user.role === 'admin') {
      action(top, 'Create new study', () => editStudy('', defaultStudySettings()));
      action(top, 'Manage moderator accounts', () => showModerators());
      const templateInput = node('input', top); templateInput.type = 'file'; templateInput.accept = '.json,application/json';
      action(top, 'Create study from template file', async () => {
        if (!templateInput.files?.[0]) throw new Error('Choose a study template JSON file first');
        const settings = JSON.parse(await templateInput.files[0].text());
        const errors = validateSettings(settings); if (errors.length) throw new Error(errors.join('\n'));
        editStudy('', settings);
      });
    }
    for (const study of summaries) {
      const row = node('div', top); row.className = 'study-row'; node('strong', row, `${study.title} (${study.id})`);
      if (user.role === 'admin') action(row, 'Edit settings', async () => {
        // Fetch settings through the permission-controlled researcher endpoint.
        const fetched = await studyApiCallSettings(study.id);
        editStudy(study.id, fetched.settings, fetched.databaseURL || '');
      });
      action(row, 'Participants / results', () => showRoster(study));
      action(row, 'Export full study', async () => {
        const { results, partial } = await studyApi.exportResults(study.id);
        if (partial) alert('Warning: The linked database is unavailable. This export contains ONLY recovery-queue results and is NOT complete.');
        downloadJSON(`pizzicato-${study.id}-all.json`, results);
        downloadFile(`pizzicato-${study.id}-all.csv`, resultsCSV(results), 'text/csv');
      });
    }
    if (user.role === 'admin') action(output, 'Shared level library', () => showLibrary());
  };
  async function studyApiCallSettings(studyId: string) {
    return callBackend<{ settings: StudySettings; databaseURL?: string }>('getStudySettings', { studyId });
  }
  function editStudy(id: string, data: StudySettings, databaseURL = '') {
    output.replaceChildren(); const part = section(output, id ? `Edit study: ${id}` : 'Create study');
    const code = field(part, 'Study ID (letters, numbers, underscore, hyphen)', id);
    code.disabled = !!id;
    const title = field(part, 'Title', data.title);
    const desc = field(part, 'Description', data.description);
    const welcome = field(part, 'Participant welcome screen', data.introText, 'textarea');
    const date = field(part, 'Default start date (YYYY-MM-DD)', data.startDate);
    const limit = field(part, 'Maximum completed sessions per week', String(data.maxSessionsPerWeek));
    const db = field(part, 'Optional linked Firebase Realtime Database URL (server-side access required)', databaseURL);
    const checkboxLabel = node('label', part, 'Study enabled ');
    const enabled = node('input', checkboxLabel); enabled.type = 'checkbox'; enabled.checked = data.enabled;
    node('h3', part, 'Study timeline · drag slides to arrange the participant experience');
    const timeline = node('div', part);
    const board = createFlowBoard(timeline, data.weeks, () => {});
    void studyApi.listLevels().then(({ levels }) => board.setAvailableLevels(levels.map(level => ({ id: `library:${level.id}`, name: `Uploaded: ${level.name}` })))).catch(() => { /* Existing level IDs remain editable. */ });
    const advanced = node('details', part);
    node('summary', advanced, 'Advanced: import/paste a schedule JSON (optional)');
    const schedule = field(advanced, 'Weekly schedule JSON', JSON.stringify(data.weeks, null, 2), 'textarea');
    action(advanced, 'Replace timeline from JSON', () => { board.setWeeks(JSON.parse(schedule.value)); });
    const refreshJSON = () => { schedule.value = JSON.stringify(board.getWeeks(), null, 2); };
    action(advanced, 'Copy current timeline into JSON box', refreshJSON);
    node('p', part, 'To use a custom level, first publish it in Shared level library, then enter library:LEVEL_ID in the level slide.');
    const overrides = field(part, 'Advanced: default gameplay config overrides (JSON object)', JSON.stringify(data.defaultConfig || {}, null, 2), 'textarea');
    const conditions = field(part, 'Per-group gameplay configs (JSON object, keyed by group name)', JSON.stringify(data.groupConfigs || {}, null, 2), 'textarea');
    action(part, 'Save study', async () => {
      const settings: StudySettings = { title: title.value.trim(), description: desc.value, introText: welcome.value, startDate: date.value.trim(),
        maxSessionsPerWeek: Number(limit.value), enabled: enabled.checked, weeks: board.getWeeks(), defaultConfig: JSON.parse(overrides.value), groupConfigs: JSON.parse(conditions.value) };
      const errors = validateSettings(settings); if (errors.length) throw new Error(errors.join('\n'));
      await studyApi.saveStudy(code.value.trim(), settings, db.value.trim() || undefined);
      await render();
    });
    action(part, 'Back', render);
  }
  async function showModerators() {
    output.replaceChildren(); const box = section(output, 'Moderator accounts · all studies');
    node('p', box, 'Each moderator belongs to one study. Only administrators can add, change, or remove these accounts.');
    const studies = (await studyApi.listStudies()).studies;
    const studyPicker = node('select', box);
    for (const study of studies) { const option = node('option', studyPicker, study.title); option.value = study.id; }
    const name = field(box, 'New moderator username (at least 4 characters)');
    const password = field(box, 'New moderator password (at least 12 characters)'); password.type = 'password';
    action(box, 'Create moderator login', async () => {
      if (!studyPicker.value) throw new Error('Create a study first');
      await studyApi.provisionAccount(studyPicker.value, name.value, password.value, 'moderator');
      alert(`Moderator ${name.value} created. Give the login securely to the moderator.`);
      await showModerators();
    });
    const moderators = (await studyApi.listModerators()).moderators;
    for (const mod of moderators) {
      const row = node('div', box); row.className = 'study-row';
      node('strong', row, `${mod.username} · ${mod.studyId} · ${mod.active ? 'active' : 'disabled'}`);
      action(row, mod.active ? 'Disable login' : 'Enable login', async () => {
        await studyApi.setAccountActive(mod.uid, !mod.active); await showModerators();
      });
      action(row, 'Set new password', async () => {
        const secret = prompt('New password (12+ characters)'); if (!secret) return;
        await studyApi.resetModeratorPassword(mod.uid, secret);
        alert('Password updated. Share it securely; no password is saved in the dashboard.');
      });
      action(row, 'Remove moderator', async () => {
        if (!confirm(`Permanently remove moderator ${mod.username}?`)) return;
        await studyApi.removeAccount(mod.uid); await showModerators();
      });
    }
    action(box, 'Back to studies', render);
  }
  async function showRoster(study: StudySummary) {
    output.replaceChildren(); const box = section(output, `Participants · ${study.title}`);
    const accounts = (await studyApi.listParticipants(study.id)).accounts;
    const canProvision = user.role === 'admin';
    if (canProvision) {
      const username = field(box, 'New username', '');
      const password = field(box, 'Password (12+ characters)', ''); password.type = 'password';
      const group = field(box, 'Group / condition', '');
      const start = field(box, 'Participant-specific start (YYYY-MM-DD, optional)', '');
      action(box, 'Add participant', async () => { await studyApi.provisionAccount(study.id, username.value, password.value, 'participant', group.value, start.value); await showRoster(study); });
      action(box, 'Add moderator', async () => { await studyApi.provisionAccount(study.id, username.value, password.value, 'moderator'); await showRoster(study); });
    }
    for (const account of accounts) {
      const row = node('div', box); row.className = 'study-row';
      node('span', row, `${account.username} · ${account.role} · ${account.group || 'no group'} · ${account.active ? 'active' : 'disabled'}`);
      action(row, 'Download data', async () => {
        const { results, partial } = await studyApi.exportResults(study.id, account.uid);
        if (partial) alert('Warning: The linked database is unavailable. This export contains ONLY recovery-queue results and is NOT complete.');
        downloadJSON(`pizzicato-${study.id}-${account.username}.json`, results);
        downloadFile(`pizzicato-${study.id}-${account.username}.csv`, resultsCSV(results), 'text/csv');
      });
      if (canProvision) {
        action(row, account.active ? 'Deactivate' : 'Reactivate', async () => { await studyApi.setAccountActive(account.uid, !account.active); await showRoster(study); });
        if (account.role === 'participant') action(row, 'Edit assignment', async () => {
          const groupName = prompt('New group/condition', account.group || ''); if (groupName === null) return;
          const startDate = prompt('New participant-specific start date (YYYY-MM-DD or blank)', account.startDate || ''); if (startDate === null) return;
          const schedule = prompt('Participant-specific schedule JSON (empty to use study schedule)', account.weeksOverride ? JSON.stringify(account.weeksOverride, null, 2) : '');
          if (schedule === null) return;
          const weeksOverride = schedule.trim() ? JSON.parse(schedule) : null;
          await studyApi.setParticipant(account.uid, { group: groupName, startDate, weeksOverride }); await showRoster(study);
        });
        if (account.role === 'moderator') action(row, 'Reset password', async () => {
          const secret = prompt('Enter a new moderator password (12+ characters); share it securely with the moderator.');
          if (!secret) return; await studyApi.resetModeratorPassword(account.uid, secret); alert('Password reset. The moderator must sign in again with the new password.');
        });
        action(row, 'Remove login permanently', async () => {
          if (!confirm(`Remove login ${account.username}? This cannot be undone. Existing study results will be retained.`)) return;
          await studyApi.removeAccount(account.uid); await showRoster(study);
        });
        if (account.role === 'participant') action(row, 'Create offline pack', async () => {
          const secret = prompt('Create a local-only password (12+ characters). Share it separately from the pack.');
          if (!secret) return;
          const detail = await studyApiCallSettings(study.id);
          if (account.weeksOverride) detail.settings.weeks = account.weeksOverride;
          const levels: Record<string, unknown> = {};
          const assigned = new Set(Object.values(detail.settings.weeks).flat().filter(a => isLevelStep(a) && a.levelId.startsWith('library:')).map(a => isLevelStep(a) ? a.levelId.slice('library:'.length) : ''));
          for (const id of assigned) levels[id] = (await studyApi.getLevel(id)).level.data;
          const pack = await createOfflinePack(account, detail.settings, secret, levels);
          downloadJSON(`offline-${study.id}-${account.username}.pizzicato-study.json`, pack);
        });
      }
    }
    action(box, 'Back to studies', render);
  }
  async function showLibrary() {
    output.replaceChildren(); const box = section(output, 'Central level library');
    const file = node('input', box); file.type = 'file'; file.accept = '.json,application/json';
    const levelId = field(box, 'Unique ID (publish each revision under a new ID)', '');
    const levelName = field(box, 'Display name', '');
    action(box, 'Publish JSON level', async () => {
      if (!file.files?.length) throw new Error('Select a Designer JSON level');
      const raw = JSON.parse(await file.files[0].text());
      const data = LevelConverter.convert(raw);
      await studyApi.saveLevel(levelId.value.trim(), levelName.value.trim(), data);
      await showLibrary();
    });
    const library = (await studyApi.listLevels()).levels;
    for (const item of library) {
      const row = node('div', box); row.className = 'study-row';
      node('span', row, `${item.name} · library:${item.id}`);
      action(row, 'Download', async () => downloadJSON(`${item.id}.json`, (await studyApi.getLevel(item.id)).level.data));
    }
    action(box, 'Back to studies', render);
  }
  await render();
}
