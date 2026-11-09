import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { PhaserText } from '../core/phaserTypes';
import { Slider } from '../ui/slider';
import { ConfigData } from '../core/interfaces';
import { config } from '../managers/storageManager';
import { escapeKey } from '../core/config';
import { UploadedLevelManager } from '../managers/uploadedLevelManager';
import { retimeProgrammaticLevel } from '../util/retimeProgrammaticLevel';
import { TrackData } from '../level/trackTypes';
import Vector2 = Phaser.Math.Vector2;

export default class BpmAdjustmentScene extends HandScene {
  private back: Button;
  private statusText: PhaserText;
  private convertedLevel: Level | null = null;
  private playButton: Button | null = null;

  // BPM adjustment interface
  private bpmSlider: Slider | null = null;
  private currentBpmText: PhaserText | null = null;
  private easyButton: Button | null = null;
  private mediumButton: Button | null = null;
  private hardButton: Button | null = null;
  private originalBpm: number = 120;
  private currentBpm: number = 120;
  private convertedData: unknown = null;
  private tempLevelKey: string = '';
  private originalFileName: string = '';
  private editingLevelId: string | null = null;

  // Progression count adjustment interface
  private progressionCountSlider: Slider | null = null;
  private currentProgressionCountText: PhaserText | null = null;
  private currentProgressionCount: number = 3;
  private currentSelectedBpm: number = 120; // Default to medium

  constructor() {
    super('bpmAdjustment');
  }

  init(data: {
    convertedData: unknown;
    originalBpm: number;
    tempLevelKey: string;
    originalFileName?: string;
    editingLevelId?: string;
  }) {
    this.convertedData = data.convertedData;
    this.originalBpm = data.originalBpm;
    this.currentBpm = data.originalBpm;
    this.tempLevelKey = data.tempLevelKey;
    this.originalFileName = data.originalFileName || 'Unknown Level';
    this.currentProgressionCount = 3;
    this.editingLevelId = data.editingLevelId || null;

    // If editing, load existing progression count from level data
    if (this.editingLevelId) {
      try {
        const levelData = this.convertedData as Record<string, unknown>;
        if (levelData.layers && Array.isArray(levelData.layers)) {
          const playableLayer = (levelData.layers as Array<Record<string, unknown>>).find(
            layer => layer.playable === true
          );
          if (playableLayer && typeof playableLayer.progressCount === 'number') {
            this.currentProgressionCount = playableLayer.progressCount;
          }
        }
      } catch (error) {
        console.error('Error loading progression count from existing level:', error);
      }
    }
  }

  create() {
    super.create();

    // Title
    const titleText = this.editingLevelId ? 'Edit Level Settings' : 'Level Settings';
    this.add
      .text(this.center.x, 120, titleText, {
        fontSize: '48px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    // Create BPM section
    this.createBpmSection();

    // Create Progression Count section
    this.createProgressionCountSection();

    this.createPresetButtons();

    // Set initial button color state
    this.updatePresetButtonColors(this.currentBpm);

    // Play button in bottom right corner
    this.playButton = new Button(
      this,
      'PLAY\nLEVEL',
      this.center.x + 500,
      this.height - 100,
      () => {
        this.playLevel();
      },
    );

    // Back button
    this.back = new Button(
      this,
      'BACK',
      this.center.x - 500,
      this.height - 100,
      () => {
        this.scene.start('levelUpload');
      },
    );

    // Status text
    this.statusText = this.add
      .text(this.center.x, this.height - 50, '', {
        fontSize: '20px',
        color: '#ffff00',
        fontFamily: 'Arial, sans-serif',
        wordWrap: { width: 800, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    // ESC key support - return to level upload
    this.input.keyboard!.on(escapeKey, () => {
      this.scene.start('levelUpload');
    });
  }

  private createBpmSection() {
    // BPM Section Title
    this.add
      .text(this.center.x, 200, 'BPM Settings', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    // Current BPM display
    this.currentBpmText = this.add
      .text(this.center.x, 250, `BPM: ${this.currentBpm}`, {
        fontSize: '24px',
        color: '#00ff00',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    this.createBpmSlider();
  }

  private createBpmSlider() {
    // BPM Slider
    const minBpm = Math.max(60, this.originalBpm - 60); // Allow ±60 BPM range, minimum 60
    const maxBpm = Math.min(200, this.originalBpm + 60); // Maximum 200

    // Create a proper config object with the bpm value using an existing config key
    const sliderConfig = { ...config, targetSize: this.currentBpm };

    this.bpmSlider = new Slider(
      this,
      new Vector2(this.center.x - 250, 300),
      new Vector2(500, 30),
      undefined, // Remove label offset to prevent "UNDEFINED" display
      sliderConfig as ConfigData,
      'targetSize' as keyof ConfigData,
      new Vector2(minBpm, maxBpm),
      slider => {
        this.currentBpm = Math.round(slider.getValue());
        this.updateBpmDisplay();
      },
    ).setIsInteger(true);

    // Add the slider to the scene
    this.add.existing(this.bpmSlider);

    // Add min/max labels
    this.add
      .text(this.center.x - 250, 340, `${minBpm}`, {
        fontSize: '18px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    this.add
      .text(this.center.x + 250, 340, `${maxBpm}`, {
        fontSize: '18px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);
  }

  private createProgressionCountSection() {
    // Progression count section title
    this.add
      .text(this.center.x, 700, 'Progression Count Settings', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    // Current progression count display
    this.currentProgressionCountText = this.add
      .text(
        this.center.x,
        750,
        `Progression Count: ${this.currentProgressionCount}`,
        {
          fontSize: '24px',
          color: '#00ff00',
          fontFamily: 'Arial, sans-serif',
        },
      )
      .setOrigin(0.5);

    this.createProgressionCountSlider();
  }

  private createProgressionCountSlider() {
    // Progression count slider (1-10 range)
    const sliderConfig = {
      ...config,
      targetSize: this.currentProgressionCount,
    };

    this.progressionCountSlider = new Slider(
      this,
      new Vector2(this.center.x - 150, 800),
      new Vector2(300, 30),
      undefined,
      sliderConfig as ConfigData,
      'targetSize' as keyof ConfigData,
      new Vector2(1, 10),
      slider => {
        this.currentProgressionCount = Math.round(slider.getValue());
        this.updateProgressionCountDisplay();
      },
    ).setIsInteger(true);

    // Add the slider to the scene
    this.add.existing(this.progressionCountSlider);

    // Add min/max labels
    this.add
      .text(this.center.x - 150, 840, '1', {
        fontSize: '18px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    this.add
      .text(this.center.x + 150, 840, '10', {
        fontSize: '18px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);
  }

  private createPresetButtons() {
    // Easy button (90 BPM)
    this.easyButton = new Button(
      this,
      'EASY\n90 BPM',
      this.center.x - 500,
      500,
      () => {
        this.setBpmPreset(90);
      },
    );
    this.setupPresetButtonHover(this.easyButton, 90);

    // Medium button (120 BPM)
    this.mediumButton = new Button(
      this,
      'MEDIUM\n120 BPM',
      this.center.x,
      500,
      () => {
        this.setBpmPreset(120);
      },
    );
    this.setupPresetButtonHover(this.mediumButton, 120);

    // Hard button (150 BPM)
    this.hardButton = new Button(
      this,
      'HARD\n150 BPM',
      this.center.x + 500,
      500,
      () => {
        this.setBpmPreset(150);
      },
    );
    this.setupPresetButtonHover(this.hardButton, 150);
  }

  private setupPresetButtonHover(button: Button, bpm: number) {
    button.setPinchCallbacks({
      startPinch: () => {
        this.setBpmPreset(bpm);
      },
      startHover: () => {
        // Don't change color on hover, keep current state
      },
      endHover: () => {
        // Restore the correct color based on current selection
        if (this.currentSelectedBpm === bpm) {
          button.setTintFill(0xffffff); // White for selected
        } else {
          button.setTintFill(0x00ff00); // Green for unselected
        }
      },
    });
  }

  private setBpmPreset(bpm: number) {
    this.currentBpm = bpm;
    if (this.bpmSlider) {
      this.bpmSlider.setValue(bpm);
    }
    this.updateBpmDisplay();
    this.updatePresetButtonColors(bpm);
  }

  private updatePresetButtonColors(selectedBpm: number) {
    // Store the current selected BPM for hover callbacks
    this.currentSelectedBpm = selectedBpm;

    // Reset all buttons to default color (green)
    if (this.easyButton) {
      this.easyButton.setTintFill(0x00ff00); // Default green
    }
    if (this.mediumButton) {
      this.mediumButton.setTintFill(0x00ff00); // Default green
    }
    if (this.hardButton) {
      this.hardButton.setTintFill(0x00ff00); // Default green
    }

    // Highlight the selected button (white)
    switch (selectedBpm) {
      case 90:
        if (this.easyButton) {
          this.easyButton.setTintFill(0xffffff); // White for selected
        }
        break;
      case 120:
        if (this.mediumButton) {
          this.mediumButton.setTintFill(0xffffff); // White for selected
        }
        break;
      case 150:
        if (this.hardButton) {
          this.hardButton.setTintFill(0xffffff); // White for selected
        }
        break;
    }
  }

  private updateBpmDisplay() {
    if (this.currentBpmText) {
      this.currentBpmText.setText(`BPM: ${this.currentBpm}`);
    }
  }

  private updateProgressionCountDisplay() {
    if (this.currentProgressionCountText) {
      this.currentProgressionCountText.setText(
        `Progression Count: ${this.currentProgressionCount}`,
      );
    }
  }

  private playLevel() {
    if (!this.convertedData) {
      this.setStatus('No level data available!', '#ff0000');
      return;
    }

    try {
      // Update the BPM in the converted data
      const levelData = this.convertedData as Record<string, unknown>;

      // Update BPM array with the new base BPM
      retimeProgrammaticLevel(levelData as unknown as TrackData, this.currentBpm);

      // Update progression count for all playable layers
      if (levelData.layers && Array.isArray(levelData.layers)) {
        (levelData.layers as Array<Record<string, unknown>>).forEach(layer => {
          if (layer.playable === true) {
            // The engine requires the threshold not to exceed the node count.
            const nodeCount = Array.isArray(layer.nodes) ? layer.nodes.length : 0;
            layer.progressCount = Math.min(this.currentProgressionCount, nodeCount);
          }
        });
      }

      // Save the level so it can be replayed from the upload screen.
      this.saveLevelPermanently(levelData);

      // Store converted data in browser storage for temporary use


      this.setStatus(
        `BPM: ${this.currentBpm}, Progression Count: ${this.currentProgressionCount}! Starting level...`,
        '#00ff00',
      );

      // Create Level instance with adjusted data
      this.createTempLevel(this.tempLevelKey, levelData);

      // Start the level immediately after creation
      if (this.convertedLevel) {
        this.convertedLevel.track.preload(this);
        this.convertedLevel.setBPM(0);
        this.scene.start('level', this.convertedLevel);
      }
    } catch (error) {
      this.setStatus('Error creating level with adjusted BPM.', '#ff0000');
    }
  }

  private saveLevelPermanently(levelData: Record<string, unknown>): void {
    try {
      const bpmArray = [
        this.currentBpm,
        Math.round(this.currentBpm * 1.25),
        Math.round(this.currentBpm * 1.5),
      ];

      if (this.editingLevelId) {
        // Update existing level
        this.updateExistingLevel(levelData, bpmArray);
      } else {
        // Create new level
        const levelId = UploadedLevelManager.saveUploadedLevel(
          levelData,
          this.originalFileName,
          bpmArray,
          this.currentProgressionCount,
        );

        // eslint-disable-next-line no-console
        console.log(`Level saved permanently with ID: ${levelId}`);
      }
    } catch (error) {
      console.error('Error saving level permanently:', error);
      // Don't show error to user as the level can still be played temporarily
    }
  }

  private updateExistingLevel(levelData: Record<string, unknown>, bpmArray: number[]): void {
    if (!this.editingLevelId) throw new Error('Missing existing level ID');
    UploadedLevelManager.updateUploadedLevel(
      this.editingLevelId, levelData, bpmArray, this.currentProgressionCount,
    );
  }

  private createTempLevel(levelKey: string, convertedData: unknown) {
    try {
      // Store the converted data in the cache first
      this.overrideTrackDataLoading(levelKey, convertedData);

      // Create a temporary level
      this.convertedLevel = new Level(this, levelKey);

      this.setStatus('Level ready to play!', '#00ff00');
    } catch (error) {
      this.setStatus('Error creating level. Please try again.', '#ff0000');
    }
  }

  private overrideTrackDataLoading(levelKey: string, convertedData: unknown) {
    // Store the converted data in the scene's cache
    this.cache.json.add(levelKey, convertedData);
  }

  private setStatus(message: string, color: string) {
    this.statusText.setText(message);
    this.statusText.setColor(color);
  }

  destroy() {
    // Clean up any remaining elements
    if (this.bpmSlider) {
      this.bpmSlider.destroy();
    }
    if (this.progressionCountSlider) {
      this.progressionCountSlider.destroy();
    }
  }
}
