const cron = require('node-cron');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const emailService = require('../services/emailService');

/**
 * Two responsibilities on the same sweep:
 *  1. Send any scheduled MEDICATION_REMINDER notifications whose time has come
 *     (these rows were pre-created by doctorController.submitVisitNotes).
 *  2. Create + send APPOINTMENT_REMINDER notifications ~24h before a
 *     CONFIRMED appointment's slotStart, if one hasn't been sent yet.
 */
async function runReminderSweep() {
  const now = new Date();

  // 1. Due medication reminders
  const dueMeds = await prisma.notification.findMany({
    where: { type: 'MEDICATION_REMINDER', status: 'PENDING', scheduledFor: { lte: now } },
    take: 100,
  });
  for (const n of dueMeds) {
    await emailService.attemptSend(n);
  }
  if (dueMeds.length) logger.info(`Reminder sweep: sent ${dueMeds.length} medication reminder(s)`);

  // 2. Upcoming appointment reminders (window: appointments starting in the
  // next 23-25h that don't already have a reminder notification logged)
  const windowStart = new Date(now.getTime() + 23 * 60 * 60000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60000);

  const upcoming = await prisma.appointment.findMany({
    where: { status: 'CONFIRMED', slotStart: { gte: windowStart, lte: windowEnd } },
    include: { doctor: { include: { user: true } }, patient: { include: { user: true } }, notifications: true },
  });

  let sent = 0;
  for (const appt of upcoming) {
    const alreadyReminded = appt.notifications.some((n) => n.type === 'APPOINTMENT_REMINDER');
    if (alreadyReminded) continue;

    await emailService.queueAndSendEmail({
      appointmentId: appt.id,
      recipientUserId: appt.patient.userId,
      type: 'APPOINTMENT_REMINDER',
      to: appt.patient.user.email,
      templateData: {
        name: appt.patient.user.name,
        doctorName: appt.doctor.user.name,
        slotStart: appt.slotStart.toISOString(),
      },
    });
    sent++;
  }
  if (sent) logger.info(`Reminder sweep: sent ${sent} appointment reminder(s)`);
}

function startReminderJob() {
  const expr = process.env.REMINDER_JOB_CRON || '*/5 * * * *';
  cron.schedule(expr, () => {
    runReminderSweep().catch((err) => logger.error(`Reminder sweep failed: ${err.message}`));
  });
  logger.info(`Reminder job scheduled: ${expr}`);
}

module.exports = { startReminderJob, runReminderSweep };
