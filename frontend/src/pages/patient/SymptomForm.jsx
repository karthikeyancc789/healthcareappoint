import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import api from '../../api/client';
import { patientLinks } from './links';

const HOLD_MINUTES_DISPLAY = 10; // mirrors backend SLOT_HOLD_MINUTES default, shown while waiting on first load

export default function SymptomForm() {
  const { appointmentId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [symptomText, setSymptomText] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState('form'); // form -> summary -> confirmed
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(HOLD_MINUTES_DISPLAY * 60);

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleSubmitSymptoms(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post(`/patient/appointments/${appointmentId}/symptoms`, { symptomText });
      // preVisitSummary is stored as a JSON string in the DB — parse it before use
      const raw = data.appointment.preVisitSummary;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      setSummary(parsed);
      setStep('summary');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save symptoms. Your hold may have expired.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      await api.post(`/patient/appointments/${appointmentId}/confirm`);
      setStep('confirmed');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm the appointment. Please try booking again.');
    } finally {
      setLoading(false);
    }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Layout links={patientLinks}>
      <div className="page-header">
        <h1>Before your visit</h1>
        <p>
          {state?.doctorName && `Dr. ${state.doctorName} — `}
          {state?.slotStart && new Date(state.slotStart).toLocaleString()}
        </p>
      </div>

      {step !== 'confirmed' && secondsLeft > 0 && (
        <div className="card mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Slot held for {mm}:{ss} — complete this form to confirm your booking.
        </div>
      )}
      {step !== 'confirmed' && secondsLeft === 0 && (
        <div className="error-banner">Your hold has likely expired. Please go back and pick a slot again.</div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {step === 'form' && (
        <div className="card">
          <form onSubmit={handleSubmitSymptoms}>
            <div className="field">
              <label>Describe your symptoms</label>
              <textarea
                value={symptomText}
                onChange={(e) => setSymptomText(e.target.value)}
                placeholder="e.g. Persistent headache for 3 days, mild fever, sensitivity to light..."
                required
              />
            </div>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? 'Analyzing…' : 'Continue'}
            </button>
          </form>
        </div>
      )}

      {step === 'summary' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Here's what we'll share with your doctor</h3>
          {summary?.chiefComplaint ? (
            <>
              <p style={{ color: 'var(--text-muted)' }}>{summary.chiefComplaint}</p>
              {summary.suggestedQuestions?.length > 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <strong>Questions to ask:</strong> {summary.suggestedQuestions.join(' · ')}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Your symptoms have been saved. The doctor will review them before your visit.
            </p>
          )}
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Confirming…' : 'Confirm appointment'}
          </button>
        </div>
      )}

      {step === 'confirmed' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Appointment confirmed</h3>
          <p>We've emailed you a confirmation and added this to your Google Calendar (if connected).</p>
          <button className="btn btn-secondary" onClick={() => navigate('/patient/appointments')}>
            View my appointments
          </button>
        </div>
      )}
    </Layout>
  );
}
