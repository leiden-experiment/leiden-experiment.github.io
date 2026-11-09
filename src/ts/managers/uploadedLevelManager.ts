export interface UploadedLevelInfo {
  id: string;
  name: string;
  originalFileName: string;
  bpm: number[];
  progressionCount: number;
  uploadDate: string;
  playableLayers: number;
}

export class UploadedLevelManager {
  private static readonly STORAGE_KEY = 'uploaded_levels_list';
  private static readonly LEVEL_DATA_PREFIX = 'uploaded_level_data_';

  /**
   * Get all uploaded levels metadata
   */
  static getUploadedLevels(): UploadedLevelInfo[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading uploaded levels:', error);
      return [];
    }
  }

  /**
   * Save uploaded levels metadata
   */
  private static saveUploadedLevelsList(levels: UploadedLevelInfo[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(levels));
    } catch (error) {
      console.error('Error saving uploaded levels list:', error);
      throw error;
    }
  }

  /**
   * Save a new uploaded level permanently
   */
  static saveUploadedLevel(
    levelData: unknown,
    originalFileName: string,
    bpm: number[],
    progressionCount: number
  ): string {
    const levelId = this.generateLevelId();
    const levelInfo: UploadedLevelInfo = {
      id: levelId,
      name: this.generateLevelName(originalFileName),
      originalFileName,
      bpm,
      progressionCount,
      uploadDate: new Date().toISOString(),
      playableLayers: this.countPlayableLayers(levelData)
    };

    // Save level data
    try {
      localStorage.setItem(
        `${this.LEVEL_DATA_PREFIX}${levelId}`,
        JSON.stringify(levelData)
      );
    } catch (error) {
      console.error('Error saving level data:', error);
      throw new Error('Failed to save level data');
    }

    // Update levels list
    const existingLevels = this.getUploadedLevels();
    existingLevels.push(levelInfo);
    try {
      this.saveUploadedLevelsList(existingLevels);
    } catch (error) {
      localStorage.removeItem(`${this.LEVEL_DATA_PREFIX}${levelId}`);
      throw error;
    }

    return levelId;
  }

  /**
   * Atomically replace a saved level without deleting its existing ID.
   * Roll back the data if updating the metadata fails (e.g. quota exceeded).
   */
  static updateUploadedLevel(
    levelId: string,
    levelData: unknown,
    bpm: number[],
    progressionCount: number,
  ): void {
    const levels = this.getUploadedLevels();
    const info = levels.find(level => level.id === levelId);
    if (!info) throw new Error('Uploaded level not found.');
    const key = `${this.LEVEL_DATA_PREFIX}${levelId}`;
    const previous = localStorage.getItem(key);
    const previousBpm = info.bpm;
    const previousProgression = info.progressionCount;
    const previousLayers = info.playableLayers;
    try {
      localStorage.setItem(key, JSON.stringify(levelData));
      info.bpm = bpm;
      info.progressionCount = progressionCount;
      info.playableLayers = this.countPlayableLayers(levelData);
      this.saveUploadedLevelsList(levels);
    } catch (error) {
      if (previous !== null) localStorage.setItem(key, previous);
      else localStorage.removeItem(key);
      info.bpm = previousBpm;
      info.progressionCount = previousProgression;
      info.playableLayers = previousLayers;
      throw error;
    }
  }

  /**
   * Load level data by ID
   */
  static loadLevelData(levelId: string): unknown | null {
    try {
      const stored = localStorage.getItem(`${this.LEVEL_DATA_PREFIX}${levelId}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error loading level data:', error);
      return null;
    }
  }

  /**
   * Delete an uploaded level
   */
  static deleteUploadedLevel(levelId: string): boolean {
    try {
      // Remove level data
      localStorage.removeItem(`${this.LEVEL_DATA_PREFIX}${levelId}`);

      // Remove from levels list
      const existingLevels = this.getUploadedLevels();
      const updatedLevels = existingLevels.filter(level => level.id !== levelId);
      this.saveUploadedLevelsList(updatedLevels);

      return true;
    } catch (error) {
      console.error('Error deleting level:', error);
      return false;
    }
  }

  /**
   * Generate a unique level ID
   */
  private static generateLevelId(): string {
    return `uploaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a display name for the level
   */
  private static generateLevelName(originalFileName: string): string {
    // Remove .json extension and clean up the name
    const baseName = originalFileName.replace(/\.json$/i, '');
    return baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Count playable layers in level data
   */
  private static countPlayableLayers(levelData: unknown): number {
    try {
      const data = levelData as Record<string, unknown>;
      if (data.layers && Array.isArray(data.layers)) {
        return (data.layers as Array<Record<string, unknown>>).filter(
          layer => layer.playable === true
        ).length;
      }
      return 0;
    } catch (error) {
      console.error('Error counting playable layers:', error);
      return 0;
    }
  }

  /**
   * Get storage usage info
   */
  static getStorageInfo(): { levelCount: number; totalSize: number } {
    const levels = this.getUploadedLevels();
    let totalSize = 0;

    levels.forEach(level => {
      const data = localStorage.getItem(`${this.LEVEL_DATA_PREFIX}${level.id}`);
      if (data) {
        totalSize += new Blob([data]).size;
      }
    });

    return {
      levelCount: levels.length,
      totalSize
    };
  }

  /**
   * Clear all uploaded levels
   */
  static clearAllUploadedLevels(): void {
    const levels = this.getUploadedLevels();
    levels.forEach(level => {
      localStorage.removeItem(`${this.LEVEL_DATA_PREFIX}${level.id}`);
    });
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
