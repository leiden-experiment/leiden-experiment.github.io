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
  phase?: string;
  experimentStart?: string;
  week?: number;
  lastLogin: string;
}

const newUserData: UserData = {
  name: '',
  config: '',
  phase: '',
  experimentStart: '',
  week: 0,
  lastLogin: '',
};

const emailSuffix = '@pizzicato.com';

function addEmailSuffix(name: string): string {
  return name + emailSuffix;
}

export function removeEmailSuffix(email: string): string {
  return email.replace(emailSuffix, '');
}

function removePhaseSuffix(string) {
  if (string.endsWith('pre')) {
    return string.slice(0, -3); // Remove "pre"
  } else if (string.endsWith('post')) {
    return string.slice(0, -4); // Remove "post"
  } else {
    return string;
  }
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
  const email = addEmailSuffix(removePhaseSuffix(name));

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

function extractParticipantInfo(participantString: string) {
  const regex = /^participant(\d+)(pre|post)?$/;
  const match = participantString.match(regex);

  if (match) {
    return {
      number: parseInt(match[1], 10),
      suffix: match[2] || 'training',
    };
  } else {
    return null;
  }
}

function getParticipantConfig(participantNumber: number) {
  if (participantNumber < 0) {
    throw new Error('Participant number cannot be negative.');
  }

  const remainder = participantNumber % 4;

  switch (remainder) {
    case 0:
      return 'sonification';
    case 1:
      return 'synchronization';
    case 2:
      return 'both';
    case 3:
      return 'none';
    default:
      return 'unknown'; // Should not be reached for non-negative integers.
  }
}

function calculateWeekNumber(
  startDateString: string,
  endDateString: string,
): number | null {
  try {
    const startDateObj = new Date(startDateString);
    const endDateObj = new Date(endDateString);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return null;
    }

    const timeDifference: number =
      endDateObj.getTime() - startDateObj.getTime(); // Explicitly typed as number
    const daysPassed: number = Math.ceil(
      timeDifference / (1000 * 60 * 60 * 24),
    );

    if (daysPassed <= 0) {
      return 1;
    }

    const weekNumber: number = Math.ceil(daysPassed / 7);
    return weekNumber;
  } catch (error) {
    console.error('Error calculating week number:', error);
    return null;
  }
}

function getCurrentDateAsString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function throwError(error: string) {
  alert(error);
}

// Login function
async function login(): Promise<void> {
  const [rawName, email, password] = getValidNameEmailPassword();

  signInWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      const participantInfo = extractParticipantInfo(rawName);

      if (participantInfo == null) {
        throwError('Invalid participant info');
        return;
      }

      const participantConfig = getParticipantConfig(participantInfo.number);
      // Signed up
      currentUser = userCredential.user;

      // Update user last login in Firebase Database
      const db = ref(database);
      const time = new Date().toUTCString();
      const updates: UserData = { lastLogin: time, config: participantConfig };

      const user = `users/${currentUser.uid}`;
      newUserData.name = removePhaseSuffix(rawName);
      newUserData.lastLogin = time;
      newUserData.config = participantConfig;
      newUserData.week = 0;

      newUserData.phase = participantInfo.suffix;
      updates.phase = participantInfo.suffix;

      if (participantInfo.suffix == 'pre') {
        newUserData.experimentStart = getCurrentDateAsString();
        updates.experimentStart = getCurrentDateAsString();
      }

      get(child(db, user))
        .then(snapshot => {
          if (snapshot.exists()) {
            const data = snapshot.val() as UserData;
            if (participantInfo.suffix != 'pre' && data.experimentStart == '') {
              throwError(
                'Cannot login with the provided credentials prior to experiment start being set',
              );
              return;
            }
            if (participantInfo.suffix == 'pre') {
              updates.week = 0;
            } else {
              // Calculate current week of experiment.
              let startTime: string | undefined = data.experimentStart;
              if (startTime == undefined || startTime == '') {
                startTime = updates.experimentStart;
              }
              const week = calculateWeekNumber(
                startTime!,
                getCurrentDateAsString(),
              );
              if (week == null) {
                throwError('Failed to calculate experiment week number');
                return;
              }
              updates.week = week!;
            }
            update(child(db, user), updates).then(() => {
              startGame();
            });
          } else {
            if (newUserData.experimentStart == '') {
              throwError(
                'Cannot login with the provided credentials prior to experiment start being set',
              );
              return;
            }
            update(child(db, user), newUserData).then(() => {
              startGame();
            });
          }
        })
        .catch(err => {
          console.info('LOGIN ERROR: ' + err);
        });
    })
    .catch(error => {
      if (error.code === 'auth/invalid-credential') {
        alert('Invalid username or password. Please try again.');
      } else if (error.code === 'auth/user-disabled') {
        alert('This user account has been disabled.');
      } else if (error.code === 'auth/user-not-found') {
        alert('User not found. Please check your credentials.');
      } else if (error.code === 'auth/wrong-password') {
        alert('Incorrect password. Please try again.');
      } else {
        // Handle other Firebase authentication errors
        console.error('Firebase sign-in error:', error);
      }
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
  jsonData: object,
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

export async function getWeekNumber(): Promise<number> {
  return new Promise((resolve, reject) => {
    const db = ref(database);
    get(child(db, `users/${currentUser!.uid}`))
      .then(snapshot => {
        if (snapshot.exists()) {
          const userData: UserData = snapshot.val();
          resolve(userData.week!);
        } else {
          reject('Failed to identify week number');
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
        <h2>Experiment Login</h2>
        <div class="input-group">
          <input type="text" id="name" name="name" placeholder="Name" required>
        </div>
        <div class="input-group">
          <input type="password" id="password" name="password" placeholder="Password" required>
        </div>
        <div class="button-group">
          <button id="login_button" class="login-button">Login</button>
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
} else {
  startGame();
}
