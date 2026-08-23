// Run with: npm run seed
// Creates one Admin account and one demo Doctor so you can log in and
// exercise the whole flow without manually calling the API first.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@clinic.com' },
    update: {},
    create: {
      email: 'admin@clinic.com',
      passwordHash,
      name: 'Clinic Admin',
      role: 'ADMIN',
    },
  });

  const doctorPasswordHash = await bcrypt.hash('Doctor@123', 10);
  const doctorUser = await prisma.user.upsert({
    where: { email: 'dr.jane@clinic.com' },
    update: {},
    create: {
      email: 'dr.jane@clinic.com',
      passwordHash: doctorPasswordHash,
      name: 'Jane Smith',
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          specialisation: 'General Medicine',
          slotDurationMin: 30,
          workingHours: {
            MON: ['09:00', '17:00'],
            TUE: ['09:00', '17:00'],
            WED: ['09:00', '17:00'],
            THU: ['09:00', '17:00'],
            FRI: ['09:00', '13:00'],
          },
        },
      },
    },
  });

  console.log('Seeded admin:', admin.email, '(password: Admin@123)');
  console.log('Seeded doctor:', doctorUser.email, '(password: Doctor@123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
