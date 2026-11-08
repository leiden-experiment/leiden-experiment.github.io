import { studyApi } from './firebaseClient';
import { DashboardCache } from './dashboardCache';
import { normalizeUsername } from './username';
import { slidesForStudyWeek, Account, StudySettings, StudySummary, defaultStudySettings, validateSettings, isLevelStep, normalizeStudyWeeks, migrateLegacySettingsSlides, getNextAssignment, emptyProgress } from './types';
import { createFlowBoard } from './flowBoard';
import { LevelConverter } from '../util/levelConverter';
import { downloadFile } from './offline';
import { gameplayDefaults, gameplayOptions, GameplayValue, validateGameplayConfig } from './gameplayFields';
import { displayDate, displayDateTime, isoDate } from './dateFormat';

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
/** Always display DD-MM-YYYY, while retaining the browser's calendar picker. */
function dateField(parent: HTMLElement, title: string, storedISO: string, help: string) {
  const label = node('label', parent); label.className = 'study-field';
  const caption = node('span', label, title); tooltip(caption, help);
  const wrapper = node('span', label); wrapper.className = 'study-european-date';
  const entry = node('input', wrapper);
  entry.type = 'text'; entry.className = 'study-date-entry'; entry.value = displayDate(storedISO);
  entry.placeholder = 'DD-MM-YYYY'; entry.inputMode = 'numeric'; entry.autocomplete = 'off';
  entry.pattern = '\\d{2}-\\d{2}-\\d{4}'; entry.title = help;
  const calendar = node('button', wrapper, '▦'); calendar.type = 'button'; calendar.className = 'study-date-calendar';
  calendar.title = `Choose ${title.toLowerCase()} from the calendar`;
  calendar.setAttribute('aria-label', calendar.title);
  const picker = node('input', wrapper); picker.type = 'date'; picker.className = 'study-native-picker'; picker.tabIndex = -1;
  picker.value = storedISO || '';
  calendar.addEventListener('click', () => { try { picker.showPicker(); } catch { picker.focus(); picker.click(); } });
  picker.addEventListener('change', () => {
    entry.value = displayDate(picker.value);
    entry.dispatchEvent(new Event('change', { bubbles: true }));
  });
  entry.addEventListener('change', () => {
    try { picker.value = isoDate(entry.value); } catch { picker.value = ''; }
  });
  return { input: entry, picker };
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
  // Color indicates intent while keeping the dashboard's subdued monochrome base.
  if (/^(?:\+\s*)?(?:add|create|upload|new)\b/i.test(title)) button.classList.add('study-action-add');
  if (/^(?:save|apply|update)\b/i.test(title)) button.classList.add('study-action-save');
  button.addEventListener('click', async () => { button.disabled = true; try { await fn(); } catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { button.disabled = false; } });
  return button;
}
function section(parent: HTMLElement, heading: string) { const el = node('section', parent); el.className = 'study-card'; node('h2', el, heading); return el; }
function actions(parent: HTMLElement) { const el = node('div', parent); el.className = 'study-actions'; return el; }
function fileSlug(text: string) { return text.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'study'; }
function downloadJSON(name: string, data: unknown) { downloadFile(name, JSON.stringify(data, null, 2)); }
/** The level library's updatedAt is set at upload time for generated, unique level IDs. */
function levelDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : displayDate(date.toISOString());
}
function exportName(study: StudySummary, person = 'all-participants') {
  // Local time at the moment of download, down to the second.
  const now = new Date(); const stamp = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
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
      // Browser number inputs localize decimals as commas in some locales.
      // Decimal settings use a dot-only text box with decimal keyboard hints.
      input.type = option.step !== undefined && option.step !== 1 ? 'text' : 'number';
      input.lang = 'en-US'; input.inputMode = 'decimal'; input.value = String(value); input.step = String(option.step ?? 'any');
      if (option.min !== undefined) input.min = String(option.min);
      if (option.max !== undefined) input.max = String(option.max);
    }
    input.title = option.help;
    inputs.push({ key: option.key, element: input, isBoolean: typeof option.defaultValue === 'boolean' });
  }
  return () => {
    const value: Record<string, unknown> = { ...current }; // Preserve unrelated legacy settings.
    delete value.skipButtonAppearsAfterLoop;
    delete value.skipLayersAutomaticallyAfterLoop;
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
  const cache = new DashboardCache();
  const nav = node('nav', root); nav.className = 'study-nav'; nav.setAttribute('aria-label', 'Research dashboard navigation');
  const brand = node('strong', nav, 'Pizzicato'); brand.className = 'study-brand';
  const navButtons = node('div', nav); navButtons.className = 'study-nav-links';
  const backBtn = action(navButtons, '← Back', () => goBack());
  action(navButtons, 'Studies', () => navigate('Studies', showStudies));
  if (user.role === 'admin') action(navButtons, 'Levels', () => navigate('Levels', showLibrary));
  const signOut = action(nav, `Sign Out (${user.username})`, async () => {
    ++navigationToken; cache.dispose(); await onExit();
  }); signOut.classList.add('study-signout');
  const frame = node('div', root); frame.className = 'study-layout';
  const output = node('main', frame);
  type View = { label: string; render: () => void | Promise<void> };
  const history: View[] = [];
  let current: View | undefined;
  let navigationToken = 0;
  const clear = (label: string) => {
    output.replaceChildren();
    if (!cache.ready) node('p', output, 'Loading dashboard data…');
    backBtn.disabled = history.length === 0;
  };
  function navigate(label: string, render: () => void | Promise<void>, push = true) {
    if (push && current && current.label !== label) history.push(current);
    current = { label, render }; const token = ++navigationToken; clear(label);
    // Navigation is immediate; buttons live in the persistent nav and never await API responses.
    Promise.resolve().then(async () => {
      await cache.load();
      if (token !== navigationToken) return;
      output.replaceChildren();
      await render();
    }).catch(err => {
      if (token !== navigationToken) return;
      const error = section(output, 'Unable to load this page'); node('p', error, err instanceof Error ? err.message : String(err));
      action(error, 'Try again', () => navigate(label, render, false));
    });
  }
  function goBack() {
    const previous = history.pop(); if (previous) navigate(previous.label, previous.render, false);
  }
  async function showStudies() {
    const page = section(output, 'Studies');
    const commands = actions(page);
    if (user.role === 'admin') {
      const createStudy = action(commands, '+ Create study', () => navigate('Create study', () => editStudy('', { ...defaultStudySettings(), weeklyEnabled: false, scheduleMode: 'single', dateRangeEnabled: false }), true), 'primary');
      createStudy.classList.add('study-block-button');
      commands.classList.add('study-full-actions');

    }
    page.classList.add('study-compact-card', 'study-list-card');
    const list = node('div', page); list.className = 'study-list'; node('p', list, 'Loading studies…');
    await cache.load();
    const studies = cache.studies();
    if (!list.isConnected) return;
    list.replaceChildren();
    if (!studies.length) node('p', list, 'No studies yet. Create your first study above.').className = 'study-empty-studies';
    for (const study of studies) {
      const row = node('div', list); row.className = 'study-row';
      const title = node('div', row); title.className = 'study-row-title';
      node('strong', title, study.title);
      const studyActions = actions(row); studyActions.classList.add('study-study-row-actions');
      action(studyActions, 'Manage study', () => navigate(study.title, () => showStudy(study)), 'primary');
      if (user.role === 'admin') {
        const status = action(studyActions, study.enabled ? 'Disable' : 'Enable', async () => {
          if (study.enabled && !confirm(`Disable “${study.title}”? Participants will be unable to enter the study until you enable it again.`)) return;
          const saved = await studyApi.setStudyEnabled(study.id, !study.enabled);
          cache.saveStudy(study.id, { ...cache.settings(study.id), enabled: !study.enabled }, saved.revision);
          navigate('Studies', showStudies, false);
        }, study.enabled ? 'secondary' : 'primary');
        status.title = study.enabled ? 'Pause participant access without deleting results' : 'Restore participant access';
        status.classList.add('study-compact-toggle');
      }
      if (user.role === 'admin') {
        const remove = action(studyActions, '×', async () => {
          if (!confirm(`Remove study “${study.title}”?\n\nParticipants and moderators will lose access. Existing results will be retained for audit, but the study will disappear from the dashboard. This cannot be undone from the dashboard.`)) return;
          await studyApi.removeStudy(study.id);
          cache.removeStudy(study.id);
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
      action(buttons, 'Edit Study', () => navigate('Edit ' + study.title, () => {
        editStudy(study.id, cache.settings(study.id));
      }), 'primary');
      action(buttons, 'Moderators', () => navigate(`Moderators · ${study.title}`, () => showModerators(study)));
    }
    action(buttons, 'Participants', () => navigate(`Participants · ${study.title}`, () => showRoster(study)));
  }
  function editStudy(id: string, originalData: StudySettings) {
    // Preserve the original object for optimistic revision checks while
    // converting old Settings slides into regular Start/instruction slides.
    const data = migrateLegacySettingsSlides(originalData);
    const page = section(output, id ? `Edit study: ${data.title}` : 'Create study');
    const basic = node('div', page); basic.className = 'study-form-grid';
    const title = field(basic, 'Study title', data.title, 'input', 'The name shown to researchers and participants.');
    const options = section(page, 'Schedule options'); options.classList.add('study-subsection');
    // One always-visible scheduling control. Legacy weeklyEnabled=false maps to Single session.
    // Weekly schedule rows: mode/explanation, dates or duration, then session limit.
    const weeklyRow = node('div', options); weeklyRow.className = 'study-schedule-mode-row';
    const modeLabel = node('label', weeklyRow); modeLabel.className = 'study-field';
    const modeText = node('span', modeLabel, 'Weekly scheduling');
    tooltip(modeText, 'Single session repeats the same timeline. Fixed uses shared study dates; Individual uses each participant’s start date.');
    const mode = node('select', modeLabel);
    for (const [value, text] of [
      ['single', 'Single session — repeat the same timeline'],
      ['fixed', 'Fixed schedule — all participants follow the same dates'],
      ['individual', 'Individual schedule — starts on first regular login']
    ]) { const option = node('option', mode, text); option.value = value; }
    mode.value = data.weeklyEnabled === false || data.scheduleMode === 'single' ? 'single' :
      (data.scheduleMode || (data.durationWeeks ? 'individual' : 'fixed'));
    const modeHelp = node('p', weeklyRow); modeHelp.className = 'study-schedule-explanation';
    const dates = node('div', options); dates.className = 'study-schedule-date-row';
    const startField = dateField(dates, 'Study start date (Week 1)', data.startDate,
      'Participants cannot play Week 1 before this date. Everyone follows this same calendar.');
    const start = startField.input;
    const legacyFixedWeeks = data.endDate && data.startDate ? Math.max(1,
      Math.ceil((Date.parse(`${data.endDate}T00:00:00Z`) - Date.parse(`${data.startDate}T00:00:00Z`) + 86400000) / 604800000)) : 0;
    const fallbackWeeks = Math.max(1, ...Object.keys(data.weeks || {}).map(Number).filter(n => n > 0));
    const fixedWeeks = field(dates, 'Number of study weeks', String(data.scheduleMode === 'fixed' && data.durationWeeks ? data.durationWeeks : legacyFixedWeeks || fallbackWeeks), 'input',
      'The study has this many seven-day weeks, beginning on the study start date.');
    fixedWeeks.type = 'number'; fixedWeeks.min = '1'; fixedWeeks.max = '104'; fixedWeeks.step = '1';
    const endInfo = node('p', dates, ''); endInfo.className = 'study-schedule-week-count';
    const durationBlock = node('div', options); durationBlock.className = 'study-schedule-duration-row';
    const duration = field(durationBlock, 'Weeks per participant', String(data.scheduleMode === 'individual' ? data.durationWeeks || 3 : 3), 'input',
      'Each participant gets this many consecutive seven-day weeks after their first regular login.');
    duration.type = 'number'; duration.min = '1'; duration.max = '104'; duration.step = '1';
    const limitRow = node('div', options); limitRow.className = 'study-schedule-limit-row';
    const limit = field(limitRow, 'Maximum completed sessions per week', String(data.maxSessionsPerWeek), 'input',
      'The maximum number of full study sessions a participant can finish during each seven-day week.');
    limit.type = 'number'; limit.min = '1'; limit.max = '50'; limit.step = '1';
    const fixedWeekCount = () => {
      let begin = '';
      try { begin = isoDate(start.value); } catch { /* Form validation will explain. */ }
      const count = Number(fixedWeeks.value);
      const validCount = Number.isInteger(count) && count >= 1 && count <= 104;
      if (begin && validCount) {
        const inclusiveEnd = new Date(Date.parse(`${begin}T00:00:00Z`) + (count * 7 - 1) * 86400000);
        endInfo.textContent = `Calculated end date: ${displayDate(inclusiveEnd.toISOString().slice(0, 10))}`;
      } else endInfo.textContent = 'Enter a start date and 1–104 weeks.';
      return validCount ? count : null;
    };
    const sync = () => {
      const weekly = mode.value !== 'single';
      dates.hidden = mode.value !== 'fixed';
      durationBlock.hidden = mode.value !== 'individual';
      limitRow.hidden = !weekly;
      modeHelp.textContent = mode.value === 'single'
        ? 'The same study session is available on every login, with no week-based limit.'
        : mode.value === 'fixed'
          ? 'Everyone follows the same calendar. Week 1 opens on the start date and each new week opens seven days later.'
          : 'Each participant follows their own seven-day calendar, beginning on their first regular login after any Pre-test.';
      const count = fixedWeekCount();
      board.setWeekly(weekly);
      // The fixed number of weeks bounds the timeline; reducing it removes
      // later regular weeks, but never Pre-test or Post-test.
      board.setWeekLimit(mode.value === 'fixed' ? count : mode.value === 'individual' ? Number(duration.value) : 1);
      board.setScheduleNote(mode.value === 'single'
        ? 'Single session: the same timeline repeats without a calendar.'
        : mode.value === 'fixed'
          ? `All participants follow the same dates: Week 1 begins ${start.value || 'on the study start date'}, then each week opens seven days later for ${fixedWeeks.value || 'the configured number of'} weeks. A researcher can give an individual participant an independent rolling calendar.`
          : `Each participant's Week 1 begins on their first regular login${data.weeks?.['0']?.length ? ' after their Pre-test' : ''}. Weeks run for ${duration.value || 'the configured number of'} seven-day periods. Researchers can assign an independent rolling calendar from any week.`);
    };
    mode.addEventListener('change', sync);
    start.addEventListener('change', sync); fixedWeeks.addEventListener('change', sync);
    start.addEventListener('input', sync); fixedWeeks.addEventListener('input', sync);
    duration.addEventListener('change', sync); duration.addEventListener('input', sync);
    const timelineHost = section(page, 'Study timeline'); timelineHost.classList.add('study-subsection');
    const board = createFlowBoard(timelineHost, normalizeStudyWeeks(data.weeks), () => {}, mode.value !== 'single');
    board.setAvailableLevels(cache.levels().map(l => ({ id: `library:${l.id}`, name: `Uploaded: ${l.name}`, bpm: l.bpm })));
    sync();
    const collection = section(page, 'Research data'); collection.classList.add('study-subsection');
    const collectFingers = check(collection, 'Collect normalized positions and radii', data.collectFingerPositions === true,
      'When disabled, normalized finger and target coordinates and radii are omitted; scores and timing are still recorded.');
    const participantControls = section(page, 'Participant screen controls');
    participantControls.classList.add('study-subsection');
    const enableParticipantSettings = check(participantControls, 'Allow participants to edit settings', data.participantSettingsEnabled === true,
      'Show a Settings button alongside Setup Camera on every study screen. Saved changes are remembered next time the participant logs in.');
    const allowedHost = node('div', participantControls); allowedHost.className = 'study-config-grid';
    const permittedSettings: { key: string; box: HTMLInputElement }[] = [];
    for (const option of gameplayOptions) {
      const label = node('label', allowedHost); label.className = 'study-check'; label.title = option.help;
      const box = node('input', label); box.type = 'checkbox';
      box.checked = (data.participantSettingsAllowed || []).includes(option.key);
      node('span', label, option.label);
      permittedSettings.push({ key: option.key, box });
    }
    const syncParticipantControls = () => { allowedHost.hidden = !enableParticipantSettings.checked; };
    enableParticipantSettings.onchange = () => {
      if (enableParticipantSettings.checked && !permittedSettings.some(item => item.box.checked)) {
        for (const item of permittedSettings) item.box.checked = ['targetSize', 'fingerSize', 'backgroundMusicVolume', 'enableCameraVisibility'].includes(item.key);
      }
      syncParticipantControls();
    };
    syncParticipantControls();
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
      const heading = node('div', panel); heading.className = 'study-group-heading';
      const nameField = field(heading, 'Group name', name, 'input', 'Enter this exact name when assigning a participant to this group.');
      const removeGroup = action(heading, '×', () => {
        panel.remove();
        const ix = groups.findIndex(g => g.panel === panel);
        if (ix >= 0) groups.splice(ix, 1);
      }, 'danger');
      removeGroup.classList.add('study-remove-icon', 'study-group-remove');
      removeGroup.title = 'Remove this group';
      removeGroup.setAttribute('aria-label', 'Remove this group');
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
        title: title.value.trim(), description: data.description || '', introText: '', collectFingerPositions: collectFingers.checked,
        participantSettingsEnabled: enableParticipantSettings.checked,
        participantSettingsAllowed: enableParticipantSettings.checked ? permittedSettings.filter(item => item.box.checked).map(item => item.key) : [],
        startDate: mode.value === 'fixed' ? isoDate(start.value) : data.startDate || new Date().toISOString().slice(0, 10),
        endDate: '', // Derived from fixed start date and durationWeeks, never a separate lock.
        weeklyEnabled: mode.value !== 'single', scheduleMode: mode.value as 'single' | 'fixed' | 'individual',
        dateRangeEnabled: false,
        maxSessionsPerWeek: mode.value !== 'single' ? Number(limit.value) : data.maxSessionsPerWeek || 3,
        enabled: id ? data.enabled !== false : true,
        ...(mode.value === 'fixed' ? { durationWeeks: Number(fixedWeeks.value) } : {}),
        ...(mode.value === 'individual' ? { durationWeeks: Number(duration.value), participantStartMode: 'first-login' as const } : {}),
        weeks: normalizeStudyWeeks(board.getWeeks()),
        defaultConfig: defaultEnabled.checked ? readDefaults() : {}, groupConfigs,
      };
      const errors = validateSettings(settings); if (errors.length) throw new Error(errors.join('\n'));
      const originallyPopulated = Object.values(normalizeStudyWeeks(data.weeks)).some(slides => slides.length > 0);
      const nowEmpty = Object.values(settings.weeks).every(slides => slides.length === 0);
      const confirmClearTimeline = !!id && originallyPopulated && nowEmpty;
      if (confirmClearTimeline && !confirm('This will delete ALL slides in this study timeline. Are you sure?')) return;
      const studyId = id || newId('study');
      const saved = await studyApi.saveStudy(studyId, settings, confirmClearTimeline, cache.study(studyId)?.revision ?? 0, id ? originalData : undefined);
      cache.saveStudy(studyId, settings, saved.revision);
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
      const { uid } = await studyApi.provisionAccount(study.id, name.value, password.value, 'moderator');
      cache.addAccount(study.id, { uid, username: normalizeUsername(name.value), role: 'moderator', studyId: study.id, active: true });
      alert(`Moderator ${name.value} created. Share their login securely.`);
      navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
    }, 'primary');
    createModerator.classList.add('study-block-button');
    const results = node('div', page); node('p', results, 'Loading moderators…');
    const accounts = cache.accounts(study.id);
    if (!results.isConnected) return; results.replaceChildren();
    const moderators = accounts.filter(a => a.role === 'moderator');
    if (!moderators.length) node('p', results, 'No moderator accounts for this study.');
    for (const mod of moderators) {
      const row = node('div', results); row.className = 'study-row study-mod-row';
      const title = node('div', row); title.className = 'study-row-title';
      node('strong', title, mod.username); node('small', title, mod.active ? 'Active' : 'Disabled');
      const modActions = actions(row); modActions.classList.add('study-row-actions');
      action(modActions, mod.active ? 'Disable' : 'Enable', async () => {
        await studyApi.setAccountActive(mod.uid, !mod.active); cache.updateAccount(mod.uid, { active: !mod.active }); navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
      });
      action(modActions, 'Reset password', async () => {
        const secret = prompt('New password'); if (!secret) return;
        await studyApi.resetModeratorPassword(mod.uid, secret); alert('Password updated. Share it securely.');
      });
      const removeModerator = action(modActions, '×', async () => {
        if (!confirm(`Permanently remove ${mod.username}?`)) return;
        await studyApi.removeAccount(mod.uid); cache.removeAccount(mod.uid); navigate(`Moderators · ${study.title}`, () => showModerators(study), false);
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
    const exportAll = action(controls, 'Download all participant data', async () => {
      const { results, partial } = await studyApi.exportResults(study.id);
      if (partial) alert('Some linked-database results could not be retrieved; queued records are included.');
      downloadJSON(exportName(study), results);
    }, 'primary');
    exportAll.title = 'Downloads all results currently available in Firebase, including sessions recorded since you logged in.';
    const settings = cache.settings(study.id);
    if (!page.isConnected) return;
    const groups = Object.keys(settings.groupConfigs || {});
    // Participant startDate is a read-only historical first regular login date.
    // Researchers adjust the rolling schedule through Next session stage.
    if (canEdit) {
      const create = node('div', page); create.className = 'study-form-grid';
      const username = field(create, 'New participant username', '', 'input', 'Participant login name.');
      const password = field(create, 'Password', '', 'input', 'Participant login password. Share it securely.'); password.type = 'password';
      const group = groupSelect(create, 'Group / condition', groups);

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
        const customConfig = customToggle.checked ? readCustom() : undefined;
        const { uid } = await studyApi.provisionAccount(study.id, username.value.trim(), password.value, 'participant', group.value, '', customConfig);
        const normalized = normalizeUsername(username.value.trim());
        cache.addAccount(study.id, { uid, username: normalized, participantId: normalized, role: 'participant', studyId: study.id, active: true, group: group.value, startDate: '', ...(customConfig ? { customConfig } : {}) });
        navigate(`Participants · ${study.title}`, () => showRoster(study), false);
      }, 'primary');
      createButton.classList.add('study-block-button');
    }
    const refreshControl = action(actions(page), 'Refresh participant data', async () => {
      await cache.refreshParticipants(study.id);
      navigate(`Participants · ${study.title}`, () => showRoster(study), false);
    }, 'secondary');
    refreshControl.classList.add('study-block-button');
    refreshControl.title = 'Retrieve the latest participants, completed session counts and completion times from Firebase.';
    const search = field(page, 'Find a participant', '', 'input', 'Filter the participant list by username or group.');
    search.placeholder = 'Search participants…'; search.classList.add('study-search');
    const progressDescription = (uid: string) => {
      const progress = cache.progress(study.id, uid);
      const completed = progress?.totalCompletedSessions ?? Object.values(progress?.sessions || {}).reduce((sum, count) => sum + Number(count || 0), 0);
      const recordedAt = progress?.lastCompletedSessionAt;
      const date = recordedAt ? new Date(recordedAt) : null;
      const lastCompleted = date && Number.isFinite(date.valueOf())
        ? displayDateTime(recordedAt) : completed ? 'time not recorded for earlier sessions' : 'never';
      return `${completed} completed session${completed === 1 ? '' : 's'} (last completed: ${lastCompleted})`;
    };
    const results = node('div', page); results.className = 'study-roster'; node('p', results, 'Loading participants…');
    const accounts = cache.accounts(study.id);
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
      node('small', details, `Participant start date: ${member.startDate ? displayDate(member.startDate) : 'Not started'}`);
      node('small', details, progressDescription(member.uid));
      const savedProgress = cache.progress(study.id, member.uid) || emptyProgress();
      const currentPlan = getNextAssignment(settings, savedProgress, member.startDate || '');
      if (settings.weeklyEnabled !== false && settings.scheduleMode !== 'single' && currentPlan.week > 0 &&
          currentPlan.week <= currentPlan.totalWeeks) {
        node('small', details, `Week ${currentPlan.week}: ${savedProgress.sessions[String(currentPlan.week)] || 0} of ${settings.maxSessionsPerWeek} sessions completed`);
      }
      const activeOverride = savedProgress.stageOverride;
      const rolling = savedProgress.scheduleOverride;
      if (activeOverride) node('small', details, `Next session: ${activeOverride.week === 0 ? 'Pre-test' : activeOverride.week === -1 ? 'Post-test' : `Week ${activeOverride.week}`} (researcher test stage)`);
      else if (rolling) node('small', details, `Personal schedule: ${rolling.startDate ? `Week ${currentPlan.week} (began Week ${rolling.week} on ${displayDate(rolling.startDate)})` : `Week ${rolling.week} starts on next login`}`);
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

        const customToggle = check(edit, 'Use custom gameplay settings', !!member.customConfig,
          'Enable individual gameplay settings at any time, even if the participant was created without them.');
        const customPanel = node('div', edit); customPanel.className = 'study-individual-config';
        let readCustom: () => Record<string, unknown> = () => ({});
        const fillCustom = () => {
          customPanel.replaceChildren();
          readCustom = gameConfigEditor(customPanel, member.customConfig || {}, {
            ...gameplayDefaults, ...(settings.defaultConfig || {}), ...(settings.groupConfigs?.[group.value] || {})
          } as Record<string, GameplayValue>);
        };
        fillCustom(); customPanel.hidden = !customToggle.checked;
        customToggle.onchange = () => { customPanel.hidden = !customToggle.checked; };
        group.onchange = () => { if (customToggle.checked) fillCustom(); };
        // A researcher can correct an allowance without modifying or deleting historic results.
        let correctedWeeklyCount: HTMLInputElement | undefined;
        const editWeek = currentPlan.week;
        if (settings.weeklyEnabled !== false && settings.scheduleMode !== 'single' && editWeek > 0 &&
            editWeek <= currentPlan.totalWeeks && slidesForStudyWeek(normalizeStudyWeeks(settings.weeks), editWeek).length > 0) {
          correctedWeeklyCount = field(assignmentFields, `Completed sessions in Week ${editWeek}`,
            String(savedProgress.sessions[String(editWeek)] || 0), 'input',
            'Correct this week’s session allowance. Historical results and the total completed count remain unchanged. Any unfinished session for this week restarts on the participant’s next login.');
          correctedWeeklyCount.type = 'number'; correctedWeeklyCount.min = '0';
          correctedWeeklyCount.max = String(settings.maxSessionsPerWeek); correctedWeeklyCount.step = '1';
        }
        let stageSelect: HTMLSelectElement | undefined;
        if (settings.weeklyEnabled !== false && settings.scheduleMode !== 'single') {
          const stageLabel = node('label', assignmentFields); stageLabel.className = 'study-field';
          const caption = node('span', stageLabel, 'Next session stage');
          tooltip(caption, 'Automatic follows the study calendar. Selecting a week starts a persistent personal seven-day schedule from that week on the participant’s next login, even beyond a fixed study end date. Pre-test/Post-test are special one-session test stages. Automatic cancels the personal schedule.');
          stageSelect = node('select', stageLabel);
          const auto = node('option', stageSelect, 'Automatic (study dates)'); auto.value = '';
          if (rolling && !activeOverride) {
            const keep = node('option', stageSelect, `Keep personal calendar — ${rolling.startDate ? `currently Week ${currentPlan.week}` : `Week ${rolling.week} starts at next login`}`);
            keep.value = 'keep';
          }
          const configured = normalizeStudyWeeks(settings.weeks);
          if (configured['0']?.length) { const opt = node('option', stageSelect, 'Pre-test'); opt.value = '0'; }
          for (let week = 1; week <= currentPlan.totalWeeks; week++) {
            if (!slidesForStudyWeek(configured, week).length) continue;
            const source = configured[String(week)] ? '' : ' (repeats previous week)';
            const opt = node('option', stageSelect, `Week ${week}${source}`); opt.value = String(week);
          }
          if (configured['-1']?.length) { const opt = node('option', stageSelect, 'Post-test'); opt.value = '-1'; }
          stageSelect.value = activeOverride ? String(activeOverride.week) : rolling ? 'keep' : '';
        }
        const save = action(actions(edit), 'Save participant settings', async () => {
          const changed: Partial<Account> = { group: group.value,
            customConfig: customToggle.checked ? readCustom() : undefined };
          const previousStage = activeOverride ? String(activeOverride.week) : rolling ? 'keep' : '';
          const stageChanged = !!stageSelect && stageSelect.value !== previousStage;
          if (stageChanged && !confirm('Change the participant’s schedule? Selecting a week starts a new rolling calendar on their next login; Automatic restores the study calendar. Unfinished screens may restart, but saved results are kept.')) return;
          await studyApi.setParticipant(member.uid, { ...changed, ...(!customToggle.checked ? { customConfig: null } : {}) });
          cache.updateAccount(member.uid, changed);
          if (correctedWeeklyCount && Number(correctedWeeklyCount.value) !== (savedProgress.sessions[String(editWeek)] || 0)) {
            const count = Number(correctedWeeklyCount.value);
            if (!Number.isInteger(count) || count < 0 || count > settings.maxSessionsPerWeek)
              throw new Error('Enter a whole-number session count within the weekly limit.');
            if (!confirm(`Set Week ${editWeek} completed sessions to ${count}? Historical results will be retained. Any unfinished Week ${editWeek} session will restart; ask the participant to reload or sign in again.`)) return;
            const response = await studyApi.setParticipantWeekSessions(member.uid, editWeek, count);
            cache.setProgress(study.id, member.uid, response.progress);
          }
          if (stageChanged && stageSelect) {
            const selectedStage = stageSelect.value === '' ? null : Number(stageSelect.value);
            const response = await studyApi.setParticipantStage(member.uid, selectedStage);
            cache.setProgress(study.id, member.uid, response.progress);
          }
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        }, 'primary'); save.classList.add('study-block-button');
        iconAction('Edit settings', 'Edit group / condition and personal settings', () => { edit.hidden = !edit.hidden; });
        iconAction('Username', 'Change username', async () => {
          const name = prompt('New username', member.username);
          if (name === null || name.trim() === member.username) return;
          await studyApi.updateAccountCredentials(member.uid, name.trim());
          cache.updateAccount(member.uid, { username: normalizeUsername(name.trim()) });
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        });
        iconAction('Password', 'Change password', async () => {
          const password = prompt('New password'); if (password === null) return;
          await studyApi.updateAccountCredentials(member.uid, undefined, password);
          alert('Password updated. Share it privately.');
        });
        iconAction(member.active ? 'Disable' : 'Enable', member.active ? 'Deactivate participant' : 'Reactivate participant', async () => {
          await studyApi.setAccountActive(member.uid, !member.active);
          cache.updateAccount(member.uid, { active: !member.active });
          navigate(`Participants · ${study.title}`, () => showRoster(study), false);
        });
        const removeParticipant = iconAction('×', 'Remove participant (results are kept)', async () => {
          if (!confirm(`Remove ${member.username}? Existing results will be retained.`)) return;
          await studyApi.removeAccount(member.uid);
          cache.removeAccount(member.uid);
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
    node('p', page, 'Upload JSON levels here once, then assign them when creating or modifying studies.');
    const editor = node('div', page); editor.className = 'study-level-upload';
    const fileLabel = node('label', editor); fileLabel.className = 'study-field'; node('span', fileLabel, 'JSON level file');
    // Render our own centered file-picker text; native file buttons are offset by
    // different amounts in Chrome/Edge/Firefox on Windows and macOS.
    const picker = node('div', fileLabel); picker.className = 'study-file-picker';
    node('span', picker, 'Choose file').className = 'study-file-picker-button';
    const fileStatus = node('span', picker, 'No file chosen'); fileStatus.className = 'study-file-picker-name';
    const file = node('input', picker); file.type = 'file'; file.accept = '.json,application/json';
    file.title = 'Choose a Level Designer JSON export.';
    file.setAttribute('aria-label', 'Choose a JSON level file');
    file.onchange = () => { fileStatus.textContent = file.files?.[0]?.name || 'No file chosen'; };
    const levelName = field(editor, 'Display name', '', 'input', 'The name researchers see when assigning a level.');
    action(editor, 'Upload level', async () => {
      if (!file.files?.[0]) throw new Error('Select a level JSON file first');
      const converted = LevelConverter.convert(JSON.parse(await file.files[0].text()));
      const name = levelName.value.trim() || file.files[0].name.replace(/\.json$/i, '');
      if (cache.levels().some(level => level.name.trim().toLowerCase() === name.toLowerCase()))
        throw new Error(`A level named ${name} already exists. Use a different display name.`);
      const id = newId('level');
      await studyApi.saveLevel(id, name, converted);
      cache.addLevel({ id, name, updatedAt: new Date().toISOString(), bpm: converted.bpm[0] });
      navigate('Levels', showLibrary, false);
    }, 'primary');
    const list = node('div', page); node('p', list, 'Loading levels…');
    const levels = cache.levels();
    if (!list.isConnected) return; list.replaceChildren();
    if (!levels.length) node('p', list, 'No custom levels uploaded yet.');
    for (const level of levels) {
      const row = node('div', list); row.className = 'study-row study-level-row';
      const label = node('div', row); label.className = 'study-row-title';
      const uploadedDate = levelDate(level.updatedAt);
      node('strong', label, uploadedDate ? `${level.name} (${uploadedDate})` : level.name);
      action(row, 'Download', async () => downloadJSON(`${level.id}.json`, (await studyApi.getLevel(level.id)).level.data));
      if (user.role === 'admin') {
        const remove = action(row, '×', async () => {
          if (!confirm(`Permanently remove level “${level.name}” from the shared library? Only unused levels can be deleted.`)) return;
          await studyApi.removeLevel(level.id);
          cache.removeLevel(level.id);
          navigate('Levels', showLibrary, false);
        }, 'danger');
        remove.classList.add('study-remove-icon', 'study-remove-level'); remove.title = `Delete level ${level.name}`;
        remove.setAttribute('aria-label', remove.title);
      }
    }
  }
  navigate('Studies', showStudies, false);
}
