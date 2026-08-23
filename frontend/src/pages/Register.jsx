import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'PATIENT', specialisation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key) {
    return (e) => setForm({ ...form, [key]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register(form);
      if (user.role === 'DOCTOR') navigate('/doctor');
      else if (user.role === 'ADMIN') navigate('/admin');
      else navigate('/patient');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="sub">Book appointments and track your care in one place.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field role-selector" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {['PATIENT', 'DOCTOR', 'ADMIN'].map((role) => (
              <label
                key={role}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px',
                  border: `1px solid ${form.role === role ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.role === role ? 'var(--primary-tint)' : 'transparent',
                  color: form.role === role ? 'var(--primary-dark)' : 'var(--text-muted)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={form.role === role}
                  onChange={update('role')}
                  style={{ display: 'none' }}
                />
                {role.charAt(0) + role.slice(1).toLowerCase()}
              </label>
            ))}
          </div>

          <div className="field">
            <label>Full name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={update('email')} required />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={update('phone')} />
          </div>
          {form.role === 'DOCTOR' && (
            <div className="field">
              <label>Specialisation</label>
              <input value={form.specialisation} onChange={update('specialisation')} required />
            </div>
          )}
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="sub" style={{ marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
