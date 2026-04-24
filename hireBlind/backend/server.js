// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');

dotenv.config();

const { pool } = require('./config/db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Upload middleware
const upload = multer({ storage: multer.memoryStorage() });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/resumes', upload.array('files'), require('./routes/resumes'));
app.use('/api/screening', require('./routes/screening'));
app.use('/api/audit', require('./routes/audit'));

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      database: 'connected',
      serverTime: dbResult.rows[0].now,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 HireBlind backend running on http://localhost:${PORT}`);

  // Verify database connection on startup
  try {
    await pool.query('SELECT 1');
    console.log('📦 PostgreSQL (Neon) connected successfully');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
  }
});

module.exports = app;