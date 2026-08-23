import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../api/client';
import { patientLinks } from './links';

export default function FindDoctor() {
  const navigate = useNavigate();
  const [specialisation, setSpecialisation] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    const { data } = await api.get('/patient/doctors', { params: { specialisation } });
    setDoctors(data.doctors);
    setSelectedDoctor(null);
    setSlots([]);
  }

  useEffect(() => {
    search();
  }, []);

  async function loadSlots(doctor) {
    setSelectedDoctor(doctor);
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get(`/patient/doctors/${doctor.id}/slots`, { params: { date } });
      setSlots(data.slots);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load slots.');
    } finally {
      setLoading(false);
    }
  }

  async function bookSlot(slot) {
    setError('');
    try {
      const { data } = await api.post('/patient/appointments/hold', {
        doctorId: selectedDoctor.id,
        slotStart: slot.start,
        slotEnd: slot.end,
      });
      navigate(`/patient/symptoms/${data.appointment.id}`, {
        state: { doctorName: selectedDoctor.user.name, slotStart: slot.start },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'That slot was just taken. Please pick another.');
      if (selectedDoctor) loadSlots(selectedDoctor);
    }
  }

  return (
    <Layout links={patientLinks}>
      <div className="page-header">
        <h1>Find a doctor</h1>
        <p>Search by specialisation and pick a slot that works for you.</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="e.g. Cardiology, General Medicine"
            value={specialisation}
            onChange={(e) => setSpecialisation(e.target.value)}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}
          />
          <button className="btn btn-primary" onClick={search}>Search</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        <div>
          {doctors.length === 0 && <div className="card empty-state">No doctors found.</div>}
          {doctors.map((d) => (
            <div
              key={d.id}
              className="card"
              style={{ cursor: 'pointer', borderColor: selectedDoctor?.id === d.id ? 'var(--primary)' : undefined }}
              onClick={() => loadSlots(d)}
            >
              <strong>Dr. {d.user.name}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{d.specialisation}</div>
              <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {d.slotDurationMin} min slots
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          {!selectedDoctor && <div className="empty-state">Select a doctor to see available slots.</div>}
          {selectedDoctor && (
            <>
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    loadSlots(selectedDoctor);
                  }}
                />
              </div>
              {loading && <p>Loading slots…</p>}
              {!loading && slots.length === 0 && (
                <div className="empty-state">No slots available on this date — try another date.</div>
              )}
              {!loading && slots.length > 0 && (
                <div className="slot-grid">
                  {slots.map((s) => (
                    <button key={s.start} className="slot-btn" onClick={() => bookSlot(s)}>
                      {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
