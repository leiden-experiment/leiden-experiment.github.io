import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { levels, weekNumber } from './loadingScene';
import { PhaserText } from '../core/phaserTypes';
import { assert } from '../core/common';
import {
  currentUser,
  currentUserData,
  currentUserNumber,
  incrementCurrentUserTrainings,
} from '../core/game';
import { autoSaveToCSV, config } from '../managers/storageManager';

export let incrementIndex: boolean = false;

export function setIncrementIndex(increment: boolean) {
  incrementIndex = increment;
}

export default class ContinueScene extends HandScene {
  private calibration: Button;
  private start: Button;
  private title: PhaserText;
  private index: number = 0;
  private sequence: string[] = [];

  constructor() {
    super('continueScene');
  }

  private getLevel(trackKey: string): Level {
    const matching: Level[] = levels.filter(
      (level: Level) => level.trackKey == trackKey,
    );
    assert(
      matching.length != 0,
      'Failed to find level with track key: ' + trackKey,
    );
    assert(
      matching.length == 1,
      'Found multiple levels identical track key: ' + trackKey,
    );
    return matching[0];
  }

  preload() {
    super.preload();

    levels.forEach((level: Level) => {
      level.preload(this);
    });

    this.sequence = this.getTestSequence();
    assert(this.sequence.length == 2, 'Failed to identify test sequence');
  }

  getTestSequence(): string[] {
    // Returns a sequence based on the current user number. The sequence switches every 4 numbers.
    assert(
      currentUserNumber != undefined,
      'Failed to identify current user number',
    );
    if (Math.floor((currentUserNumber! - 1) / 4) % 2 === 0) {
      return ['Trained', 'Untrained'];
    } else {
      return ['Untrained', 'Trained'];
    }
  }

  create(data?: unknown) {
    super.create();

    const buttonsY: number = 800;
    const buttonGapX: number = 330;

    if (incrementIndex) {
      if (config.autoSaveCSV) {
        autoSaveToCSV((data as Level).score.levelStats);
      }
      this.index++;
    }
    incrementIndex = false;

    let startText: string | undefined = undefined;

    let level: Level | undefined;

    this.getLevel('Tryout').setBPM(0);
    this.getLevel('Trained').setBPM(2);
    this.getLevel('Untrained').setBPM(2);
    this.getLevel('Nosound').setBPM(2);

    const setLevel = (name: string, suffix: string) => {
      level = this.getLevel(name);
      startText = 'START\n' + suffix.toUpperCase();
    };

    let suffix: string = 'Invalid Week';

    const tryoutLoops: number = 2;
    const testLoops: number = 6;
    const trainingLoops: number = 6;

    if (weekNumber == 0) {
      if (this.index == 0) {
        suffix = 'TRYOUT';
        config.skipLayersAutomaticallyAfterLoop = tryoutLoops;
        setLevel('Tryout', suffix);
      } else if (this.index == 1) {
        suffix = 'PRETEST 1';
        setLevel(this.sequence[0], suffix);
        config.skipLayersAutomaticallyAfterLoop = testLoops;
      } else if (this.index == 2) {
        suffix = 'PRETEST 2';
        setLevel(this.sequence[1], suffix);
        config.skipLayersAutomaticallyAfterLoop = testLoops;
      } else if (this.index >= 3) {
        suffix = 'PRETESTS COMPLETED';
        // TODO: Show pretest completed.
      }
    } else if (weekNumber >= 1 && weekNumber <= 3) {
      let attempt: number = 1;

      if (currentUserData) {
        if (currentUserData.trainingsCompleted) {
          attempt = currentUserData.trainingsCompleted + 1;
        }
      }

      suffix =
        'WEEK ' + weekNumber.toString() + ' SESSION ' + attempt.toString();

      if (this.index == 0 || this.index == 1 || this.index == 2) {
        config.skipLayersAutomaticallyAfterLoop = trainingLoops;
        level = this.getLevel('Trained');
        startText =
          'START WEEK ' +
          weekNumber.toString() +
          '\n' +
          'TRAINING '.toUpperCase() +
          +attempt.toString() +
          '.' +
          (this.index + 1).toString();
      } else {
        suffix =
          'WEEK ' +
          weekNumber.toString() +
          ' SESSION ' +
          attempt.toString() +
          ' COMPLETED';
        if (currentUser) {
          incrementCurrentUserTrainings()
            .then((result: string) => {
              console.info('INFO: ' + result);
            })
            .catch(err => {
              console.info('ERROR: ' + err);
            });
        }
      }
      if (level) {
        switch (weekNumber) {
          case 1:
            level.setBPM(0);
            break;
          case 2:
            level.setBPM(1);
            break;
          case 3:
            level.setBPM(2);
            break;
          default:
            break;
        }
      }
    } else if (weekNumber == -1) {
      config.skipLayersAutomaticallyAfterLoop = testLoops;
      if (this.index == 0) {
        suffix = 'POSTTEST 1';
        setLevel(this.sequence[0], suffix);
      } else if (this.index == 1) {
        suffix = 'POSTTEST 2';
        setLevel(this.sequence[1], suffix);
      } else if (this.index == 2) {
        config.sonificationEnabled = false;
        config.synchronizationEnabled = false;
        config.pinchVolume = 0.0;
        config.backgroundMusicVolume = 0.0;
        suffix = 'POSTTEST 3';
        setLevel('Nosound', suffix);
      } else {
        suffix = 'POSTTESTS COMPLETED';
        // TODO: Show thanks for participating.
      }
    } else {
      suffix = 'Thanks for participating!';
    }

    this.title = this.add
      .text(this.center.x, 360, suffix, {
        font: '110px Courier New',
        color: 'white',
      })
      .setOrigin(0.5, 0.5);

    if (startText) {
      this.start = new Button(
        this,
        startText,
        this.center.x + buttonGapX,
        buttonsY,
        () => {
          if (level) this.scene.start('level', level);
        },
      );

      this.calibration = new Button(
        this,
        'SETUP\nCAMERA',
        this.center.x - buttonGapX,
        buttonsY,
        () => {
          this.scene.start('calibration');
        },
      );
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
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
  }
}
