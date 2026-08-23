import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ role, children }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    // Logged in, but the wrong portal — send them to their own home instead
    // of a blank 403 page.
    const home = user.role === 'PATIENT' ? '/patient' : user.role === 'DOCTOR' ? '/doctor' : '/admin';
    return <Navigate to={home} replace />;
  }
  return children;
}
