// frontend/src/pages/RecruiterDashboard.jsx
import React, { useState, useEffect } from 'react';
import CandidateRanking from '../components/CandidateRanking';
import CompliancePanel from '../components/CompliancePanel';
import AuditLog from '../components/AuditLog';

export default function RecruiterDashboard({ user, getToken, logout }) {
  const [sessionId, setSessionId] = useState('');
  const [screening, setScreening] = useState(null);
  const [topCandidates, setTopCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('candidates');
  const [message, setMessage] = useState('');

  const loadScreening = async () => {
    if (!sessionId) {
      setMessage('Please enter a session ID');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/screening/${sessionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setScreening(data);
        setTopCandidates(data.topCandidates || []);
        setMessage('');
      } else {
        setMessage('Session not found');
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard recruiter-dashboard">
      <header className="dashboard-header">
        <h1>👤 Recruiter Dashboard</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={logout}>Sign Out</button>
        </div>
      </header>

      <main className="dashboard-content">
        <section className="session-loader">
          <h2>Load Screening Session</h2>
          <div className="input-group">
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Enter session ID..."
              onKeyPress={(e) => e.key === 'Enter' && loadScreening()}
            />
            <button onClick={loadScreening} disabled={loading}>
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
          {message && <div className="error-message">{message}</div>}
        </section>

        {screening && (
          <>
            <section className="session-info">
              <div className="info-card">
                <h3>📋 Job: {screening.jobTitle}</h3>
                <p>Total Resumes: {screening.totalResumes}</p>
                <p>Anonymised: {screening.anonymisedCount}</p>
                <p>Scored: {screening.scoredCount}</p>
              </div>
            </section>

            <nav className="tabs">
              <button
                className={`tab ${activeTab === 'candidates' ? 'active' : ''}`}
                onClick={() => setActiveTab('candidates')}
              >
                🏆 Top Candidates ({topCandidates.length})
              </button>
              <button
                className={`tab ${activeTab === 'compliance' ? 'active' : ''}`}
                onClick={() => setActiveTab('compliance')}
              >
                📜 Compliance Report
              </button>
              <button
                className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
                onClick={() => setActiveTab('audit')}
              >
                📋 Audit Log
              </button>
            </nav>

            {activeTab === 'candidates' && (
              <section className="candidates-section">
                <CandidateRanking
                  candidates={topCandidates}
                  sessionId={sessionId}
                  getToken={getToken}
                />
              </section>
            )}

            {activeTab === 'compliance' && (
              <section className="compliance-section">
                <CompliancePanel
                  sessionId={sessionId}
                  getToken={getToken}
                />
              </section>
            )}

            {activeTab === 'audit' && (
              <section className="audit-section">
                <AuditLog sessionId={sessionId} getToken={getToken} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}