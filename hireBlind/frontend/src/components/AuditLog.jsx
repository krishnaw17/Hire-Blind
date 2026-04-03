// frontend/src/components/AuditLog.jsx
import React, { useState, useEffect } from 'react';

export default function AuditLog({ sessionId, getToken }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchAuditLog();
  }, [sessionId]);

  const fetchAuditLog = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/audit/log?sessionId=${sessionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setLogs(data.events || []);
      } else {
        setError('Failed to load audit log');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action) => {
    const labels = {
      resumes_uploaded: '📄 Resumes Uploaded',
      pii_anonymisation: '🛡️ PII Anonymisation',
      candidates_scored: '⭐ Candidates Scored',
      ranking_override: '🚩 Ranking Override',
      ranking_override_flagged: '🚩 Override Flagged',
    };
    return labels[action] || action;
  };

  const getActionColor = (action) => {
    const colors = {
      resumes_uploaded: 'color-blue',
      pii_anonymisation: 'color-green',
      candidates_scored: 'color-amber',
      ranking_override: 'color-red',
      ranking_override_flagged: 'color-red',
    };
    return colors[action] || '';
  };

  const filteredLogs =
    filter === 'all'
      ? logs
      : logs.filter((log) => log.action === filter);

  if (loading) {
    return <div className="loading">Loading audit log...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const actionTypes = ['all', ...new Set(logs.map((l) => l.action))];

  return (
    <div className="audit-log">
      <div className="audit-header">
        <h2>📋 Audit Log</h2>
        <p>All actions are logged with timestamps for compliance</p>
      </div>

      <div className="audit-filter">
        <label>Filter by action:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {actionTypes.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All Actions' : getActionLabel(type)}
            </option>
          ))}
        </select>
        <span className="log-count">{filteredLogs.length} events</span>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="empty-state">
          <p>No audit events found</p>
        </div>
      ) : (
        <div className="log-timeline">
          {filteredLogs.map((log, index) => (
            <div
              key={index}
              className={`log-event ${getActionColor(log.action)}`}
            >
              <div className="event-marker"></div>

              <div className="event-content">
                <div className="event-header">
                  <span className="event-label">
                    {getActionLabel(log.action)}
                  </span>
                  <span className="event-timestamp">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>

                {log.action === 'resumes_uploaded' && (
                  <div className="event-details">
                    <p>📊 Uploaded {log.count} resumes</p>
                  </div>
                )}

                {log.action === 'pii_anonymisation' && (
                  <div className="event-details">
                    <p>📊 Processed {log.resumesProcessed} resumes</p>
                    <p>🛡️ Removed {log.details?.totalRemoved} PII fields</p>
                  </div>
                )}

                {log.action === 'candidates_scored' && (
                  <div className="event-details">
                    <p>⭐ Scored {log.candidatesScored} candidates</p>
                    <p>
                      🏆 Top candidate: {log.topScore}/10
                    </p>
                  </div>
                )}

                {(log.action === 'ranking_override' ||
                  log.action === 'ranking_override_flagged') && (
                  <div className="event-details override-details">
                    <p>
                      <strong>Reason:</strong> {log.reason}
                    </p>
                    <p>
                      <strong>Status:</strong>{' '}
                      {log.requiresReview ? '⚠️ Requires Review' : 'Logged'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="audit-stats">
        <h3>Summary Statistics</h3>
        <div className="stats-grid">
          <div className="stat">
            <span className="stat-label">Total Events</span>
            <span className="stat-value">{logs.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Uploads</span>
            <span className="stat-value">
              {logs.filter((l) => l.action === 'resumes_uploaded').length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Anonymisations</span>
            <span className="stat-value">
              {logs.filter((l) => l.action === 'pii_anonymisation').length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Scorings</span>
            <span className="stat-value">
              {logs.filter((l) => l.action === 'candidates_scored').length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Overrides</span>
            <span className="stat-value">
              {logs.filter((l) =>
                l.action.includes('ranking_override')
              ).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}