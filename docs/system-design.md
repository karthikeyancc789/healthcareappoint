# System Design Write-up

## Double-booking prevention

Booking a slot is a two-phase process: **hold**, then **confirm**. This exists because the
symptom form and LLM call between "pick a slot" and "confirm" take real time, during which the
slot must not be handed to someone else, but also must not be locked forever if the patient
abandons the flow.

The hold step runs inside a Prisma interactive transaction. Before touching any row, it takes a
Postgres advisory lock keyed on `hashtext(doctorId || slotStart)`
(`pg_advisory_xact_lock`), which is automatically released at transaction end. This serializes any
two concurrent requests for the *exact same* slot — the second request blocks until the first
commits or rolls back, instead of both racing to read "is this free?" and both concluding yes.
After acquiring the lock, the transaction checks for an existing appointment on that
`(doctorId, slotStart)` pair; if one is `CONFIRMED`, or `PENDING` with an unexpired hold, the
request is rejected with 409. Otherwise it creates (or reuses an expired-hold row for) the
appointment with `status = PENDING` and `holdExpiresAt = now + SLOT_HOLD_MINUTES`.

The advisory lock is the fast path, but it is not the only guarantee. The `Appointment` table has
`@@unique([doctorId, slotStart])` at the database level. Even if the advisory lock were somehow
bypassed — a second app instance, a bug, a raw SQL insert — the unique constraint makes a true
double-booking physically impossible to persist; Postgres rejects the second insert with a
`P2002` error, which the global error handler translates into a friendly "this slot was just
taken" response. This two-layer approach (advisory lock for good UX + unique constraint as an
unconditional backstop) means correctness doesn't depend on every code path remembering to check
availability first.

## Slot hold mechanism

A `PENDING` appointment with `holdExpiresAt` set represents a temporary reservation. `getAvailableSlots`
excludes any slot with a `CONFIRMED` appointment or a `PENDING` one whose hold hasn't expired yet,
so other patients don't see it as free. If the patient completes the symptom form and confirms
before the hold expires, `confirmAppointment` flips the status to `CONFIRMED` and clears
`holdExpiresAt`. If they abandon the flow, a cron job (`slotHoldSweepJob`, every minute) runs
`releaseExpiredHolds()`, which deletes `PENDING` rows past their `holdExpiresAt`, freeing the slot.
`SLOT_HOLD_MINUTES` (default 10) balances two failure modes: too short and a slow-typing patient
loses their slot mid-form; too long and abandoned holds needlessly block real availability.

## Doctor leave conflict handling

When an admin calls `POST /admin/doctors/:id/leave`, `handleDoctorLeave` first upserts the
`DoctorLeave` row (unique on `(doctorId, date)`, so re-marking the same day is idempotent), then
queries every `CONFIRMED` or `PENDING` appointment for that doctor within the day's UTC bounds.
Each affected appointment is processed independently via `Promise.allSettled`: status moves to
`DOCTOR_LEAVE` (distinct from `CANCELLED`, so patients see *why* it was cancelled), an email is
queued via the notification pipeline, and any Google Calendar events for both patient and doctor
are deleted. Using `allSettled` rather than `all` means one patient's notification failure (e.g. a
bad email address) doesn't stop the rest of the affected patients from being processed — the job
logs how many of N succeeded rather than aborting partway through. Because `getAvailableSlots`
also checks `DoctorLeave` directly, leave days are immediately excluded from future searches,
independent of whether any bookings existed on that date.

## Notification failure handling

Every outbound notification — booking confirmation, reminder, cancellation, leave notice,
medication reminder — is first written to the `Notification` table with `status = PENDING`
*before* the send is attempted. This ordering matters: if the process crashes between "decide to
notify" and "email actually sent," the record survives and is still retryable, rather than the
notification being lost with no trace. `attemptSend` then tries the actual SMTP send and updates
the row to `SENT` or `FAILED` with the error message attached.

A separate cron job (`emailRetryJob`, every 2 minutes) finds `FAILED` rows under `MAX_ATTEMPTS`
(5) and retries them, using an exponential backoff based on `attempts` (capped at 60 minutes) so a
broken SMTP config doesn't get hammered every cycle. Rows that exhaust retries stay `FAILED` for
manual review rather than retrying indefinitely. Google Calendar sync is treated the same way in
spirit but as best-effort only: `createEvent`/`updateEvent`/`deleteEvent` catch and log all
errors, returning `null`/`false` on failure, and are never allowed to block or roll back the
underlying appointment action — a calendar outage should never prevent a patient from booking.

LLM calls follow the identical philosophy (see README's "LLM prompts" section): retried, then
degraded to a safe fallback rather than surfaced as a hard failure, so a third-party outage never
takes down the core booking or visit-completion flow.
