// backend/routes/auth.js
const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const router = express.Router();

const auth = getAuth();
const db = getFirestore();

/**
 * POST /api/auth/register
 * Create new user with role (admin or recruiter)
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        error: 'Email, password, and role required'
      });
    }

    if (!['admin', 'recruiter'].includes(role)) {
      return res.status(400).json({
        error: 'Role must be "admin" or "recruiter"'
      });
    }

    // Create Firebase user
    const userRecord = await auth.createUser({
      email,
      password,
    });

    // Store role in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email,
      role,
      createdAt: new Date().toISOString(),
    });

    // Create custom token for immediate login
    const customToken = await auth.createCustomToken(userRecord.uid);

    res.status(201).json({
      uid: userRecord.uid,
      email,
      role,
      token: customToken,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 * Login user and return JWT
 * Note: Client will use Firebase SDK's signInWithEmailAndPassword
 * This endpoint is for reference
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required'
      });
    }

    // Get user by email to retrieve role
    const userQuery = await db
      .collection('users')
      .where('email', '==', email)
      .get();

    if (userQuery.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    res.json({
      uid: userDoc.id,
      email,
      role: userData.role,
      message: 'Login successful. Use Firebase SDK for actual authentication.'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/verify
 * Verify JWT token and get user role
 * Auto-creates user doc if missing
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);

    // Hardcoded admin emails — only used as fallback when no Firestore doc exists
    const adminEmails = ['admin@hireblind.com', 'krishnawadhwa2@gmail.com'];

    let role = null;

    // Firestore is the single source of truth for roles
    try {
      const userDocRef = db.collection('users').doc(decodedToken.uid);
      const userDoc = await userDocRef.get();
      const userData = userDoc.data();

      if (userData) {
        role = userData.role;

        // Auto-correct hardcoded admin emails if stored with wrong role
        if (adminEmails.includes(decodedToken.email) && role !== 'admin') {
          role = 'admin';
          await userDocRef.update({ role: 'admin' });
          console.log(`Corrected role to admin for ${decodedToken.email}`);
        }
      } else {
        // No doc yet — auto-create with email-based fallback
        role = adminEmails.includes(decodedToken.email) ? 'admin' : 'recruiter';
        await userDocRef.set({
          email: decodedToken.email,
          role,
          createdAt: new Date().toISOString(),
        });
        console.log(`Auto-created user doc for ${decodedToken.email} with role: ${role}`);
      }
    } catch (firestoreError) {
      // Firestore unavailable — fall back to email-based role
      role = adminEmails.includes(decodedToken.email) ? 'admin' : 'recruiter';
      console.warn('Firestore unavailable, using email-based role:', firestoreError.message);
    }

    res.json({
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * POST /api/auth/set-job-description
 * Admin uploads job description
 */
router.post('/set-job-description', async (req, res) => {
  try {
    const { jobDescription, jobTitle, screeningSessionId } = req.body;
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    if (userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can set job description' });
    }

    const sessionId = screeningSessionId || Date.now().toString();

    await db.collection('screeningSessions').doc(sessionId).set({
      adminId: decodedToken.uid,
      jobTitle,
      jobDescription,
      createdAt: new Date().toISOString(),
      status: 'active',
    });

    res.json({
      sessionId,
      message: 'Job description saved'
    });
  } catch (error) {
    console.error('Job description error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;