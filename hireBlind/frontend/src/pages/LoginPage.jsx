// frontend/src/pages/LoginPage.jsx
import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function LoginPage({ onAuthSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('recruiter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const body = isRegistering
        ? { email, password, role }
        : { email, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Pass user data + token to parent
      onAuthSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>HireBlind</h1>
          <p>Bias-Free Resume Screening</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {isRegistering && (
            <div className="form-group">
              <label>Role</label>
              <div className="role-selector">
                <label className="role-option">
                  <input
                    type="radio"
                    name="role"
                    value="admin"
                    checked={role === 'admin'}
                    onChange={(e) => setRole(e.target.value)}
                  />
                  <span>Admin (Set job description)</span>
                </label>
                <label className="role-option">
                  <input
                    type="radio"
                    name="role"
                    value="recruiter"
                    checked={role === 'recruiter'}
                    onChange={(e) => setRole(e.target.value)}
                  />
                  <span>Recruiter (Screen candidates)</span>
                </label>
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Loading...' : isRegistering ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="toggle-btn"
            >
              {isRegistering ? 'Sign In' : 'Register'}
            </button>
          </p>
        </div>

        <div className="demo-hint">
          <p>📝 Demo credentials:</p>
          <p>admin@hireblind.com / admin123</p>
          <p>recruiter@hireblind.com / recruiter123</p>
        </div>
      </div>
    </div>
  );
}