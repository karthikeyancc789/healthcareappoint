/**
 * One-off migration: reset workingHours to "{}" for doctors who still have
 * the old hardcoded default (Mon-Fri 09:00-17:00 / Fri 09:00-13:00).
 *
 * Run once:  node scripts/resetDefaultWorkingHours.js
 */
require('dotenv').config();
const prisma = require('../src/config/prisma');

const DEFAULT_SCHEDULE = JSON.stringify({
  MON: ['09:00', '17:00'],
  TUE: ['09:00', '17:00'],
  WED: ['09:00', '17:00'],
  THU: ['09:00', '17:00'],
  FRI: ['09:00', '13:00'],
});

async function main() {
  const doctors = await prisma.doctor.findMany({
    include: { user: { select: { name: true } } },
  });

  let resetCount = 0;
  for (const doc of doctors) {
    if (doc.workingHours === DEFAULT_SCHEDULE) {
      await prisma.doctor.update({
        where: { id: doc.id },
        data: { workingHours: JSON.stringify({}) },
      });
      console.log(`  ✓ Cleared default schedule for Dr. ${doc.user.name}`);
      resetCount++;
    } else {
      console.log(`  – Kept schedule for Dr. ${doc.user.name}: ${doc.workingHours}`);
    }
  }

  console.log(`\nDone. Reset ${resetCount} doctor(s) to empty schedule.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
