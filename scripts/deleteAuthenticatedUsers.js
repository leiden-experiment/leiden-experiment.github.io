const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (replace with your service account key)
const serviceAccount = require('path/to/service.json'); // Replace with your service account

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function clearAuthenticatedUsers() {
  try {
    const listUsersResult = await admin.auth().listUsers();
    const deletePromises = listUsersResult.users.map(userRecord => {
      return admin.auth().deleteUser(userRecord.uid);
    });

    await Promise.all(deletePromises);
    console.log('All authenticated users deleted successfully.');
  } catch (error) {
    console.error('Error clearing authenticated users:', error);
  }
}

clearAuthenticatedUsers();
