const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const emailService = require('./emailService');
const calendarService = require('./calendarService');

const SLOT_HOLD_MINUTES = Number(process.env.SLOT_HOLD_MINUTES || 10);
const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Computes candidate slots for a doctor on a given date from their
 * workingHours + slotDurationMin, then filters out slots that are already
 * booked/held or fall on a leave day.
 */
async function getAvailableSlots(doctorId, dateStr) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new AppError('Doctor not found', 404);

  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const dayKey = DAY_KEYS[date.getUTCDay()];
  const hoursForDay = doctor.workingHours[dayKey];
  if (!hoursForDay) return []; // doctor doesn't work this day of week

  const onLeave = await prisma.doctorLeave.findUnique({
    where: { doctorId_date: { doctorId, date } },
  });
  if (onLeave) return [];

  const [startH, startM] = hoursForDay[0].split(':').map(Number);
  const [endH, endM] = hoursForDay[1].split(':').map(Number);
  const dayStart = new Date(date);
  dayStart.setUTCHours(startH, startM, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(endH, endM, 0, 0);

  const candidates = [];
  let cursor = new Date(dayStart);
  while (cursor < dayEnd) {
    const slotEnd = new Date(cursor.getTime() + doctor.slotDurationMin * 60000);
    if (slotEnd <= dayEnd) candidates.push({ start: new Date(cursor), end: slotEnd });
    cursor = slotEnd;
  }

  // Exclude slots that are CONFIRMED, or PENDING with a hold that hasn't
  // expired yet (an active hold blocks the slot from being shown as free).
  const now = new Date();
  const taken = await prisma.appointment.findMany({
    where: {
      doctorId,
      slotStart: { gte: dayStart, lt: dayEnd },
      OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', holdExpiresAt: { gt: now } }],
    },
    select: { slotStart: true },
  });
  const takenTimes = new Set(taken.map((t) => t.slotStart.getTime()));

  return candidates
    .filter((c) => c.start.getTime() > now.getTime() && !takenTimes.has(c.start.getTime()))
    .map((c) => ({ start: c.start.toISOString(), end: c.end.toISOString() }));
}

/**
 * Places a temporary hold on a slot (status PENDING) so the patient can fill
 * the symptom form without the slot being taken from under them. Uses a
 * Prisma interactive transaction with a Postgres advisory lock keyed on
 * (doctorId, slotStart) so two simultaneous requests for the *same* slot
 * are serialized — the second one fails fast with a 409 instead of both
 * racing to insert. The unique constraint on (doctorId, slotStart) is the
 * final backstop even if the advisory lock is somehow bypassed.
 */
async function holdSlot({ doctorId, patientId, slotStart, slotEnd }) {
  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  const holdExpiresAt = new Date(Date.now() + SLOT_HOLD_MINUTES * 60000);

  return prisma.$transaction(async (tx) => {
    // Advisory lock: hashtext() gives a stable int from the string key.
    // pg_advisory_xact_lock auto-releases at transaction end (commit or rollback).
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      `${doctorId}:${start.toISOString()}`
    );

    const now = new Date();
    const existing = await tx.appointment.findUnique({
      where: { doctor_slot_unique: { doctorId, slotStart: start } },
    });

    if (existing && (existing.status === 'CONFIRMED' || (existing.status === 'PENDING' && existing.holdExpiresAt > now))) {
      throw new AppError('This slot is no longer available. Please choose another.', 409);
    }

    if (existing) {
      // A previous hold expired — reuse the row instead of violating the
      // unique constraint with a fresh insert.
      return tx.appointment.update({
        where: { id: existing.id },
        data: { patientId, status: 'PENDING', holdExpiresAt, slotEnd: end, symptomText: null, preVisitSummary: null },
      });
    }

    return tx.appointment.create({
      data: { doctorId, patientId, slotStart: start, slotEnd: end, status: 'PENDING', holdExpiresAt },
    });
  });
}

/**
 * Confirms a held appointment after the symptom form + pre-visit summary
 * are attached. Re-checks the hold hasn't expired (in case the patient sat
 * on the form too long) and sends confirmation notifications.
 */
async function confirmAppointment(appointmentId, patientId) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: { include: { user: true } }, patient: { include: { user: true } } },
  });

  if (!appt || appt.patientId !== patientId) throw new AppError('Appointment not found', 404);
  if (appt.status !== 'PENDING') throw new AppError('Appointment is not in a confirmable state', 400);
  if (appt.holdExpiresAt && appt.holdExpiresAt < new Date()) {
    throw new AppError('Your slot hold expired. Please book again.', 410);
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED', holdExpiresAt: null },
  });

  // Notifications are best-effort and never block the confirmation response.
  await notifyBookingConfirmed(appt).catch((err) =>
    logger.error(`notifyBookingConfirmed failed: ${err.message}`)
  );

  return updated;
}

async function notifyBookingConfirmed(appt) {
  const slotStr = appt.slotStart.toISOString();

  await emailService.queueAndSendEmail({
    appointmentId: appt.id,
    recipientUserId: appt.patient.userId,
    type: 'BOOKING_CONFIRMATION',
    to: appt.patient.user.email,
    templateData: { name: appt.patient.user.name, doctorName: appt.doctor.user.name, slotStart: slotStr },
  });

  await emailService.queueAndSendEmail({
    appointmentId: appt.id,
    recipientUserId: appt.doctor.userId,
    type: 'BOOKING_CONFIRMATION',
    to: appt.doctor.user.email,
    templateData: { name: appt.doctor.user.name, doctorName: appt.doctor.user.name, slotStart: slotStr },
  });

  const patientEventId = await calendarService.createEvent(appt.patient.userId, {
    summary: `Appointment with Dr. ${appt.doctor.user.name}`,
    description: 'Booked via Healthcare Appointment Manager',
    startTime: appt.slotStart.toISOString(),
    endTime: appt.slotEnd.toISOString(),
  });
  const doctorEventId = await calendarService.createEvent(appt.doctor.userId, {
    summary: `Appointment with ${appt.patient.user.name}`,
    description: 'Booked via Healthcare Appointment Manager',
    startTime: appt.slotStart.toISOString(),
    endTime: appt.slotEnd.toISOString(),
  });

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { googleEventIdPatient: patientEventId, googleEventIdDoctor: doctorEventId },
  });
}

/**
 * Called when an admin marks a doctor on leave for a date. Cancels every
 * affected CONFIRMED/PENDING appointment on that date and notifies the
 * patients via email + removes the calendar events. Runs each cancellation
 * independently so one failure doesn't stop the rest from being processed.
 */
async function handleDoctorLeave(doctorId, dateStr, reason) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  await prisma.doctorLeave.upsert({
    where: { doctorId_date: { doctorId, date } },
    update: { reason },
    create: { doctorId, date, reason },
  });

  const affected = await prisma.appointment.findMany({
    where: { doctorId, slotStart: { gte: dayStart, lte: dayEnd }, status: { in: ['CONFIRMED', 'PENDING'] } },
    include: { doctor: { include: { user: true } }, patient: { include: { user: true } } },
  });

  const results = await Promise.allSettled(
    affected.map(async (appt) => {
      await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'DOCTOR_LEAVE' } });

      await emailService.queueAndSendEmail({
        appointmentId: appt.id,
        recipientUserId: appt.patient.userId,
        type: 'DOCTOR_LEAVE_NOTICE',
        to: appt.patient.user.email,
        templateData: {
          name: appt.patient.user.name,
          doctorName: appt.doctor.user.name,
          slotStart: appt.slotStart.toISOString(),
        },
      });

      if (appt.googleEventIdPatient) {
        await calendarService.deleteEvent(appt.patient.userId, appt.googleEventIdPatient);
      }
      if (appt.googleEventIdDoctor) {
        await calendarService.deleteEvent(appt.doctor.userId, appt.googleEventIdDoctor);
      }
    })
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    logger.error(`handleDoctorLeave: ${failures.length}/${affected.length} notifications failed`, {
      errors: failures.map((f) => f.reason?.message),
    });
  }

  return { affectedCount: affected.length, notifiedCount: affected.length - failures.length };
}

/** Releases expired PENDING holds so their slots become bookable again. Called by a cron sweep. */
async function releaseExpiredHolds() {
  const { count } = await prisma.appointment.deleteMany({
    where: { status: 'PENDING', holdExpiresAt: { lt: new Date() } },
  });
  if (count > 0) logger.info(`Released ${count} expired slot hold(s)`);
  return count;
}

module.exports = {
  getAvailableSlots,
  holdSlot,
  confirmAppointment,
  handleDoctorLeave,
  releaseExpiredHolds,
  notifyBookingConfirmed,
};
