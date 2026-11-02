import { studyApi, callBackend } from './firebaseClient';
import { Account, StudySettings, StudySummary, defaultStudySettings, validateSettings, isLevelStep } from './types';
import { createFlowBoard } from './flowBoard';
import { LevelConverter } from '../util/levelConverter';
import { createOfflinePack, downloadFile } from './offline';
import { resultsCSV } from './results';
import { gameplayDefaults, gameplayOptions, GameplayValue, validateGameplayConfig } from './gameplayFields';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag); if (text !== undefined) item.textContent = text; parent.appendChild(item); return item;
}
function tooltip(parent: HTMLElement, help: string) {
  const note = node('span', parent, 'ⓘ'); note.className = 'study-tooltip'; note.title = help;
  note.tabIndex = 0; note.setAttribute('aria-label', help); return note;
}
function field(parent: HTMLElement, title: string, value?: string, kind?: 'input', help?: string): HTMLInputElement;
function field(parent: HTMLElement, title: string, value: string, kind: 'textarea', help?: string): HTMLTextAreaElement;
function field(parent: HTMLElement, title: string, value = '', kind: 'input' | 'textarea' = 'input', help = '') {
  const label = node('label', parent); label.className = 'study-field';
  const caption = node('span', label, title); if (help) tooltip(caption, help);
  const control = document.createElement(kind); control.value = value; if (help) control.title = help;
  label.appendChild(control); return control;
}
function check(parent: HTMLElement, title: string, checked: boolean, help: string) {
  const label = node('label', parent); label.className = 'study-check';
  const input = node('input', label); input.type = 'checkbox'; input.checked = checked;
  node('span', label, title); tooltip(label, help); return input;
}
function action(parent: HTMLElement, title: string, fn: () => void | Promise<void>, style: 'primary' | 'secondary' | 'danger' = 'secondary') {
  const button = node('button', parent, title); button.type = 'button'; button.className = `study-btn study-btn-${style}`;
  button.addEventListener('click', async () => { button.disabled = true; try { await fn(); } catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { button.disabled = false; } });
  return button;
}
function section(parent: HTMLElement, heading: string) { const el = node('section', parent); el.className = 'study-card'; node('h2', el, heading); return el; }
function actions(parent: HTMLElement) { const el = node('div', parent); el.className = 'study-actions'; return el; }
function downloadJSON(name: string, data: unknown) { downloadFile(name, JSON.stringify(data, null, 2)); }
/** Cryptographically random, collision-resistant public IDs; no manually entered identifier. */
function newId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
function gameConfigEditor(parent: HTMLElement, current: Record<string, unknown>, baseline: Record<string, GameplayValue>) {
  const container = node('div', parent); container.className = 'study-config-grid';
  const inputs: { key: string; element: HTMLInputElement; isBoolean: boolean }[] = [];
  for (const option of gameplayOptions) {
    const wrap = node('label', container); wrap.className = 'study-config-field';
    const caption = node('span', wrap, option.label); tooltip(caption, option.help);
    const input = node('input', wrap);
    const value = current[option.key] ?? baseline[option.key];
    if (typeof option.defaultValue === 'boolean') {
      input.type = 'checkbox'; input.checked = Boolean(value);
    } else {
      input.type = 'number'; input.value = String(value); input.step = String(option.step ?? 'any');
      if (option.min !== undefined) input.min = String(option.min);
      if (option.max !== undefined) input.max = String(option.max);
    }
    input.title = option.help;
    inputs.push({ key: option.key, element: input, isBoolean: typeof option.defaultValue === 'boolean' });
  }
  return () => {
    const value: Record<string, unknown> = { ...current }; // Preserve pre-existing extra fields.
    for (const entry of inputs) {
      if (!entry.isBoolean && entry.element.value.trim() === '') throw new Error(`Enter a value for ${entry.key}`);
      value[entry.key] = entry.isBoolean ? entry.element.checked : Number(entry.element.value);
    }
    const errors = validateGameplayConfig(Object.fromEntries(Object.entries(value).filter(([key]) => gameplayOptions.some(o => o.key === key))));
    if (errors.length) throw new Error(errors.join('\n'));
    return value;
  };
}

export async function showDashboard(root: HTMLElement, user: Account, onExit: () => void) {
  root.replaceChildren(); root.classList.add('study-shell', 'study-admin-dashboard');
  const nav = node('nav', root); nav.className = 'study-nav'; nav.setAttribute('aria-label', 'Research dashboard navigation');
  const brand = node('strong', nav, 'Pizzicato'); brand.className = 'study-brand';
  const navButtons = node('div', nav); navButtons.className = 'study-nav-links';
  const backBtn = action(navButtons, '← Back', () => goBack());
  action(navButtons, 'Studies', () => navigate('Studies', showStudies));
  if (user.role === 'admin') action(navButtons, 'Shared level library', () => navigate('Shared level library', showLibrary));
  const account = node('span', nav, `${user.username} · ${user.role}`); account.className = 'study-account';
  action(nav, 'Sign out', onExit);
  const frame = node('div', root); frame.className = 'study-layout';
  const breadcrumb = node('p', frame); breadcrumb.className = 'study-breadcrumb';
  const output = node('main', frame);
  type View = { label: string; render: () => void | Promise<void> };
  const history: View[] = [];
  let current: View | undefined;
  let navigationToken = 0;
  const clear = (label: string) => {
    output.replaceChildren(); breadcrumb.textContent = label;
    backBtn.disabled = history.length === 0;
  };
  function navigate(label: string, render: () => void | Promise<void>, push = true) {
    if (push && current && current.label !== label) history.push(current);
    current = { label, render }; const token = ++navigationToken; clear(label);
    // Navigation is immediate; buttons live in the persistent nav and never await API responses.
    Promise.resolve().then(() => render()).catch(err => {
      if (token !== navigationToken) return;
      const error = section(output, 'Unable to load this page'); node('p', error, err instanceof Error ? err.message : String(err));
      action(error, 'Try again', () => navigate(label, render, false));
    });
  }
  function goBack() {
    const previous = history.pop(); if (previous) navigate(previous.label, previous.render, false);
  }
  async function studyApiCallSettings(studyId: string) {
    return callBackend<{ settings: StudySettings; databaseURL?: string }>('getStudySettings', { studyId });
  }
  async function exportStudy(id: string) {
    const { results, partial } = await studyApi.exportResults(id);
    if (partial) alert('The linked database is unavailable. This export only includes recovery-queue results.');
    downloadJSON(`pizzicato-${id}-all.json`, results);
    downloadFile(`pizzicato-${id}-all.csv`, resultsCSV(results), 'text/csv');
  }
  async function showStudies() {
    const page = section(output, 'Studies');
    const commands = actions(page);
    if (user.role === 'admin') {
      action(commands, '+ Create study', () => navigate('Create study', () => editStudy('', { ...defaultStudySettings(), weeklyEnabled: false, dateRangeEnabled: false }), true), 'primary');
      const template = node('input', commands); template.type = 'file'; template.accept = '.json,application/json'; template.title = 'Optional: import a previously saved study template';
      action(commands, 'Import study template', async () => {
        if (!template.files?.[0]) throw new Error('Choose a JSON template first');
        const settings = JSON.parse(await template.files[0].text()) as StudySettings;
        const errors = validateSettings(settings); if (errors.length) throw new Error(errors.join('\n'));
        navigate('Create study from template', () => editStudy('', settings));
      });
    }
    const list = node('div', page); list.className = 'study-list'; node('p', list, 'Loading studies…');
    const { studies } = await studyApi.listStudies();
    if (!list.isConnected) return;
    list.replaceChildren();
    if (!studies.length) node('p', list, 'No studies yet. Create your first study above.');
    for (const study of studies) {
      const row = node('div', list); row.className = 'study-row';
      const title = node('div', row); title.className = 'study-row-title';
      node('strong', title, study.title); node('small', title, `ID ${study.id} · ${study.enabled ? 'Enabled' : 'Disabled'}`);
      action(row, 'Manage study', () => navigate(study.title, () => showStudy(study)), 'primary');
    }
  }
  function showStudy(study: StudySummary) {
    const page = section(output, study.title);
    const details = node('p', page, `Study ID: ${study.id}`); details.className = 'study-muted';
    const buttons = actions(page);
    if (user.role === 'admin') {
      action(buttons, 'Study settings & timeline', () => navigate('Edit ' + study.title, async () => {
        const pending = section(output, 'Loading study settings…');
        const fetched = await studyApiCallSettings(study.id);
        if (!pending.isConnected) return;
        output.replaceChildren(); editStudy(study.id, fetched.settings, fetched.databaseURL || '');
      }), 'primary');
      action(buttons, 'Moderator accounts', () => navigate(`Moderators · ${study.title}`, () => showModerators(study)));
    }
    action(buttons, 'Participants & results', () => navigate(`Participants · ${study.title}`, () => showRoster(study)));
    action(buttons, 'Export study results', () => exportStudy(study.id));
  }
  function editStudy(id: string, data: StudySettings, databaseURL = '') {
    const page = section(output, id ? `Edit study: ${data.title}` : 'Create study');
    const basic = node('div', page); basic.className = 'study-form-grid';
    const title = field(basic, 'Study title', data.title, 'input', 'The name shown to researchers and participants.');
    const db = field(basic, 'Study results database URL (optional)', databaseURL, 'input', 'A separate Firebase Realtime Database for results; leave empty to use the central database.');
    const enabled = check(basic, 'Enable participant access', data.enabled, 'Only enabled studies can be played by participants.');
    const welcome = field(page, 'Welcome message', data.introText, 'textarea', 'Text shown before the next assigned level.');
    const options = section(page, 'Schedule options'); options.classList.add('study-subsection');
    const weekly = check(options, 'Weekly study (different timeline for each week)', data.weeklyEnabled !== false,
      'Enable weekly schedules and a maximum number of completed sessions each week. When off, week 1 repeats without a weekly cap.');
    const dateEnabled = check(options, 'Restrict study to a start/end date', data.dateRangeEnabled !== false,
      'Prevent participation before the start date or after the optional end date.');
    const weeklyBlock = node('div', options); weeklyBlock.className = 'study-form-grid';
    const limit = field(weeklyBlock, 'Maximum completed sessions per week', String(data.maxSessionsPerWeek), 'input', 'A completed session is a full pass through its timeline.');
    limit.type = 'number'; limit.min = '1'; limit.max = '50'; limit.step = '1';
    const dates = node('div', options); dates.className = 'study-form-grid';
    const start = field(dates, 'Start date', data.startDate, 'input', 'The first permitted date and week-1 anchor for weekly studies.'); start.type = 'date';
    const end = field(dates, 'End date (optional)', data.endDate || '', 'input', 'After this date participants cannot start or continue sessions.'); end.type = 'date';
    const sync = () => {
      weeklyBlock.hidden = !weekly.checked; dates.hidden = !(dateEnabled.checked || weekly.checked);
      end.closest('label')!.hidden = !dateEnabled.checked;
      start.closest('label')!.querySelector('span')!.firstChild!.textContent = dateEnabled.checked ? 'Start date' : 'Week 1 reference date';
      board.setWeekly(weekly.checked);
    };
    weekly.addEventListener('change', sync); dateEnabled.addEventListener('change', sync);
    const timelineHost = section(page, 'Study timeline'); timelineHost.classList.add('study-subsection');
    const board = createFlowBoard(timelineHost, data.weeks, () => {}, weekly.checked);
    void studyApi.listLevels().then(({ levels }) => {
      if (timelineHost.isConnected) board.setAvailableLevels(levels.map(l => ({ id: `library:${l.id}`, name: `Uploaded: ${l.name}` })));
    }).catch(() => { /* Bundled levels and saved IDs remain usable. */ });
    sync();
    const configs = section(page, 'Gameplay settings'); configs.classList.add('study-subsection');
    const defaultEnabled = check(configs, 'Override default gameplay settings', !!data.defaultConfig && Object.keys(data.defaultConfig).length > 0,
      'Change gameplay behavior for every participant unless a group overrides it.');
    const defaultsHost = node('div', configs);
    const readDefaults = gameConfigEditor(defaultsHost, data.defaultConfig || {}, gameplayDefaults);
    const groupsEnabled = check(configs, 'Use group-specific gameplay settings', !!data.groupConfigs && Object.keys(data.groupConfigs).length > 0,
      'Create study groups with their own settings. Assign participants to matching group names.');
    const groupsHost = node('div', configs);
    type GroupEntry = { name: HTMLInputElement; read: () => Record<string, unknown>; panel: HTMLElement };
    const groups: GroupEntry[] = [];
    function addGroup(name: string, values: Record<string, unknown>) {
      const panel = node('section', groupsHost); panel.className = 'study-group-panel';
      const heading = node('div', panel); heading.className = 'study-row';
      const nameField = field(heading, 'Group name', name, 'input', 'Enter this exact name when assigning a participant to this group.');
      action(heading, 'Remove group', () => { panel.remove(); const ix = groups.findIndex(g => g.panel === panel); if (ix >= 0) groups.splice(ix, 1); }, 'danger');
      const read = gameConfigEditor(panel, values, { ...gameplayDefaults, ...(defaultEnabled.checked ? readDefaults() : {}) } as Record<string, GameplayValue>);
      groups.push({ name: nameField, read, panel });
    }
    for (const [name, values] of Object.entries(data.groupConfigs || {})) addGroup(name, values);
    const addGroupButton = action(groupsHost, '+ Add group', () => {
      const requested = prompt('Group name (e.g. control or trained)');
      if (requested === null) return; const name = requested.trim();
      if (!name || groups.some(g => g.name.value.trim() === name)) throw new Error('Enter a unique group name');
      addGroup(name, { ...gameplayDefaults, ...(defaultEnabled.checked ? readDefaults() : {}) });
    });
    const updateConfigs = () => {
      defaultsHost.hidden = !defaultEnabled.checked; groupsHost.hidden = !groupsEnabled.checked;
      addGroupButton.disabled = !groupsEnabled.checked;
    };
    defaultEnabled.addEventListener('change', updateConfigs); groupsEnabled.addEventListener('change', updateConfigs); updateConfigs();
    action(actions(page), id ? 'Save changes' : 'Create study', async () => {
      const groupConfigs: Record<string, Record<string, unknown>> = {};
      if (groupsEnabled.checked) for (const group of groups) {
        const name = group.name.value.trim(); if (!name || name.length > 100 || Object.prototype.hasOwnProperty.call(groupConfigs, name)) throw new Error('Every group needs a unique name (max 100 characters)');
        groupConfigs[name] = group.read();
      }
      const settings: StudySettings = {
        title: title.value.trim(), description: data.description || '', introText: welcome.value,
        startDate: dateEnabled.checked || weekly.checked ? start.value : data.startDate || new Date().toISOString().slice(0, 10),
        endDate: dateEnabled.checked ? end.value : '',
        weeklyEnabled: weekly.checked, dateRangeEnabled: dateEnabled.checked,
        maxSessionsPerWeek: weekly.checked ? Number(limit.value) : data.maxSessionsPerWeek || 3,
        enabled: enabled.checked, weeks: board.getWeeks(),
        defaultConfig: defaultEnabled.checked ? readDefaults() : {}, groupConfigs,
      };
      const errors = validateSettings(settings); if (errors.length) throw new Error(errors.join('\n'));
      await studyApi.saveStudy(id || newId('study'), settings, db.value.trim() || undefined);
      history.length = 0; navigate('Studies', showStudies, false);
    }, 'primary');
  }
  async function showModerators(study: StudySummary) {
    const page = section(output, `Moderator accounts · ${study.title}`);
    node('p', page, 'Moderators may view participants and download results for this study; only administrators can manage accounts.');
    const create = node('div', page); create.className = 'study-form-grid';
    const name = field(create, 'New moderator username', '', 'input', 'At least four characters; used to sign in.');
    const password = field(create, 'Password', '', 'input', 'At least 12 characters; share privately.'); password.type = 'password';
    action(page, '+ Create moderator', async () => {
      await studyApi.provisionAccount(study.id, name.value, password.value, 'moderator');
      alert(`Moderator ${name.value} created. Share their login securely.`);
      navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
    }, 'primary');
    const results = node('div', page); node('p', results, 'Loading moderators…');
    const { accounts } = await studyApi.listParticipants(study.id);
    if (!results.isConnected) return; results.replaceChildren();
    const moderators = accounts.filter(a => a.role === 'moderator');
    if (!moderators.length) node('p', results, 'No moderator accounts for this study.');
    for (const mod of moderators) {
      const row = node('div', results); row.className = 'study-row';
      const title = node('div', row); title.className = 'study-row-title';
      node('strong', title, mod.username); node('small', title, mod.active ? 'Active' : 'Disabled');
      action(row, mod.active ? 'Disable' : 'Enable', async () => {
        await studyApi.setAccountActive(mod.uid, !mod.active); navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
      });
      action(row, 'Reset password', async () => {
        const secret = prompt('New password (at least 12 characters)'); if (!secret) return;
        await studyApi.resetModeratorPassword(mod.uid, secret); alert('Password updated. Share it securely.');
      });
      action(row, 'Remove', async () => {
        if (!confirm(`Permanently remove ${mod.username}?`)) return;
        await studyApi.removeAccount(mod.uid); navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
      }, 'danger');
    }
  }
  async function showRoster(study: StudySummary) {
    const page = section(output, `Participants · ${study.title}`);
    const canEdit = user.role === 'admin';
    if (canEdit) {
      const create = node('div', page); create.className = 'study-form-grid';
      const username = field(create, 'New participant username', '', 'input', 'Participant sign-in username.');
      const password = field(create, 'Password', '', 'input', 'At least 12 characters.'); password.type = 'password';
      const group = field(create, 'Group / condition', '', 'input', 'Use a group name defined in this study’s gameplay settings.');
      const start = field(create, 'Participant start date (optional)', '', 'input', 'Overrides the study’s week anchor and, when date limits are enabled, its start date.'); start.type = 'date';
      action(page, '+ Add participant', async () => {
        await studyApi.provisionAccount(study.id, username.value, password.value, 'participant', group.value, start.value);
        navigate(`Participants · ${study.title}`, () => showRoster(study), false);
      }, 'primary');
    }
    const results = node('div', page); node('p', results, 'Loading participants…');
    const { accounts } = await studyApi.listParticipants(study.id);
    if (!results.isConnected) return; results.replaceChildren();
    const participants = accounts.filter(a => a.role === 'participant');
    if (!participants.length) node('p', results, 'No participants yet.');
    for (const member of participants) {
      const row = node('div', results); row.className = 'study-row';
      const details = node('div', row); details.className = 'study-row-title';
      node('strong', details, member.username); node('small', details, `${member.group || 'No group'} · ${member.active ? 'Active' : 'Disabled'}`);
      action(row, 'Download results', async () => {
        const { results: data, partial } = await studyApi.exportResults(study.id, member.uid);
        if (partial) alert('The linked results database is unavailable. This export may be incomplete.');
        downloadJSON(`pizzicato-${study.id}-${member.username}.json`, data);
        downloadFile(`pizzicato-${study.id}-${member.username}.csv`, resultsCSV(data), 'text/csv');
      });
      if (canEdit) {
        action(row, member.active ? 'Deactivate' : 'Reactivate', async () => {
          await studyApi.setAccountActive(member.uid, !member.active);
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        });
        action(row, 'Edit assignment', async () => {
          const groupName = prompt('Group / condition', member.group || ''); if (groupName === null) return;
          const startDate = prompt('Participant start date (YYYY-MM-DD or blank)', member.startDate || ''); if (startDate === null) return;
          const schedule = prompt('Custom schedule JSON (blank uses the study schedule)', member.weeksOverride ? JSON.stringify(member.weeksOverride, null, 2) : '');
          if (schedule === null) return;
          await studyApi.setParticipant(member.uid, { group: groupName, startDate, weeksOverride: schedule.trim() ? JSON.parse(schedule) : null });
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        });
        action(row, 'Offline pack', async () => {
          const secret = prompt('Create an offline password (at least 12 characters)'); if (!secret) return;
          const detail = await studyApiCallSettings(study.id);
          if (member.weeksOverride) detail.settings.weeks = member.weeksOverride;
          const levels: Record<string, unknown> = {};
          const assigned = new Set(Object.values(detail.settings.weeks).flat().filter(a => isLevelStep(a) && a.levelId.startsWith('library:')).map(a => isLevelStep(a) ? a.levelId.slice('library:'.length) : ''));
          for (const id of assigned) levels[id] = (await studyApi.getLevel(id)).level.data;
          downloadJSON(`offline-${study.id}-${member.username}.pizzicato-study.json`, await createOfflinePack(member, detail.settings, secret, levels));
        });
        action(row, 'Remove', async () => {
          if (!confirm(`Remove participant ${member.username}? Existing results will be retained.`)) return;
          await studyApi.removeAccount(member.uid);
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        }, 'danger');
      }
    }
  }
  async function showLibrary() {
    const page = section(output, 'Shared level library');
    node('p', page, 'Upload a JSON level once, then assign it to any study. IDs are created automatically.');
    const editor = node('div', page); editor.className = 'study-form-grid';
    const file = node('input', editor); file.type = 'file'; file.accept = '.json,application/json'; file.title = 'Choose a Level Designer JSON export.';
    const levelName = field(editor, 'Display name', '', 'input', 'The name researchers see when assigning a level.');
    action(page, 'Upload level', async () => {
      if (!file.files?.[0]) throw new Error('Select a level JSON file first');
      const converted = LevelConverter.convert(JSON.parse(await file.files[0].text()));
      const name = levelName.value.trim() || file.files[0].name.replace(/\.json$/i, '');
      await studyApi.saveLevel(newId('level'), name, converted);
      navigate('Shared level library', showLibrary, false);
    }, 'primary');
    const list = node('div', page); node('p', list, 'Loading levels…');
    const { levels } = await studyApi.listLevels();
    if (!list.isConnected) return; list.replaceChildren();
    if (!levels.length) node('p', list, 'No custom levels uploaded yet.');
    for (const level of levels) {
      const row = node('div', list); row.className = 'study-row';
      const label = node('div', row); label.className = 'study-row-title';
      node('strong', label, level.name); node('small', label, `library:${level.id}`);
      action(row, 'Download', async () => downloadJSON(`${level.id}.json`, (await studyApi.getLevel(level.id)).level.data));
    }
  }
  navigate('Studies', showStudies, false);
}
