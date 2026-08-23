import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../api/client';
import { adminLinks } from './links';

const DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', specialisation: '', slotDurationMin: 30,
  });
  const [days, setDays] = useState({ MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false });
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  const [leaveDoctorId, setLeaveDoctorId] = useState(null);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  async function load() {
    const { data } = await api.get('/admin/doctors');
    setDoctors(data.doctors);
  }

  useEffect(() => {
    load();
  }, []);

  async function createDoctor(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const workingHours = {};
    Object.entries(days).forEach(([day, on]) => {
      if (on) workingHours[day] = [startTime, endTime];
    });
    try {
      await api.post('/admin/doctors', { ...form, workingHours });
      setSuccess('Doctor account created.');
      setShowForm(false);
      setForm({ name: '', email: '', password: '', phone: '', specialisation: '', slotDurationMin: 30 });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create doctor.');
    }
  }

  async function submitLeave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`/admin/doctors/${leaveDoctorId}/leave`, { date: leaveDate, reason: leaveReason });
      setSuccess(`Leave recorded. ${data.notifiedCount}/${data.affectedCount} affected patients notified.`);
      setLeaveDoctorId(null);
      setLeaveDate('');
      setLeaveReason('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not set leave.');
    }
  }

  return (
    <Layout links={adminLinks}>
      <div className="page-header">
        <h1>Doctors</h1>
        <p>Manage doctor profiles, working hours, and leave days.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="card" style={{ background: 'var(--urgency-low-tint)', color: 'var(--urgency-low)' }}>{success}</div>}

      <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ marginBottom: 16 }}>
        {showForm ? 'Cancel' : '+ Add doctor'}
      </button>

      {showForm && (
        <div className="card">
          <form onSubmit={createDoctor}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="field"><label>Temp password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field"><label>Specialisation</label><input value={form.specialisation} onChange={(e) => setForm({ ...form, specialisation: e.target.value })} required /></div>
              <div className="field"><label>Slot duration (min)</label><input type="number" value={form.slotDurationMin} onChange={(e) => setForm({ ...form, slotDurationMin: Number(e.target.value) })} /></div>
            </div>

            <label style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>Working days</label>
            <div style={{ display: 'flex', gap: 10, margin: '8px 0 14px', flexWrap: 'wrap' }}>
              {DAY_KEYS.map((d) => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={!!days[d]} onChange={(e) => setDays({ ...days, [d]: e.target.checked })} />
                  {d}
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div className="field"><label>Start time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
              <div className="field"><label>End time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            </div>

            <button className="btn btn-primary">Create doctor</button>
          </form>
        </div>
      )}

      {doctors.map((d) => (
        <div key={d.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Dr. {d.user.name}</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{d.specialisation} · {d.slotDurationMin} min slots</div>
            </div>
            <button className="btn btn-secondary" onClick={() => setLeaveDoctorId(leaveDoctorId === d.id ? null : d.id)}>
              Mark leave
            </button>
          </div>

          {leaveDoctorId === d.id && (
            <form onSubmit={submitLeave} style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div className="field"><label>Date</label><input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} required /></div>
                <div className="field"><label>Reason (optional)</label><input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} /></div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Any existing bookings on this date will be cancelled and the patient notified by email automatically.
              </p>
              <button className="btn btn-danger">Confirm leave day</button>
            </form>
          )}
        </div>
      ))}
    </Layout>
  );
}
