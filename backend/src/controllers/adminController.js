const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/authUtils');
const { AppError } = require('../middleware/errorHandler');
const slotService = require('../services/slotService');

/** Admin creates a doctor account + profile in one step. */
async function createDoctor(req, res) {
  const { email, password, name, phone, specialisation, slotDurationMin, workingHours } = req.body;
  if (!email || !password || !name || !specialisation || !workingHours) {
    throw new AppError('email, password, name, specialisation, and workingHours are required');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      phone,
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          specialisation,
          slotDurationMin: slotDurationMin || 30,
          workingHours, // e.g. { "MON": ["09:00","17:00"], ... }
        },
      },
    },
    include: { doctorProfile: true },
  });

  res.status(201).json({ doctor: user });
}

async function updateDoctor(req, res) {
  const { doctorId } = req.params;
  const { specialisation, slotDurationMin, workingHours } = req.body;

  const doctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: {
      ...(specialisation && { specialisation }),
      ...(slotDurationMin && { slotDurationMin }),
      ...(workingHours && { workingHours }),
    },
  });
  res.json({ doctor });
}

async function listDoctors(req, res) {
  const doctors = await prisma.doctor.findMany({
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });
  res.json({ doctors });
}

/** Marks a doctor on leave for a date; cancels + notifies affected patients. */
async function setDoctorLeave(req, res) {
  const { doctorId } = req.params;
  const { date, reason } = req.body;
  if (!date) throw new AppError('date is required (YYYY-MM-DD)');

  const result = await slotService.handleDoctorLeave(doctorId, date, reason);
  res.json({ message: 'Leave recorded and affected patients notified', ...result });
}

module.exports = { createDoctor, updateDoctor, listDoctors, setDoctorLeave };
