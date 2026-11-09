/* Example contents for src/ts/study/deployment.ts in the RESEARCH fork.
   Replace placeholder values from YOUR Firebase project settings; do not commit credentials.
   Firebase web apiKey is not an administrator secret. Roles are only in server-side custom claims. */
export type DeploymentMode = 'guest' | 'online' | 'offline';
export const deployment: {
  mode: DeploymentMode;
  allowGuest: boolean;
  firebase: null | Record<string, string>;
} = {
  mode: 'online',
  allowGuest: false,
  firebase: {
    apiKey: 'REPLACE_FROM_FIREBASE_CONSOLE',
    authDomain: 'YOUR-PROJECT.firebaseapp.com',
    projectId: 'YOUR-PROJECT',
    databaseURL: 'https://YOUR-PROJECT-default-rtdb.europe-west1.firebasedatabase.app',
    appId: 'REPLACE_FROM_FIREBASE_CONSOLE'
  },
};
// For a standalone Windows/Mac participant application: change mode to 'offline',
// leave allowGuest false, set firebase to null, and import an offline study pack on first launch.
