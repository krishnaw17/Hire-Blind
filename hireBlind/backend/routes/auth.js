// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticateToken, requireAdmin, signToken } = require('../middleware/auth');
const router = express.Router();

const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * Create new user with role (admin or recruiter)
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        error: 'Email, password, and role required',
      });
    }

    if (!['admin', 'recruiter'].includes(role)) {
      return res.status(400).json({
        error: 'Role must be "admin" or "recruiter"',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters',
      });
    }

    // Check if email already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password and insert user
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email, passwordHash, role]
    );

    const user = result.rows[0];

    // Sign JWT for immediate login
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      uid: user.id,
      email: user.email,
      role: user.role,
      token,
      message: 'User created successfully',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required',
      });
    }

    // Find user by email
    const result = await db.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Sign JWT
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      uid: user.id,
      email: user.email,
      role: user.role,
      token,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/verify
 * Verify JWT token and return user info
 */
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // Token already verified by middleware, fetch fresh user data
    const result = await db.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      uid: user.id,
      email: user.email,
      role: user.role,
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
router.post('/set-job-description', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { jobDescription, jobTitle, screeningSessionId } = req.body;

    if (!jobDescription || !jobTitle) {
      return res.status(400).json({ error: 'Job title and description required' });
    }

    const sessionId = screeningSessionId || Date.now().toString();

    // Upsert the screening session
    await db.query(
      `INSERT INTO screening_sessions (id, admin_id, job_title, job_description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         job_title = $3,
         job_description = $4,
         updated_at = NOW()`,
      [sessionId, req.user.id, jobTitle, jobDescription]
    );

    res.json({
      sessionId,
      message: 'Job description saved',
    });
  } catch (error) {
    console.error('Job description error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;