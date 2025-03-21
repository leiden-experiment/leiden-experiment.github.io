import { Hand } from '../objects/hand';
import webcam from '../objects/webcam';
import {
  drawHandLandmarkConnections,
  drawHandLandmarks,
} from '../util/drawUtil';
import { assert } from '../core/common';
import { config } from '../managers/storageManager';
import { Graphics, Scene, Vector2 } from '../core/phaserTypes';
import {
  handLandmarkConnectionOptions,
  handLandmarkOptions,
  landmarkDepth,
} from '../core/config';
import { background } from '../scenes/loadingScene';

export default class HandScene extends Scene {
  public graphicsObject: Graphics;
  public hand: Hand;
  public bg: HTMLElement;
  public width: number;
  public height: number;
  public center: Vector2;

  constructor(sceneKey: string) {
    super(sceneKey);
    this.bg = document.getElementById('background_image')!;
  }

  public preload() {}

  public enableCamera(cameraVisibility: boolean, cameraOpacity: number) {
    webcam.setVisibility(cameraVisibility);
    this.setOpacity(cameraOpacity);
  }

  public create() {
    this.width = this.scale.width;
    this.height = this.scale.height;
    this.center = new Vector2(this.width / 2, this.height / 2);
    this.enableCamera(config.enableCameraVisibility, config.cameraOpacity);

    // These calls are required because calibration scene hides, tints, and re-textures the background.
    background.setVisible(false);
    document.getElementById('background_image')!;
    this.bg.style.opacity = '1';
    this.setBackgroundTexture('background');
    background.clearTint();

    this.sound.pauseOnBlur = false;

    this.graphicsObject = this.add.graphics();
    this.graphicsObject.setDepth(landmarkDepth);

    this.hand = new Hand(this);

    this.input.topOnly = false;
  }

  public update(_time: number, _delta: number) {
    webcam.video.width = this.game.canvas.clientWidth;
    webcam.video.height = this.game.canvas.clientHeight;

    this.graphicsObject.clear();

    this.hand.update();

    drawHandLandmarks(this.graphicsObject, handLandmarkOptions, 0);
    drawHandLandmarkConnections(
      this.graphicsObject,
      handLandmarkConnectionOptions,
      0,
    );
  }

  public setOpacity(cameraOpacity: number) {
    if (cameraOpacity == undefined) return;
    assert(cameraOpacity >= 0 && cameraOpacity <= 1);
    const backgroundOpacity: number = 1 - cameraOpacity;
    if (background) {
      background.setAlpha(backgroundOpacity);
    }
    if (this.bg) {
      //this.bg.style.backgroundColor = 'rgba(0, 0, 0,' + backgroundOpacity.toString() + ')';
      this.bg.style.opacity = backgroundOpacity.toString();
    }
  }

  public setBackgroundTexture(textureKey: string) {
    if (this.bg) {
      this.bg.style.backgroundSize = '0 0';
    }
    if (!background) {
      return;
    }
    // TODO: Add assert that textureKey is loaded.
    background.setTexture(textureKey);
    background.setDisplaySize(this.width, this.height);
    background.setVisible(true);
  }
}
