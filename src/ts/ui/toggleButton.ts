import { difficultyButtonChosenTint } from '../core/config';
import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';

export class ToggleButton extends Button {
  protected toggleState: boolean;

  private spriteKey: string;
  private toggledSpriteKey: string;
  private toggleCallback?: (newToggleState: boolean) => void;

  constructor(
    scene: HandScene,
    x: number,
    y: number,
    onPinch: () => void = () => {},
    spriteKey: string,
    toggledSpriteKey: string,
    toggled: boolean = false,
    soundKey: string = 'pinch',
  ) {
    super(scene, x, y, onPinch, spriteKey, soundKey);
    this.spriteKey = spriteKey;
    this.toggledSpriteKey = toggledSpriteKey;
    this.toggleState = toggled;

    this.setTexture(this.getSpriteKey());
  }

  public setToggleState(newToggleState: boolean) {
    this.toggleState = newToggleState;
    this.setTexture(this.getSpriteKey());
    this.toggleCallback?.(this.toggleState);
  }

  public addToggleCallback(toggleCallback: (newToggleState: boolean) => void) {
    this.toggleCallback = toggleCallback;
    this.toggleCallback(this.toggleState);
  }

  public toggle() {
    this.toggleState = !this.toggleState;
    this.setTexture(this.getSpriteKey());
    this.toggleCallback?.(this.toggleState);
  }

  public getToggleState(): boolean {
    return this.toggleState;
  }

  public updateTint() {
    if (this.toggleState) {
      this.setTintFill(difficultyButtonChosenTint);
    } else {
      this.clearTint();
    }
  }

  private getSpriteKey() {
    return this.toggleState ? this.spriteKey : this.toggledSpriteKey;
  }
}
