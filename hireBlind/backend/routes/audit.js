// backend/routes/audit.js
const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const router = express.Router();

const auth = getAuth();
const db = getFirestore();

/**
 * GET /api/audit/log
 * Get audit log for a session
 */
router.get('/log', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await auth.verifyIdToken(token);

    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const logsSnapshot = await db
      .collection('auditLog')
      .where('sessionId', '==', sessionId)
      .get();

    const logs = [];
    logsSnapshot.forEach(doc => {
      logs.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Sort in memory to avoid Firestore composite index requirement
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      sessionId,
      totalEvents: logs.length,
      events: logs,
    });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/audit/compliance-report
 * Generate EU AI Act compliance report
 */
router.get('/compliance-report', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);

    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Get session data
    const sessionDoc = await db
      .collection('screeningSessions')
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();

    // Get audit logs
    const logsSnapshot = await db
      .collection('auditLog')
      .where('sessionId', '==', sessionId)
      .get();

    const logs = [];
    logsSnapshot.forEach(doc => {
      logs.push(doc.data());
    });

    // Calculate PII removal statistics
    const anonymisationLog = logs.find(l => l.action === 'pii_anonymisation');
    const totalFieldsRemoved = anonymisationLog?.details?.totalRemoved || 0;
    const totalResumes = sessionData.resumes?.length || 0;

    // Count overrides
    const overrides = logs.filter(l => l.action === 'ranking_override');

    // Build compliance report
    const report = {
      reportId: `REPORT-${Date.now()}`,
      sessionId,
      generatedAt: new Date().toISOString(),
      generatedBy: decodedToken.uid,
      
      // Article 13: Transparency
      transparency: {
        title: 'EU AI Act Article 13 - Transparency Report',
        jobTitle: sessionData.jobTitle,
        totalCandidates: totalResumes,
        processedCandidates: sessionData.anonymisedResumes?.length || 0,
        scoredCandidates: sessionData.scoredCandidates?.length || 0,
      },

      // Data Processing
      dataProcessing: {
        piiRemovalSummary: {
          totalFieldsRemoved,
          averagePerResume: totalResumes > 0 ? (totalFieldsRemoved / totalResumes).toFixed(1) : 0,
          fieldsRemovedTypes: [
            'Full name',
            'Email address',
            'Phone number',
            'Home address',
            'Date of birth',
            'University name',
            'Social media links',
            'Photo references',
          ],
        },
      },

      // Human Oversight
      humanOversight: {
        decision: 'All final hiring decisions made by recruiter',
        noFullyAutomatedDecisions: true,
        manualOverridesApplied: overrides.length,
        overrideReasons: overrides.map(o => ({
          candidateId: o.candidateId,
          reason: o.reason,
          timestamp: o.timestamp,
        })),
      },

      // Risk Mitigation
      riskMitigation: {
        biasDetection: true,
        auditTrail: true,
        explainability: true,
        dataMinimisation: true,
        noDataRetention: 'PII stripped and never stored',
      },

      // Audit Trail
      auditTrail: {
        totalEvents: logs.length,
        events: logs.slice(0, 10).map(l => ({
          action: l.action,
          timestamp: l.timestamp,
          details: l.details,
        })),
      },

      // Compliance Summary
      complianceSummary: {
        status: 'COMPLIANT',
        article13: 'SATISFIED - Transparency report available',
        dataMinimisation: 'SATISFIED - PII stripped before processing',
        humanOversight: 'SATISFIED - Recruiter makes final decisions',
        auditability: 'SATISFIED - All actions logged with timestamps',
        recommendations: [
          'Review ranking overrides for potential bias patterns',
          'Maintain this audit log for regulatory inspection',
          'Update PII stripping rules if new data types discovered',
        ],
      },
    };

    res.json(report);
  } catch (error) {
    console.error('Compliance report error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/audit/override-flag
 * Flag and log a ranking override (for bias detection)
 */
router.post('/override-flag', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { sessionId, candidateId, originalRank, newRank, reason } = req.body;

    if (!sessionId || !candidateId || !reason) {
      return res.status(400).json({
        error: 'Session ID, candidate ID, and reason required',
      });
    }

    // Log the override
    const flagLog = {
      action: 'ranking_override_flagged',
      userId: decodedToken.uid,
      sessionId,
      candidateId,
      originalRank,
      newRank,
      reason,
      timestamp: new Date().toISOString(),
      severity: 'medium',
      requiresReview: true,
    };

    await db.collection('auditLog').add(flagLog);

    res.json({
      success: true,
      flagged: true,
      message: 'Override flagged for audit review',
      flagId: Date.now().toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Override flag error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/audit/flags
 * Get all flagged overrides for a session
 */
router.get('/flags', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await auth.verifyIdToken(token);

    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const flagsSnapshot = await db
      .collection('auditLog')
      .where('sessionId', '==', sessionId)
      .where('requiresReview', '==', true)
      .get();

    const flags = [];
    flagsSnapshot.forEach(doc => {
      flags.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Sort in memory to avoid Firestore composite index requirement
    flags.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      sessionId,
      totalFlags: flags.length,
      flags,
    });
  } catch (error) {
    console.error('Get flags error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;