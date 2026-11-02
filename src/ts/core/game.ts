/** Phaser game bootstrap and optional study authentication. No credentials or admin role flags live in the client. */
import Phaser from 'phaser';
import { LoadingScene, ElectronScene } from '../scenes/loadingScene';
import LevelScene from '../scenes/levelScene';
import MainMenu from '../scenes/mainMenuScene';
import LevelSelect from '../scenes/levelSelectScene';
import LevelUploadScene from '../scenes/levelUploadScene';
import BpmAdjustmentScene from '../scenes/bpmAdjustmentScene';
import Options from '../scenes/optionsScene';
import Scoreboard from '../scenes/scoreboardScene';
import Calibration from '../scenes/calibrationScene';
import StudySessionScene from '../scenes/studySessionScene';
import { deployment } from '../study/deployment';
import { loginOnline, logoutOnline, studyApi } from '../study/firebaseClient';
import { getOfflinePack, importOfflinePack, loginOffline } from '../study/offline';
import { setStudySession } from '../study/runtime';
import { showDashboard } from '../study/dashboard';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL, width: 1920, height: 1080,
  scale: { mode: Phaser.Scale.ScaleModes.HEIGHT_CONTROLS_WIDTH, autoCenter: Phaser.Scale.CENTER_BOTH },
  transparent: true,
  physics: { default: 'matter', matter: { debug: false, gravity: { x: 0, y: 0 } } },
  scene: [ElectronScene, LoadingScene, MainMenu, StudySessionScene, Options, LevelSelect, LevelUploadScene,
    BpmAdjustmentScene, LevelScene, Scoreboard, Calibration],
};
let game: Phaser.Game | null = null;
const root = document.createElement('div'); root.id = 'pizzicato-gateway';
document.body.appendChild(root);
const background = document.createElement('div'); background.id = 'background_image'; document.body.appendChild(background);
function startGame() {
  root.replaceChildren(); root.classList.remove('study-shell'); root.style.display = 'none';
  if (!game) game = new Phaser.Game(config);
}
function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, label?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (label) node.textContent = label; parent.appendChild(node); return node;
}
function promptLogin() {
  root.style.display = 'block'; root.classList.add('study-shell'); root.replaceChildren();
  const wrapper = el(root, 'main'); wrapper.className = 'study-card';
  el(wrapper, 'h1', deployment.mode === 'offline' ? 'Pizzicato · Offline participant login' : 'Pizzicato · Research login');
  const error = el(wrapper, 'p'); error.setAttribute('role', 'alert');
  const username = el(wrapper, 'input'); username.placeholder = 'Username (not an email)'; username.autocomplete = 'username'; username.type = 'text';
  const password = el(wrapper, 'input'); password.placeholder = 'Password'; password.type = 'password'; password.autocomplete = 'current-password';
  const button = el(wrapper, 'button', 'Sign in');
  button.onclick = async () => {
    button.disabled = true; error.textContent = '';
    try {
      if (deployment.mode === 'offline') {
        const pack = await loginOffline(username.value.trim(), password.value);
        setStudySession({ account: pack.account, settings: pack.settings, mode: 'offline' }, undefined, pack.levels);
        startGame();
      } else {
        const { account } = await loginOnline(username.value.trim(), password.value);
        if (account.role === 'admin' || account.role === 'moderator') {
          await showDashboard(root, account, async () => { await logoutOnline(); promptLogin(); });
        } else {
          const bundle = await studyApi.fetchParticipant();
          setStudySession({ account: bundle.account, settings: bundle.settings, mode: 'online' }, bundle.progress);
          startGame();
        }
      }
    } catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
    finally { button.disabled = false; }
  };
  password.addEventListener('keydown', event => { if (event.key === 'Enter') button.click(); });
  if (deployment.mode === 'offline') {
    el(wrapper, 'p', getOfflinePack() ? 'Offline study pack installed.' : 'Import the participant-specific offline study pack first.');
    const input = el(wrapper, 'input'); input.type = 'file'; input.accept = '.json,.pizzicato-study.json';
    input.onchange = async () => {
      try { if (!input.files?.[0]) return; importOfflinePack(JSON.parse(await input.files[0].text())); promptLogin(); }
      catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
    };
  }
  if (deployment.allowGuest) {
    const guest = el(wrapper, 'button', 'Play as guest'); guest.onclick = startGame;
  }
}
if (deployment.mode === 'guest') startGame();
else promptLogin();
