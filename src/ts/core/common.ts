/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-async-promise-executor */
import { Vector2 } from '../core/phaserTypes';
import { debugMode } from './config';

export function initVariables(): Promise<void> {
  return new Promise<void>((resolve, _reject) => {
    resolve();
  });
}

export function getAppPath(): string {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return '';
  }

  return new URL('.', window.location.href).href;
}

export function isDebugMode(): boolean {
  return debugMode;
}

// function makeRequest(method, url) {
//   return new Promise(function (resolve, reject) {
//     const xhr = new XMLHttpRequest();
//     xhr.open(method, url);
//     xhr.onload = function () {
//       if (this.status >= 200 && this.status < 300) {
//         resolve(xhr);
//       } else {
//         reject({
//           status: this.status,
//           statusText: xhr.statusText,
//         });
//       }
//     };
//     xhr.onerror = function () {
//       reject({
//         status: this.status,
//         statusText: xhr.statusText,
//       });
//     };
//     xhr.send();
//   });
// }

// export function loadJSONData(filePath: string): Promise<string> {
//   return new Promise<string>(async (resolve, reject) => {
//     await makeRequest('GET', filePath)
//       .then((result: any) => {
//         resolve(JSON.parse(result.responseText.toString('utf8')));
//       })
//       .catch(() => {
//         reject();
//       });
//   });
//   //return fs.readFileSync(filePath, 'utf8')
// }

export function assert(
  value: boolean,
  message: string = 'no error message provided',
) {
  // TODO: This if-statement works but see if there is a way to
  // undefine the entire assert function when debugMode is false.
  if (isDebugMode()) {
    if (!value) {
      throw new Error('Assertion failed: ' + message);
    }
  }
}

// Converts relative file paths to absolute ones (relative to root directory) (for executable and hot run to work correctly).
export function absRootPath(
  relPath: string,
  relativeToRootDir: string = '',
): string {
  const basePath: string = getAppPath();
  const normalizedRelPath: string = relPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const normalizedRootDir: string = relativeToRootDir
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (basePath !== '') {
    const combinedPath: string = [normalizedRootDir, normalizedRelPath]
      .filter(part => part !== '')
      .join('/');
    return new URL(combinedPath, basePath).href;
  }

  const fallbackRoot: string =
    normalizedRootDir === '' ? '' : `/${normalizedRootDir}`;
  return `${fallbackRoot}/${normalizedRelPath}`.replace(/\/+/g, '/');
}

// Converts relative file paths to absolute ones (relative to src directory) (for executable and hot run to work correctly).
export function absPath(relPath: string): string {
  return absRootPath(relPath, '');
}

// Returns a subset of array1 and array2 which contains only objects occurring in both arrays.
export function getCommonItems<T>(array1: T[], array2: T[]): T[] {
  // Convert both arrays into unique sets using the Set data structure
  const set1: Set<T> = new Set(array1);
  const set2: Set<T> = new Set(array2);

  // Create a new set to store overlapping items
  const overlappingSet: Set<T> = new Set();

  // Iterate through both sets and add common elements to the overlapping set
  for (const item of set1) {
    if (set2.has(item)) {
      overlappingSet.add(item);
    }
  }

  // Convert the overlapping set to an array
  const overlappingArray: T[] = [...overlappingSet];

  return overlappingArray;
}
export { Vector2 };
