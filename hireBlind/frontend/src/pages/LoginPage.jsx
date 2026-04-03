// frontend/src/pages/LoginPage.jsx
import React, { useState } from 'react';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('recruiter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = getAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        // Register new user
        await createUserWithEmailAndPassword(auth, email, password);

        // Call backend to set role
        const user = auth.currentUser;
        const idToken = await user.getIdToken();

        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ email, password, role }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to set role');
        }
      } else {
        // Login existing user
        await signInWithEmailAndPassword(auth, email, password);
      }
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