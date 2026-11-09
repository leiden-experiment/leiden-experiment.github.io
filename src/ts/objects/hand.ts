import Finger from '../objects/finger';
import handTracker from '../objects/handTracker';
import { HandIndex, HandLandmarkIndex } from '../objects/handLandmarks';
import { config } from '../managers/storageManager';
import {
  GameObject,
  MatterOverlapData,
  Scene,
  Vector2,
} from '../core/phaserTypes';
import {
  fingerSpriteScale,
  focalLength,
  indexFingerId,
  invalidFingerIndex,
  middleFingerId,
  palmHeight,
  palmWidth,
  pinkyFingerId,
  ringFingerId,
  thumbFingerId,
} from '../core/config';
import setInteraction from '../util/interaction';
import { assert } from '../core/common';
import { Observer, PinchCallbacks } from '../core/interfaces';

/*
 * Pinch events have the following names:
 *
 * startPinch: fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.start
 * pinched: fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.continue
 * endPinch: fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.end
 *
 * Hover events have the following names:
 *
 * startHover: fingerName + FingerOverlapEvents.hover + FingerOverlapStates.start
 * hovering: fingerName + FingerOverlapEvents.hover + FingerOverlapStates.continue
 * endHover: fingerName + FingerOverlapEvents.hover + FingerOverlapStates.end
 */

enum FingerOverlapEvents {
  'hover',
  'pinch',
}

enum FingerOverlapStates {
  'start',
  'continue',
  'end',
}

export class Hand extends GameObject {
  private readonly fingers: Finger[] = [];
  private observers_: Observer[] = [];

  constructor(scene: Scene) {
    super(scene, 'hand');

    this.fingers = [];
    this.observers_ = [];

    const addFinger = (id: string, landmarkIndex: HandLandmarkIndex) => {
      const finger: Finger = new Finger(
        this.scene,
        id,
        landmarkIndex,
        fingerSpriteScale * config.fingerSize,
      );
      this.fingers.push(finger);
      return finger;
    };

    const thumb: Finger = addFinger(thumbFingerId, HandLandmarkIndex.THUMB_TIP);
    const _index: Finger = addFinger(
      indexFingerId,
      HandLandmarkIndex.INDEX_FINGER_TIP,
    );
    const _middle: Finger = addFinger(
      middleFingerId,
      HandLandmarkIndex.MIDDLE_FINGER_TIP,
    );
    const _ring: Finger = addFinger(
      ringFingerId,
      HandLandmarkIndex.RING_FINGER_TIP,
    );
    const _pinky: Finger = addFinger(
      pinkyFingerId,
      HandLandmarkIndex.PINKY_TIP,
    );

    // TODO: Possibly break this up into smaller functions.
    const addOverlapEmitter = (
      onOverlap: (
        overlapCallback: (overlap: MatterOverlapData) => void,
      ) => void,
      state: FingerOverlapStates,
    ) => {
      onOverlap((overlap: MatterOverlapData) => {
        const finger: Finger | undefined = this.getFinger(overlap.bodyB.label);
        if (finger != undefined) {
          for (const observer of this.observers) {
            if (
              observer.fingerName == finger.name &&
              observer.object &&
              observer.object.input &&
              observer.object.input.enabled
            ) {
              observer.object.emit(
                finger.name + FingerOverlapEvents.pinch + state,
              );
            }
          }
        } else if (overlap.bodyB.gameObject) {
          const obj: GameObject = overlap.bodyB.gameObject as GameObject;
          for (const f of this.fingers) {
            if (f == thumb) continue;
            const o: Observer = {
              object: obj,
              fingerName: f.name,
            };
            if (!this.isObserver(o)) continue;
            const fingerOverlapping: boolean = this.scene.matter.overlap(
              overlap.bodyB,
              [f],
            );
            if (state === FingerOverlapStates.start && fingerOverlapping) {
              obj.emit(
                f.name + FingerOverlapEvents.hover + FingerOverlapStates.start,
              );
              this.setObserverHover(o, true);
            } else if (state === FingerOverlapStates.continue) {
              const wasHovering: boolean = this.wasObserverHovering(o);
              if (fingerOverlapping && wasHovering) {
                obj.emit(
                  f.name +
                    FingerOverlapEvents.hover +
                    FingerOverlapStates.continue,
                );
                this.setObserverHover(o, true);
              } else if (fingerOverlapping && !wasHovering) {
                obj.emit(
                  f.name +
                    FingerOverlapEvents.hover +
                    FingerOverlapStates.start,
                );
                this.setObserverHover(o, true);
              } else if (!fingerOverlapping && wasHovering) {
                obj.emit(
                  f.name + FingerOverlapEvents.hover + FingerOverlapStates.end,
                );
                this.setObserverHover(o, false);
              }
            } else if (
              state === FingerOverlapStates.end &&
              this.wasObserverHovering(o)
            ) {
              obj.emit(
                f.name + FingerOverlapEvents.hover + FingerOverlapStates.end,
              );
              this.setObserverHover(o, false);
            }
          }
        }
      });
    };

    addOverlapEmitter(
      thumb.setOnCollide.bind(thumb),
      FingerOverlapStates.start,
    );
    addOverlapEmitter(
      thumb.setOnCollideActive.bind(thumb),
      FingerOverlapStates.continue,
    );
    addOverlapEmitter(
      thumb.setOnCollideEnd.bind(thumb),
      FingerOverlapStates.end,
    );
  }

  // @return Returns the display width normalized to the game width of the first finger in the fingers list that exists.
  public getNormalizedFingerRadius(): number | null {
    for (const f of this.fingers) {
      if (f) {
        return f.normalizedRadius;
      }
    }
    return null;
  }

  public getNormalizedFingerPosition(name: string): [number, number] | null {
    const finger: Finger | undefined = this.getFinger(name);
    if (finger === undefined) {
      return null;
    }
    return finger.normalizedPosition;
  }

  private getFinger(name: string): Finger | undefined {
    const i: number = this.fingers.findIndex((f: Finger) => f.name == name);
    if (i === invalidFingerIndex) return undefined;
    return this.fingers[i];
  }

  private getFingersOtherThan(name: string): Finger[] {
    const otherFingers: Finger[] = [];
    for (const f of this.fingers) {
      if (f && f.name == name) continue;
      otherFingers.push(f);
    }
    return otherFingers;
  }

  private get observers() {
    return this.observers_;
  }

  private isObserver(observer: Observer): boolean {
    return (
      this.observers_.find((o: Observer) => {
        return (
          o.fingerName === observer.fingerName && o.object == observer.object
        );
      }) != undefined
    );
  }

  private wasObserverHovering(observer: Observer): boolean {
    assert(this.isObserver(observer));
    return this.observers_.find((o: Observer) => {
      return (
        o.fingerName === observer.fingerName && o.object == observer.object
      );
    })!.wasHovering!;
  }

  private setObserverHover(observer: Observer, state: boolean) {
    const index: number = this.observers_.findIndex((o: Observer) => {
      return (
        o.fingerName === observer.fingerName && o.object == observer.object
      );
    });
    assert(
      index !== invalidFingerIndex,
      'Cannot set observer hover before observer is pushed',
    );
    this.observers_[index].wasHovering = state;
  }

  private pushNewObserversOnly(observer: Observer) {
    if (!this.isObserver(observer)) {
      this.observers.push(observer);
      this.setObserverHover(observer, false);
    }
  }

  private removeObserver(observer: Observer) {
    const index: number = this.observers_.findIndex((o: Observer) => {
      return (
        o.fingerName === observer.fingerName && o.object == observer.object
      );
    });
    if (index > invalidFingerIndex) {
      this.observers_.splice(index, 1);
    }
  }

  public setFingerScale(newScale: number) {
    for (const finger of this.fingers) {
      finger.setScale(fingerSpriteScale * newScale);
    }
  }

  public addPinchCheck(
    fingerName: string,
    obj: GameObject,
    callbacks: PinchCallbacks,
  ) {
    this.pushNewObserversOnly({ object: obj, fingerName: fingerName });

    const overlapping = (fingerName: string): boolean => {
      const thumb: Finger | undefined = this.getFinger(thumbFingerId);
      const finger: Finger | undefined = this.getFinger(fingerName);
      if (thumb === undefined) return false;
      if (finger === undefined) return false;
      const thumbOverlapping: boolean = this.scene.matter.overlap(obj, [thumb]);
      const fingerOverlapping: boolean = this.scene.matter.overlap(obj, [
        finger,
      ]);
      return thumbOverlapping && fingerOverlapping;
    };

    const otherFingerOverlapsThumb = (fingerName: string): boolean => {
      const otherFingers: Finger[] = this.getFingersOtherThan(fingerName);
      const thumb: Finger | undefined = this.getFinger(thumbFingerId);
      if (thumb === undefined) return false;
      for (const finger of otherFingers) {
        if (finger == thumb) continue;
        if (finger === undefined) continue;
        if (this.scene.matter.overlap(thumb, [finger])) return true;
      }
      return false;
    };

    if (callbacks.startPinch) {
      obj.on(
        fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.start,
        () => {
          if (overlapping(fingerName)) {
            if (
              !config.ignoreMultifingerPinches ||
              (config.ignoreMultifingerPinches &&
                !otherFingerOverlapsThumb(fingerName))
            ) {
              callbacks.startPinch?.();
            }
          }
        },
      );
    }
    if (callbacks.pinched) {
      obj.on(
        fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.continue,
        () => {
          if (overlapping(fingerName)) {
            if (
              !config.ignoreMultifingerPinches ||
              (config.ignoreMultifingerPinches &&
                !otherFingerOverlapsThumb(fingerName))
            ) {
              callbacks.pinched?.();
            }
          }
        },
      );
    }
    if (callbacks.endPinch) {
      obj.on(
        fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.end,
        () => {
          if (overlapping(fingerName)) {
            if (
              !config.ignoreMultifingerPinches ||
              (config.ignoreMultifingerPinches &&
                !otherFingerOverlapsThumb(fingerName))
            ) {
              callbacks.endPinch?.();
            }
          }
        },
      );
    }
    if (callbacks.startHover) {
      obj.on(
        fingerName + FingerOverlapEvents.hover + FingerOverlapStates.start,
        () => {
          callbacks.startHover?.();
        },
      );
    }
    if (callbacks.hovering) {
      obj.on(
        fingerName + FingerOverlapEvents.hover + FingerOverlapStates.continue,
        () => {
          callbacks.hovering?.();
        },
      );
    }
    if (callbacks.endHover) {
      obj.on(
        fingerName + FingerOverlapEvents.hover + FingerOverlapStates.end,
        () => {
          callbacks.endHover?.();
        },
      );
    }
  }

  public removePinchCheck(fingerName: string, obj: GameObject) {
    this.removeObserver({ fingerName: fingerName, object: obj });
    obj.off(fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.start);
    obj.off(
      fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.continue,
    );
    obj.off(fingerName + FingerOverlapEvents.pinch + FingerOverlapStates.end);
    obj.off(fingerName + FingerOverlapEvents.hover + FingerOverlapStates.start);
    obj.off(
      fingerName + FingerOverlapEvents.hover + FingerOverlapStates.continue,
    );
    obj.off(fingerName + FingerOverlapEvents.hover + FingerOverlapStates.end);
  }

  public update() {
    this.observers_ = this.observers_.filter(o => o != undefined);

    handTracker.update();

    // Temporary object to check if player is hovering over an observer.
    // Phaser pointer does not interact with Matter physics so this is essentially a Matter wrapper object.
    const pointer = this.scene.matter.add.circle(
      this.scene.input.mousePointer.x,
      this.scene.input.mousePointer.y,
      1,
      {
        circleRadius: 1 /* pointer is a 'point' */,
        isSensor: true,
        render: {
          visible: false,
        },
      },
    );

    for (const finger of this.fingers) {
      const normalizedPosition: Vector2 | undefined =
        handTracker.getNormalizedLandmarkPosition(finger.landmarkIndex);
      const foundFinger: boolean = normalizedPosition != undefined;
      if (foundFinger) {
        finger.updatePosition(normalizedPosition!.x, normalizedPosition!.y);
      }
      setInteraction(finger, foundFinger);
      // When the hand goes off screen, send pinch end and hover end events to all observers.
      if (!foundFinger && pointer) {
        for (const observer of this.observers) {
          if (pointer == undefined) continue;
          if (observer.object == undefined || !observer.object.active) continue;
          if (this.scene == undefined) continue;

          observer.object.emit(
            finger.name + FingerOverlapEvents.pinch + FingerOverlapStates.end,
          );
          // Do not send hover end event if the player's mouse is still over the observer.
          if (!this.scene.matter.overlap(pointer, [observer.object])) {
            observer.object.emit(
              finger.name + FingerOverlapEvents.hover + FingerOverlapStates.end,
            );
          }
        }
      }
    }

    this.scene.matter.world.remove(pointer);
  }

  // Returns hand distance from camera in centimeters or 0 if hand was not recognized.
  calculateHandDistance(handIndex: HandIndex = 0): number {
    const pos1: Vector2 | undefined = handTracker.getNormalizedLandmarkPosition(
      HandLandmarkIndex.INDEX_FINGER_MCP,
      handIndex,
    );
    const pos2: Vector2 | undefined = handTracker.getNormalizedLandmarkPosition(
      HandLandmarkIndex.PINKY_MCP,
      handIndex,
    );
    const pos3: Vector2 | undefined = handTracker.getNormalizedLandmarkPosition(
      HandLandmarkIndex.WRIST,
      handIndex,
    );
    let distanceWidth2: number = 0;
    let distanceHeight2: number = 0;
    if (pos1 != undefined && pos2 != undefined) {
      const pos4 = new Vector2((pos1.x + pos2.x) / 2, (pos1.y + pos2.y) / 2);
      distanceWidth2 = pos2.distanceSq(pos1);
      if (pos3 != undefined) {
        distanceHeight2 = pos3.distanceSq(pos4);
      }
    }
    if (distanceWidth2 == 0 || distanceHeight2 == 0) {
      return 0;
    }
    let distanceOnScreen = Math.max(
      Math.sqrt(distanceWidth2) / palmWidth,
      Math.sqrt(distanceHeight2) / palmHeight,
    );
    // Multiplied by 10 to convert to centimeters.
    distanceOnScreen *= 10;
    return (palmWidth * focalLength) / distanceOnScreen;
  }
}
