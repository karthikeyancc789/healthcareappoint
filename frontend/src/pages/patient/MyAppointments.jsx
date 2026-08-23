import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../api/client';
import { patientLinks } from './links';

const STATUS_LABEL = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  DOCTOR_LEAVE: 'Cancelled — doctor unavailable',
};

export default function MyAppointments() {
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

  useEffect(() => {
    load();
  }, []);

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
      {appointments.length === 0 && <div className="card empty-state">No appointments yet — find a doctor to get started.</div>}

      {appointments.map((a) => (
        <div key={a.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong>Dr. {a.doctor.user.name}</strong>
              <div className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {new Date(a.slotStart).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: 6 }}>{STATUS_LABEL[a.status] || a.status}</div>
            </div>
            {a.status === 'CONFIRMED' && (
              <button className="btn btn-danger" onClick={() => cancel(a.id)}>Cancel</button>
            )}
          </div>

          {a.status === 'COMPLETED' && a.postVisitSummary && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--primary-tint)', borderRadius: 8 }}>
              <strong style={{ fontSize: '0.85rem' }}>Visit summary</strong>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', margin: '6px 0 0' }}>{a.postVisitSummary}</p>
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
}
