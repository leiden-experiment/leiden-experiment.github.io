import { LevelStats } from '../core/interfaces';

/**
 * Function to convert a levelStats object to a csv string, it's best to keep this in the same file as the interfaces.
 * @param levelStats the stats to convert.
 * @return the data in a CSV format string.
 */
export function levelStatsToCSV(levelStats: LevelStats): string {
  let csvContent: string =
    'layerID,noteID,pinchType,loopNumber,playerTime,correctTime,classification,normalizedTargetRadius,normalizedTargetPositionX,normalizedTargetPositionY,normalizedFingerRadius,normalizedPinkyFingerPositionX,normalizedPinkyFingerPositionY,normalizedRingFingerPositionX,normalizedRingFingerPositionY,normalizedMiddleFingerPositionX,normalizedMiddleFingerPositionY,normalizedIndexFingerPositionX,normalizedIndexFingerPositionY,normalizedThumbFingerPositionX,normalizedThumbFingerPositionY\n';

  for (const layerStats of levelStats.layersStats) {
    const layerID = levelStats.layersStats.indexOf(layerStats);
    for (const hitInfo of layerStats.hits) {
      const fingerRadius = hitInfo.normalizedFingerRadius
        ? hitInfo.normalizedFingerRadius
        : null;
      const [targetX, targetY] = hitInfo.normalizedTargetPosition || [null, null];
      const [pinkyX, pinkyY] = hitInfo.normalizedPinkyFingerPosition
        ? hitInfo.normalizedPinkyFingerPosition
        : [null, null];
      const [ringX, ringY] = hitInfo.normalizedRingFingerPosition
        ? hitInfo.normalizedRingFingerPosition
        : [null, null];
      const [middleX, middleY] = hitInfo.normalizedMiddleFingerPosition
        ? hitInfo.normalizedMiddleFingerPosition
        : [null, null];
      const [indexX, indexY] = hitInfo.normalizedIndexFingerPosition
        ? hitInfo.normalizedIndexFingerPosition
        : [null, null];
      const [thumbX, thumbY] = hitInfo.normalizedThumbFingerPosition
        ? hitInfo.normalizedThumbFingerPosition
        : [null, null];

      const row: string = `${layerID},${hitInfo.noteID},${hitInfo.pinchType},${hitInfo.loopNumber},${millisecondsToSeconds(hitInfo.playerTime)},${millisecondsToSeconds(hitInfo.correctTime)},${hitInfo.classification},${hitInfo.normalizedTargetRadius ?? ''},${targetX},${targetY},${fingerRadius},${pinkyX},${pinkyY},${ringX},${ringY},${middleX},${middleY},${indexX},${indexY},${thumbX},${thumbY}\n`;

      csvContent += row;
    }
  }
  return csvContent;
}

function millisecondsToSeconds(time: number, roundTo: number = 3): number {
  return parseFloat((time / 1000).toFixed(roundTo));
}
