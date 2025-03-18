import { absPath, listLevelDirectories } from '../core/common';
import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { Sprite, Vector2 } from '../core/phaserTypes';
import {
  buttonPinchSoundKey,
  buttonPinchSoundPath,
  calibrationScene,
  continueScene,
  levelListPath,
  levelScene,
  levelSelectScene,
  logoTextureKey,
  logoTexturePath,
  mainMenuButtonGap,
  //mainMenuScene,
  mainMenubuttonTopLevel,
  menuCalibrateButtonTextureKey,
  menuCalibrateButtonTexturePath,
  menuSelectButtonTextureKey,
  menuSelectButtonTexturePath,
  playButtonTextureKey,
  playButtonTexturePath,
  //optionsButtonTextureKey,
  //optionsButtonTexturePath,
  standardButtonScale,
  uiHoverColor,
} from '../core/config';
import { ContinueSceneData, PinchCallbacks } from '../core/interfaces';

export default class ContinueScene extends HandScene {
  private menuLogo: Sprite | undefined;
  private menuSelectLevel: Button;
  private menuCalibrate: Button;
  //private menuOptions: Button;

  private levels: { [id: string]: Level } = {};

  private continueData: ContinueSceneData;

  constructor() {
    super(continueScene);

    this.levels = {};
  }

  async preload() {
    super.preload();

    this.continueData = this.scene.settings.data as ContinueSceneData;

    this.load.audio(buttonPinchSoundKey, absPath(buttonPinchSoundPath));
    this.load.image(logoTextureKey, absPath(logoTexturePath));
    //this.load.image(optionsButtonTextureKey, absPath(optionsButtonTexturePath));
    this.load.image(
      menuSelectButtonTextureKey,
      absPath(menuSelectButtonTexturePath),
    );
    this.load.image(
      menuCalibrateButtonTextureKey,
      absPath(menuCalibrateButtonTexturePath),
    );
    this.load.image(playButtonTextureKey, absPath(playButtonTexturePath));
    this.load.image('startPretest', absPath('assets/ui/start_pretest.png'));
    this.load.image('startPosttest', absPath('assets/ui/start_posttest.png'));
    this.load.image('startTryout', absPath('assets/ui/start_tryout.png'));
    this.load.image('startTraining', absPath('assets/ui/start_training.png'));
    this.load.image(
      'continuePretest',
      absPath('assets/ui/continue_pretest.png'),
    );
    this.load.image(
      'continuePosttest',
      absPath('assets/ui/continue_posttest.png'),
    );

    this.levels['tryout'] = new Level('Tryout');
    this.levels['trained'] = new Level('Trained');
    this.levels['untrained'] = new Level('Untrained');
    this.levels['nosound'] = new Level('Nosound');

    for (const key in this.levels) {
      this.levels[key].preloadTrack(this);
    }
  }

  create() {
    super.create();

    if (this.continueData.incrementIndex) {
      this.continueData.index++;
    }
    this.continueData.incrementIndex = true;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const horizontalCenter = 0.5 * windowWidth;

    let buttonTextureKey: string = playButtonTextureKey;

    let showButtons: boolean = true;

    this.continueData.nextScene = continueScene;

    if (this.continueData.weekNumber == 0) {
      // Pretest
      if (this.continueData.index == 0) {
        this.continueData.level = this.levels['tryout'];
        this.continueData.level.setBPM(0);
        buttonTextureKey = 'startTryout';
      } else if (this.continueData.index == 1) {
        // TODO: Randomize order based on user id.
        this.continueData.level = this.levels['trained'];
        this.continueData.level.setBPM(0);
        buttonTextureKey = 'startPretest';
      } else if (this.continueData.index == 2) {
        this.continueData.level = this.levels['untrained'];
        this.continueData.level.setBPM(2);
        buttonTextureKey = 'continuePretest';
      } else if (this.continueData.index >= 3) {
        showButtons = false;
      }
    } else if (this.continueData.weekNumber == 1) {
      // Training week 1
      if (this.continueData.index == 0) {
        this.continueData.level = this.levels['trained'];
        buttonTextureKey = 'startTraining';
      } else {
        // TODO: Show pretest completed.
        showButtons = false;
      }
      if (this.continueData.level) {
        this.continueData.level.setBPM(0);
      }
    } else if (this.continueData.weekNumber == 2) {
      // Training week 2
      if (this.continueData.index == 0) {
        this.continueData.level = this.levels['trained'];
        buttonTextureKey = 'startTraining';
      } else {
        showButtons = false;
      }
      if (this.continueData.level) {
        this.continueData.level.setBPM(1);
      }
    } else if (this.continueData.weekNumber == 3) {
      // Training week 3
      if (this.continueData.index == 0) {
        this.continueData.level = this.levels['trained'];
        buttonTextureKey = 'startTraining';
      } else {
        // TODO: Show training for weekNumber completed.
        showButtons = false;
      }
      if (this.continueData.level) {
        this.continueData.level.setBPM(2);
      }
    } else if (this.continueData.weekNumber == -1) {
      // Post test
      if (this.continueData.index == 0) {
        this.continueData.level = this.levels['trained'];
        this.continueData.level.setBPM(0);
        buttonTextureKey = 'startPosttest';
      } else if (this.continueData.index == 1) {
        this.continueData.level = this.levels['untrained'];
        this.continueData.level.setBPM(2);
        buttonTextureKey = 'continuePosttest';
      } else if (this.continueData.index == 2) {
        this.continueData.level = this.levels['nosound'];
        // TODO: Set user config to nosound.
        this.continueData.level.setBPM(2);
        buttonTextureKey = 'continuePosttest';
      } else {
        // TODO: Show thanks for participating.
        showButtons = false;
      }
    } else {
      // TODO: Show thanks for participating.
      // Invalid week number.
      showButtons = false;
    }

    if (showButtons) {
      this.menuSelectLevel = new Button(
        this,
        new Vector2(
          horizontalCenter + windowWidth * mainMenuButtonGap,
          mainMenubuttonTopLevel * windowHeight,
        ),
        standardButtonScale,
        buttonTextureKey,
        buttonPinchSoundKey,
        true,
      );

      this.menuSelectLevel.addPinchCallbacks({
        startPinch: () => {
          this.scene.start(levelScene, this.continueData);
        },
        startHover: () => {
          this.menuSelectLevel.setTintFill(uiHoverColor);
        },
        endHover: () => {
          this.menuSelectLevel.clearTint();
        },
      });
      this.menuCalibrate = new Button(
        this,
        new Vector2(
          horizontalCenter - windowWidth * mainMenuButtonGap,
          mainMenubuttonTopLevel * windowHeight,
        ),
        standardButtonScale,
        menuCalibrateButtonTextureKey,
        buttonPinchSoundKey,
        true,
      );

      this.menuCalibrate.addPinchCallbacks({
        startPinch: () => {
          this.scene.start(calibrationScene, this.continueData);
        },
        startHover: () => {
          this.menuCalibrate.setTintFill(uiHoverColor);
        },
        endHover: () => {
          this.menuCalibrate.clearTint();
        },
      });
    } else {
      // TODO: Add completed text of some kind.
    }

    // this.menuOptions = new Button(
    //   this,
    //   new Vector2(
    //     horizontalCenter + windowWidth * mainMenuButtonGap,
    //     mainMenubuttonTopLevel * windowHeight,
    //   ),
    //   standardButtonScale,
    //   optionsButtonTextureKey,
    //   buttonPinchSoundKey,
    //   true,
    // );

    this.menuLogo = this.add
      .sprite(0, 0, logoTextureKey)
      .setOrigin(0, 0)
      .setScale(0.7, 0.7);
    this.menuLogo.setPosition(
      horizontalCenter - this.menuLogo.displayWidth / 2,
      0.25 * windowHeight,
    );

    // this.menuOptions.addPinchCallbacks({
    //   startPinch: () => {
    //     this.scene.start(optionsScene);
    //   },
    //   startHover: () => {
    //     this.menuOptions.setTintFill(uiHoverColor);
    //   },
    //   endHover: () => {
    //     this.menuOptions.clearTint();
    //   },
    // });
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
  }
}
