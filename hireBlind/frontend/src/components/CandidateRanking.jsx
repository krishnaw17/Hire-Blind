// frontend/src/components/CandidateRanking.jsx
import React, { useState } from 'react';

export default function CandidateRanking({
  candidates,
  sessionId,
  getToken,
}) {
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [flagging, setFlagging] = useState(false);

  const handleFlagOverride = async (candidateId, currentRank) => {
    if (!overrideReason.trim()) {
      alert('Please provide a reason for override');
      return;
    }

    setFlagging(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/screening/override`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            candidateId,
            newRank: currentRank,
            reason: overrideReason,
          }),
        }
      );

      if (response.ok) {
        alert('Override flagged for audit review');
        setOverrideReason('');
      } else {
        alert('Failed to flag override');
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setFlagging(false);
    }
  };

  if (!candidates || candidates.length === 0) {
    return (
      <div className="empty-state">
        <p>📊 No candidates scored yet. Run screening first.</p>
      </div>
    );
  }

  return (
    <div className="candidate-ranking">
      <div className="ranking-header">
        <h2>🏆 Top Candidates</h2>
        <p className="ranking-note">
          Ranked by skills, experience, and role relevance
        </p>
      </div>

      <div className="candidates-grid">
        {candidates.map((candidate, index) => (
          <div
            key={candidate.candidateId}
            className={`candidate-card rank-${index + 1}`}
            onClick={() => setSelectedCandidate(candidate)}
          >
            <div className="rank-badge">{index + 1}</div>
            <div className="candidate-score">
              <div className="score-number">{candidate.score}/10</div>
              <div className="confidence-bar">
                <div
                  className="confidence-fill"
                  style={{
                    width: `${(candidate.confidence || 0.85) * 100}%`,
                  }}
                ></div>
              </div>
              <span className="confidence-text">
                {Math.round((candidate.confidence || 0.85) * 100)}% confident
              </span>
            </div>

            <div className="candidate-reasoning">
              <p className="reasoning-text">{candidate.reasoning}</p>
            </div>

            <div className="explainability-tags">
              {(candidate.explainabilityTags || []).slice(0, 3).map((tag, i) => (
                <span key={i} className="tag">
                  ✓ {tag}
                </span>
              ))}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCandidate(candidate);
              }}
              className="view-btn"
            >
              View Details
            </button>
          </div>
        ))}
      </div>

      {selectedCandidate && (
        <div className="modal-overlay" onClick={() => setSelectedCandidate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-btn"
              onClick={() => setSelectedCandidate(null)}
            >
              ✕
            </button>

            <h3>Candidate #{candidates.indexOf(selectedCandidate) + 1}</h3>

            <div className="modal-section">
              <h4>Score & Confidence</h4>
              <p>
                <strong>{selectedCandidate.score}/10</strong> ({selectedCandidate.confidence || 0.85} confidence)
              </p>
            </div>

            <div className="modal-section">
              <h4>Why This Ranking?</h4>
              <p>{selectedCandidate.reasoning}</p>
            </div>

            <div className="modal-section">
              <h4>✓ Strengths</h4>
              <ul>
                {(selectedCandidate.strengths || []).map((strength, i) => (
                  <li key={i}>{strength}</li>
                ))}
              </ul>
            </div>

            <div className="modal-section">
              <h4>⚠ Gaps</h4>
              <ul>
                {(selectedCandidate.gaps || []).map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>

            <div className="modal-section">
              <h4>All Tags</h4>
              <div className="tags-full">
                {(selectedCandidate.explainabilityTags || []).map((tag, i) => (
                  <span key={i} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="modal-section override-section">
              <h4>📝 Override This Ranking?</h4>
              <p className="override-note">
                If you disagree with this ranking, provide a reason for audit trail.
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Why are you overriding this ranking?"
                rows="3"
              />
              <button
                onClick={() =>
                  handleFlagOverride(
                    selectedCandidate.candidateId,
                    candidates.indexOf(selectedCandidate) + 1
                  )
                }
                disabled={flagging || !overrideReason.trim()}
                className="btn btn-warning"
              >
                {flagging ? 'Flagging...' : 'Flag Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}