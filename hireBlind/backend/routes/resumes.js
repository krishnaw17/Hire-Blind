// backend/routes/resumes.js
const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { parseResumesBatch } = require('../services/resumeParser');
const router = express.Router();

const auth = getAuth();
const db = getFirestore();

/**
 * POST /api/resumes/upload
 * Upload and parse multiple resume files
 */
router.post('/upload', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);

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
      f => !validMimeTypes.includes(f.mimetype) && 
           !f.originalname.endsWith('.pdf') &&
           !f.originalname.endsWith('.docx')
    );

    if (invalidFiles.length > 0) {
      return res.status(400).json({
        error: 'Only PDF and DOCX files are supported',
        invalidFiles: invalidFiles.map(f => f.originalname),
      });
    }

    // Check file sizes (max 10MB per file)
    const oversizedFiles = req.files.filter(f => f.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      return res.status(400).json({
        error: 'Files exceed 10MB limit',
        oversizedFiles: oversizedFiles.map(f => f.originalname),
      });
    }

    // Parse all resumes
    const parsedResumes = await parseResumesBatch(req.files);

    // Use provided sessionId or create new one
    const screeningSessionId = req.body.sessionId || `session_${Date.now()}`;
    const successCount = parsedResumes.filter(r => r.status === 'success').length;

    // Store in Firestore (merge with existing session from job description step)
    await db
      .collection('screeningSessions')
      .doc(screeningSessionId)
      .set({
        resumes: parsedResumes,
        uploadedBy: decodedToken.uid,
        totalFiles: req.files.length,
        successfulParsed: successCount,
        uploadedAt: new Date().toISOString(),
        status: 'parsing_complete',
      }, { merge: true });

    // Store audit log
    await db.collection('auditLog').add({
      action: 'resumes_uploaded',
      userId: decodedToken.uid,
      sessionId: screeningSessionId,
      count: successCount,
      timestamp: new Date().toISOString(),
    });

    res.json({
      sessionId: screeningSessionId,
      uploadedAt: new Date().toISOString(),
      totalUploaded: req.files.length,
      successfullyParsed: successCount,
      resumes: parsedResumes.map(r => ({
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
router.get('/:sessionId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await auth.verifyIdToken(token);

    const sessionDoc = await db
      .collection('screeningSessions')
      .doc(req.params.sessionId)
      .get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();

    res.json({
      sessionId: req.params.sessionId,
      totalResumes: sessionData.resumes?.length || 0,
      resumes: (sessionData.resumes || []).map(r => ({
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