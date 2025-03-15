import { absPath } from '../core/common';
import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Checkbox } from '../ui/checkbox';
import {
  config,
  defaultConfig,
  saveConfigData,
} from '../managers/storageManager';
import webcam from '../objects/webcam';
import { ConfigData } from '../core/interfaces';
import { EventEmitter, Sprite, Tween, Vector2 } from '../core/phaserTypes';
import {
  backButtonTextureKey,
  backButtonTexturePath,
  buttonPinchSoundKey,
  buttonPinchSoundPath,
  escapeKey,
  fingerColors,
  mainMenuScene,
  optionsBackgroundPath,
  optionsBackgroundTextureKey,
  optionsButtonGap,
  optionsButtonTopLevel,
  optionsCheckboxOffset,
  optionsScene,
  optionsSliderLabelOffset,
  resetButtonTextureKey,
  resetButtonTexturePath,
  standardButtonScale,
  targetInnerTextureKey,
  targetInnerTexturePath,
  thumbFingerId,
  uiHoverColor,
  undefinedText,
} from '../core/config';

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

const horizontalCenter = 0.5 * windowWidth;

const leftAlignment = windowWidth * 0.1;
const rightAlignment = windowWidth * 0.64;
const verticalAlignment1 = windowHeight * 0.1;
const verticalAlignment1Offset = windowHeight * 0.08;

const verticalAlignment2 = windowHeight * 0.32;
const verticalAlignment2Offset = windowHeight * 0.08;

const verticalAlignment3 = windowHeight * 0.57;
const verticalAlignment3Offset = windowHeight * 0.08;

const optionsSliderSize = new Vector2(windowWidth * 0.26, windowHeight * 0.03);

export default class Options extends HandScene {
  private configData: ConfigData;
  private defaultData: ConfigData;

  private backToMenu: Button;
  private resetConfig: Button;

  private rotateTween: Tween;

  options: (Slider | Checkbox)[] = [];

  private emitter: EventEmitter;

  constructor() {
    super(optionsScene);
  }

  private setConfig() {
    saveConfigData(this.configData);
    webcam.setVisibility(this.configData.enableCameraVisibility);
  }

  private saveAndExit() {
    this.setConfig();
    //this.setOpacity(this.configData.cameraOpacity);
    if (this.rotateTween != undefined) {
      this.rotateTween.destroy();
    }
    this.scene.start(mainMenuScene);
  }

  async preload() {
    this.load.audio(buttonPinchSoundKey, absPath(buttonPinchSoundPath));
    this.load.image(
      optionsBackgroundTextureKey,
      absPath(optionsBackgroundPath),
    );
    this.load.image(backButtonTextureKey, absPath(backButtonTexturePath));
    this.load.image(resetButtonTextureKey, absPath(resetButtonTexturePath));
    this.load.image(targetInnerTextureKey, absPath(targetInnerTexturePath));
  }

  public async create() {
    super.create();

    this.defaultData = defaultConfig;
    this.configData = config;

    this.createOptions();
  }

  private createOptions() {
    this.backToMenu = new Button(
      this,
      new Vector2(
        horizontalCenter - windowWidth * optionsButtonGap,
        windowHeight * optionsButtonTopLevel,
      ),
      standardButtonScale,
      backButtonTextureKey,
      buttonPinchSoundKey,
      true,
    );
    this.resetConfig = new Button(
      this,
      new Vector2(
        horizontalCenter + windowWidth * optionsButtonGap,
        windowHeight * optionsButtonTopLevel,
      ),
      standardButtonScale,
      resetButtonTextureKey,
      buttonPinchSoundKey,
      true,
    );

    this.input.keyboard!.on(escapeKey, () => {
      this.saveAndExit();
    });

    const _background1l: Sprite = this.add
      .sprite(
        windowWidth * 0.09,
        windowHeight * 0.05,
        optionsBackgroundTextureKey,
      )
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(windowWidth * 0.28, windowHeight * 0.185);

    const _background2l: Sprite = this.add
      .sprite(
        windowWidth * 0.09,
        windowHeight * 0.26,
        optionsBackgroundTextureKey,
      )
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(windowWidth * 0.28, windowHeight * 0.27);

    const _background3l: Sprite = this.add
      .sprite(
        windowWidth * 0.09,
        windowHeight * 0.55,
        optionsBackgroundTextureKey,
      )
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(windowWidth * 0.28, windowHeight * 0.23);

    const _background1r: Sprite = this.add
      .sprite(
        windowWidth * 0.63,
        windowHeight * 0.05,
        optionsBackgroundTextureKey,
      )
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(windowWidth * 0.28, windowHeight * 0.185);

    const _background2r: Sprite = this.add
      .sprite(
        windowWidth * 0.63,
        windowHeight * 0.26,
        optionsBackgroundTextureKey,
      )
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(windowWidth * 0.28, windowHeight * 0.27);

    const _background3r: Sprite = this.add
      .sprite(
        windowWidth * 0.63,
        windowHeight * 0.55,
        optionsBackgroundTextureKey,
      )
      .setOrigin(0, 0)
      .setAlpha(0.8)
      .setDisplaySize(windowWidth * 0.28, windowHeight * 0.23);

    // --------------------------------------------------------

    const targetExample = this.add
      .sprite(
        windowWidth * 0.5,
        verticalAlignment1 + verticalAlignment1Offset * 0 + windowHeight * 0.15,
        targetInnerTextureKey,
      )
      .setTint(fingerColors[thumbFingerId])
      .setScale(this.configData['targetSize']);
    // Make target spin on repeat.
    this.rotateTween = this.tweens.add({
      targets: [targetExample],
      rotation: 2 * Math.PI,
      ease: 'Power0',
      duration: 1000,
      repeat: -1,
    });
    if (
      this.configData['fancyEffectsDisabled'] &&
      this.rotateTween != undefined
    ) {
      this.rotateTween.pause();
    }
    const targetScaleSlider = new Slider(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment1 + verticalAlignment1Offset * 0,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      this.configData,
      'targetSize',
      new Vector2(0.5, 3),
      (slider: Slider) => {
        slider.label!.setText('Target Scale: ' + slider.getStringValue());
        const sliderValue: number = slider.getValue();
        this.configData[slider.key] = sliderValue;
        targetExample.setScale(sliderValue);
      },
    );
    this.options.push(targetScaleSlider);
    this.add.existing(targetScaleSlider);

    // --------------------------------------------------------

    const fingerScaleSlider = new Slider(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment1 + verticalAlignment1Offset * 1,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      this.configData,
      'fingerSize',
      new Vector2(0.5, 3),
      (slider: Slider) => {
        if (slider.label != undefined)
          slider.label.setText('Finger Scale: ' + slider.getStringValue());
        const sliderValue: number = slider.getValue();
        this.configData[slider.key] = sliderValue;
        this.hand.setFingerScale(sliderValue);
      },
    );
    this.options.push(fingerScaleSlider);
    this.add.existing(fingerScaleSlider);

    // --------------------------------------------------------

    const opacityCallback = (slider: Slider) => {
      if (slider == undefined || !slider.active) return;
      if (slider.label != undefined && slider.label.active)
        slider.label.setText('Camera Opacity: ' + slider.getStringValue());
      this.configData[slider.key] = slider.getValue();
      this.setOpacity(this.configData[slider.key] as number);
    };

    const cameraOpacitySlider = new Slider(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment2 + verticalAlignment2Offset * 0,
      ),
      optionsSliderSize,
      optionsSliderLabelOffset,
      this.configData,
      'cameraOpacity',
      new Vector2(0.01, 1.0),
      opacityCallback,
    );
    const cameraVisibility = new Checkbox(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment2 +
          verticalAlignment2Offset * 0 +
          optionsCheckboxOffset.y,
      ),
      25,
      undefined,
      undefinedText,
      this.configData,
      'enableCameraVisibility',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
        webcam.setVisibility(checkbox.isChecked);
        if (checkbox.isChecked) {
          cameraOpacitySlider.draw();
        } else {
          cameraOpacitySlider.setValue(this.configData['cameraOpacity']);
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
        leftAlignment,
        verticalAlignment2 + verticalAlignment2Offset * 1,
      ),
      optionsSliderSize,
      optionsSliderLabelOffset,
      this.configData,
      'skipLoopThreshold',
      new Vector2(1, 16),
      (slider: Slider) => {
        slider.label!.setText(
          'Skip Button After Loop: ' + slider.getStringValue(),
        );
        this.configData[slider.key] = slider.getValue();
      },
    ).setIsInteger(true);
    const layerSkipButton = new Checkbox(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment2 +
          verticalAlignment2Offset * 1 +
          optionsCheckboxOffset.y,
      ),
      25,
      undefined,
      undefinedText,
      this.configData,
      'enableSkipButton',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
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

    const layerSkipLoopThresholdSlider = new Slider(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment2 + verticalAlignment2Offset * 2,
      ),
      optionsSliderSize,
      optionsSliderLabelOffset,
      this.configData,
      'autoSkipThreshold',
      new Vector2(1, 16),
      (slider: Slider) => {
        slider.label!.setText(
          'Skip Layers After Loop: ' + slider.getStringValue(),
        );
        this.configData[slider.key] = slider.getValue();
      },
    ).setIsInteger(true);
    const skipLayers = new Checkbox(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment2 +
          verticalAlignment2Offset * 2 +
          optionsCheckboxOffset.y,
      ),
      25,
      undefined,
      undefinedText,
      this.configData,
      'enableAutoSkip',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
        if (checkbox.isChecked) {
          layerSkipLoopThresholdSlider.draw();
        } else {
          layerSkipLoopThresholdSlider.hide('Skip Layers Automatically');
        }
      },
    );
    this.options.push(layerSkipLoopThresholdSlider);
    this.options.push(skipLayers);
    this.add.existing(layerSkipLoopThresholdSlider);
    this.add.existing(skipLayers);

    // --------------------------------------------------------

    const disableLayerProgress = new Checkbox(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment3 + verticalAlignment3Offset * 0,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Disable Layer Progression',
      this.configData,
      'disableLayerProgression',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
      },
    );
    this.options.push(disableLayerProgress);
    this.add.existing(disableLayerProgress);

    // --------------------------------------------------------

    const fingerPinchesOnly = new Checkbox(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment3 + verticalAlignment3Offset * 1,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Index Finger Pinches Only',
      this.configData,
      'indexFingerOnly',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
      },
    );
    this.options.push(fingerPinchesOnly);
    this.add.existing(fingerPinchesOnly);

    // --------------------------------------------------------

    const disableEffects = new Checkbox(
      this,
      new Vector2(
        leftAlignment,
        verticalAlignment3 + verticalAlignment3Offset * 2,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Disable Fancy Effects',
      this.configData,
      'fancyEffectsDisabled',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
        if (checkbox.isChecked) {
          if (this.rotateTween != undefined) this.rotateTween.pause();
        } else if (!checkbox.isChecked) {
          if (this.rotateTween != undefined && targetExample != undefined)
            this.rotateTween.resume();
        }
      },
    );
    this.options.push(disableEffects);
    this.add.existing(disableEffects);

    // -------------------------------------------------------- RIGHT ALIGNMENT --------------------------------------------------------

    const onTimeDurationSlider = new Slider(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment1 + verticalAlignment1Offset * 0,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      this.configData,
      'onTimeDuration',
      new Vector2(50, 1000),
      (slider: Slider) => {
        slider.label!.setText(
          'On Time Duration: ' + slider.getStringValue() + ' ms',
        );
        this.configData[slider.key] = slider.getValue();
      },
    ).setIsInteger(true);
    this.options.push(onTimeDurationSlider);
    this.add.existing(onTimeDurationSlider);

    // --------------------------------------------------------

    const lateDurationSlider = new Slider(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment1 + verticalAlignment1Offset * 1,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      this.configData,
      'lateTimeDuration',
      new Vector2(50, 1000),
      (slider: Slider) => {
        slider.label!.setText(
          'Late Time Duration: ' + slider.getStringValue() + ' ms',
        );
        this.configData[slider.key] = slider.getValue();
      },
    ).setIsInteger(true);
    this.options.push(lateDurationSlider);
    this.add.existing(lateDurationSlider);

    // --------------------------------------------------------

    const pinchVolumeSlider = new Slider(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment2 + verticalAlignment2Offset * 0,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      this.configData,
      'sonificationLevel',
      new Vector2(0, 1),
      (slider: Slider) => {
        slider.label!.setText('Pinch Volume: ' + slider.getStringValue());
        this.configData[slider.key] = slider.getValue();
      },
    );
    this.options.push(pinchVolumeSlider);
    this.add.existing(pinchVolumeSlider);

    // --------------------------------------------------------

    const backgroundVolumeSlider = new Slider(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment2 + verticalAlignment2Offset * 1,
      ),
      optionsSliderSize,
      new Vector2(0, optionsSliderLabelOffset.y),
      this.configData,
      'backgroundMusicLevel',
      new Vector2(0, 1),
      (slider: Slider) => {
        slider.label!.setText('Track Volume: ' + slider.getStringValue());
        this.configData[slider.key] = slider.getValue();
      },
    );
    this.options.push(backgroundVolumeSlider);
    this.add.existing(backgroundVolumeSlider);

    // --------------------------------------------------------

    const requireSinglePinch = new Checkbox(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment2 + verticalAlignment2Offset * 2,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Require Single Pinches',
      this.configData,
      'singlePinchRequirement',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
      },
    );
    this.options.push(requireSinglePinch);
    this.add.existing(requireSinglePinch);

    // --------------------------------------------------------

    const disableVisualMetronome = new Checkbox(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment3 + verticalAlignment3Offset * 0,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Disable Visual Metronome',
      this.configData,
      'disableVisualMetronome',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
      },
    );
    this.options.push(disableVisualMetronome);
    this.add.existing(disableVisualMetronome);

    // --------------------------------------------------------

    const disableSonification = new Checkbox(
      this,
      new Vector2(
        rightAlignment,
        verticalAlignment3 + verticalAlignment3Offset * 1,
      ),
      25,
      new Vector2(-optionsCheckboxOffset.x, 0),
      'Disable Sonification',
      this.configData,
      'disableSonification',
      (checkbox: Checkbox) => {
        this.configData[checkbox.key] = checkbox.isChecked;
      },
    );
    this.options.push(disableSonification);
    this.add.existing(disableSonification);

    // --------------------------------------------------------

    // TODO: Re-enable this once there is a way to store it automatically on a server or elsewhere.
    // const autoSaveCSV = new Checkbox(
    //   this,
    //   new Vector2(rightAlignment, verticalAlignment3 + verticalAlignment3Offset * 2),
    //   25,
    //   new Vector2(-optionsCheckboxOffset.x, 0),
    //   'Automatically Save CSV',
    //   this.configData,
    //   'autoSaveCSV',
    //   (checkbox: Checkbox) => {
    //     this.configData[checkbox.key] = checkbox.isChecked
    //   }
    // )
    // this.options.push(autoSaveCSV)
    // this.add.existing(autoSaveCSV)

    // -------------------------------------------------------- MENU BUTTONS --------------------------------------------------------

    this.backToMenu.addPinchCallbacks({
      startPinch: () => {
        this.saveAndExit();
      },
      startHover: () => {
        this.backToMenu.setTintFill(uiHoverColor);
      },
      endHover: () => {
        this.backToMenu.clearTint();
      },
    });

    this.resetConfig.addPinchCallbacks({
      startPinch: async () => {
        this.configData = structuredClone(this.defaultData);
        for (const option of this.options) {
          option.reset(this.configData);
        }
        this.setConfig();
      },
      startHover: () => {
        this.resetConfig.setTintFill(uiHoverColor);
      },
      endHover: () => {
        this.resetConfig.clearTint();
      },
    });
  }

  public update(time: number, delta: number): void {
    super.update(time, delta);
  }
}
