const prisma = require('../config/prisma');
const { AppError } = require('../middleware/errorHandler');
const slotService = require('../services/slotService');
const llmService = require('../services/llmService');

async function searchDoctors(req, res) {
  const { specialisation } = req.query;
  const doctors = await prisma.doctor.findMany({
    where: specialisation ? { specialisation: { contains: specialisation, mode: 'insensitive' } } : {},
    include: { user: { select: { id: true, name: true } } },
  });
  res.json({ doctors });
}

async function getSlots(req, res) {
  const { doctorId } = req.params;
  const { date } = req.query; // YYYY-MM-DD
  if (!date) throw new AppError('date query param is required (YYYY-MM-DD)');
  const slots = await slotService.getAvailableSlots(doctorId, date);
  res.json({ slots });
}

/** Step 1: hold a slot (reserves it while the patient fills the symptom form). */
async function holdSlot(req, res) {
  const { doctorId, slotStart, slotEnd } = req.body;
  if (!doctorId || !slotStart || !slotEnd) throw new AppError('doctorId, slotStart, slotEnd are required');

  const patientProfile = await getPatientProfile(req.user.id);
  const appointment = await slotService.holdSlot({
    doctorId,
    patientId: patientProfile.id,
    slotStart,
    slotEnd,
  });
  res.status(201).json({ appointment, holdExpiresAt: appointment.holdExpiresAt });
}

/** Step 2: submit symptoms -> generates LLM pre-visit summary, stores it (doesn't confirm yet). */
async function submitSymptoms(req, res) {
  const { appointmentId } = req.params;
  const { symptomText } = req.body;
  if (!symptomText) throw new AppError('symptomText is required');

  const patientProfile = await getPatientProfile(req.user.id);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientId !== patientProfile.id) throw new AppError('Appointment not found', 404);
  if (appt.status !== 'PENDING') throw new AppError('Appointment already confirmed or expired', 400);

  const preVisitSummary = await llmService.generatePreVisitSummary(symptomText);

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { symptomText, preVisitSummary },
  });
  res.json({ appointment: updated });
}

/** Step 3: confirm the appointment (finalizes booking, sends confirmations). */
async function confirmAppointment(req, res) {
  const { appointmentId } = req.params;
  const patientProfile = await getPatientProfile(req.user.id);
  const appointment = await slotService.confirmAppointment(appointmentId, patientProfile.id);
  res.json({ appointment });
}

async function myAppointments(req, res) {
  const patientProfile = await getPatientProfile(req.user.id);
  const appointments = await prisma.appointment.findMany({
    where: { patientId: patientProfile.id },
    include: { doctor: { include: { user: { select: { name: true } } } } },
    orderBy: { slotStart: 'desc' },
  });
  res.json({ appointments });
}

async function cancelAppointment(req, res) {
  const { appointmentId } = req.params;
  const patientProfile = await getPatientProfile(req.user.id);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientId !== patientProfile.id) throw new AppError('Appointment not found', 404);

  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'CANCELLED' } });
  res.json({ message: 'Appointment cancelled' });
}

async function getPatientProfile(userId) {
  const profile = await prisma.patient.findUnique({ where: { userId } });
  if (!profile) throw new AppError('Patient profile not found', 404);
  return profile;
}

module.exports = { searchDoctors, getSlots, holdSlot, submitSymptoms, confirmAppointment, myAppointments, cancelAppointment };
