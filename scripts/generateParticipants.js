const admin = require('firebase-admin');
const fs = require('fs');
const { Parser } = require('json2csv');

// Instructions:
// 0. Install dependencies in console:
// npm init -y
// npm i firebase-admin json2csv
// 1. Acquire service account json file:
// In Firebase, navigate to Project Settings -> Service Accounts -> Firebase Admin SDK -> Admin SDK configuration snippet (select Node.js) and click "Generate new private key"
// 2. Replace the path below with the one to your service account key.
// 3. Run with this file with Node in the console:
// node generateParticipants.js

// Initialize Firebase Admin SDK.
// Replace with your service account json file (with the weird long name).
const serviceAccount = require('path/to/generated/service/account/file.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function createUsers(start, end) {
  const userData = []; // Array to store user data for CSV

  for (let i = start; i <= end; i++) {
    const email = `participant${i}@pizzicato.com`;
    const password = generatePassword(6);
    const participantName = `participant${i}`; // Extract participant name

    await checkAndCreateUser(email, password, participantName, userData);
  }

  // Generate and save CSV
  generateAndSaveCSV(userData);
}

async function checkAndCreateUser(email, password, participantName, userData) {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(
      `User with email ${email} already exists (UID: ${userRecord.uid}). No action taken.`,
    );
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        const newUserRecord = await admin.auth().createUser({
          email: email,
          password: password,
        });
        console.log(`User created: ${email} (UID: ${newUserRecord.uid})`);

        // Add user data to the array
        userData.push({
          participantName: participantName,
          email: email,
          password: password,
          uid: newUserRecord.uid,
        });
      } catch (createUserError) {
        console.error(`Error creating user ${email}:`, createUserError);
      }
    } else {
      console.error(`Error checking user ${email}:`, error);
    }
  }
}

function generatePassword(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateAndSaveCSV(userData) {
  const fields = ['participantName', 'password'];
  const opts = { fields };

  try {
    const parser = new Parser(opts);
    const csv = parser.parse(userData);

    fs.writeFileSync('participant_credentials.csv', csv);
    console.log('Participant credentials saved to participant_credentials.csv');
  } catch (err) {
    console.error('Error generating or saving CSV:', err);
  }
}

createUsers(101, 200);
