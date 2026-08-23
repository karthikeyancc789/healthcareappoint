import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';

import FindDoctor from './pages/patient/FindDoctor';
import SymptomForm from './pages/patient/SymptomForm';
import MyAppointments from './pages/patient/MyAppointments';

import DoctorDashboard from './pages/doctor/DoctorDashboard';

import AdminDashboard from './pages/admin/AdminDashboard';

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/patient" element={<ProtectedRoute role="PATIENT"><FindDoctor /></ProtectedRoute>} />
      <Route path="/patient/symptoms/:appointmentId" element={<ProtectedRoute role="PATIENT"><SymptomForm /></ProtectedRoute>} />
      <Route path="/patient/appointments" element={<ProtectedRoute role="PATIENT"><MyAppointments /></ProtectedRoute>} />

      <Route path="/doctor" element={<ProtectedRoute role="DOCTOR"><DoctorDashboard /></ProtectedRoute>} />

      <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>} />

      <Route
        path="/"
        element={
          user ? (
            <Navigate to={user.role === 'PATIENT' ? '/patient' : user.role === 'DOCTOR' ? '/doctor' : '/admin'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
