// frontend/src/components/CompliancePanel.jsx
import React, { useState, useEffect } from 'react';

export default function CompliancePanel({ sessionId, getToken }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchComplianceReport();
  }, [sessionId]);

  const fetchComplianceReport = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/audit/compliance-report?sessionId=${sessionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setReport(data);
      } else {
        setError('Failed to load compliance report');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading compliance report...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!report) {
    return <div>No compliance report available</div>;
  }

  return (
    <div className="compliance-panel">
      <div className="compliance-header">
        <h2>📜 EU AI Act Compliance Report</h2>
        <p className="report-id">Report ID: {report.reportId}</p>
        <p className="report-date">Generated: {new Date(report.generatedAt).toLocaleString()}</p>
      </div>

      <section className="compliance-section">
        <h3>✅ Compliance Status</h3>
        <div className={`status-badge status-${report.complianceSummary.status.toLowerCase()}`}>
          {report.complianceSummary.status}
        </div>
        <div className="compliance-checklist">
          <div className="check-item">
            <span className="check-mark">✓</span>
            <span>Article 13 - {report.complianceSummary.article13}</span>
          </div>
          <div className="check-item">
            <span className="check-mark">✓</span>
            <span>Data Minimisation - {report.complianceSummary.dataMinimisation}</span>
          </div>
          <div className="check-item">
            <span className="check-mark">✓</span>
            <span>Human Oversight - {report.complianceSummary.humanOversight}</span>
          </div>
          <div className="check-item">
            <span className="check-mark">✓</span>
            <span>Auditability - {report.complianceSummary.auditability}</span>
          </div>
        </div>
      </section>

      <section className="compliance-section">
        <h3>📊 Screening Summary</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Total Candidates</span>
            <span className="stat-value">{report.transparency.totalCandidates}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Processed</span>
            <span className="stat-value">{report.transparency.processedCandidates}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Scored</span>
            <span className="stat-value">{report.transparency.scoredCandidates}</span>
          </div>
        </div>
      </section>

      <section className="compliance-section">
        <h3>🛡️ PII Removal Summary</h3>
        <div className="pii-summary">
          <p>
            <strong>Total Fields Removed:</strong>{' '}
            {report.dataProcessing.piiRemovalSummary.totalFieldsRemoved}
          </p>
          <p>
            <strong>Average Per Resume:</strong>{' '}
            {report.dataProcessing.piiRemovalSummary.averagePerResume}
          </p>
          <p>
            <strong>Removed Field Types:</strong>
          </p>
          <ul className="pii-list">
            {report.dataProcessing.piiRemovalSummary.fieldsRemovedTypes.map((field, i) => (
              <li key={i}>{field}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="compliance-section">
        <h3>👤 Human Oversight</h3>
        <div className="human-oversight">
          <p>
            <strong>Decision Making:</strong> {report.humanOversight.decision}
          </p>
          <p>
            <strong>Fully Automated Decisions:</strong>{' '}
            {report.humanOversight.noFullyAutomatedDecisions ? '❌ No' : '⚠️ Yes'}
          </p>
          <p>
            <strong>Manual Overrides Applied:</strong>{' '}
            {report.humanOversight.manualOverridesApplied}
          </p>
          {report.humanOversight.overrideReasons.length > 0 && (
            <div className="override-reasons">
              <p><strong>Override Reasons:</strong></p>
              <ul>
                {report.humanOversight.overrideReasons.map((override, i) => (
                  <li key={i}>
                    <strong>{override.reason}</strong>
                    <br />
                    <small>{new Date(override.timestamp).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="compliance-section">
        <h3>🔍 Risk Mitigation Measures</h3>
        <div className="risk-mitigation">
          <div className="measure">
            <span className="measure-icon">✓</span>
            <span>Bias Detection: {report.riskMitigation.biasDetection ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="measure">
            <span className="measure-icon">✓</span>
            <span>Audit Trail: {report.riskMitigation.auditTrail ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="measure">
            <span className="measure-icon">✓</span>
            <span>Explainability: {report.riskMitigation.explainability ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="measure">
            <span className="measure-icon">✓</span>
            <span>Data Minimisation: {report.riskMitigation.dataMinimisation ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="measure">
            <span className="measure-icon">✓</span>
            <span>No Data Retention: {report.riskMitigation.noDataRetention}</span>
          </div>
        </div>
      </section>

      <section className="compliance-section">
        <h3>💡 Recommendations</h3>
        <ul className="recommendations">
          {report.complianceSummary.recommendations.map((rec, i) => (
            <li key={i}>{rec}</li>
          ))}
        </ul>
      </section>

      <section className="compliance-section audit-preview">
        <h3>📋 Recent Audit Events (Last 10)</h3>
        <div className="audit-events">
          {report.auditTrail.events.map((event, i) => (
            <div key={i} className="audit-event">
              <span className="event-action">{event.action}</span>
              <span className="event-time">
                {new Date(event.timestamp).toLocaleString()}
              </span>
              {event.details && (
                <span className="event-details">
                  Details: {JSON.stringify(event.details)}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="compliance-footer">
        <p>
          This report is generated automatically to satisfy EU AI Act Article 13 transparency
          requirements. Keep this report for regulatory inspection.
        </p>
        <button onClick={() => window.print()} className="btn btn-secondary">
          🖨️ Print Report
        </button>
      </div>
    </div>
  );
}