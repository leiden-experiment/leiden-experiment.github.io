const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (replace with your service account key)
const serviceAccount = require('./path/to/your/serviceAccountKey.json'); // Replace with your service account

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function createUsers() {
  for (let i = 1; i <= 100; i++) {
    const email = `participant${i}@pizzicato.com`;
    const password = generatePassword(6);

    await checkAndCreateUser(email, password); // Use the checkAndCreateUser function
  }
}

async function checkAndCreateUser(email, password) {
  try {
    // Check if user exists by email
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(
      `User with email ${email} already exists (UID: ${userRecord.uid}). No action taken.`,
    );
  } catch (error) {
    // If user does not exist, create them
    if (error.code === 'auth/user-not-found') {
      try {
        const newUserRecord = await admin.auth().createUser({
          email: email,
          password: password,
        });
        console.log(`User created: ${email} (UID: ${newUserRecord.uid})`);
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

createUsers();
