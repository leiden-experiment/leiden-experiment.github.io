import { studyApi, callBackend } from './firebaseClient';
import { Account, StudySettings, StudySummary, defaultStudySettings, validateSettings, isLevelStep } from './types';
import { createFlowBoard } from './flowBoard';
import { LevelConverter } from '../util/levelConverter';
import { downloadFile } from './offline';
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
function groupSelect(parent: HTMLElement, title: string, names: string[], selected = '', help = 'Optional study group or condition.') {
  const label = node('label', parent); label.className = 'study-field';
  const caption = node('span', label, title); tooltip(caption, help);
  const dropdown = node('select', label);
  const none = node('option', dropdown, 'None'); none.value = '';
  for (const name of names) { const item = node('option', dropdown, name); item.value = name; }
  dropdown.value = names.includes(selected) ? selected : '';
  return dropdown;
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
function fileSlug(text: string) { return text.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'study'; }
function downloadJSON(name: string, data: unknown) { downloadFile(name, JSON.stringify(data, null, 2)); }
function exportName(study: StudySummary, person = 'all-participants') {
  // Local time at the moment of download, down to the second.
  const now = new Date(); const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
  return `pizzicato-${fileSlug(study.title)}-${fileSlug(person)}-${stamp}.json`;
}
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
  if (user.role === 'admin') action(navButtons, 'Levels', () => navigate('Levels', showLibrary));
  const signOut = action(nav, `Sign Out (${user.username})`, onExit); signOut.classList.add('study-signout');
  const frame = node('div', root); frame.className = 'study-layout';
  const output = node('main', frame);
  type View = { label: string; render: () => void | Promise<void> };
  const history: View[] = [];
  let current: View | undefined;
  let navigationToken = 0;
  const clear = (label: string) => {
    output.replaceChildren();
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
  async function showStudies() {
    const page = section(output, 'Studies');
    const commands = actions(page);
    if (user.role === 'admin') {
      const createStudy = action(commands, '+ Create study', () => navigate('Create study', () => editStudy('', { ...defaultStudySettings(), weeklyEnabled: false, dateRangeEnabled: false }), true), 'primary');
      createStudy.classList.add('study-block-button');
      commands.classList.add('study-full-actions');

    }
    page.classList.add('study-compact-card', 'study-list-card');
    const list = node('div', page); list.className = 'study-list'; node('p', list, 'Loading studies…');
    const { studies } = await studyApi.listStudies();
    if (!list.isConnected) return;
    list.replaceChildren();
    if (!studies.length) node('p', list, 'No studies yet. Create your first study above.');
    for (const study of studies) {
      const row = node('div', list); row.className = 'study-row';
      const title = node('div', row); title.className = 'study-row-title';
      node('strong', title, study.title);
      action(row, 'Manage study', () => navigate(study.title, () => showStudy(study)), 'primary');
      if (user.role === 'admin') {
        const remove = action(row, '×', async () => {
          if (!confirm(`Remove study “${study.title}”?\n\nParticipants and moderators will lose access. Existing results will be retained for audit, but the study will disappear from the dashboard. This cannot be undone from the dashboard.`)) return;
          await studyApi.removeStudy(study.id);
          navigate('Studies', showStudies, false);
        }, 'danger');
        remove.title = `Remove study ${study.title}`; remove.setAttribute('aria-label', remove.title);
        remove.classList.add('study-remove-icon', 'study-remove-study');
      }
    }
  }
  function showStudy(study: StudySummary) {
    const page = section(output, study.title);
    page.classList.add('study-compact-card');
    const buttons = actions(page); buttons.classList.add('study-study-tabs');
    if (user.role === 'admin') {
      action(buttons, 'Edit Study', () => navigate('Edit ' + study.title, async () => {
        const pending = section(output, 'Loading study settings…');
        const fetched = await studyApiCallSettings(study.id);
        if (!pending.isConnected) return;
        output.replaceChildren(); editStudy(study.id, fetched.settings, fetched.databaseURL || '');
      }), 'primary');
      action(buttons, 'Moderators', () => navigate(`Moderators · ${study.title}`, () => showModerators(study)));
    }
    action(buttons, 'Participants', () => navigate(`Participants · ${study.title}`, () => showRoster(study)));
  }
  function editStudy(id: string, data: StudySettings, databaseURL = '') {
    const page = section(output, id ? `Edit study: ${data.title}` : 'Create study');
    const basic = node('div', page); basic.className = 'study-form-grid';
    const title = field(basic, 'Study title', data.title, 'input', 'The name shown to researchers and participants.');
    const db = field(basic, 'Study results database URL (optional)', databaseURL, 'input', 'A separate Firebase Realtime Database for results; leave empty to use the central database.');
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
    const perParticipant = check(options, 'Limit each participant to a number of weeks', !!data.durationWeeks,
      'End each participant’s access after the chosen number of weeks from their personal start date.');
    const durationBlock = node('div', options); durationBlock.className = 'study-form-grid';
    const duration = field(durationBlock, 'Weeks per participant', String(data.durationWeeks || 3), 'input', 'For example, 3 ends access after three 7-day periods.');
    duration.type = 'number'; duration.min = '1'; duration.max = '104'; duration.step = '1';
    const modeLabel = node('label', durationBlock); modeLabel.className = 'study-field';
    const modeHeading = node('span', modeLabel, 'Participant start date determined by');
    tooltip(modeHeading, 'Manual: set the date on each participant. First login: record it automatically when they sign in for the first time.');
    const startMode = node('select', modeLabel);
    for (const [value, text] of [['manual', 'Researcher assigns a date'], ['first-login', 'First participant login']]) {
      const option = node('option', startMode, text); option.value = value;
    }
    startMode.value = data.participantStartMode || 'manual';

    const sync = () => {
      weeklyBlock.hidden = !weekly.checked; durationBlock.hidden = !perParticipant.checked; dates.hidden = !(dateEnabled.checked || weekly.checked);
      end.closest('label')!.hidden = !dateEnabled.checked;
      start.closest('label')!.querySelector('span')!.firstChild!.textContent = dateEnabled.checked ? 'Start date' : 'Week 1 reference date';
      board.setWeekly(weekly.checked);
    };
    weekly.addEventListener('change', sync); dateEnabled.addEventListener('change', sync); perParticipant.addEventListener('change', sync);
    const timelineHost = section(page, 'Study timeline'); timelineHost.classList.add('study-subsection');
    const board = createFlowBoard(timelineHost, data.weeks && !Array.isArray(data.weeks) ? data.weeks : { '1': [] }, () => {}, weekly.checked);
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
      const removeGroup = action(panel, 'Remove group', () => { panel.remove(); const ix = groups.findIndex(g => g.panel === panel); if (ix >= 0) groups.splice(ix, 1); }, 'danger');
      removeGroup.classList.add('study-block-button');
      const read = gameConfigEditor(panel, values, { ...gameplayDefaults, ...(defaultEnabled.checked ? readDefaults() : {}) } as Record<string, GameplayValue>);
      panel.appendChild(removeGroup);
      groups.push({ name: nameField, read, panel });
    }
    for (const [name, values] of Object.entries(data.groupConfigs || {})) addGroup(name, values);
    const addGroupButton = action(groupsHost, '+ Add group', () => {
      const requested = prompt('Group name (e.g. control or trained)');
      if (requested === null) return; const name = requested.trim();
      if (!name || groups.some(g => g.name.value.trim() === name)) throw new Error('Enter a unique group name');
      addGroup(name, { ...gameplayDefaults, ...(defaultEnabled.checked ? readDefaults() : {}) });
    });
    addGroupButton.classList.add('study-block-button');
    const updateConfigs = () => {
      defaultsHost.hidden = !defaultEnabled.checked; groupsHost.hidden = !groupsEnabled.checked;
      addGroupButton.disabled = !groupsEnabled.checked;
    };
    defaultEnabled.addEventListener('change', updateConfigs); groupsEnabled.addEventListener('change', updateConfigs); updateConfigs();
    const saveStudyButton = action(actions(page), id ? 'Save changes' : 'Create study', async () => {
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
        enabled: true,
        ...(perParticipant.checked ? { durationWeeks: Number(duration.value),
          participantStartMode: startMode.value as 'manual' | 'first-login' } : {}),
        weeks: board.getWeeks() && typeof board.getWeeks() === 'object' ? board.getWeeks() : { '1': [] },
        defaultConfig: defaultEnabled.checked ? readDefaults() : {}, groupConfigs,
      };
      const errors = validateSettings(settings); if (errors.length) throw new Error(errors.join('\n'));
      await studyApi.saveStudy(id || newId('study'), settings, db.value.trim() || undefined);
      history.length = 0; navigate('Studies', showStudies, false);
    }, 'primary');
    saveStudyButton.classList.add('study-block-button');
  }
  async function showModerators(study: StudySummary) {
    const page = section(output, `Moderator accounts · ${study.title}`);
    page.classList.add('study-compact-card');
    node('p', page, 'Moderators may view participants and download results for this study; only administrators can manage accounts.');
    const create = node('div', page); create.className = 'study-form-grid';
    const name = field(create, 'New moderator username', '', 'input', 'At least four characters; used to sign in.');
    const password = field(create, 'Password', '', 'input', 'Use a long password for security.'); password.type = 'password';
    const createModerator = action(page, '+ Create moderator', async () => {
      await studyApi.provisionAccount(study.id, name.value, password.value, 'moderator');
      alert(`Moderator ${name.value} created. Share their login securely.`);
      navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
    }, 'primary');
    createModerator.classList.add('study-block-button');
    const results = node('div', page); node('p', results, 'Loading moderators…');
    const { accounts } = await studyApi.listParticipants(study.id);
    if (!results.isConnected) return; results.replaceChildren();
    const moderators = accounts.filter(a => a.role === 'moderator');
    if (!moderators.length) node('p', results, 'No moderator accounts for this study.');
    for (const mod of moderators) {
      const row = node('div', results); row.className = 'study-row study-mod-row';
      const title = node('div', row); title.className = 'study-row-title';
      node('strong', title, mod.username); node('small', title, mod.active ? 'Active' : 'Disabled');
      const modActions = actions(row); modActions.classList.add('study-row-actions');
      action(modActions, mod.active ? 'Disable' : 'Enable', async () => {
        await studyApi.setAccountActive(mod.uid, !mod.active); navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
      });
      action(modActions, 'Reset password', async () => {
        const secret = prompt('New password'); if (!secret) return;
        await studyApi.resetModeratorPassword(mod.uid, secret); alert('Password updated. Share it securely.');
      });
      const removeModerator = action(modActions, '×', async () => {
        if (!confirm(`Permanently remove ${mod.username}?`)) return;
        await studyApi.removeAccount(mod.uid); navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
      }, 'danger');
      removeModerator.title = `Remove moderator ${mod.username}`; removeModerator.setAttribute('aria-label', removeModerator.title);
      removeModerator.classList.add('study-remove-icon');
    }
  }
  async function showRoster(study: StudySummary) {
    const page = section(output, `Participants · ${study.title}`);
    page.classList.add('study-compact-card');
    const canEdit = user.role === 'admin';
    const controls = actions(page); controls.classList.add('study-full-actions');
    action(controls, 'Download all participant data', async () => {
      const { results, partial } = await studyApi.exportResults(study.id);
      if (partial) alert('Some linked-database results could not be retrieved; queued records are included.');
      downloadJSON(exportName(study), results);
    }, 'primary');
    const settings = (await studyApiCallSettings(study.id)).settings;
    if (!page.isConnected) return;
    const groups = Object.keys(settings.groupConfigs || {});
    const showStartDate = settings.dateRangeEnabled !== false || !!settings.durationWeeks;
    const requiredStartDate = !!settings.durationWeeks && settings.participantStartMode !== 'first-login';
    const dateHelp = settings.participantStartMode === 'first-login'
      ? 'Leave empty to record first login, or set a specific date.' : 'Individual start date and weekly schedule anchor.';
    if (canEdit) {
      const create = node('div', page); create.className = 'study-form-grid';
      const username = field(create, 'New participant username', '', 'input', 'Participant login name.');
      const password = field(create, 'Password', '', 'input', 'One character is technically supported, but a longer password is substantially safer.'); password.type = 'password';
      const group = groupSelect(create, 'Group / condition', groups);
      let start: HTMLInputElement | undefined;
      if (showStartDate) {
        start = field(create, requiredStartDate ? 'Participant start date' : 'Participant start date (optional)', '', 'input', dateHelp);
        start.type = 'date'; start.required = requiredStartDate;
      }
      const customToggle = check(page, 'Use custom gameplay settings for this participant', false,
        'Participant-specific values take precedence over study defaults and group settings.');
      const customPanel = node('div', page); customPanel.className = 'study-individual-config'; customPanel.hidden = true;
      const baseline = { ...gameplayDefaults, ...(settings.defaultConfig || {}), ...(settings.groupConfigs?.[group.value] || {}) } as Record<string, GameplayValue>;
      let readCustom = gameConfigEditor(customPanel, {}, baseline);
      const refreshCustom = () => {
        customPanel.replaceChildren();
        readCustom = gameConfigEditor(customPanel, {}, { ...gameplayDefaults, ...(settings.defaultConfig || {}), ...(settings.groupConfigs?.[group.value] || {}) } as Record<string, GameplayValue>);
      };
      group.onchange = () => { if (customToggle.checked) refreshCustom(); };
      customToggle.onchange = () => { customPanel.hidden = !customToggle.checked; };
      const createButton = action(actions(page), '+ Add participant', async () => {
        if (requiredStartDate && !start?.value) throw new Error('Choose a participant start date.');
        await studyApi.provisionAccount(study.id, username.value.trim(), password.value, 'participant', group.value, start?.value || '', customToggle.checked ? readCustom() : undefined);
        navigate(`Participants · ${study.title}`, () => showRoster(study), false);
      }, 'primary');
      createButton.classList.add('study-block-button');
    }
    const search = field(page, 'Find a participant', '', 'input', 'Filter the participant list by username or group.');
    search.placeholder = 'Search participants…'; search.classList.add('study-search');
    const results = node('div', page); results.className = 'study-roster'; node('p', results, 'Loading participants…');
    const { accounts } = await studyApi.listParticipants(study.id);
    if (!results.isConnected) return;
    results.replaceChildren();
    const participants = accounts.filter(a => a.role === 'participant').sort((a,b) => a.username.localeCompare(b.username));
    if (!participants.length) node('p', results, 'No participants yet.');
    const rows: { element: HTMLElement; member: Account }[] = [];
    for (const member of participants) {
      const item = node('div', results); item.className = 'study-roster-item';
      const row = node('div', item); row.className = 'study-row study-participant-row';
      const details = node('div', row); details.className = 'study-row-title';
      node('strong', details, member.username);
      node('small', details, `Group: ${member.group || 'None'} · ${member.active ? 'Active' : 'Disabled'}${member.customConfig ? ' · Custom settings' : ''}`);
      const commands = actions(row); commands.classList.add('study-row-actions');
      const iconAction = (text: string, hint: string, fn: () => void | Promise<void>, style: 'primary' | 'secondary' | 'danger' = 'secondary') => {
        const button = action(commands, text, fn, style); button.title = hint; button.setAttribute('aria-label', hint); return button;
      };
      iconAction('Download', 'Download participant results (JSON)', async () => {
        const { results: data, partial } = await studyApi.exportResults(study.id, member.uid);
        if (partial) alert('Some results could not be retrieved.');
        downloadJSON(exportName(study, member.username), data);
      });
      if (canEdit) {
        const edit = node('div', item); edit.className = 'study-inline-edit'; edit.hidden = true;
        const assignmentFields = node('div', edit); assignmentFields.className = 'study-form-grid';
        const group = groupSelect(assignmentFields, 'Group / condition', groups, member.group || '');
        let date: HTMLInputElement | undefined;
        if (showStartDate) {
          date = field(assignmentFields, requiredStartDate ? 'Participant start date' : 'Participant start date (optional)', member.startDate || '', 'input', dateHelp);
          date.type = 'date'; date.required = requiredStartDate;
        }
        let customToggle: HTMLInputElement | undefined;
        let readCustom: () => Record<string, unknown> = () => ({});
        // Only accounts provisioned with individual settings expose this editor.
        if (member.customConfig) {
          customToggle = check(edit, 'Use custom gameplay settings', true,
            'Override the group configuration with participant-specific values. Uncheck to remove the override.');
          const customPanel = node('div', edit); customPanel.className = 'study-individual-config';
          const fillCustom = () => {
            customPanel.replaceChildren();
            readCustom = gameConfigEditor(customPanel, member.customConfig || {}, {
              ...gameplayDefaults, ...(settings.defaultConfig || {}), ...(settings.groupConfigs?.[group.value] || {})
            } as Record<string, GameplayValue>);
          };
          fillCustom();
          customToggle.onchange = () => { customPanel.hidden = !customToggle!.checked; };
          group.onchange = () => { if (customToggle!.checked) fillCustom(); };
        }
        const save = action(actions(edit), 'Save participant settings', async () => {
          if (requiredStartDate && !date?.value) throw new Error('Choose a participant start date.');
          await studyApi.setParticipant(member.uid, { group: group.value,
            ...(showStartDate ? { startDate: date?.value || '' } : {}),
            ...(customToggle ? { customConfig: customToggle.checked ? readCustom() : null } : {}) });
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        }, 'primary'); save.classList.add('study-block-button');
        iconAction('Edit settings', 'Edit group / condition and personal settings', () => { edit.hidden = !edit.hidden; });
        iconAction('Username', 'Change username', async () => {
          const name = prompt('New username', member.username);
          if (name === null || name.trim() === member.username) return;
          await studyApi.updateAccountCredentials(member.uid, name.trim());
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        });
        iconAction('Password', 'Change password', async () => {
          const password = prompt('New password'); if (password === null) return;
          await studyApi.updateAccountCredentials(member.uid, undefined, password);
          alert('Password updated. Share it privately.');
        });
        iconAction(member.active ? 'Disable' : 'Enable', member.active ? 'Deactivate participant' : 'Reactivate participant', async () => {
          await studyApi.setAccountActive(member.uid, !member.active);
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        });
        const removeParticipant = iconAction('×', 'Remove participant (results are kept)', async () => {
          if (!confirm(`Remove ${member.username}? Existing results will be retained.`)) return;
          await studyApi.removeAccount(member.uid);
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        }, 'danger');
        removeParticipant.classList.add('study-remove-icon');
      }
      rows.push({ element: item, member });
    }
    search.oninput = () => { const query = search.value.trim().toLowerCase();
      rows.forEach(({ element, member }) => { element.hidden = !!query && !`${member.username} ${member.group || ''}`.toLowerCase().includes(query); });
    };
  }
  async function showLibrary() {
    const page = section(output, 'Levels'); page.classList.add('study-compact-card', 'study-library-card');
    node('p', page, 'Upload a JSON level once, then assign it to any study. IDs are created automatically.');
    const editor = node('div', page); editor.className = 'study-level-upload';
    const fileLabel = node('label', editor); fileLabel.className = 'study-field'; node('span', fileLabel, 'JSON level file');
    const file = node('input', fileLabel); file.type = 'file'; file.accept = '.json,application/json'; file.title = 'Choose a Level Designer JSON export.';
    const levelName = field(editor, 'Display name', '', 'input', 'The name researchers see when assigning a level.');
    action(editor, 'Upload level', async () => {
      if (!file.files?.[0]) throw new Error('Select a level JSON file first');
      const converted = LevelConverter.convert(JSON.parse(await file.files[0].text()));
      const name = levelName.value.trim() || file.files[0].name.replace(/\.json$/i, '');
      await studyApi.saveLevel(newId('level'), name, converted);
      navigate('Levels', showLibrary, false);
    }, 'primary');
    const list = node('div', page); node('p', list, 'Loading levels…');
    const { levels } = await studyApi.listLevels();
    if (!list.isConnected) return; list.replaceChildren();
    if (!levels.length) node('p', list, 'No custom levels uploaded yet.');
    for (const level of levels) {
      const row = node('div', list); row.className = 'study-row study-level-row';
      const label = node('div', row); label.className = 'study-row-title';
      node('strong', label, level.name);
      action(row, 'Download', async () => downloadJSON(`${level.id}.json`, (await studyApi.getLevel(level.id)).level.data));
      if (user.role === 'admin') {
        const remove = action(row, '×', async () => {
          if (!confirm(`Permanently remove level “${level.name}” from the shared library? Only unused levels can be deleted.`)) return;
          await studyApi.removeLevel(level.id);
          navigate('Levels', showLibrary, false);
        }, 'danger');
        remove.classList.add('study-remove-icon', 'study-remove-level'); remove.title = `Delete level ${level.name}`;
        remove.setAttribute('aria-label', remove.title);
      }
    }
  }
  navigate('Studies', showStudies, false);
}
