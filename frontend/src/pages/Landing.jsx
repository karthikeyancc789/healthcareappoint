// src/pages/Landing.jsx
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="brand">
          <span className="pulse-dot" style={{ background: 'var(--primary)', display: 'inline-block' }} />
          Clinic Manager
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/login" className="btn btn-secondary">Log in</Link>
          <Link to="/register" className="btn btn-primary">Get started</Link>
        </div>
      </header>

      <section className="landing-hero">
        <h1>Appointments, symptoms, and follow-ups — in one place</h1>
        <p>
          Book with the right doctor in minutes, share your symptoms ahead of time so your visit
          starts on the same page, and get a plain-language summary of what to do next — with
          reminders sent straight to your email and calendar.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <Link to="/register" className="btn btn-primary">Create your account</Link>
          <Link to="/login" className="btn btn-secondary">I already have one</Link>
        </div>
      </section>

      <section className="landing-features">
        <div className="card">
          <h3>Book in a few taps</h3>
          <p>Search doctors by specialisation, see real-time open slots, and hold your spot while you fill in the details.</p>
        </div>
        <div className="card">
          <h3>Arrive prepared</h3>
          <p>Describe your symptoms beforehand — your doctor gets an AI-generated summary and urgency flag before you walk in.</p>
        </div>
        <div className="card">
          <h3>Never miss a dose</h3>
          <p>After your visit, get a clear summary of your prescription and follow-up steps, with medication reminders along the way.</p>
        </div>
      </section>
    </div>
  );
}