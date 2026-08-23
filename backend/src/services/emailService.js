const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const prisma = require('../config/prisma');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const TEMPLATES = {
  BOOKING_CONFIRMATION: ({ name, doctorName, slotStart }) => ({
    subject: 'Appointment Confirmed',
    body: `Hi ${name},\n\nYour appointment with Dr. ${doctorName} on ${slotStart} is confirmed.\n\n— Healthcare Clinic`,
  }),
  APPOINTMENT_REMINDER: ({ name, doctorName, slotStart }) => ({
    subject: 'Appointment Reminder',
    body: `Hi ${name},\n\nReminder: your appointment with Dr. ${doctorName} is on ${slotStart}.\n\n— Healthcare Clinic`,
  }),
  CANCELLATION: ({ name, doctorName, slotStart, reason }) => ({
    subject: 'Appointment Cancelled',
    body: `Hi ${name},\n\nYour appointment with Dr. ${doctorName} on ${slotStart} has been cancelled.${reason ? ` Reason: ${reason}` : ''}\n\n— Healthcare Clinic`,
  }),
  DOCTOR_LEAVE_NOTICE: ({ name, doctorName, slotStart }) => ({
    subject: 'Your appointment needs to be rescheduled',
    body: `Hi ${name},\n\nDr. ${doctorName} is unavailable on ${slotStart} due to leave. Please rebook at your convenience — we're sorry for the inconvenience.\n\n— Healthcare Clinic`,
  }),
  MEDICATION_REMINDER: ({ name, medicine, dosage }) => ({
    subject: 'Medication Reminder',
    body: `Hi ${name},\n\nThis is a reminder to take your medication: ${medicine} (${dosage}).\n\n— Healthcare Clinic`,
  }),
};

/**
 * Creates a Notification row (status PENDING) and immediately attempts to
 * send it. This ensures every notification is durably recorded BEFORE the
 * send attempt, so a crash mid-send still leaves something for the retry
 * job to pick up — the app never silently loses a notification.
 */
async function queueAndSendEmail({ appointmentId, recipientUserId, type, to, templateData }) {
  const rendered = TEMPLATES[type](templateData);

  const notification = await prisma.notification.create({
    data: {
      appointmentId,
      recipientUserId,
      channel: 'EMAIL',
      type,
      status: 'PENDING',
      payload: { to, ...rendered },
    },
  });

  await attemptSend(notification);
  return notification;
}

/**
 * Attempts to send a single notification record. On failure, marks it
 * FAILED with the error so the retry background job can pick it back up
 * (see jobs/emailRetryJob.js) instead of the request throwing.
 */
async function attemptSend(notification) {
  const { to, subject, body } = notification.payload;
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text: body,
    });
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', attempts: { increment: 1 } },
    });
    return true;
  } catch (err) {
    logger.error(`Email send failed for notification ${notification.id}: ${err.message}`);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'FAILED', attempts: { increment: 1 }, lastError: err.message },
    });
    return false;
  }
}

module.exports = { queueAndSendEmail, attemptSend, TEMPLATES };
