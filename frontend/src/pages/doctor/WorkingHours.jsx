// src/pages/doctor/WorkingHours.jsx
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../api/client';
import { doctorLinks } from './links';

export default function WorkingHours() {
  const [hours, setHours] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Load current schedule
  useEffect(() => {
    (async () => {
      const { data } = await api.get('/doctor/profile'); // endpoint should return doctor with workingHours
      setHours(JSON.parse(data.doctor.workingHours));
    })();
  }, []);

  const handleChange = (day, idx, value) => {
    const updated = { ...hours };
    updated[day][idx] = value;
    setHours(updated);
  };

  const addDay = (day) => {
    setHours({ ...hours, [day]: ['09:00', '17:00'] });
  };

  const save = async () => {
    setLoading(true);
    try {
      await api.put(`/doctor/${/* doctorId */ ''}`, {
        workingHours: hours,
      });
      setMsg('Schedule saved!');
    } catch (e) {
      setMsg(e.response?.data?.error || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout links={doctorLinks}>
      <div className="page-header">
        <h1>Set Your Weekly Working Hours</h1>
        <p className="sub">
          Pick start and end times for each day. Times must be in 24‑hour format (HH:MM).
        </p>
      </div>

      {Object.entries(hours).map(([day, range]) => (
        <div className="field" key={day}>
          <label>{day}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="time"
              value={range[0]}
              onChange={(e) => handleChange(day, 0, e.target.value)}
            />
            <span>—</span>
            <input
              type="time"
              value={range[1]}
              onChange={(e) => handleChange(day, 1, e.target.value)}
            />
          </div>
        </div>
      ))}

      {/* Add a day button */}
      <button className="btn btn-secondary" onClick={() => addDay('SAT')}>
        Add Saturday (or any missing day)
      </button>

      <br />
      <button className="btn btn-primary" onClick={save} disabled={loading}>
        {loading ? 'Saving…' : 'Save Schedule'}
      </button>

      {msg && <div className="error-banner">{msg}</div>}
    </Layout>
  );
}
