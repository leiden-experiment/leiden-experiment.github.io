import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import { LevelConverter } from '../util/levelConverter';
import Level from '../level/level';
import { PhaserText } from '../core/phaserTypes';
import { escapeKey } from '../core/config';
import {
  UploadedLevelManager,
  UploadedLevelInfo,
} from '../managers/uploadedLevelManager';

export default class LevelUploadScene extends HandScene {
  private back: Button;
  private uploadButton: Button;
  private statusText: PhaserText;
  private convertedLevel: Level | null = null;
  private playButton: Button | null = null;
  private fileInput: HTMLInputElement | null = null;
  private dragOverHandler: (e: DragEvent) => void;
  private dragLeaveHandler: (e: DragEvent) => void;
  private dropHandler: (e: DragEvent) => void;

  // Uploaded levels management
  private uploadedLevels: UploadedLevelInfo[] = [];
  private levelListContainer: PhaserText | null = null;
  private levelButtons: Button[] = [];
  private levelsContainer: Phaser.GameObjects.Container | null = null;
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private minScrollY: number = 0;
  private scrollSpeed: number = 30;
  private scrollMask: Phaser.GameObjects.Graphics | null = null;
  private scrollZone: Phaser.GameObjects.Zone | null = null;

  constructor() {
    super('levelUpload');
  }

  create() {
    super.create();

    // Release DOM inputs/drag handlers on every scene transition, including PLAY.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.loadUploadedLevels();

    // Title
    this.add
      .text(this.center.x, 100, 'Level Upload', {
        fontSize: '42px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    // Create drag and drop area
    this.setupDragAndDrop();

    // Left side - Upload section
    this.createUploadSection();

    // Right side - Uploaded levels section
    this.createUploadedLevelsSection();

    // Back button
    this.back = new Button(
      this,
      'BACK',
      this.center.x - 500,
      this.height - 100,
      () => {
        this.cleanup();
        this.scene.start('mainMenu');
      },
    );

    // Create hidden file input
    this.createFileInput();
  }

  private setupDragAndDrop() {
    // Add drag and drop event listeners to the document
    const canvas = this.game.canvas;

    this.dragOverHandler = e => {
      e.preventDefault();
      e.stopPropagation();
      this.setStatus('Drop a Level Designer JSON file here!', '#00ff00');
      // Highlight the upload button when dragging over
      this.uploadButton.setTintFill(0x00ff00);
    };

    this.dragLeaveHandler = e => {
      e.preventDefault();
      e.stopPropagation();
      this.setStatus('', '#ffffff');
      // Reset button color
      this.uploadButton.clearTint();
    };

    this.dropHandler = e => {
      e.preventDefault();
      e.stopPropagation();

      // Reset button color
      this.uploadButton.clearTint();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (this.validateFile(file)) {
          this.handleFileUpload(file);
        }
      }
    };

    canvas.addEventListener('dragover', this.dragOverHandler);
    canvas.addEventListener('dragleave', this.dragLeaveHandler);
    canvas.addEventListener('drop', this.dropHandler);

    // ESC key support - return to main menu
    this.input.keyboard!.on(escapeKey, () => {
      this.cleanup();
      this.scene.start('mainMenu');
    });
  }

  private createFileInput() {
    // Create file input element
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    // Handle file selection
    this.fileInput.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        if (this.validateFile(file)) {
          this.handleFileUpload(file);
        }
      }
      // Reset input value to allow selecting the same file again
      (event.target as HTMLInputElement).value = '';
    });
  }

  private openFileDialog() {
    if (this.fileInput) {
      this.fileInput.click();
    }
  }

  private validateFile(file: File): boolean {
    // Check file type
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      this.setStatus('Please select a JSON file (.json)', '#ff0000');
      return false;
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.setStatus('File too large! Maximum size is 10MB.', '#ff0000');
      return false;
    }

    return true;
  }

  private async handleFileUpload(file: File) {
    this.setStatus(`Reading file: ${file.name}...`, '#ffff00');

    try {
      const text = await this.readFileAsText(file);
      this.setStatus('Parsing JSON...', '#ffff00');
      const originalData = JSON.parse(text);

      // Validate format
      if (!LevelConverter.validateOriginalFormat(originalData)) {
        this.setStatus(
          'Unsupported level JSON. Export a project from the Level Designer.',
          '#ff0000',
        );
        return;
      }

      this.setStatus('Converting level format...', '#ffff00');

      // Convert the format
      const convertedData = LevelConverter.convert(originalData);

      // Validate converted data before proceeding
      if (!convertedData || typeof convertedData !== 'object') {
        throw new Error('Invalid converted data');
      }

      this.setStatus(
        'Level converted successfully! Proceeding to BPM adjustment...',
        '#00ff00',
      );

      // Create temporary level key
      const tempLevelKey = LevelConverter.generateTempLevelKey();

      // Navigate to BPM adjustment scene with the data
      this.scene.start('bpmAdjustment', {
        convertedData: convertedData,
        originalBpm: originalData.music.bpm,
        tempLevelKey: tempLevelKey,
        originalFileName: file.name,
      });
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : 'Invalid level JSON.',
        '#ff0000',
      );
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }

  private createTempLevel(levelKey: string, convertedData: unknown) {
    try {
      // Store the converted data in the cache first
      this.overrideTrackDataLoading(levelKey, convertedData);

      // Create a temporary level
      this.convertedLevel = new Level(this, levelKey);

      this.setStatus('Level ready to play!', '#00ff00');

      // Show play button
      this.showPlayButton();
    } catch (error) {
      this.setStatus('Error creating level. Please try again.', '#ff0000');
    }
  }

  private overrideTrackDataLoading(levelKey: string, convertedData: unknown) {
    // Store the converted data in the scene's cache
    this.cache.json.add(levelKey, convertedData);
  }

  private showPlayButton() {
    if (this.playButton) {
      this.playButton.destroy();
    }

    this.playButton = new Button(
      this,
      'PLAY\nLEVEL',
      this.center.x + 300,
      800,
      () => {
        this.playConvertedLevel();
      },
    );
  }

  private playConvertedLevel() {
    if (!this.convertedLevel) {
      this.setStatus('No level loaded!', '#ff0000');
      return;
    }

    try {
      this.setStatus('Starting level...', '#00ff00');

      // Start level scene with the converted level
      // The level scene will handle preloading and initialization
      this.scene.start('level', this.convertedLevel);
    } catch (error) {
      this.setStatus('Error starting level. Please try again.', '#ff0000');
    }
  }

  private setStatus(message: string, color: string) {
    this.statusText.setText(message);
    this.statusText.setColor(color);
  }

  private loadUploadedLevels() {
    this.uploadedLevels = UploadedLevelManager.getUploadedLevels();
  }

  private createUploadSection() {
    const leftCenterX = this.center.x - 500;

    // Upload section title
    this.add
      .text(leftCenterX, 180, 'Upload New Level', {
        fontSize: '42px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    // Upload button - make it more prominent
    this.uploadButton = new Button(
      this,
      'UPLOAD\nLEVEL',
      leftCenterX,
      400,
      () => {
        this.openFileDialog();
      },
    );

    // Status text
    this.statusText = this.add
      .text(leftCenterX, 380, '', {
        fontSize: '14px',
        color: '#ffff00',
        fontFamily: 'Arial, sans-serif',
        wordWrap: { width: 350, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
  }

  private createUploadedLevelsSection() {
    const rightCenterX = this.center.x + 500;

    // Uploaded levels section title
    this.add
      .text(rightCenterX, 180, 'Uploaded Levels', {
        fontSize: '42px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5);

    // Display uploaded levels in the right section
    this.displayUploadedLevels(rightCenterX);
  }

  private displayUploadedLevels(centerX: number = this.center.x) {
    // Clear existing level buttons
    this.clearLevelButtons();

    if (this.uploadedLevels.length === 0) {
      // Show message when no levels are uploaded
      this.levelListContainer = this.add
        .text(
          centerX,
          250,
          'No uploaded levels yet.\nUpload your first level!',
          {
            fontSize: '20px',
            color: '#888888',
            fontFamily: 'Arial, sans-serif',
            wordWrap: { width: 300, useAdvancedWrap: true },
            align: 'center',
          },
        )
        .setOrigin(0.5);
      return;
    }

    // Create a container for scrollable content
    this.levelsContainer = this.add.container(0, 0);
    this.scrollY = 0;

    // Define scrollable area bounds (right side only)
    const scrollAreaX = centerX - 200;
    const scrollAreaY = 230;
    const scrollAreaWidth = 450;
    const scrollAreaHeight = this.height - scrollAreaY - 100;

    // Create mask for scrollable area
    this.scrollMask = this.make.graphics({});
    this.scrollMask.fillStyle(0xffffff);
    this.scrollMask.fillRect(
      scrollAreaX,
      scrollAreaY,
      scrollAreaWidth,
      scrollAreaHeight,
    );

    // Apply mask to container
    const mask = this.scrollMask.createGeometryMask();
    this.levelsContainer.setMask(mask);

    // Create interactive zone for scroll detection
    this.scrollZone = this.add
      .zone(scrollAreaX, scrollAreaY, scrollAreaWidth, scrollAreaHeight)
      .setOrigin(0, 0)
      .setInteractive();

    // Display levels in a vertical list for the right side
    const startY = 250;
    const buttonSpacing = 170; // Spacing between levels

    this.uploadedLevels.forEach((level, index) => {
      const y = startY + index * buttonSpacing;

      // Level info container - centered in right column
      const levelInfoX = centerX;

      // Create a frame/box for each level
      const frameWidth = 380;
      const frameHeight = 140;
      const frameX = levelInfoX - frameWidth / 2;
      const frameY = y - frameHeight / 2 + 35;

      // Draw frame background with rounded corners
      const frame = this.add.rectangle(
        levelInfoX,
        y + 15,
        frameWidth,
        frameHeight,
        0x000000,
        0.3,
      );
      frame.setStrokeStyle(2, 0x00ff00, 0.8);

      // Add rounded corners by creating a graphics object
      const graphics = this.add.graphics();
      graphics.lineStyle(2, 0x00ff00, 0.8);
      graphics.fillStyle(0x000000, 0.3);
      graphics.fillRoundedRect(
        frameX,
        frameY,
        frameWidth,
        frameHeight,
        15, // Corner radius
      );
      graphics.strokeRoundedRect(
        frameX,
        frameY,
        frameWidth,
        frameHeight,
        15, // Corner radius
      );

      // Hide the original rectangle since we're using the rounded one
      frame.setVisible(false);

      // Add frame and graphics to container
      this.levelsContainer!.add(frame);
      this.levelsContainer!.add(graphics);

      // Level name
      const nameText = this.add
        .text(levelInfoX, y - 5, `${level.name}`, {
          fontSize: '18px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
        })
        .setOrigin(0.5, 0.5);
      this.levelsContainer!.add(nameText);

      // Level details
      const detailsText = this.add
        .text(
          levelInfoX,
          y + 13,
          `BPM: ${level.bpm[0]}-${level.bpm[2]} | Layers: ${level.playableLayers}`,
          {
            fontSize: '13px',
            color: '#cccccc',
            fontFamily: 'Arial, sans-serif',
          },
        )
        .setOrigin(0.5, 0.5);
      this.levelsContainer!.add(detailsText);

      const dateText = this.add
        .text(
          levelInfoX,
          y + 28,
          `Uploaded: ${new Date(level.uploadDate).toLocaleDateString()}`,
          {
            fontSize: '11px',
            color: '#aaaaaa',
            fontFamily: 'Arial, sans-serif',
          },
        )
        .setOrigin(0.5, 0.5);
      this.levelsContainer!.add(dateText);

      // Buttons - arranged vertically below the level info
      const buttonY = y + 70;
      const buttonSpacingX = 125;

      // Play button
      const playButton = new Button(
        this,
        'PLAY',
        levelInfoX - buttonSpacingX,
        buttonY,
        () => {
          this.playUploadedLevel(level);
        },
      );
      playButton.setScale(0.3);
      if (playButton.text) {
        playButton.text.setColor('#00ff00'); // Green text for PLAY
      }
      this.levelsContainer!.add(playButton);
      if (playButton.text) this.levelsContainer!.add(playButton.text);

      // Edit button
      const editButton = new Button(this, 'EDIT', levelInfoX, buttonY, () => {
        this.editUploadedLevel(level);
      });
      editButton.setScale(0.3);
      editButton.setTintFill(0xffff44);
      if (editButton.text) {
        editButton.text.setColor('#ffff00'); // Yellow text for EDIT
      }
      this.levelsContainer!.add(editButton);
      if (editButton.text) this.levelsContainer!.add(editButton.text);

      // Delete button
      const deleteButton = new Button(
        this,
        'DELETE',
        levelInfoX + buttonSpacingX,
        buttonY,
        () => {
          this.deleteUploadedLevel(level);
        },
      );
      deleteButton.setScale(0.3);
      deleteButton.setTintFill(0xff4444);
      if (deleteButton.text) {
        deleteButton.text.setColor('#ff0000'); // Red text for DELETE
      }
      this.levelsContainer!.add(deleteButton);
      if (deleteButton.text) this.levelsContainer!.add(deleteButton.text);

      this.levelButtons.push(playButton, editButton, deleteButton);
    });

    // Calculate scroll boundaries
    const contentHeight = this.uploadedLevels.length * buttonSpacing;
    const visibleHeight = scrollAreaHeight;
    this.maxScrollY = Math.max(0, contentHeight - visibleHeight + 50);
    this.minScrollY = 0;

    // Setup mouse wheel scrolling
    this.setupScrolling();

    // Add scroll indicator if content is scrollable
    if (this.maxScrollY > 0) {
      this.addScrollIndicator(centerX);
    }
  }

  private setupScrolling() {
    let isOverScrollZone = false;

    // Track when mouse enters/leaves the scroll zone
    if (this.scrollZone) {
      this.scrollZone.on('pointerover', () => {
        isOverScrollZone = true;
      });

      this.scrollZone.on('pointerout', () => {
        isOverScrollZone = false;
      });
    }

    // Mouse wheel event - only respond when over scroll zone
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        // Only scroll if mouse is over the scroll zone
        if (!isOverScrollZone || !this.levelsContainer || this.maxScrollY === 0)
          return;

        // Update scroll position
        this.scrollY = Phaser.Math.Clamp(
          this.scrollY + deltaY * 0.5,
          -this.maxScrollY,
          this.minScrollY,
        );

        // Apply scroll to container
        this.levelsContainer.y = this.scrollY;
      },
    );
  }

  private addScrollIndicator(centerX: number) {
    // Add scroll hint text
    const scrollHint = this.add
      .text(centerX, this.height - 80, '⬆️  Scroll to see more  ⬇️', {
        fontSize: '14px',
        color: '#888888',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    // Fade out hint after a few seconds
    this.tweens.add({
      targets: scrollHint,
      alpha: 0,
      duration: 3000,
      delay: 2000,
      onComplete: () => scrollHint.destroy(),
    });
  }

  private clearLevelButtons() {
    // Destroy container and all its children
    if (this.levelsContainer) {
      this.levelsContainer.destroy(true); // true = destroy all children
      this.levelsContainer = null;
    }

    // Destroy mask
    if (this.scrollMask) {
      this.scrollMask.destroy();
      this.scrollMask = null;
    }

    // Destroy scroll zone
    if (this.scrollZone) {
      this.scrollZone.destroy();
      this.scrollZone = null;
    }

    // Clear button references
    this.levelButtons = [];

    if (this.levelListContainer) {
      this.levelListContainer.destroy();
      this.levelListContainer = null;
    }

    // Remove wheel event listener
    this.input.off('wheel');
  }

  private playUploadedLevel(level: UploadedLevelInfo) {
    try {
      const levelData = UploadedLevelManager.loadLevelData(level.id);
      if (!levelData) {
        this.setStatus('Error loading level data!', '#ff0000');
        return;
      }

      // Create temporary level key for playing
      const tempLevelKey = LevelConverter.generateTempLevelKey();

      // Store the level data temporarily for playing


      // Create Level instance
      this.cache.json.add(tempLevelKey, levelData);
      const levelInstance = new Level(this, tempLevelKey);

      this.setStatus(`Starting ${level.name}...`, '#00ff00');

      // Start the level
      this.scene.start('level', levelInstance);
    } catch (error) {
      this.setStatus('Error playing level!', '#ff0000');
      console.error('Error playing uploaded level:', error);
    }
  }

  private editUploadedLevel(level: UploadedLevelInfo) {
    try {
      const levelData = UploadedLevelManager.loadLevelData(level.id);
      if (!levelData) {
        this.setStatus('Error loading level data for editing!', '#ff0000');
        return;
      }

      // Generate a temporary level key for editing
      const tempLevelKey = LevelConverter.generateTempLevelKey();

      // Extract BPM from level data
      const levelDataObj = levelData as Record<string, unknown>;
      const bpmArray = (levelDataObj.bpm as number[]) || [120, 150, 180];
      const originalBpm = bpmArray[0]; // Use the first BPM as the base

      this.setStatus(`Loading ${level.name} for editing...`, '#00ff00');

      // Navigate to BPM adjustment scene with the existing data
      this.scene.start('bpmAdjustment', {
        convertedData: levelData,
        originalBpm: originalBpm,
        tempLevelKey: tempLevelKey,
        originalFileName: level.originalFileName,
        editingLevelId: level.id, // Add this to indicate we're editing
      });
    } catch (error) {
      this.setStatus('Error loading level for editing!', '#ff0000');
      console.error('Error editing uploaded level:', error);
    }
  }

  private deleteUploadedLevel(level: UploadedLevelInfo) {
    if (confirm(`Are you sure you want to delete "${level.name}"?`)) {
      const success = UploadedLevelManager.deleteUploadedLevel(level.id);
      if (success) {
        this.setStatus(`Deleted ${level.name}`, '#00ff00');
        // Reload and redisplay levels
        this.loadUploadedLevels();
        this.displayUploadedLevels(this.center.x + 500);
      } else {
        this.setStatus('Error deleting level!', '#ff0000');
      }
    }
  }

  private cleanup() {
    // Clear level buttons
    this.clearLevelButtons();

    // Remove file input from DOM
    if (this.fileInput && this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
      this.fileInput = null;
    }

    // Remove drag and drop event listeners
    const canvas = this.game.canvas;
    if (this.dragOverHandler) {
      canvas.removeEventListener('dragover', this.dragOverHandler);
    }
    if (this.dragLeaveHandler) {
      canvas.removeEventListener('dragleave', this.dragLeaveHandler);
    }
    if (this.dropHandler) {
      canvas.removeEventListener('drop', this.dropHandler);
    }

    // Clean up temporary level data
    const tempKeys = Object.keys(localStorage).filter(key =>
      key.startsWith('temp_level_'),
    );
    tempKeys.forEach(key => localStorage.removeItem(key));
  }

  destroy() {
    this.cleanup();
  }
}
