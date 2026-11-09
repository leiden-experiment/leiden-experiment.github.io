/** Browser build configuration. The webpack build injects PUBLIC Firebase web-app values.
 * Edit nothing in TypeScript: use `npm run setup:web` or the GitHub Pages secret.
 * All administrator privileges are checked server-side; no credentials are bundled.
 */
export type DeploymentMode = 'guest' | 'online' | 'offline';
export interface DeploymentConfig {
  mode: DeploymentMode;
  allowGuest: boolean;
  firebase: null | Record<string, string>;
}
declare const __PIZZICATO_WEB_CONFIG__: DeploymentConfig;
export const deployment: DeploymentConfig = __PIZZICATO_WEB_CONFIG__;
