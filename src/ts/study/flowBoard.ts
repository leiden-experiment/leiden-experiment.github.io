import { StudyStep, StudySettings, isLevelStep, isSelectionStep, normalizeStudyWeeks } from './types';

/** Dependency-free study slide timeline with live, explicit drag insertion previews. */
export function createFlowBoard(parent: HTMLElement, source: StudySettings['weeks'], changed: (weeks: StudySettings['weeks']) => void, weekly = true) {
  let weeks: StudySettings['weeks'] = JSON.parse(JSON.stringify(normalizeStudyWeeks(source)));
  let isWeekly = weekly;
  let availableLevels: { id: string; name: string; bpm?: number }[] = [
    ...['Birthday Vibes', 'Cheerful Bliss', 'Slow Elegance', 'Trained', 'Untrained', 'Tryout', 'Nosound']
      .map(name => ({ id: `legacy:${name}`, name: `Bundled: ${name}` }))
  ];
  let selected: { week: string; index: number } | null = null;
  let dragging: { week: string; index: number } | null = null;
  let destination: { week: string; index: number } | null = null;
  const board = document.createElement('div'); board.className = 'study-flow-board'; parent.appendChild(board);
  // Render the editor within the selected week, never below the entire timeline.
  const editor = document.createElement('div'); editor.className = 'study-slide-editor';
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, into: HTMLElement, title?: string) => {
    const element = document.createElement(tag); if (title !== undefined) element.textContent = title; into.appendChild(element); return element;
  };
  const button = (into: HTMLElement, title: string, fn: () => void, purpose: 'default' | 'add' | 'danger' = 'default') => {
    const b = make('button', into, title); b.type = 'button'; b.onclick = fn;
    b.classList.add('study-flow-action', `study-action-${purpose}`);
    return b;
  };
  const trigger = () => changed(JSON.parse(JSON.stringify(weeks)));
  const placeholder = (kind: 'start' | 'level' | 'selection' | 'break' | 'end'): StudyStep => kind === 'selection'
    ? { type: 'selection', text: 'Choose a level to play.', choices: [{ type: 'level', levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 3 }], unlock: 'all', playthroughs: 3 }
    : kind === 'level'
    ? { type: 'level', levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 3 }
    : { type: kind, text: kind === 'start' ? 'Welcome! Press Continue when ready.' :
      kind === 'break' ? 'Take a break. Press Continue when ready to play again.' :
        'Thanks for playing! Please come back for your next session.' };
  const ordered = () => Object.keys(weeks || {}).sort((a, b) => Number(a) - Number(b));
  function move(fromWeek: string, fromIndex: number, toWeek: string, insertion: number) {
    const from = weeks[fromWeek]; const to = weeks[toWeek];
    if (!from || !to || !from[fromIndex] || insertion < 0 || insertion > to.length) return;
    if (fromWeek === toWeek && (insertion === fromIndex || insertion === fromIndex + 1)) return;
    const [step] = from.splice(fromIndex, 1);
    const target = fromWeek === toWeek && fromIndex < insertion ? insertion - 1 : insertion;
    to.splice(target, 0, step);
    selected = { week: toWeek, index: target }; trigger(); render();
  }
  function add(week: string, type: 'start' | 'level' | 'selection' | 'break' | 'end') {
    weeks[week].push(placeholder(type)); selected = { week, index: weeks[week].length - 1 }; trigger(); render();
  }
  function tempoSlider(into: HTMLElement, assignment: { levelId: string; bpm?: number; bpmIndex: number }) {
    const info = availableLevels.find(level => level.id === assignment.levelId);
    const row = make('div', into); row.className = 'study-field study-bpm-slider';
    const heading = make('div', row); heading.className = 'study-bpm-heading';
    const caption = make('span', heading);
    const original = Number.isFinite(info?.bpm) ? Math.round(info!.bpm!) : 120;
    // The original BPM maps to the same numeric slider position as an explicit BPM.
    // A level outside the slider's supported range can still use its authored tempo.
    const originalPosition = Math.min(200, Math.max(60, original));
    const slider = make('input', row);
    slider.type = 'range'; slider.min = '60'; slider.max = '200'; slider.step = '1';
    slider.value = String(assignment.bpm ?? originalPosition);
    slider.title = 'Exact playback BPM (60–200). Moving the slider sets a tempo override.';
    const updateLabel = () => { caption.textContent = `BPM: ${assignment.bpm ?? original}`; };
    updateLabel();
    slider.setAttribute('aria-label', 'Playback BPM');
    slider.addEventListener('input', () => { assignment.bpm = Number(slider.value); updateLabel(); trigger(); });
    const reset = button(heading, 'Reset BPM', () => {
      delete assignment.bpm; slider.value = String(originalPosition); updateLabel(); trigger();
    });
    reset.classList.add('study-bpm-reset');
    reset.title = `Restore the level's original tempo (${original} BPM)`;
  }
  function edit() {
    editor.replaceChildren();
    if (!selected) { editor.hidden = true; return; }
    editor.hidden = false;
    const { week, index } = selected;
    const step = weeks[week]?.[index]; if (!step) { selected = null; return edit(); }
    make('h3', editor, `${week === '0' ? 'Pretest' : week === '-1' ? 'Posttest' : `Week ${week}`} · Slide ${index + 1}`);
    make('p', editor, isLevelStep(step) ? 'Select which level to play, its difficulty, and how many loops to complete.' : 'This screen appears until the participant presses Continue.');
    function item(label: string, value: string, change: (value: string) => void, help: string, multiline = false) {
      const wrap = make('label', editor); wrap.className = 'study-field';
      make('span', wrap, label); wrap.title = help;
      const input = multiline ? document.createElement('textarea') : document.createElement('input');
      input.value = value; input.title = help; wrap.appendChild(input);
      input.addEventListener('input', () => { change(input.value); trigger(); });
    }
    if (isLevelStep(step)) {
      const selectorRow = make('label', editor); selectorRow.className = 'study-field';
      make('span', selectorRow, 'Level'); selectorRow.title = 'Choose a bundled level or a level uploaded to the shared library.';
      const select = make('select', selectorRow);
      const blank = make('option', select, 'Choose a level…'); blank.value = '';
      for (const level of availableLevels) { const option = make('option', select, level.name); option.value = level.id; }
      select.value = availableLevels.some(l => l.id === step.levelId) ? step.levelId : '';
      select.onchange = () => { if (!select.value) return; step.levelId = select.value; delete step.bpm; step.bpmIndex = 0; trigger(); render(); };
      if (!select.value) item('Existing level ID', step.levelId, value => { step.levelId = value; }, 'Keeps previously assigned levels available even if they are not currently listed.');
      if (step.levelId.startsWith('legacy:')) item('Difficulty / BPM option', String(step.bpmIndex), value => { step.bpmIndex = Number(value); }, '0 selects the first speed. Higher numbers select later speed options.');
      else { step.bpmIndex = 0; tempoSlider(editor, step); }
      item('Number of loops', String(step.loops), value => { step.loops = Number(value); }, 'Loops to play before this slide completes.');
    } else if (isSelectionStep(step)) {
      item('Selection screen message', step.text, v => { step.text = v; }, 'Shown above the selectable levels.', true);
      const unlock = make('label', editor); unlock.className = 'study-field';
      make('span', unlock, 'Unlock levels');
      const unlockSelect = make('select', unlock);
      for (const [value, label] of [['all', 'All levels unlocked'], ['sequential', 'Unlock next after playing previous'], ['weekly', 'Unlock one more each week']]) {
        const option = make('option', unlockSelect, label); option.value = value;
      }
      unlockSelect.value = step.unlock; unlockSelect.title = 'Controls which levels the participant may select.';
      unlockSelect.onchange = () => { step.unlock = unlockSelect.value as typeof step.unlock; trigger(); };
      const quota = make('label', editor); quota.className = 'study-field';
      make('span', quota, 'Number of plays (0 = unlimited)');
      const plays = make('input', quota); plays.type = 'number'; plays.min = '0'; plays.max = '100'; plays.step = '1'; plays.value = String(step.playthroughs);
      plays.title = 'Fixed number of completed level plays, or 0 to allow indefinite selection with a Finish button.';
      plays.onchange = () => { step.playthroughs = Number(plays.value); trigger(); };
      make('h3', editor, 'Selectable levels');
      step.choices.forEach((choice, i) => {
        const row = make('div', editor); row.className = 'study-choice-editor';
        const pickerLabel = make('label', row); pickerLabel.className = 'study-field'; make('span', pickerLabel, `Level ${i + 1}`);
        const picker = make('select', pickerLabel);
        for (const level of availableLevels) { const option = make('option', picker, level.name); option.value = level.id; }
        if (!availableLevels.some(l => l.id === choice.levelId)) { const old = make('option', picker, choice.levelId); old.value = choice.levelId; }
        picker.value = choice.levelId;
        picker.onchange = () => { choice.levelId = picker.value; choice.bpmIndex = 0; delete choice.bpm; trigger(); render(); };
        if (choice.levelId.startsWith('legacy:')) {
          const difficulty = make('label', row); difficulty.className = 'study-field'; make('span', difficulty, 'BPM option');
          const bpm = make('input', difficulty); bpm.type = 'number'; bpm.min = '0'; bpm.max = '8'; bpm.step = '1'; bpm.value = String(choice.bpmIndex);
          bpm.onchange = () => { choice.bpmIndex = Number(bpm.value); trigger(); };
        } else { choice.bpmIndex = 0; tempoSlider(row, choice); }
        const count = make('label', row); count.className = 'study-field'; make('span', count, 'Loops');
        const loops = make('input', count); loops.type = 'number'; loops.min = '1'; loops.max = '100'; loops.step = '1'; loops.value = String(choice.loops);
        loops.onchange = () => { choice.loops = Number(loops.value); trigger(); };
        const remove = button(row, '×', () => {
          if (step.choices.length <= 1) return;
          step.choices.splice(i, 1); trigger(); render();
        }, 'danger');
        remove.classList.add('study-choice-remove');
        remove.disabled = step.choices.length <= 1;
        remove.title = `Remove level ${i + 1}`;
        remove.setAttribute('aria-label', remove.title);
      });
      const addChoice = button(editor, '+ Add selectable level', () => {
        if (step.choices.length >= 9) return;
        step.choices.push({ type: 'level', levelId: availableLevels[0]?.id || 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 3 });
        trigger(); render();
      }, 'add');
      addChoice.disabled = step.choices.length >= 9;
    } else item('Participant message', step.text, value => { step.text = value; }, 'Shown on this start, break, or end screen.', true);
  }
  function render() {
    board.replaceChildren();
    const toolbar = make('div', board); toolbar.className = 'study-flow-toolbar';
    make('h3', toolbar, 'Visual study timeline');
    if (isWeekly) {
      const toolbarActions = make('div', toolbar); toolbarActions.className = 'study-flow-toolbar-actions';
      button(toolbarActions, '+ Add week', () => {
        const next = Math.max(0, ...ordered().map(Number).filter(n => n > 0)) + 1;
        weeks[String(next)] = []; selected = null; trigger(); render();
      }, 'add');
      button(toolbarActions, '+ Pre-test', () => { if (!weeks['0']) weeks['0'] = []; trigger(); render(); }, 'add');
      button(toolbarActions, '+ Post-test', () => { if (!weeks['-1']) weeks['-1'] = []; trigger(); render(); }, 'add');
    }
    make('p', board, isWeekly
      ? 'Each row represents a different week. Drag slide thumbnails to any insertion marker, including across weeks.'
      : 'Single-session study: the Week 1 timeline repeats. Enable Weekly study to use different weeks.');
    if (!weeks['1']) weeks['1'] = [];
    for (const week of (isWeekly ? ordered() : ['1'])) {
      const section = make('section', board); section.className = 'study-week-row';
      const header = make('div', section); header.className = 'study-week-heading';
      make('strong', header, week === '0' ? 'Pretest' : week === '-1' ? 'Posttest' : isWeekly ? `Week ${week}` : 'Study session');
      if (week !== '1') {
        const removeRow = button(header, '×', () => {
          if (!confirm(`Remove ${week === '0' ? 'Pretest' : week === '-1' ? 'Posttest' : `Week ${week}`} and its slides?`)) return;
          delete weeks[week]; selected = null; trigger(); render();
        }, 'danger');
        removeRow.classList.add('study-week-delete');
        removeRow.title = 'Remove this row and its slides';
        removeRow.setAttribute('aria-label', removeRow.title);
      }
      const slides = make('div', section); slides.className = 'study-slides';
      const indicator = document.createElement('div'); indicator.className = 'study-drop-indicator';
      indicator.textContent = 'Drop here'; indicator.setAttribute('aria-hidden', 'true');
      const clearPreview = () => { indicator.remove(); destination = null; };
      const preview = (index: number) => {
        if (!dragging) return;
        // Inserting before or after the dragged tile leaves it unchanged:
        // do not display a misleading drop target for those positions.
        if (dragging.week === week && (index === dragging.index || index === dragging.index + 1)) {
          clearPreview(); return;
        }
        destination = { week, index };
        const candidates = Array.from(slides.querySelectorAll<HTMLElement>('.study-slide'));
        const target = candidates[index];
        if (target) slides.insertBefore(indicator, target); else slides.appendChild(indicator);
      };
      slides.ondragover = event => {
        if (!dragging) return;
        event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const tiles = Array.from(slides.querySelectorAll<HTMLElement>('.study-slide'));
        let index = tiles.length;
        for (let i = 0; i < tiles.length; i++) {
          const rect = tiles[i].getBoundingClientRect();
          if (event.clientX < rect.left + rect.width / 2) { index = i; break; }
        }
        preview(index);
      };
      slides.ondrop = event => {
        if (!dragging || !destination || destination.week !== week) return;
        event.preventDefault(); event.stopPropagation();
        const { week: fromWeek, index: fromIndex } = dragging;
        const target = destination.index; dragging = null; clearPreview();
        move(fromWeek, fromIndex, week, target);
      };
      weeks[week].forEach((step, index) => {
        const tile = make('div', slides); tile.className = `study-slide study-slide-${isLevelStep(step) ? 'level' : step.type}`;
        if (selected?.week === week && selected.index === index) tile.classList.add('study-slide-selected');
        tile.draggable = true; tile.tabIndex = 0; tile.setAttribute('role', 'button');
        tile.setAttribute('aria-label', `Edit ${isLevelStep(step) ? 'level' : step.type} slide ${index + 1}`);
        const heading = make('div', tile); heading.className = 'study-slide-heading';
        make('small', heading, `${index + 1} · ${isLevelStep(step) ? 'LEVEL' : step.type.toUpperCase()}`);
        const remove = button(heading, '×', () => {
          if (!confirm(`Delete slide ${index + 1}?`)) return;
          weeks[week].splice(index, 1); selected = null; trigger(); render();
        }, 'danger');
        remove.classList.add('study-slide-delete'); remove.title = 'Delete this slide'; remove.setAttribute('aria-label', 'Delete this slide');
        remove.onclick = event => { event.stopPropagation(); if (!confirm(`Delete slide ${index + 1}?`)) return; weeks[week].splice(index, 1); selected = null; trigger(); render(); };
        make('strong', tile, isLevelStep(step) ? availableLevels.find(l => l.id === step.levelId)?.name || step.levelId : isSelectionStep(step) ? `Choose between ${step.choices.length} levels` : step.text.slice(0, 85) || '(empty message)');
        if (isLevelStep(step)) make('small', tile, `${step.levelId.startsWith('legacy:') ? `BPM option ${step.bpmIndex} · ` : ''}${step.loops} loops`);
        if (isSelectionStep(step)) make('small', tile, `${step.playthroughs === 0 ? 'Free play' : `${step.playthroughs} plays`} · ${step.unlock}`);
        tile.addEventListener('click', () => { selected = { week, index }; render(); });
        tile.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = { week, index }; render(); }
          if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); move(week, index, week, Math.max(0, index - 1)); }
          if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); move(week, index, week, Math.min(weeks[week].length, index + 2)); }
        });
        tile.ondragstart = event => {
          dragging = { week, index }; tile.classList.add('study-slide-dragging');
          event.dataTransfer?.setData('text/plain', JSON.stringify(dragging));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        };
        tile.ondragend = () => { dragging = null; clearPreview(); tile.classList.remove('study-slide-dragging'); };
      });
      const addBar = make('div', section); addBar.className = 'study-flow-add';
      const hints = {
        selection: 'Let the participant choose from multiple levels, with unlock rules and play limits.',
        start: 'Introductory screen shown before play.', level: 'Play an assigned level at the chosen difficulty and loops.',
        break: 'Pause screen with a Continue button.', end: 'Thank-you screen ending the participant session.'
      };
      for (const type of ['start', 'level', 'selection', 'break', 'end'] as const) {
        const addButton = button(addBar, `+ ${type === 'selection' ? 'Level selection' : type === 'level' ? 'Play level' : type === 'break' ? 'Break' : type === 'start' ? 'Start' : 'End'}`, () => add(week, type), 'add');
        addButton.title = hints[type];
      }
      // Position the slide editor immediately below the controls for its own week.
      // Appending it here ensures Week 1 editor appears before Week 2, and so on.
      if (selected?.week === week) section.appendChild(editor);
    }
    edit();
  }
  render();
  return {
    getWeeks: () => JSON.parse(JSON.stringify(weeks)) as StudySettings['weeks'],
    setAvailableLevels: (levels: { id: string; name: string; bpm?: number }[]) => { availableLevels = [...availableLevels.filter(x => x.id.startsWith('legacy:')), ...levels]; edit(); },
    setWeeks: (value: StudySettings['weeks']) => { weeks = JSON.parse(JSON.stringify(normalizeStudyWeeks(value)));
      selected = null; trigger(); render(); },
    setWeekly: (value: boolean) => { if (isWeekly !== value) { isWeekly = value; selected = null; render(); } },
  };
}
