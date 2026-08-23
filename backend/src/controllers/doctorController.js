const prisma = require('../config/prisma');
const { AppError } = require('../middleware/errorHandler');
const llmService = require('../services/llmService');

async function myAppointments(req, res) {
  const doctorProfile = await getDoctorProfile(req.user.id);
  const { status } = req.query;

  const appointments = await prisma.appointment.findMany({
    where: { doctorId: doctorProfile.id, ...(status && { status }) },
    include: { patient: { include: { user: { select: { name: true, phone: true } } } } },
    orderBy: { slotStart: 'asc' },
  });
  res.json({ appointments });
}

/** Returns the AI-generated pre-visit summary + urgency for a specific appointment. */
async function getPreVisitSummary(req, res) {
  const { appointmentId } = req.params;
  const doctorProfile = await getDoctorProfile(req.user.id);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.doctorId !== doctorProfile.id) throw new AppError('Appointment not found', 404);
  res.json({ symptomText: appt.symptomText, preVisitSummary: appt.preVisitSummary });
}

/** Doctor submits post-visit notes + prescription -> LLM generates patient-friendly summary. */
async function submitVisitNotes(req, res) {
  const { appointmentId } = req.params;
  const { doctorNotes, prescription } = req.body; // prescription: [{medicine, dosage, frequencyPerDay, durationDays}]
  if (!doctorNotes) throw new AppError('doctorNotes is required');

  const doctorProfile = await getDoctorProfile(req.user.id);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.doctorId !== doctorProfile.id) throw new AppError('Appointment not found', 404);
  if (appt.status !== 'CONFIRMED') throw new AppError('Only confirmed appointments can be completed', 400);

  const postVisitSummary = await llmService.generatePostVisitSummary(doctorNotes, prescription);

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      doctorNotes,
      prescription: prescription || null,
      postVisitSummary,
      status: 'COMPLETED',
    },
  });

  // Medication reminders are scheduled as future Notification rows and
  // picked up by the reminder background job (see jobs/medicationReminderJob.js).
  if (Array.isArray(prescription)) {
    await scheduleMedicationReminders(updated, prescription);
  }

  res.json({ appointment: updated });
}

async function scheduleMedicationReminders(appointment, prescription) {
  const patient = await prisma.patient.findUnique({
    where: { id: appointment.patientId },
    include: { user: true },
  });

  const rows = [];
  for (const med of prescription) {
    const timesPerDay = Math.max(1, Number(med.frequencyPerDay) || 1);
    const durationDays = Math.max(1, Number(med.durationDays) || 1);
    const intervalHours = Math.floor(24 / timesPerDay);

    for (let day = 0; day < durationDays; day++) {
      for (let dose = 0; dose < timesPerDay; dose++) {
        const scheduledFor = new Date(appointment.updatedAt);
        scheduledFor.setDate(scheduledFor.getDate() + day);
        scheduledFor.setHours(9 + dose * intervalHours, 0, 0, 0); // starts at 9am, spread through the day

        rows.push({
          appointmentId: appointment.id,
          recipientUserId: patient.userId,
          channel: 'EMAIL',
          type: 'MEDICATION_REMINDER',
          status: 'PENDING',
          scheduledFor,
          payload: {
            to: patient.user.email,
            subject: 'Medication Reminder',
            body: `Hi ${patient.user.name},\n\nReminder to take: ${med.medicine} (${med.dosage}).\n\n— Healthcare Clinic`,
          },
        });
      }
    }
  }

  if (rows.length) await prisma.notification.createMany({ data: rows });
}

async function getDoctorProfile(userId) {
  const profile = await prisma.doctor.findUnique({ where: { userId } });
  if (!profile) throw new AppError('Doctor profile not found', 404);
  return profile;
}

async function updateWorkingHours(req, res) {
  const { doctorId } = req.params;
  const { workingHours } = req.body;
  if (!workingHours) throw new AppError('workingHours is required', 400);
  // Ensure JSON string stored
  const updated = await prisma.doctor.update({
    where: { id: Number(doctorId) },
    data: { workingHours: JSON.stringify(workingHours) },
  });
  res.json({ doctor: updated });
}

module.exports = { myAppointments, getPreVisitSummary, submitVisitNotes, updateWorkingHours };
