// backend/routes/screening.js
const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { stripPIIBatch } = require('../services/piiService');
const { scoreCandidatesBatch } = require('../services/scoringService');
const router = express.Router();

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
router.post('/anonymise', authenticateToken, async (req, res) => {
  try {
    // Validate sessionId
    let sessionId;
    try {
      sessionId = validateSessionId(req.body.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Get session
    const sessionResult = await db.query(
      'SELECT resumes FROM screening_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const resumes = sessionResult.rows[0].resumes || [];

    if (resumes.length === 0) {
      return res.status(400).json({ error: 'No resumes in session' });
    }

    // Strip PII from all resumes
    const anonymisedResults = await stripPIIBatch(
      resumes.map((r) => ({ id: r.id, text: r.text }))
    );

    // Build anonymised data
    const anonymisedData = anonymisedResults.map((result, index) => ({
      originalId: result.resumeId || `resume_${index}`,
      anonymisedText: result.anonymisedText || '',
      removedFields: JSON.stringify(result.removedFields || []),
      removedCount: (result.removedFields || []).length,
      status: result.status || 'pending',
      error: result.error || null,
      timestamp: new Date().toISOString(),
    }));

    if (!Array.isArray(anonymisedData) || anonymisedData.length === 0) {
      return res.status(500).json({
        error: 'Failed to process resumes: no valid data to store',
      });
    }

    // Update session with anonymised resumes
    await db.query(
      `UPDATE screening_sessions
       SET anonymised_resumes = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(anonymisedData), sessionId]
    );

    // Log audit event
    await db.query(
      `INSERT INTO audit_log (action, user_id, session_id, details, timestamp)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        'pii_anonymisation',
        req.user.id,
        sessionId,
        JSON.stringify({
          resumesProcessed: anonymisedResults.length,
          totalRemoved: anonymisedResults.reduce(
            (sum, r) => sum + (r.removedFields?.length || 0),
            0
          ),
        }),
      ]
    );

    res.json({
      sessionId,
      totalProcessed: anonymisedResults.length,
      successCount: anonymisedResults.filter((r) => r.status === 'success').length,
      anonymisedResumes: anonymisedData.map((r) => ({
        originalId: r.originalId,
        status: r.status,
        fieldsRemoved: r.removedCount || 0,
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
router.post('/score', authenticateToken, async (req, res) => {
  try {
    // Validate sessionId
    let sessionId;
    try {
      sessionId = validateSessionId(req.body.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Get session
    const sessionResult = await db.query(
      'SELECT job_description, job_title, anonymised_resumes FROM screening_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    const jobDescription = session.job_description;
    const jobTitle = session.job_title;
    const anonymisedResumes = session.anonymised_resumes || [];

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
      anonymisedResumes.map((r) => ({
        id: r.originalId,
        anonymisedText: r.anonymisedText,
      })),
      jobTitle
    );

    // Build scored data
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

    // Update session with scored candidates
    await db.query(
      `UPDATE screening_sessions
       SET scored_candidates = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(scoredData), sessionId]
    );

    // Log audit event
    await db.query(
      `INSERT INTO audit_log (action, user_id, session_id, details, timestamp)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        'candidates_scored',
        req.user.id,
        sessionId,
        JSON.stringify({
          candidatesScored: scoredCandidates.length,
          topCandidate: scoredCandidates[0]?.candidateId,
          topScore: scoredCandidates[0]?.score,
        }),
      ]
    );

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
router.post('/override', authenticateToken, async (req, res) => {
  try {
    // Validate sessionId
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
    await db.query(
      `INSERT INTO audit_log (action, user_id, session_id, details, timestamp)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        'ranking_override',
        req.user.id,
        sessionId,
        JSON.stringify({
          candidateId,
          newRank: newRank || null,
          reason,
          flagged: true,
        }),
      ]
    );

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
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    // Validate sessionId
    let sessionId;
    try {
      sessionId = validateSessionId(req.params.sessionId);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const result = await db.query(
      `SELECT job_title, job_description, resumes,
              anonymised_resumes, scored_candidates, created_at
       FROM screening_sessions WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];

    res.json({
      sessionId,
      jobTitle: session.job_title,
      jobDescription: session.job_description
        ? session.job_description.substring(0, 200) + '...'
        : '',
      totalResumes: (session.resumes || []).length,
      anonymisedCount: (session.anonymised_resumes || []).length,
      scoredCount: (session.scored_candidates || []).length,
      topCandidates: (session.scored_candidates || []).slice(0, 5),
      createdAt: session.created_at,
    });
  } catch (error) {
    console.error('Get screening error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;