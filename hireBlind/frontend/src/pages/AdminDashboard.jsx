// frontend/src/pages/AdminDashboard.jsx
import React, { useState, useRef } from 'react';
import ResumeUpload from '../components/ResumeUpload';

export default function AdminDashboard({ user, getToken, logout }) {
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [recruiterEmail, setRecruiterEmail] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadedResumes, setUploadedResumes] = useState([]);
  const [screeningStatus, setScreeningStatus] = useState('idle');
  const fileInputRef = useRef(null);

  const handleSetJobDescription = async () => {
    if (!jobTitle || !jobDescription) {
      setMessage('Please fill in both job title and description');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/set-job-description`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jobTitle,
            jobDescription,
            recruiterEmail,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSessionId(data.sessionId);
        setMessage(`✓ Job description saved! Session: ${data.sessionId}`);
        setScreeningStatus('job_set');
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.error}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUploadComplete = (resumes) => {
    setUploadedResumes(resumes);
    setScreeningStatus('resumes_uploaded');
    setMessage(`✓ ${resumes.length} resumes uploaded successfully!`);
  };

  const handleRunScreening = async () => {
    if (!sessionId) {
      setMessage('Please set job description first');
      return;
    }

    if (uploadedResumes.length === 0) {
      setMessage('Please upload resumes first');
      return;
    }

    setLoading(true);
    setScreeningStatus('anonymising');

    try {
      // Step 1: Anonymise resumes
      setMessage('🔄 Anonymising resumes (removing PII)...');
      const anonToken = await getToken();
      const anonResponse = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/screening/anonymise`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonToken}`,
          },
          body: JSON.stringify({ sessionId }),
        }
      );

      if (!anonResponse.ok) {
        throw new Error('Anonymisation failed');
      }

      setMessage('✓ Resumes anonymised! Now scoring candidates...');
      setScreeningStatus('scoring');

      // Step 2: Score candidates
      const scoreToken = await getToken();
      const scoreResponse = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/screening/score`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scoreToken}`,
          },
          body: JSON.stringify({ sessionId }),
        }
      );

      if (!scoreResponse.ok) {
        throw new Error('Scoring failed');
      }

      const scoreData = await scoreResponse.json();
      setMessage(`✓ Screening complete! Top candidate scored: ${scoreData.topFive[0]?.score || 'N/A'}/10`);
      setScreeningStatus('complete');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
      setScreeningStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard admin-dashboard">
      <header className="dashboard-header">
        <h1>🧑‍💼 Admin Dashboard</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={logout}>Sign Out</button>
        </div>
      </header>

      <main className="dashboard-content">
        <section className="section job-setup">
          <h2>Step 1: Set Job Description</h2>
          <div className="form-group">
            <label>Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Senior Software Engineer"
            />
          </div>

          <div className="form-group">
            <label>Recruiter Email (Optional)</label>
            <input
              type="email"
              value={recruiterEmail}
              onChange={(e) => setRecruiterEmail(e.target.value)}
              placeholder="recruiter@hireblind.com"
            />
          </div>

          <div className="form-group">
            <label>Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              rows="6"
            />
          </div>

          <button
            onClick={handleSetJobDescription}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Saving...' : 'Save Job Description'}
          </button>

          {sessionId && (
            <div className="success-box">
              ✓ Session ID: <code>{sessionId}</code>
            </div>
          )}
        </section>

        <section className="section resume-upload">
          <h2>Step 2: Upload Resumes</h2>
          <ResumeUpload
            getToken={getToken}
            sessionId={sessionId}
            onUploadComplete={handleResumeUploadComplete}
          />

          {uploadedResumes.length > 0 && (
            <div className="resumes-list">
              <h3>Uploaded Resumes ({uploadedResumes.length})</h3>
              <ul>
                {uploadedResumes.map((resume) => (
                  <li key={resume.id}>
                    <span className="status">{resume.status === 'success' ? '✓' : '✗'}</span>
                    {resume.filename}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="section screening">
          <h2>Step 3: Run Screening</h2>
          <button
            onClick={handleRunScreening}
            disabled={
              loading ||
              !sessionId ||
              uploadedResumes.length === 0
            }
            className="btn btn-success"
          >
            {loading ? `${screeningStatus}...` : 'Run Full Screening'}
          </button>

          {message && (
            <div className={`message ${screeningStatus === 'error' ? 'error' : 'success'}`}>
              {message}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}