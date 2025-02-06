import Phaser from 'phaser';
import { LoadingScene, ElectronScene } from '../scenes/loadingScene';
import LevelScene from '../scenes/levelScene';
import MainMenu from '../scenes/mainMenuScene';
import LevelSelect from '../scenes/levelSelectScene';
import Options from '../scenes/optionsScene';
import Scoreboard from '../scenes/scoreboardScene';
import Calibration from '../scenes/calibrationScene';

// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, User } from 'firebase/auth';
import { child, get, getDatabase, ref, set, update } from 'firebase/database';
import { ConfigData } from './interfaces';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
/*
To add a new scene:
1. import MySceneClassName from "scenes/mySceneClassName";
2. Add it to the scene array inside of config (below).
3. Ensure you are calling super("MySceneClassName") in your scene's constructor. 
   Otherwise you will get the following error: "Scene not found for key: MySceneClassName"
4. (Optional) To start in your scene, set initialScene = "MySceneClassName" in config.ts.
*/

const loginScreenEnabled: boolean = true;

export let currentUser: User | null = null;

const config = {
  type: Phaser.WEBGL, // PHASER.CANVAS, PHASER.AUTO
  scale: { mode: Phaser.Scale.RESIZE },
  transparent: true,
  physics: {
    default: 'matter',
    matter: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  scene: [
    ElectronScene,
    LoadingScene,
    MainMenu,
    Options,
    LevelSelect,
    LevelScene,
    Scoreboard,
    Calibration,
  ],
};

function startGame() {
  if (loginScreenEnabled) {
    document.body.removeChild(
      <HTMLElement>document.getElementById('login_screen'),
    );
  }
  const _game = new Phaser.Game(config);
}

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyAHkhSVhXo1qrE3lYqXEh2ozwOgZJhk960',
  authDomain: 'pizzicato-1f765.firebaseapp.com',
  projectId: 'pizzicato-1f765',
  storageBucket: 'pizzicato-1f765.firebasestorage.app',
  messagingSenderId: '196367706867',
  appId: '1:196367706867:web:bb5cac34655842ac462586',
  databaseURL:
    'https://pizzicato-1f765-default-rtdb.europe-west1.firebasedatabase.app/',
};

// Initialize Firebase app (assuming you have firebaseConfig defined elsewhere)
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const database = getDatabase(app);

// Type definition for user data
export interface UserData {
  name?: string;
  config?: string;
  lastLogin: string;
}

const newUserData: UserData = {
  config: 'sonification_config',
  lastLogin: 'Has not logged in yet',
};

const emailSuffix = '@pizzicato.com';

function addEmailSuffix(name: string): string {
  return name + emailSuffix;
}

export function removeEmailSuffix(email: string): string {
  return email.replace(emailSuffix, '');
}

export function getCurrentUserName(): string {
  if (currentUser) {
    return removeEmailSuffix(currentUser.email!);
  }
  return 'guest';
}

function getValidNameEmailPassword() {
  // Get user input fields
  const name = (<HTMLInputElement>document.getElementById('name')).value;
  const password = (<HTMLInputElement>document.getElementById('password'))
    .value;
  const email = addEmailSuffix(name);

  // Validate input fields
  if (!validateName(name)) {
    alert('Name "' + name + '" is invalid!');
    return ['', '', ''];
  }
  if (!validatePassword(password)) {
    alert('Password is invalid!');
    return ['', '', ''];
  }
  if (!validateEmail(email)) {
    alert('Failed email creation "' + email + '" is invalid!');
    alert('Failed to validate credentials!');
    return ['', '', ''];
  }
  return [name, email, password];
}

// Register function
/*
async function register(): Promise<void> {
  const [name, email, password] = getValidNameEmailPassword();

  // Register user with Firebase Auth

  createUserWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      // Signed up
      const user = userCredential.user;

      // Create user data object
      const userData: UserData = {
        name,
        lastLogin: new Date().toUTCString(),
      };
      const db = ref(database);

      set(child(db, `users/${user.uid}`), userData);

      alert('User created successfully!');
      // ...
    })
    .catch(error => {
      //const errorCode = error.code;
      const errorMessage = error.message;
      alert(errorMessage);
      // ..
    });
}
*/

// Login function
async function login(): Promise<void> {
  const [name, email, password] = getValidNameEmailPassword();

  signInWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      // Signed up
      currentUser = userCredential.user;

      // Update user last login in Firebase Database
      const db = ref(database);
      const time = new Date().toUTCString();
      const updates: UserData = { lastLogin: time };

      const user = `users/${currentUser.uid}`;
      newUserData.name = name;
      newUserData.lastLogin = time;

      get(child(db, user))
        .then(snapshot => {
          if (snapshot.exists()) {
            update(child(db, user), updates);
          } else {
            update(child(db, user), newUserData);
          }
        })
        .catch(err => {
          console.info('LOGIN ERROR: ' + err);
        });

      //alert('User logged in successfully!');

      startGame();
      // ...
    })
    .catch(error => {
      // const errorCode = error.code;
      const errorMessage = error.message;
      alert(errorMessage);
      // ..
    });
}

export async function getConfig(
  configName: string | undefined,
): Promise<ConfigData> {
  return new Promise((resolve, reject) => {
    if (!configName) {
      reject('Undefined config name: resorting to default config');
      return;
    } else {
      const db = ref(database);
      get(child(db, `configs/${configName}`))
        .then(snapshot => {
          if (snapshot.exists()) {
            resolve(snapshot.val() as ConfigData);
          } else {
            reject(
              'Config name snapshot does not exist: resorting to default config',
            );
          }
        })
        .catch(err => {
          reject('Firebase get configs failed: ' + err);
        });
    }
  });
}

export async function writeDataToCurrentUser(
  dataId: string,
  jsonData: unknown,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Update user last login in Firebase Database
    const userRef = ref(database, `users/${currentUser!.uid}/data/${dataId}`);

    set(userRef, jsonData)
      .then(() => {
        resolve(
          'Data written successfully for user "' + getCurrentUserName() + '"',
        );
      })
      .catch(err => {
        reject('Data not found for user "' + getCurrentUserName() + '":' + err);
      });
  });
}

// returns config data of the current user and the name of the config.
export async function getCurrentUserConfig(): Promise<[ConfigData, string]> {
  return new Promise((resolve, reject) => {
    const db = ref(database);
    get(child(db, `users/${currentUser!.uid}`))
      .then(snapshot => {
        if (snapshot.exists()) {
          const userData: UserData = snapshot.val();
          getConfig(userData.config)
            .then((config: ConfigData) => {
              if (userData.config) {
                resolve([config, userData.config]);
              } else {
                reject('Undefined config name');
              }
            })
            .catch(err => {
              reject('Failed to retrieve config: ' + err);
            });
        } else {
          reject(
            'User id snapshot does not exist: resorting to default config',
          );
        }
      })
      .catch(err => {
        reject('Firebase get users failed: ' + err);
      });
  });
}

// Email validation function
function validateName(name: string): boolean {
  const expression = /^[A-Za-z][A-Za-z0-9_]{3,29}$/;
  return expression.test(name);
}

// Email validation function
function validateEmail(email: string): boolean {
  const expression = /^[^@]+@\w+(\.\w+)+\w$/;
  return expression.test(email);
}

// Password validation function
function validatePassword(password: string): boolean {
  return password.length >= 6; // Minimum password length
}

if (loginScreenEnabled) {
  const form = `
    <div id="login_screen">
      <div class="login-container">
        <h2>Pizzicato Login</h2>
        <div class="input-group">
          <input type="text" id="name" name="name" placeholder="Name" required>
        </div>
        <div class="input-group">
          <input type="password" id="password" name="password" placeholder="Password" required>
        </div>
        <div class="button-group">
          <button id="login_button" class="login-button">Login</button>
          <button id="guest_button" class="guest-button">Play as Guest</button>
        </div>
      </div>
    </div>
    <div id="background_image"></div>
  `;

  // Append the form to the document
  document.body.innerHTML += form;

  (<HTMLButtonElement>document.getElementById('login_button')).addEventListener(
    'click',
    login,
  );
  (<HTMLButtonElement>document.getElementById('guest_button')).addEventListener(
    'click',
    startGame,
  );
} else {
  startGame();
}
