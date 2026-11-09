/** Mouse-controlled Settings-slide menu. Only researcher-authorized controls are rendered. */
import { GameplayValue, gameplayDefaults, gameplayOptions, validateGameplayConfig } from './gameplayFields';

export function showParticipantSettingsMenu(
  allowedSettings: readonly string[],
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
  save: (changes: Record<string, unknown>) => Promise<void>,
  onClose: () => void = () => {}
): void {
  // Prevent duplicate overlays when a participant double-clicks Settings.
  if (document.querySelector('.pizzicato-personal-settings-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'pizzicato-personal-settings-overlay';
  overlay.setAttribute('role', 'presentation');
  const panel = document.createElement('section');
  panel.className = 'pizzicato-personal-settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Participant settings');
  overlay.appendChild(panel);
  const title = document.createElement('h2'); title.textContent = 'Your settings'; panel.appendChild(title);
  const info = document.createElement('p'); info.textContent = 'These settings can be changed for your account. Select Save and Exit to keep them for your next login.'; panel.appendChild(info);
  const fields = document.createElement('div'); fields.className = 'pizzicato-personal-settings-fields'; panel.appendChild(fields);
  const inputs: { key: string; input: HTMLInputElement; isBoolean: boolean }[] = [];
  for (const option of gameplayOptions) {
    if (!allowedSettings.includes(option.key)) continue;
    const row = document.createElement('label'); row.className = 'pizzicato-personal-settings-field'; row.title = option.help;
    const label = document.createElement('span'); label.textContent = option.label; row.appendChild(label);
    const input = document.createElement('input');
    const isBoolean = typeof option.defaultValue === 'boolean';
    const value = current[option.key] ?? baseline[option.key] ?? option.defaultValue;
    if (isBoolean) { input.type = 'checkbox'; input.checked = !!value; }
    else {
      input.type = option.step !== undefined && option.step !== 1 ? 'text' : 'number';
      input.inputMode = 'decimal'; input.lang = 'en-US'; input.value = String(value);
      input.title = 'Use a period (.) for decimal values.';
      if (option.min !== undefined) input.min = String(option.min);
      if (option.max !== undefined) input.max = String(option.max);
      if (option.step !== undefined) input.step = String(option.step);
    }
    row.appendChild(input); fields.appendChild(row);
    inputs.push({ key: option.key, input, isBoolean });
  }
  const status = document.createElement('p'); status.className = 'pizzicato-personal-settings-error';
  status.setAttribute('role', 'status'); panel.appendChild(status);
  const footer = document.createElement('div'); footer.className = 'pizzicato-personal-settings-actions'; panel.appendChild(footer);
  const button = (text: string, click: () => void) => {
    const control = document.createElement('button'); control.type = 'button'; control.textContent = text;
    control.onclick = click; footer.appendChild(control); return control;
  };
  const close = () => { overlay.remove(); onClose(); };
  button('Exit without saving', close);
  button('Reset to defaults', () => {
    for (const { key, input, isBoolean } of inputs) {
      const fallback = baseline[key] ?? gameplayDefaults[key];
      if (isBoolean) input.checked = !!fallback; else input.value = String(fallback);
    }
    status.textContent = 'Defaults restored in this menu. Select Save and Exit to keep them.';
  });
  const saveButton = button('Save and Exit', () => {
    const changes: Record<string, GameplayValue> = {};
    for (const { key, input, isBoolean } of inputs) {
      if (!isBoolean && (!input.value.trim() || input.value.includes(','))) {
        status.textContent = 'Enter valid numbers using a period (.) for decimals.'; return;
      }
      changes[key] = isBoolean ? input.checked : Number(input.value);
    }
    const errors = validateGameplayConfig(changes);
    if (errors.length) { status.textContent = errors.join('. '); return; }
    saveButton.disabled = true; status.textContent = 'Saving settings…';
    void save(changes).then(close).catch(error => {
      status.textContent = error instanceof Error ? error.message : String(error);
      saveButton.disabled = false;
    });
  });
  saveButton.classList.add('pizzicato-settings-save');
  document.body.appendChild(overlay);
  panel.querySelector<HTMLInputElement>('input')?.focus();
}
