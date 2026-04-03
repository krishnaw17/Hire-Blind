// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Upload middleware
const upload = multer({ storage: multer.memoryStorage() });

// Firebase initialization
const firebaseAdmin = require('./config/firebase');
const db = getFirestore();
const auth = getAuth();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/resumes', upload.array('files'), require('./routes/resumes'));
app.use('/api/screening', require('./routes/screening'));
app.use('/api/audit', require('./routes/audit'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 HireBlind backend running on http://localhost:${PORT}`);
  console.log(`📊 Firebase project: ${process.env.FIREBASE_PROJECT_ID}`);
});

module.exports = app;