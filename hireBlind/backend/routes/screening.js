// backend/routes/screening.js
const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { stripPIIBatch } = require('../services/piiService');
const { scoreCandidatesBatch } = require('../services/scoringService');
const router = express.Router();

const auth = getAuth();
const db = getFirestore();

/**
 * Helper: Validate session ID
 */
function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new Error('Invalid or missing Session ID');
  }
  return sessionId.trim();
}

/**
 * POST /api/screening/anonymise
 * Strip PII from all resumes in a session
 */
router.post('/anonymise', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // FIXED: Validate sessionId properly
    let sessionId;
    try {
      sessionId = validateSessionId(req.body.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Get session
    const sessionDoc = await db
      .collection('screeningSessions')
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    const resumes = sessionData.resumes || [];

    if (resumes.length === 0) {
      return res.status(400).json({ error: 'No resumes in session' });
    }

    // Strip PII from all resumes
    const anonymisedResults = await stripPIIBatch(
      resumes.map(r => ({ id: r.id, text: r.text }))
    );

    // Store anonymised resumes
    const anonymisedData = anonymisedResults.map((result, index) => ({
      originalId: result.resumeId || `resume_${index}`,
      anonymisedText: result.anonymisedText || '',
      removedFields: result.removedFields || [],
      status: result.status || 'pending',
      error: result.error || null,
      timestamp: new Date().toISOString(),
    }));

    // FIXED: Validate update object before sending
    if (!Array.isArray(anonymisedData) || anonymisedData.length === 0) {
      return res.status(500).json({ 
        error: 'Failed to process resumes: no valid data to store' 
      });
    }

    try {
      await db
        .collection('screeningSessions')
        .doc(sessionId)
        .update({ 
          anonymisedResumes: anonymisedData,
          lastUpdated: new Date().toISOString()
        });
    } catch (updateError) {
      console.error('Firestore update error:', updateError);
      return res.status(500).json({ 
        error: `Database error: ${updateError.message}`,
        details: 'Failed to store anonymised resumes'
      });
    }

    // Log audit event
    await db.collection('auditLog').add({
      action: 'pii_anonymisation',
      userId: decodedToken.uid,
      sessionId,
      resumesProcessed: anonymisedResults.length,
      timestamp: new Date().toISOString(),
      details: {
        totalRemoved: anonymisedResults.reduce(
          (sum, r) => sum + (r.removedFields?.length || 0),
          0
        ),
      },
    });

    res.json({
      sessionId,
      totalProcessed: anonymisedResults.length,
      successCount: anonymisedResults.filter(r => r.status === 'success').length,
      anonymisedResumes: anonymisedData.map(r => ({
        originalId: r.originalId,
        status: r.status,
        fieldsRemoved: r.removedFields?.length || 0,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('Anonymisation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/screening/score
 * Score anonymised candidates against job description
 */
router.post('/score', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // FIXED: Validate sessionId
    let sessionId;
    try {
      sessionId = validateSessionId(req.body.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Get session
    const sessionDoc = await db
      .collection('screeningSessions')
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    const jobDescription = sessionData.jobDescription;
    const jobTitle = sessionData.jobTitle;
    const anonymisedResumes = sessionData.anonymisedResumes || [];

    if (!jobDescription) {
      return res.status(400).json({
        error: 'Job description not set. Admin must set job description first.',
      });
    }

    if (anonymisedResumes.length === 0) {
      return res.status(400).json({
        error: 'No anonymised resumes found. Run anonymisation first.',
      });
    }

    // Score all candidates
    const scoredCandidates = await scoreCandidatesBatch(
      jobDescription,
      anonymisedResumes.map(r => ({
        id: r.originalId,
        anonymisedText: r.anonymisedText,
      })),
      jobTitle
    );

    // Store scores
    const scoredData = scoredCandidates.map((result, rank) => ({
      rank: rank + 1,
      candidateId: result.candidateId,
      score: result.score || null,
      reasoning: result.reasoning || null,
      strengths: result.strengths || [],
      gaps: result.gaps || [],
      explainabilityTags: result.explainabilityTags || [],
      confidence: result.confidence || null,
      status: result.status || 'success',
      error: result.error || null,
    }));

    try {
      await db
        .collection('screeningSessions')
        .doc(sessionId)
        .update({ 
          scoredCandidates: scoredData,
          lastUpdated: new Date().toISOString()
        });
    } catch (updateError) {
      console.error('Firestore update error:', updateError);
      return res.status(500).json({ 
        error: `Database error: ${updateError.message}`,
        details: 'Failed to store scored candidates'
      });
    }

    // Log audit event
    await db.collection('auditLog').add({
      action: 'candidates_scored',
      userId: decodedToken.uid,
      sessionId,
      candidatesScored: scoredCandidates.length,
      topCandidate: scoredCandidates[0]?.candidateId,
      topScore: scoredCandidates[0]?.score,
      timestamp: new Date().toISOString(),
    });

    // Return top 5
    const topFive = scoredData.slice(0, 5);

    res.json({
      sessionId,
      totalScored: scoredCandidates.length,
      topFive,
      allScores: scoredData,
    });
  } catch (error) {
    console.error('Scoring error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/screening/override
 * Log manual ranking override
 */
router.post('/override', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // FIXED: Validate sessionId
    let sessionId;
    try {
      sessionId = validateSessionId(req.body.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const { candidateId, newRank, reason } = req.body;

    if (!candidateId || !reason) {
      return res.status(400).json({
        error: 'Candidate ID and reason required',
      });
    }

    // Log override
    await db.collection('auditLog').add({
      action: 'ranking_override',
      userId: decodedToken.uid,
      sessionId,
      candidateId,
      newRank: newRank || null,
      reason,
      timestamp: new Date().toISOString(),
      flagged: true,
    });

    res.json({
      success: true,
      message: 'Override recorded and flagged',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Override error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/:sessionId
 * Get all screening results for a session
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await auth.verifyIdToken(token);

    // FIXED: Validate sessionId
    let sessionId;
    try {
      sessionId = validateSessionId(req.params.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const sessionDoc = await db
      .collection('screeningSessions')
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();

    res.json({
      sessionId,
      jobTitle: sessionData.jobTitle,
      jobDescription: sessionData.jobDescription?.substring(0, 200) + '...',
      totalResumes: sessionData.resumes?.length || 0,
      anonymisedCount: sessionData.anonymisedResumes?.length || 0,
      scoredCount: sessionData.scoredCandidates?.length || 0,
      topCandidates: (sessionData.scoredCandidates || []).slice(0, 5),
      createdAt: sessionData.createdAt,
    });
  } catch (error) {
    console.error('Get screening error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;