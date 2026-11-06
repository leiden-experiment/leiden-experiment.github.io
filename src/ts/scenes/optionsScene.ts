import { getStudySession, updateParticipantPreferences } from '../study/runtime';
import { studyApi } from '../study/firebaseClient';
import { getOfflinePack, importOfflinePack } from '../study/offline';
import { gameplayDefaults, gameplayOptions, validateGameplayConfig } from '../study/gameplayFields';
import { ConfigData } from '../core/interfaces';
import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Checkbox } from '../ui/checkbox';
import {
  config,
  defaultConfig,
  updateConfig,
  updateConfigValue,
} from '../managers/storageManager';
import webcam from '../objects/webcam';
import { EventEmitter, Sprite, Tween, Vector2 } from '../core/phaserTypes';
import {
  escapeKey,
  fingerColors,
  optionsCheckboxOffset,
  optionsSliderLabelOffset,
  targetGlowOptions,
  thumbFingerId,
  undefinedText,
} from '../core/config';
import { assert } from '../core/common';

export default class Options extends HandScene {
  private back: Button;
  private resetConfig: Button;
  private onTimeDurationLimits: Vector2;

  private targetExample: Sprite;
  private rotateTween: Tween;
  private glowTween: Tween;
  private glow: Phaser.FX.Glow | undefined;

  options: (Slider | Checkbox)[] = [];

  private emitter: EventEmitter;
  private researchOriginal: ConfigData | null = null;
  private researchSaving = false;

  constructor() {
    super('options');
  }

  private saveAndExit() {
    webcam.setVisibility(config.enableCameraVisibility);
    // this.setOpacity(config.cameraOpacity);

    this.scene.start(getStudySession() ? 'studySession' : 'mainMenu');
  }

  public create() {
    super.create();

    this.onTimeDurationLimits = new Vector2(50, 1000);

    if (getStudySession()) this.createResearchOptions();
    else this.createOptions();
  }

  /** Research mode reuses Pizzicato's original Options visuals: a rotating
   * target-size preview, numeric Phaser sliders, and checkboxes. Unlike guest
   * mode, edits are provisional until Save and Exit confirms them on Firebase. */
  private createResearchOptions() {
    const session = getStudySession();
    if (!session) return;
    this.researchSaving = false;
    this.researchOriginal = structuredClone(config);
    this.options = [];
    // Legacy studies may still contain old Settings slides. Honor their
    // permissions but never expose assignment-owned loop counters.
    const oldPermissions = Object.values(session.settings.weeks || {}).flat()
      .filter(step => step.type === 'settings')
      .flatMap(step => step.type === 'settings' ? (step.allowedSettings || []) : []);
    const permissions = session.settings.participantSettingsAllowed || oldPermissions;
    const allowed = gameplayOptions.filter(option => permissions.includes(option.key));
    const baseline = { ...gameplayDefaults, ...session.settings.defaultConfig,
      ...(session.settings.groupConfigs?.[session.account.group || ''] || {}),
      ...(session.account.customConfig || {}) } as Record<string, unknown>;
    const initial = { ...baseline, ...(session.account.participantPreferences || {}) };
    updateConfig({ ...config, ...initial } as ConfigData, false);

    this.add.text(this.center.x, 64, 'YOUR SETTINGS', {
      font: '52px Courier New', color: '#18db43', align: 'center'
    }).setOrigin(.5);
    this.add.text(this.center.x, 112, 'Change the settings your researcher has enabled.', {
      font: '26px Courier New', color: '#dddddd', align: 'center'
    }).setOrigin(.5);

    // The same animated target preview used by the original Options scene.
    this.targetExample = this.add.sprite(this.center.x, 260, 'targetInner')
      .setTint(fingerColors[thumbFingerId]).setScale(config.targetSize);
    this.rotateTween = this.tweens.add({ targets: this.targetExample,
      rotation: 2 * Math.PI, duration: 2000, repeat: -1 });
    this.add.text(this.center.x, 350, 'TARGET SIZE PREVIEW', {
      font: '20px Courier New', color: '#aaaaaa'
    }).setOrigin(.5);

    const perColumn = Math.max(1, Math.ceil(allowed.length / 2));
    const rowGap = Math.min(55, 690 / perColumn);
    const baseY = 176;
    const columns = [this.width * .085, this.width * .635];
    for (let i = 0; i < allowed.length; i++) {
      const option = allowed[i];
      const x = columns[Math.floor(i / perColumn)];
      const y = baseY + (i % perColumn) * rowGap;
      const key = option.key as keyof ConfigData;
      if (typeof option.defaultValue === 'boolean') {
        const check = new Checkbox(this, new Vector2(x, y + 7), 27,
          new Vector2(37, -2), option.label, config, key, checkbox => {
            updateConfigValue(key, checkbox.isChecked);
            if (key === 'enableCameraVisibility') webcam.setVisibility(checkbox.isChecked);
          });
        this.options.push(check); this.add.existing(check);
      } else {
        const slider = new Slider(this, new Vector2(x, y + 29),
          new Vector2(this.width * .265, 22), new Vector2(0, -28),
          config, key, new Vector2(option.min ?? 0, option.max ?? 1), control => {
            const value = option.step === 1 ? Math.round(control.getValue()) : control.getValue();
            control.label?.setText(`${option.label}: ${Number(value.toFixed(2))}${option.label.includes('(ms)') ? ' ms' : ''}`);
            updateConfigValue(key, value);
            if (key === 'targetSize') this.targetExample?.setScale(value);
            if (key === 'fingerSize') this.hand?.setFingerScale(value);
            if (key === 'cameraOpacity') this.setOpacity(value);
          });
        if (option.step === 1) slider.setIsInteger(true);
        this.options.push(slider); this.add.existing(slider);
      }
    }
    const status = this.add.text(this.center.x, this.height - 178, '', {
      font: '23px Courier New', color: '#ffc78b', align: 'center',
      wordWrap: {width: this.width * .9}
    }).setOrigin(.5);
    const exit = () => {
      if (this.researchSaving) return;
      if (this.researchOriginal) updateConfig(this.researchOriginal, false);
      webcam.setVisibility(config.enableCameraVisibility);
      this.setOpacity(config.cameraOpacity);
      this.scene.start('studySession');
    };
    const reset = () => {
      if (this.researchSaving) return;
      // Only change researcher-authorized fields, not the assigned loop count.
      for (const option of allowed) {
        const value = baseline[option.key] ?? option.defaultValue;
        updateConfigValue(option.key as keyof ConfigData, value);
      }
      for (const control of this.options) control.reset(config);
      this.targetExample.setScale(config.targetSize);
      this.hand.setFingerScale(config.fingerSize);
      webcam.setVisibility(config.enableCameraVisibility);
      this.setOpacity(config.cameraOpacity);
      status.setText('Defaults loaded. Save and Exit to keep them.');
    };
    const save = async () => {
      if (this.researchSaving) return;
      const changes: Record<string, boolean | number> = {};
      for (const option of allowed) {
        const value = config[option.key as keyof ConfigData];
        if (typeof value === 'boolean' || typeof value === 'number') changes[option.key] = value;
      }
      const errors = validateGameplayConfig(changes);
      if (errors.length) { status.setText(errors.join(' · ')); return; }
      this.researchSaving = true;
      status.setText('Saving settings…');
      try {
        let preferences: Record<string, unknown>;
        if (session.mode === 'online') {
          const result = await studyApi.saveParticipantPreferences(changes);
          preferences = result.preferences;
        } else {
          preferences = { ...(session.account.participantPreferences || {}), ...changes };
          const pack = getOfflinePack();
          if (pack) importOfflinePack({ ...pack, account: { ...pack.account, participantPreferences: preferences } });
        }
        updateParticipantPreferences(preferences);
        updateConfig({ ...this.researchOriginal!, ...baseline, ...preferences } as ConfigData, false);
        webcam.setVisibility(config.enableCameraVisibility);
        this.scene.start('studySession');
      } catch (error) {
        this.researchSaving = false;
        status.setText(error instanceof Error ? error.message : String(error));
      }
    };
    const actions: [string, number, () => void][] = [
      ['EXIT WITHOUT\nSAVING', this.center.x - 420, exit],
      ['RESET TO\nDEFAULTS', this.center.x, reset],
      ['SAVE AND\nEXIT', this.center.x + 420, () => { void save(); }]
    ];
    for (const [label, x, onClick] of actions) {
      const button = new Button(this, label, x, this.height - 91, onClick);
      button.setScale(.75);
      button.text?.setPosition(button.x, button.y).setOrigin(.5).setAlign('center')
        .setFontSize(30).setWordWrapWidth(button.displayWidth * .95);
    }
    this.input.keyboard?.on(escapeKey, exit);
    this.events.once('shutdown', () => this.input.keyboard?.off(escapeKey, exit));
  }

  private normalizeDuration(duration: number) {
    if (duration < 0) {
      return 0.001; // Handle negative durations
    }

    const normalizedDuration =
      (duration - this.onTimeDurationLimits.x) /
      (this.onTimeDurationLimits.y - this.onTimeDurationLimits.x);

    // Ensure the normalized duration is within the 0-1 range
    return 1.0 - Math.max(0, Math.min(1, normalizedDuration));
  }

  private setGlowTimeScale(duration: number) {
    this.glowTween?.setTimeScale(this.normalizeDuration(duration));
  }

  private createOptions() {
    assert(config != undefined, 'Failed to fetch configuration data');

    const optionsSliderSize = new Vector2(
      this.width * 0.26,
      this.height * 0.03,
    );

    const halfButtonGapX: number = this.width * 0.15;

    this.back = new Button(
      this,
      'BACK',
      this.center.x - halfButtonGapX,
      this.height - 100,
      () => {
        this.saveAndExit();
      },
    );
    this.resetConfig = new Button(
      this,
      'RESET TO\nDEFAULT',
      this.center.x + halfButtonGapX,
      this.height - 100,
      () => {
        console.info('INFO: Reset config to default');
        updateConfig(defaultConfig, false);
        for (const option of this.options) {
          option.reset(config);
        }
        this.setGlowTimeScale(config['onTimeDuration'] / 2);
        webcam.setVisibility(config.enableCameraVisibility);
      },
    );

    this.input.keyboard?.on(escapeKey, this.saveAndExit, this);

    const _background1l: Sprite = this.add
      .sprite(this.width * 0.09, this.height * 0.05, 'optionsBackground')
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(this.width * 0.28, this.height * 0.185);

    const _background2l: Sprite = this.add
      .sprite(this.width * 0.09, this.height * 0.26, 'optionsBackground')
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(this.width * 0.28, this.height * 0.27);

    const _background3l: Sprite = this.add
      .sprite(this.width * 0.09, this.height * 0.55, 'optionsBackground')
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(this.width * 0.28, this.height * 0.23);

    const _background1r: Sprite = this.add
      .sprite(this.width * 0.63, this.height * 0.05, 'optionsBackground')
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(this.width * 0.28, this.height * 0.185);

    const _background2r: Sprite = this.add
      .sprite(this.width * 0.63, this.height * 0.26, 'optionsBackground')
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(this.width * 0.28, this.height * 0.27);

    const _background3r: Sprite = this.add
      .sprite(this.width * 0.63, this.height * 0.55, 'optionsBackground')
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(this.width * 0.28, this.height * 0.23);

    // --------------------------------------------------------

    this.targetExample = this.add
      .sprite(
        this.width * 0.5,
        this.height * 0.1 + this.height * 0.08 * 0 + this.height * 0.15,
        'targetInner',
      )
      .setTint(fingerColors[thumbFingerId])
      .setScale(config['targetSize']);
    // Make target spin on repeat.
    this.rotateTween = this.tweens.add({
      targets: [this.targetExample],
      rotation: 2 * Math.PI,
      ease: 'Power0',
      duration: 1000,
      repeat: -1,
    });
    this.glow = this.targetExample.postFX.addGlow(
      targetGlowOptions.color,
      0,
      0,
      false,
      targetGlowOptions.quality,
      targetGlowOptions.distance,
    );
    const glowDuration: number = config['onTimeDuration'] / 2;
    this.glowTween = this.tweens.add({
      targets: this.glow,
      outerStrength: targetGlowOptions.outerStrength,
      yoyo: true,
      duration: glowDuration,
      ease: targetGlowOptions.ease,
      repeat: -1,
    });
    this.setGlowTimeScale(glowDuration);
    if (config['postProcessingDisabled'] && this.glowTween) {
      this.glowTween.pause();
    }
    const targetScaleSlider = new Slider(
      this,
      new Vector2(this.width * 0.1, this.height * 0.1 + this.height * 0.08 * 0),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      config,
      'targetSize',
      new Vector2(0.5, 3),
      (slider: Slider) => {
        slider.label!.setText('Target Scale: ' + slider.getStringValue());
        const sliderValue: number = slider.getValue();
        updateConfigValue(slider.key, sliderValue);
        this.targetExample.setScale(sliderValue);
      },
    );
    this.options.push(targetScaleSlider);
    this.add.existing(targetScaleSlider);

    // --------------------------------------------------------

    const fingerScaleSlider = new Slider(
      this,
      new Vector2(this.width * 0.1, this.height * 0.1 + this.height * 0.08 * 1),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      config,
      'fingerSize',
      new Vector2(0.5, 3),
      (slider: Slider) => {
        if (slider.label)
          slider.label.setText('Finger Scale: ' + slider.getStringValue());
        const sliderValue: number = slider.getValue();
        updateConfigValue(slider.key, sliderValue);
        this.hand.setFingerScale(sliderValue);
      },
    );
    this.options.push(fingerScaleSlider);
    this.add.existing(fingerScaleSlider);

    // --------------------------------------------------------

    const opacityCallback = (slider: Slider) => {
      if (slider == undefined || !slider.active) return;
      if (slider.label && slider.label.active)
        slider.label.setText('Camera Opacity: ' + slider.getStringValue());
      updateConfigValue(slider.key, slider.getValue());
      this.setOpacity(config[slider.key] as number);
    };

    const cameraOpacitySlider = new Slider(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.32 + this.height * 0.08 * 0,
      ),
      optionsSliderSize,
      optionsSliderLabelOffset,
      config,
      'cameraOpacity',
      new Vector2(0.01, 1.0),
      opacityCallback,
    );
    const cameraVisibility = new Checkbox(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.32 + this.height * 0.08 * 0 + optionsCheckboxOffset.y,
      ),
      25,
      undefined,
      undefinedText,
      config,
      'enableCameraVisibility',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
        webcam.setVisibility(checkbox.isChecked);
        if (checkbox.isChecked) {
          cameraOpacitySlider.draw();
        } else {
          cameraOpacitySlider.setValue(config['cameraOpacity']);
          opacityCallback(cameraOpacitySlider);
          this.setOpacity(0);
          cameraOpacitySlider.hide('Show Camera');
        }
      },
    );
    this.options.push(cameraOpacitySlider);
    this.options.push(cameraVisibility);
    this.add.existing(cameraOpacitySlider);
    this.add.existing(cameraVisibility);

    // --------------------------------------------------------

    const layerSkipLoopSlider = new Slider(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.32 + this.height * 0.08 * 1,
      ),
      optionsSliderSize,
      optionsSliderLabelOffset,
      config,
      'skipButtonAppearsAfterLoop',
      new Vector2(1, 16),
      (slider: Slider) => {
        slider.label!.setText(
          'Skip Button After Loop: ' + slider.getStringValue(),
        );
        updateConfigValue(slider.key, slider.getValue());
      },
    ).setIsInteger(true);
    const layerSkipButton = new Checkbox(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.32 + this.height * 0.08 * 1 + optionsCheckboxOffset.y,
      ),
      25,
      undefined,
      undefinedText,
      config,
      'showSkipButton',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
        if (checkbox.isChecked) {
          layerSkipLoopSlider.draw();
        } else {
          layerSkipLoopSlider.hide('Show Layer Skip Button');
        }
      },
    );
    this.options.push(layerSkipLoopSlider);
    this.options.push(layerSkipButton);
    this.add.existing(layerSkipLoopSlider);
    this.add.existing(layerSkipButton);

    // --------------------------------------------------------

    const layerskipButtonAppearsAfterLoopSlider = new Slider(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.32 + this.height * 0.08 * 2,
      ),
      optionsSliderSize,
      optionsSliderLabelOffset,
      config,
      'skipLayersAutomaticallyAfterLoop',
      new Vector2(1, 16),
      (slider: Slider) => {
        slider.label!.setText(
          'Skip Layers After Loop: ' + slider.getStringValue(),
        );
        updateConfigValue(slider.key, slider.getValue());
      },
    ).setIsInteger(true);
    const skipLayers = new Checkbox(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.32 + this.height * 0.08 * 2 + optionsCheckboxOffset.y,
      ),
      25,
      undefined,
      undefinedText,
      config,
      'skipLayersAutomatically',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
        if (checkbox.isChecked) {
          layerskipButtonAppearsAfterLoopSlider.draw();
        } else {
          layerskipButtonAppearsAfterLoopSlider.hide(
            'Skip Layers Automatically',
          );
        }
      },
    );
    this.options.push(layerskipButtonAppearsAfterLoopSlider);
    this.options.push(skipLayers);
    this.add.existing(layerskipButtonAppearsAfterLoopSlider);
    this.add.existing(skipLayers);

    // --------------------------------------------------------

    const disableLayerProgress = new Checkbox(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.57 + this.height * 0.08 * 0,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Disable Layer Progression',
      config,
      'disableLayerProgression',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(disableLayerProgress);
    this.add.existing(disableLayerProgress);

    // --------------------------------------------------------

    const fingerPinchesOnly = new Checkbox(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.57 + this.height * 0.08 * 1,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Index Finger Pinches Only',
      config,
      'indexFingerOnly',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(fingerPinchesOnly);
    this.add.existing(fingerPinchesOnly);

    // --------------------------------------------------------

    const disableEffects = new Checkbox(
      this,
      new Vector2(
        this.width * 0.1,
        this.height * 0.57 + this.height * 0.08 * 2,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Disable Post-Processing',
      config,
      'postProcessingDisabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
        if (checkbox.isChecked) {
          if (this.glowTween) {
            this.glowTween.restart();
            this.glowTween.pause();
          }
          if (this.glow) {
            this.targetExample.postFX.disable();
          }
        } else if (!checkbox.isChecked) {
          if (this.glowTween && this.targetExample) this.glowTween.resume();
          if (this.glow) this.targetExample.postFX.enable();
        }
      },
    );
    this.options.push(disableEffects);
    this.add.existing(disableEffects);

    // -------------------------------------------------------- RIGHT ALIGNMENT --------------------------------------------------------

    const onTimeDurationSlider = new Slider(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.1 + this.height * 0.08 * 0,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      config,
      'onTimeDuration',
      this.onTimeDurationLimits,
      (slider: Slider) => {
        slider.label!.setText(
          'On Time Duration: ' + slider.getStringValue() + ' ms',
        );
        updateConfigValue(slider.key, slider.getValue());
        this.setGlowTimeScale(config['onTimeDuration'] / 2);
      },
    ).setIsInteger(true);
    this.options.push(onTimeDurationSlider);
    this.add.existing(onTimeDurationSlider);

    // --------------------------------------------------------

    const lateDurationSlider = new Slider(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.1 + this.height * 0.08 * 1,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      config,
      'lateTimeDuration',
      new Vector2(50, 1000),
      (slider: Slider) => {
        slider.label!.setText(
          'Late Time Duration: ' + slider.getStringValue() + ' ms',
        );
        updateConfigValue(slider.key, slider.getValue());
      },
    ).setIsInteger(true);
    this.options.push(lateDurationSlider);
    this.add.existing(lateDurationSlider);

    // --------------------------------------------------------

    const pinchVolumeSlider = new Slider(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.3 + this.height * 0.07 * 0,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      config,
      'pinchVolume',
      new Vector2(0, 1),
      (slider: Slider) => {
        slider.label!.setText('Pinch Volume: ' + slider.getStringValue());
        updateConfigValue(slider.key, slider.getValue());
      },
    );
    this.options.push(pinchVolumeSlider);
    this.add.existing(pinchVolumeSlider);

    // --------------------------------------------------------

    const backgroundVolumeSlider = new Slider(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.3 + this.height * 0.07 * 1,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      config,
      'backgroundMusicVolume',
      new Vector2(0, 1),
      (slider: Slider) => {
        slider.label!.setText('Track Volume: ' + slider.getStringValue());
        updateConfigValue(slider.key, slider.getValue());
      },
    );
    this.options.push(backgroundVolumeSlider);
    this.add.existing(backgroundVolumeSlider);

    // --------------------------------------------------------

    const uiPinchesEnabled = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.33 + this.height * 0.08 * 1,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Enable UI Pinches',
      config,
      'uiPinchesEnabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(uiPinchesEnabled);
    this.add.existing(uiPinchesEnabled);

    // --------------------------------------------------------

    const mousePinchesEnabled = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.33 + this.height * 0.08 * 1.5,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Enable Mouse Pinches',
      config,
      'mousePinchesEnabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(mousePinchesEnabled);
    this.add.existing(mousePinchesEnabled);

    // --------------------------------------------------------

    const requireSinglePinch = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.33 + this.height * 0.08 * 2,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Ignore Multifinger Pinches',
      config,
      'ignoreMultifingerPinches',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(requireSinglePinch);
    this.add.existing(requireSinglePinch);

    // --------------------------------------------------------

    const displayVisualMetronome = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.57 + this.height * 0.08 * 0,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Display Visual Metronome',
      config,
      'displayVisualMetronome',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(displayVisualMetronome);
    this.add.existing(displayVisualMetronome);

    // --------------------------------------------------------

    const sonificationEnabled = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.57 + this.height * 0.08 * 0.5,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Enable Sonification',
      config,
      'sonificationEnabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(sonificationEnabled);
    this.add.existing(sonificationEnabled);

    const synchronizationEnabled = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.57 + this.height * 0.08 * 1,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Enable Synchronization',
      config,
      'synchronizationEnabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(synchronizationEnabled);
    this.add.existing(synchronizationEnabled);

    const unplayableBackingTracksEnabled = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.57 + this.height * 0.08 * 1.5,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Enable Unplayable Backing Tracks',
      config,
      'unplayableBackingTracksEnabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(unplayableBackingTracksEnabled);
    this.add.existing(unplayableBackingTracksEnabled);

    const playableBackingTracksEnabled = new Checkbox(
      this,
      new Vector2(
        this.width * 0.64,
        this.height * 0.57 + this.height * 0.08 * 2.0,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Enable Playable Backing Tracks',
      config,
      'playableBackingTracksEnabled',
      (checkbox: Checkbox) => {
        updateConfigValue(checkbox.key, checkbox.isChecked);
      },
    );
    this.options.push(playableBackingTracksEnabled);
    this.add.existing(playableBackingTracksEnabled);

    // --------------------------------------------------------

    const isElectronRenderer = typeof window.electron !== 'undefined';
    const isLocalBuild = isElectronRenderer;

    if (isLocalBuild) {
      const autoSaveCSV = new Checkbox(
        this,
        new Vector2(
          this.width * 0.1,
          this.height * 0.57 + this.height * 0.08 * 1.5,
        ),
        25,
        new Vector2(-optionsCheckboxOffset.x, 0),
        'Automatically Save CSV',
        config,
        'autoSaveCSV',
        (checkbox: Checkbox) => {
          updateConfigValue(checkbox.key, checkbox.isChecked);
        },
      );
      this.options.push(autoSaveCSV);
      this.add.existing(autoSaveCSV);
    }

    // -------------------------------------------------------- MENU BUTTONS --------------------------------------------------------
  }

  public update(time: number, delta: number): void {
    super.update(time, delta);
  }
}
