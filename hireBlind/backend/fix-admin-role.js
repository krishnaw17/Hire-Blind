// One-time script to fix admin role in Firestore
const dotenv = require('dotenv');
dotenv.config();

const admin = require('firebase-admin');

// Initialize with explicit project config
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    }),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function fixAdminRole() {
  try {
    // Get the admin user from Firebase Auth
    const adminUser = await auth.getUserByEmail('admin@hireblind.com');
    console.log('Found admin user:', adminUser.uid);

    // Update role to admin in Firestore
    const docRef = db.collection('users').doc(adminUser.uid);
    await docRef.set({
      email: 'admin@hireblind.com',
      role: 'admin',
      createdAt: new Date().toISOString(),
    }, { merge: true });

    console.log('✅ Admin role set to "admin" successfully!');

    // Also fix recruiter user if exists
    try {
      const recruiterUser = await auth.getUserByEmail('recruiter@hireblind.com');
      console.log('Found recruiter user:', recruiterUser.uid);
      await db.collection('users').doc(recruiterUser.uid).set({
        email: 'recruiter@hireblind.com',
        role: 'recruiter',
        createdAt: new Date().toISOString(),
      }, { merge: true });
      console.log('✅ Recruiter role set to "recruiter" successfully!');
    } catch (e) {
      console.log('No recruiter user found, skipping');
    }

    // Verify
    const doc = await docRef.get();
    console.log('Admin data:', doc.data());

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

fixAdminRole();
