# Healthcare Appointment & Follow-up Manager

A full-stack clinic platform with separate portals for **patients**, **doctors**, and an **admin**.
Patients book appointments and describe symptoms in advance; an LLM generates a pre-visit summary
with urgency level for the doctor. After the visit, the doctor's clinical notes and prescription are
converted into a patient-friendly summary. Both sides get email confirmations/reminders and
Google Calendar events.

## Stack

- **Backend:** Node.js, Express, PostgreSQL, Prisma ORM, JWT auth, node-cron
- **Frontend:** React (Vite), React Router, Axios
- **LLM:** Anthropic API (Claude) for pre-visit and post-visit summaries
- **Email:** Nodemailer (SMTP — works with Mailtrap, Gmail app password, SendGrid SMTP relay, etc.)
- **Calendar:** Google Calendar API with OAuth 2.0

## Project structure

```
backend/
  prisma/schema.prisma      # DB schema (see below)
  prisma/seed.js            # creates an admin + demo doctor account
  src/
    config/                 # prisma client, logger
    controllers/            # auth, admin, patient, doctor, calendar
    services/                # llmService, emailService, calendarService, slotService
    jobs/                    # reminderJob, emailRetryJob, slotHoldSweepJob (node-cron)
    middleware/              # auth (JWT + role check), errorHandler
    routes/
    app.js / server.js
frontend/
  src/
    pages/patient|doctor|admin
    components/, context/, api/
docs/
  system-design.md          # 800-word write-up (also required deliverable #4)
```

## Setup

### 1. Database

Create a PostgreSQL database (local, or a free instance on Render/Railway/Supabase/Neon).

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, SMTP_*, GOOGLE_*
npm install
npx prisma migrate dev --name init   # creates tables from prisma/schema.prisma
npm run seed                          # creates admin@clinic.com / Admin@123
                                       # and dr.jane@clinic.com / Doctor@123
npm run dev                           # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev             # http://localhost:5173
```

### 3. Try it out

1. Log in as `admin@clinic.com` and create a doctor (or use the seeded `dr.jane@clinic.com`).
2. Register a new patient account, search for a doctor, book a slot, fill the symptom form.
3. Log in as the doctor, review the AI pre-visit summary + urgency, complete the visit with notes
   and a prescription — a patient-friendly summary is generated automatically.
4. Log back in as the patient to see the post-visit summary.
5. As admin, mark the doctor on leave for a date with an existing booking to see the
   cancellation + notification flow.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list. Key ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs auth tokens |
| `SLOT_HOLD_MINUTES` | How long a slot is reserved while the patient fills the symptom form (default 10) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | LLM for pre/post-visit summaries |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Outbound email |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Google Calendar OAuth 2.0 |
| `REMINDER_JOB_CRON`, `EMAIL_RETRY_JOB_CRON`, `SLOT_HOLD_SWEEP_CRON` | Background job schedules |

## Database schema

Defined in `backend/prisma/schema.prisma`. Core tables:

- **User** — shared identity for patient/doctor/admin (`role` enum), holds Google OAuth tokens
- **Doctor** — specialisation, `slotDurationMin`, `workingHours` (JSON per weekday), linked to `User`
- **DoctorLeave** — `(doctorId, date)` unique — a day a doctor is unavailable
- **Patient** — linked to `User`
- **Appointment** — the booking record. Key fields:
  - `status`: `PENDING → CONFIRMED → COMPLETED`, or `CANCELLED` / `DOCTOR_LEAVE`
  - `holdExpiresAt`: slot-hold expiry (see "Slot hold mechanism" below)
  - `preVisitSummary` (JSON): `{ urgencyLevel, chiefComplaint, suggestedQuestions[] }`
  - `postVisitSummary` (text), `doctorNotes`, `prescription` (JSON array)
  - `googleEventIdPatient` / `googleEventIdDoctor`: for update/delete on reschedule/cancel
  - **`@@unique([doctorId, slotStart])`** — the hard database-level guarantee against double-booking
- **Notification** — every email/calendar action is logged here (`status`, `attempts`, `lastError`)
  so failures can be retried instead of silently dropped.

## API overview

All routes are prefixed `/api`. Auth via `Authorization: Bearer <token>`.

**Auth**
- `POST /auth/register` — patient self-registration
- `POST /auth/login`
- `GET /auth/me`

**Admin** (role: ADMIN)
- `POST /admin/doctors` — create doctor (specialisation, workingHours, slotDurationMin)
- `GET /admin/doctors`
- `PATCH /admin/doctors/:doctorId`
- `POST /admin/doctors/:doctorId/leave` — `{ date, reason }`, cancels + notifies affected patients

**Patient** (role: PATIENT)
- `GET /patient/doctors?specialisation=`
- `GET /patient/doctors/:doctorId/slots?date=YYYY-MM-DD`
- `POST /patient/appointments/hold` — `{ doctorId, slotStart, slotEnd }` → reserves the slot
- `POST /patient/appointments/:id/symptoms` — `{ symptomText }` → runs LLM, returns pre-visit summary
- `POST /patient/appointments/:id/confirm` — finalizes booking, sends email + calendar
- `GET /patient/appointments`
- `POST /patient/appointments/:id/cancel`

**Doctor** (role: DOCTOR)
- `GET /doctor/appointments?status=CONFIRMED`
- `GET /doctor/appointments/:id/pre-visit-summary`
- `POST /doctor/appointments/:id/visit-notes` — `{ doctorNotes, prescription[] }` → runs LLM,
  marks appointment COMPLETED, schedules medication reminders

**Calendar**
- `GET /calendar/oauth/connect` — returns Google consent URL for the logged-in user
- `GET /calendar/oauth/callback` — Google redirect target (stores tokens)

## LLM prompts

**Pre-visit summary** (`services/llmService.js::generatePreVisitSummary`):
> Analyse these symptoms and return ONLY valid JSON: `{urgencyLevel: Low|Medium|High, chiefComplaint, suggestedQuestions: [3 strings]}`. Symptoms: `<symptoms>`

**Post-visit summary** (`services/llmService.js::generatePostVisitSummary`):
> Convert these clinical notes into a patient-friendly summary with a medication schedule and follow-up steps, in simple non-technical language. Clinical notes: `<notes>`. Prescription: `<prescription>`

**Failure handling:** every LLM call is wrapped in a retry (2 retries, exponential backoff) and,
on final failure, falls back to a safe default object/string instead of throwing — booking and
visit completion never fail because of an LLM outage (see `FALLBACK_PRE_VISIT` / `FALLBACK_POST_VISIT`
in `llmService.js`).

## Google Calendar setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project → enable the
   **Google Calendar API**.
2. Create an **OAuth 2.0 Client ID** (type: Web application).
3. Add an authorized redirect URI matching `GOOGLE_REDIRECT_URI` in your `.env`
   (e.g. `http://localhost:5000/api/calendar/oauth/callback`, or your deployed backend URL).
4. Copy the Client ID/Secret into `backend/.env`.
5. Each user (patient or doctor) connects their calendar by visiting the URL returned from
   `GET /api/calendar/oauth/connect` — this is a one-time consent per user. Until connected,
   calendar sync for that user is skipped (best-effort, never blocks booking).

## Deployment

Any free host works (Render, Railway, Vercel for frontend + Render/Railway for backend + a
managed Postgres add-on). General steps:
1. Provision a PostgreSQL instance, set `DATABASE_URL`.
2. Deploy `backend/` as a web service; run `npx prisma migrate deploy && npm run seed` once, then `npm start`.
3. Deploy `frontend/` as a static site (`npm run build` → publish `dist/`), set `VITE_API_URL` to the backend's public URL.
4. Set `FRONTEND_URL` on the backend to the deployed frontend URL (used for CORS and the OAuth redirect).

## Notes on scope

This is a complete, running implementation of every requirement in the brief. A few things are
intentionally kept simple for a project of this size and are called out as such rather than
hidden: background jobs run in-process via `node-cron` (fine at this scale; would move to a
separate worker for higher volume), and the frontend favors clarity over exhaustive edge-case UI
(e.g. no drag able calendar view) so the core booking/LLM/notification pipeline gets the most
engineering attention.
