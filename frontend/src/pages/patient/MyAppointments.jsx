import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../api/client';
import { patientLinks } from './links';

const STATUS_LABEL = {
  PENDING:      'Awaiting confirmation',
  CONFIRMED:    'Confirmed',
  CANCELLED:    'Cancelled',
  COMPLETED:    'Completed',
  DOCTOR_LEAVE: 'Cancelled — doctor unavailable',
};

const STATUS_COLOR = {
  PENDING:      '#d97706',  // amber
  CONFIRMED:    '#16a34a',  // green
  CANCELLED:    '#dc2626',  // red
  COMPLETED:    '#6b7280',  // grey
  DOCTOR_LEAVE: '#dc2626',
};

function formatSlot(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function MyAppointments() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/patient/appointments');
      setAppointments(data.appointments);
    } catch (err) {
      setError('Could not load your appointments.');
    }
  }

  useEffect(() => { load(); }, []);

  async function cancel(id) {
    if (!confirm('Cancel this appointment?')) return;
    await api.post(`/patient/appointments/${id}/cancel`);
    load();
  }

  return (
    <Layout links={patientLinks}>
      <div className="page-header">
        <h1>My appointments</h1>
        <p>Your upcoming and past visits.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {appointments.length === 0 && (
        <div className="card empty-state">
          <p>No appointments yet.</p>
          <button className="btn btn-primary" onClick={() => navigate('/patient')}>
            Find a doctor
          </button>
        </div>
      )}

      {appointments.map((a) => (
        <div key={a.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong style={{ fontSize: '1rem' }}>Dr. {a.doctor.user.name}</strong>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {a.doctor.specialisation}
              </div>
              <div className="mono" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                🗓 {formatSlot(a.slotStart)}
              </div>
              <div style={{
                display: 'inline-block', marginTop: 8, fontSize: '0.78rem', fontWeight: 600,
                color: STATUS_COLOR[a.status] || '#6b7280',
                background: `${STATUS_COLOR[a.status]}18` || '#f3f4f6',
                padding: '2px 10px', borderRadius: 20,
              }}>
                {STATUS_LABEL[a.status] || a.status}
              </div>
            </div>
            {(a.status === 'CONFIRMED' || a.status === 'PENDING') && (
              <button className="btn btn-danger" onClick={() => cancel(a.id)}>Cancel</button>
            )}
          </div>

          {a.status === 'COMPLETED' && a.postVisitSummary && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--primary-tint)', borderRadius: 8 }}>
              <strong style={{ fontSize: '0.85rem' }}>Visit summary</strong>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', margin: '6px 0 0' }}>
                {a.postVisitSummary}
              </p>
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
}
