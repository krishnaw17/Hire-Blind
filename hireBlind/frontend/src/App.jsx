// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import RecruiterDashboard from './pages/RecruiterDashboard';
import './styles/globals.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Returns the stored JWT token
  const getToken = async () => {
    const token = localStorage.getItem('hireblind_token');
    if (!token) throw new Error('Not authenticated');
    return token;
  };

  // Verify token on mount and restore session
  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem('hireblind_token');

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setUser({ uid: data.uid, email: data.email });
          setUserRole(data.role);
        } else {
          // Token expired or invalid — clear it
          localStorage.removeItem('hireblind_token');
          setUser(null);
          setUserRole(null);
        }
      } catch (error) {
        console.error('Failed to verify session:', error);
        localStorage.removeItem('hireblind_token');
        setUser(null);
        setUserRole(null);
      }

      setLoading(false);
    };

    verifySession();
  }, []);

  // Called after successful login/register
  const handleAuthSuccess = (userData) => {
    localStorage.setItem('hireblind_token', userData.token);
    setUser({ uid: userData.uid, email: userData.email });
    setUserRole(userData.role);
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem('hireblind_token');
    setUser(null);
    setUserRole(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading HireBlind...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuthSuccess={handleAuthSuccess} />;
  }

  // Role-based routing
  if (userRole === 'admin') {
    return (
      <AdminDashboard
        user={user}
        getToken={getToken}
        logout={logout}
      />
    );
  }

  if (userRole === 'recruiter') {
    return (
      <RecruiterDashboard
        user={user}
        getToken={getToken}
        logout={logout}
      />
    );
  }

  return (
    <div className="error-container">
      <h2>Access Denied</h2>
      <p>Your role is not recognized. Please contact support.</p>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}