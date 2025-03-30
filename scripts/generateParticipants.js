const admin = require('firebase-admin');
const fs = require('fs');
const { Parser } = require('json2csv');

// Initialize Firebase Admin SDK (replace with your service account key)
const serviceAccount = require('path/to/service.json'); // Replace with your service account

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function createUsers() {
  const userData = []; // Array to store user data for CSV

  for (let i = 1; i <= 100; i++) {
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

createUsers();
