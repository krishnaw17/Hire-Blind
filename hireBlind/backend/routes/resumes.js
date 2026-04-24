// backend/routes/resumes.js
const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { parseResumesBatch } = require('../services/resumeParser');
const router = express.Router();

/**
 * POST /api/resumes/upload
 * Upload and parse multiple resume files
 */
router.post('/upload', authenticateToken, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    if (req.files.length < 5) {
      return res.status(400).json({
        error: 'Minimum 5 files required',
        provided: req.files.length,
      });
    }

    // Validate file types
    const validMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const invalidFiles = req.files.filter(
      (f) =>
        !validMimeTypes.includes(f.mimetype) &&
        !f.originalname.endsWith('.pdf') &&
        !f.originalname.endsWith('.docx')
    );

    if (invalidFiles.length > 0) {
      return res.status(400).json({
        error: 'Only PDF and DOCX files are supported',
        invalidFiles: invalidFiles.map((f) => f.originalname),
      });
    }

    // Check file sizes (max 10MB per file)
    const oversizedFiles = req.files.filter((f) => f.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      return res.status(400).json({
        error: 'Files exceed 10MB limit',
        oversizedFiles: oversizedFiles.map((f) => f.originalname),
      });
    }

    // Parse all resumes
    const parsedResumes = await parseResumesBatch(req.files);

    // Use provided sessionId or create new one
    const screeningSessionId = req.body.sessionId || `session_${Date.now()}`;
    const successCount = parsedResumes.filter((r) => r.status === 'success').length;

    // Upsert session with parsed resumes
    await db.query(
      `INSERT INTO screening_sessions (id, resumes, status, created_at, updated_at)
       VALUES ($1, $2::jsonb, 'parsing_complete', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         resumes = $2::jsonb,
         status = 'parsing_complete',
         updated_at = NOW()`,
      [screeningSessionId, JSON.stringify(parsedResumes)]
    );

    // Store audit log
    await db.query(
      `INSERT INTO audit_log (action, user_id, session_id, details, timestamp)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        'resumes_uploaded',
        req.user.id,
        screeningSessionId,
        JSON.stringify({ count: successCount, totalFiles: req.files.length }),
      ]
    );

    res.json({
      sessionId: screeningSessionId,
      uploadedAt: new Date().toISOString(),
      totalUploaded: req.files.length,
      successfullyParsed: successCount,
      resumes: parsedResumes.map((r) => ({
        id: r.id,
        filename: r.filename,
        status: r.status,
        textLength: r.textLength,
        error: r.error || null,
      })),
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/resumes/:sessionId
 * Get parsed resumes for a session
 */
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT resumes FROM screening_sessions WHERE id = $1',
      [req.params.sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const resumes = result.rows[0].resumes || [];

    res.json({
      sessionId: req.params.sessionId,
      totalResumes: resumes.length,
      resumes: resumes.map((r) => ({
        id: r.id,
        filename: r.filename,
        status: r.status,
        textLength: r.textLength,
        text: r.text?.substring(0, 500) + '...', // Preview only
      })),
    });
  } catch (error) {
    console.error('Get resumes error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;