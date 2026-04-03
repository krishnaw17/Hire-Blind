// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import RecruiterDashboard from './pages/RecruiterDashboard';
import './styles/globals.css';

// Firebase config (replace with your config)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Always returns a fresh (non-expired) Firebase ID token
  const getToken = async () => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    return auth.currentUser.getIdToken(true);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // Fetch user role from backend using a fresh token
        try {
          const token = await currentUser.getIdToken(true);
          const response = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/verify`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (response.ok) {
            const data = await response.json();
            setUserRole(data.role);
          } else {
            console.error('Verify endpoint returned:', response.status);
            // Default to recruiter if verify fails but user is authenticated
            setUserRole('recruiter');
          }
        } catch (error) {
          console.error('Failed to fetch user role:', error);
          // Default to recruiter if backend is unreachable
          setUserRole('recruiter');
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading HireBlind...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Role-based routing
  if (userRole === 'admin') {
    return (
      <AdminDashboard
        user={user}
        getToken={getToken}
        auth={auth}
      />
    );
  }

  if (userRole === 'recruiter') {
    return (
      <RecruiterDashboard
        user={user}
        getToken={getToken}
        auth={auth}
      />
    );
  }

  return (
    <div className="error-container">
      <h2>Access Denied</h2>
      <p>Your role is not recognized. Please contact support.</p>
      <button onClick={() => auth.signOut()}>Sign Out</button>
    </div>
  );
}

export { auth };