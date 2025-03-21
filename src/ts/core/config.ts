import { HandLandmarkerOptions } from '@mediapipe/tasks-vision';
import {
  LandmarkConnectionOptions,
  LandmarkOptions,
  TargetTweenOptions,
  WebcamOptions,
} from '../core/interfaces';
import { Vector2 } from '../core/common';
import { ParticleEmitterConfig } from '../core/phaserTypes';

export const debugMode: boolean = true;

// Music

export const barLength: number = 4;
export const ticksPerBar: number = 16;
export const levelDir: string = 'levels/';
export const levelListPath: string = levelDir + 'list.json';
export const soundFileExtension: string = '.mp3';
export const levelJsonFileName: string = 'info.json';
export const levelBackgroundFileName: string = 'background.png';
export const levelPreviewFileName: string = 'preview.mp4';

// CSV

export const correctTargetId: string = 'correct';
export const earlyTargetId: string = 'early';
export const lateTargetId: string = 'late';
export const missedTargetId: string = 'missed';
export const skippedTargetId: string = 'skipped';

export const csvFilePath = '/csv/';
export const csvFileExtension = '.csv';

// Config file

export const configFilePath = 'data/config.json';
export const defaultConfigFilePath = 'data/default_config.json';

// Hand color and scale

// This is baseline relative to the sprite, not related to the finger scale option.
export const fingerSpriteScale: number = 0.3;

export const fingerColors: { [key: string]: number } = {
  thumb: 0xffffff,
  index: 0xe41a1c,
  middle: 0x0096ff, // 0x984ea3,
  ring: 0xffea00,
  pinky: 0xda70d6,
};

export const handLandmarkConnectionOptions: LandmarkConnectionOptions = {
  lineWidth: 5,
  color: 0xadd8e6,
  alpha: 0.5,
};

export const handLandmarkOptions: LandmarkOptions = {
  lineWidth: 5,
  color: 0xadd8e6,
  alpha: 1,
  radius: 0.1,
};

// Hand distance calibration

export const palmHeight = 10; // (centimeters)
export const palmWidth = 8.2; // (centimeters)
export const focalLength = 0.7; // (centimeters)

export const thumbFingerId: string = 'thumb';
export const indexFingerId: string = 'index';
export const middleFingerId: string = 'middle';
export const ringFingerId: string = 'ring';
export const pinkyFingerId: string = 'pinky';

// Hand UI interaction

export const buttonTextStyle = {
  align: 'center',
  font: '50px Courier New',
  color: '#01C303',
};
export const buttonPinchFinger: string = indexFingerId;
export const buttonHoverTint: number = 0xffffff; // white
export const buttonTextHoverTint: number = buttonHoverTint;
export const difficultyButtonChosenTint: number = 0xe41a1c; // red
export const difficultyButtonChosenTextTint: number =
  difficultyButtonChosenTint;

// Target general properties

// By how much is the progress incremented (must be integers) when the player hits a target.
export const targetSkipProgressImpact: number = -1;
export const targetMissProgressImpact: number = -1;
export const targetHitEarlyProgressImpact: number = 0;
export const targetHitLateProgressImpact: number = 0;
export const targetHitOnTimeProgressImpact: number = +1;

export const targetTextOptions = {
  font: '30px Courier New',
  color: 'white',
};

export const targetRotationDuration: number = 1000; // Milliseconds.
export const targetRotationEase: string = 'linear';

export const targetCollisionLabel: string = '-node-';

// Relative to the inner sprite.
export const outerRingStartScale: number = 0.5;

export const targetGlowOptions = {
  color: 0xffffff,
  quality: 0.05,
  distance: 24,
  outerStrength: 4,
  ease: 'linear',
};
export const earlyTargetOptions: TargetTweenOptions = {
  scale: 1.03, // Scale to which outer ring shrinks relative to inner sprite.
  color: 0xffffff, // (no tint).
  ease: 'linear',
};
export const onTimeTargetOptions: TargetTweenOptions = {
  scale: 0.78,
  color: 0x4daf4a,
  ease: 'linear',
};
export const lateTargetOptions: TargetTweenOptions = {
  scale: 0.3,
  color: 0xff7f00,
  ease: 'linear',
};
export const deadTargetOptions = {
  scale: 0,
  color: 0x808080,
  ease: 'cubic.in',
};
export const targetDeathDuration = 400; // milliseconds

// Level / layer

// Time delay before level starts playing after entering the level.
export const levelStartTimeDelay: number = 1000; // milliseconds
// Time delay before each layer starts playing. Not applicable to the first layer.
export const layerStartTimeDelay: number = 1000; // milliseconds

// Escape key

export const escapeKey: string = 'keydown-ESC';

// Initial loading / preload screen

export const backgroundTextureOpacity: number = 0.9;

// Constants

export const levelPrefix: string = 'level';
export const minuteInMilliseconds: number = 60 * 1000;

// Streak

export const streakOnFireDuration: number = 1000; // milliseconds
export const streakOnFireColorWheelExtent: number = 30; // 1 to 255.

export const streakStartRequirement: number = 1;
export const streakOnFireRequirement: number = 2;

export const streakInfoText: string = 'Streak: ';

// By how much is the streak incremented when a player hits the target on time.
export const targetHitOnTimeStreakImpact: number = +1;

export const streakTextOptions = {
  color: 'white',
  scale: 1,
  font: '30px Courier New',
  depth: 40,
  strokeThickness: 0,
  shadowOffset: new Vector2(2, 2),
  shadowColor: 'black',
  shadowBlurRadius: 2,
};

export const streakFireOptions: ParticleEmitterConfig = {
  color: [0xfacc22, 0xf89800, 0xf83600, 0x9f0404],
  colorEase: 'quad.out',
  lifespan: 500,
  scale: { start: 0.7, end: 0, ease: 'sine.out' },
  speed: 200,
  advance: 500,
  frequency: 50,
  blendMode: 'ADD',
  duration: 0,
};

// Progress bar

// In the JSON setting a layer's progressCount to this value is
// interpreted as all the nodes of the layer being required to progress
export const entireLayerProgressRequired: number = -1;
export const startingProgress: number = 0;

export const progressBarOptions = {
  requiredTint: 0x0800ff,
  completedRequiredTint: 0x2b58a5,
  completedTint: onTimeTargetOptions.color,
  extraTint: onTimeTargetOptions.color, // Used to be: 0x0633cc
  tintByNode: false,
};

// Metronome

export const metronomeMinimumBarCount: number = 1;

export const countdownTextureOptions = {
  scale: 1,
  depth: 30,
  opacity: 0.3,
  key: 'countdown',
  path: 'assets/sprites/countdown.png',
};

// Info HUD (with all the layer and track info)

export const trackInfoText: string = 'Track: ';
export const loopInfoText: string = 'Loop: ';
export const layerInfoText: string = 'Layer: ';
export const layerDividerSymbol: string = '/';
export const difficultyInfoText: string = 'Difficulty: ';
export const bpmInfoText: string = 'BPM: ';

export const difficultyTextEasy: string = 'Easy';
export const difficultyTextMedium: string = 'Medium';
export const difficultyTextHard: string = 'Hard';

// Level select scene

export const defaultDifficultyButtonIndex: number = 0; // 0 Easy, 1 Medium, 2 Hard, etc.

// Calibration scene

export const calibrationMenuWebcamOpacity: number = 0.8; // 0 to 1.
export const handTooFarThreshold: number = 40; // centimeters.
export const handTooCloseThreshold: number = 20; // centimeters.

export const handNotFoundText: string = 'Hand Not Recognized';
export const handTooFarText: string = 'Too Far - Estimated Distance: ';
export const handTooCloseText: string = 'Too Close - Estimated Distance: ';
export const handOptimalText: string = 'Optimal - Estimated Distance: ';
export const appendHandDistanceToText: boolean = true;
export const handDistanceUnitText: string = 'cm';

export const handTooFarColor: number = 0xff0000;
export const handTooCloseColor: number = 0x0000ff;
export const handJustRightColor: number = 0x00ff00;

// Scoreboard scene

export const scoreboardBackgroundAudioFeintness: number = 0.5;

// Level select scene

export const levelSelectDefaultLevel: number = 0;
export const levelSelectBackgroundAudioFeintness: number = 0.5;

// User interfaces ratios

export const optionsCheckboxOffset = new Vector2(-32, -32);
export const optionsSliderLabelOffset = new Vector2(32, -32);

// Scene keys

export const initialScene: string = 'continueScene';
export const levelCompletionScene: string = initialScene;

// Depths

export const fingerSpriteDepth: number = 100;
export const landmarkDepth: number = 99;
export const landmarkConnectionDepth: number = 98;
export const targetTextDepth: number = 97;
export const outerRingDepth: number = 96;
export const targetDepth: number = 95;
export const sliderDepth: number = 94;
export const buttonDepth: number = 93;
export const progressBarDepth: number = 61;

// Webcam

export const webcamDisplayOptions: WebcamOptions = {
  visible: false /* false overrides opacity */,
  flip: true,
  opacity: 0,
  objectFit: 'fill',
};

export const webcamSourceOptions: MediaStreamConstraints = {
  video: {
    /* Utilized webcam resolution. */
    width: { ideal: 1920 / 3 },
    height: { ideal: 1080 / 3 },
  },
  audio: false,
};

// Mediapipe

// Model file from: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
export const modelPath: string = 'models/hand_landmarker.task';
//export const wasmDirectory: string = 'node_modules/@mediapipe/tasks-vision/wasm'
export const wasmDirectory: string = 'models/wasm';

export const landmarkDetectionOptions: HandLandmarkerOptions = {
  baseOptions: {
    delegate: 'GPU',
  },
  runningMode: 'VIDEO', // TODO: Look into using LIVE_STREAM here?
  numHands: 1,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  // TODO: Look into these options and whether they do anything.
  // smoothLandmarks: true,
  // enableSegmentation: false,
  // smoothSegmentation: true,
};

// Invalid parameters

export const undefinedText: string = 'UNDEFINED';
export const invalidBpmIndex: number = -1;
export const invalidFingerIndex: number = -1;
