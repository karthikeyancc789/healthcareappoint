import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import UrgencyBadge from '../../components/UrgencyBadge';
import api from '../../api/client';
import { doctorLinks } from './links';

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [prescriptionDraft, setPrescriptionDraft] = useState([{ medicine: '', dosage: '', frequencyPerDay: 1, durationDays: 5 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/doctor/appointments', { params: { status: 'CONFIRMED' } });
    setAppointments(data.appointments);
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(a) {
    setExpandedId(expandedId === a.id ? null : a.id);
    setNotesDraft('');
    setPrescriptionDraft([{ medicine: '', dosage: '', frequencyPerDay: 1, durationDays: 5 }]);
  }

  function updateMed(idx, key, value) {
    const next = [...prescriptionDraft];
    next[idx] = { ...next[idx], [key]: value };
    setPrescriptionDraft(next);
  }

  function addMed() {
    setPrescriptionDraft([...prescriptionDraft, { medicine: '', dosage: '', frequencyPerDay: 1, durationDays: 5 }]);
  }

  async function submitNotes(appointmentId) {
    setError('');
    setSaving(true);
    try {
      await api.post(`/doctor/appointments/${appointmentId}/visit-notes`, {
        doctorNotes: notesDraft,
        prescription: prescriptionDraft.filter((m) => m.medicine.trim()),
      });
      setExpandedId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save visit notes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout links={doctorLinks}>
      <div className="page-header">
        <h1>Upcoming visits</h1>
        <p>Review each patient's AI-generated symptom summary before the visit.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {appointments.length === 0 && <div className="card empty-state">No confirmed visits scheduled.</div>}

      {appointments.map((a) => (
        <div key={a.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{a.patient.user.name}</strong>
              <div className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {new Date(a.slotStart).toLocaleString()}
              </div>
            </div>
            {a.preVisitSummary && <UrgencyBadge level={a.preVisitSummary.urgencyLevel} />}
          </div>

          {a.preVisitSummary && (
            <div style={{ marginTop: 10, fontSize: '0.88rem' }}>
              <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chief complaint</strong>
              <p style={{ margin: '2px 0 8px' }}>{a.preVisitSummary.chiefComplaint}</p>
              <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Suggested questions</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {a.preVisitSummary.suggestedQuestions?.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}

          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => toggle(a)}>
            {expandedId === a.id ? 'Close' : 'Complete visit'}
          </button>

          {expandedId === a.id && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div className="field">
                <label>Clinical notes</label>
                <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} required />
              </div>

              <label style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>Prescription</label>
              {prescriptionDraft.map((m, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.7fr 0.7fr', gap: 8, marginBottom: 8 }}>
                  <input placeholder="Medicine" value={m.medicine} onChange={(e) => updateMed(idx, 'medicine', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }} />
                  <input placeholder="Dosage e.g. 500mg" value={m.dosage} onChange={(e) => updateMed(idx, 'dosage', e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }} />
                  <input type="number" placeholder="x/day" value={m.frequencyPerDay} onChange={(e) => updateMed(idx, 'frequencyPerDay', Number(e.target.value))} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }} />
                  <input type="number" placeholder="days" value={m.durationDays} onChange={(e) => updateMed(idx, 'durationDays', Number(e.target.value))} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }} />
                </div>
              ))}
              <button className="btn btn-secondary" onClick={addMed} style={{ marginBottom: 12 }}>+ Add medicine</button>
              <br />
              <button className="btn btn-primary" onClick={() => submitNotes(a.id)} disabled={saving || !notesDraft.trim()}>
                {saving ? 'Saving…' : 'Save & generate patient summary'}
              </button>
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
}
