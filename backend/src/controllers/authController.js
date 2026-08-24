const prisma = require('../config/prisma');
const { hashPassword, comparePassword, signToken } = require('../utils/authUtils');
const { AppError } = require('../middleware/errorHandler');

// Patients self-register. Doctor and Admin accounts are provisioned by an
// existing Admin (see adminController) — this keeps the register endpoint
// from being usable to self-grant elevated roles.
async function registerUser(req, res) {
  const { email, password, name, phone, dob, gender, role, specialisation } = req.body;
  if (!email || !password || !name) throw new AppError('email, password, and name are required');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await hashPassword(password);
  const userRole = role || 'PATIENT';

  let userData = {
    email,
    passwordHash,
    name,
    phone,
    role: userRole,
  };

  if (userRole === 'DOCTOR') {
    if (!specialisation) throw new AppError('Specialisation is required for doctors');
    userData.doctorProfile = {
      create: {
        specialisation,
        slotDurationMin: 30,
        // Empty schedule by default — doctor must configure via Working Hours page
        workingHours: JSON.stringify({}),
      }
    };
  } else if (userRole === 'PATIENT') {
    userData.patientProfile = { 
      create: { dob: dob ? new Date(dob) : null, gender } 
    };
  }

  const user = await prisma.user.create({
    data: userData,
    include: { patientProfile: true, doctorProfile: true },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: sanitizeUser(user) });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('email and password are required');

  const user = await prisma.user.findUnique({
    where: { email },
    include: { doctorProfile: true, patientProfile: true },
  });
  if (!user) throw new AppError('Invalid credentials', 401);

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401);

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
}

async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { doctorProfile: true, patientProfile: true },
  });
  if (!user) throw new AppError('User not found', 404);
  res.json({ user: sanitizeUser(user) });
}

function sanitizeUser(user) {
  const { passwordHash, googleAccessToken, googleRefreshToken, ...safe } = user;
  return safe;
}

module.exports = { registerUser, login, me };
